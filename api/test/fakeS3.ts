import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Ein kleiner S3-Nachbau für Tests (seit 4.4.0) – nur Pfad-Stil und nur, was
 * `api/lib/s3Storage.ts` benutzt: PUT, GET, DELETE und ListObjectsV2.
 *
 * Er prüft, was ein echter Speicher prüft und was ein Fehler im Client sonst
 * erst in Produktion zeigte: dass jede Anfrage signiert ist (SigV4-Kopf mit
 * dem richtigen Schlüssel), und dass eine signierte Prüfsumme zum Inhalt
 * passt. Die Signatur selbst rechnet er nicht nach – das tut der Lauf gegen
 * einen echten S3-Nachbau (`S3_TEST_*`, siehe `api/fileStorage.test.ts`).
 */
export type FakeS3 = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  objects: Map<string, { body: Buffer; lastModified: Date }>;
  /** Alle Anfragen, in der Reihenfolge ihres Eingangs */
  requests: { method: string; path: string; authorization: string | null }[];
  /** Die nächsten `count` Anfragen mit diesem Status beantworten */
  failNext(count: number, status: number): void;
  close(): Promise<void>;
};

const xmlEscape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function errorXml(code: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${code}</Message></Error>`;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export async function startFakeS3(
  options: { pageSize?: number; bucket?: string } = {}
): Promise<FakeS3> {
  const bucket = options.bucket ?? "filahub-test";
  const accessKeyId = "FAKEACCESSKEY";
  const secretAccessKey = "fake-secret-do-not-log";
  const pageSize = options.pageSize ?? 1000;
  const objects = new Map<string, { body: Buffer; lastModified: Date }>();
  const requests: FakeS3["requests"] = [];
  let failures = { count: 0, status: 503 };

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const authorization = req.headers.authorization ?? null;
    requests.push({
      method: req.method ?? "",
      path: url.pathname,
      authorization,
    });
    const body = await readBody(req);
    const send = (status: number, payload = "", headers = {}) => {
      res.writeHead(status, { "content-type": "application/xml", ...headers });
      res.end(payload);
    };

    if (failures.count > 0) {
      failures.count--;
      return send(failures.status, errorXml("SlowDown"));
    }
    if (
      !authorization?.startsWith(
        `AWS4-HMAC-SHA256 Credential=${accessKeyId}/`
      ) ||
      !req.headers["x-amz-date"] ||
      !req.headers["x-amz-content-sha256"]
    ) {
      return send(403, errorXml("AccessDenied"));
    }

    const [, bucketName, ...rest] = url.pathname.split("/");
    if (bucketName !== bucket) return send(404, errorXml("NoSuchBucket"));
    const key = rest.map(decodeURIComponent).join("/");

    if (
      req.method === "GET" &&
      key === "" &&
      url.searchParams.get("list-type") === "2"
    ) {
      const prefix = url.searchParams.get("prefix") ?? "";
      const all = [...objects.keys()].filter(k => k.startsWith(prefix)).sort();
      // Das Token trägt absichtlich ein XML-Sonderzeichen: Der Client muss es
      // entschlüsseln und unverändert zurückgeben.
      const token = url.searchParams.get("continuation-token");
      const start = token ? Number(token.split("&")[1]) : 0;
      const page = all.slice(start, start + pageSize);
      const truncated = start + pageSize < all.length;
      const contents = page
        .map(
          k =>
            `<Contents><Key>${xmlEscape(k)}</Key><LastModified>${objects
              .get(k)!
              .lastModified.toISOString()}</LastModified><Size>${
              objects.get(k)!.body.length
            }</Size></Contents>`
        )
        .join("");
      return send(
        200,
        `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${bucket}</Name><Prefix>${xmlEscape(prefix)}</Prefix><KeyCount>${page.length}</KeyCount><IsTruncated>${truncated}</IsTruncated>${
          truncated
            ? `<NextContinuationToken>${xmlEscape(`seite&${start + pageSize}`)}</NextContinuationToken>`
            : ""
        }${contents}</ListBucketResult>`
      );
    }
    if (!key) return send(400, errorXml("InvalidRequest"));

    if (req.method === "PUT") {
      const claimed = req.headers["x-amz-content-sha256"];
      if (
        claimed !== "UNSIGNED-PAYLOAD" &&
        claimed !== createHash("sha256").update(body).digest("hex")
      ) {
        return send(400, errorXml("XAmzContentSHA256Mismatch"));
      }
      objects.set(key, { body, lastModified: new Date() });
      return send(200, "", { etag: '"x"' });
    }
    if (req.method === "GET") {
      const object = objects.get(key);
      if (!object) return send(404, errorXml("NoSuchKey"));
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": String(object.body.length),
      });
      return res.end(object.body);
    }
    if (req.method === "DELETE") {
      objects.delete(key);
      return send(204);
    }
    return send(405, errorXml("MethodNotAllowed"));
  });

  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    endpoint: `http://127.0.0.1:${port}`,
    bucket,
    accessKeyId,
    secretAccessKey,
    objects,
    requests,
    failNext(count, status) {
      failures = { count, status };
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      ),
  };
}
