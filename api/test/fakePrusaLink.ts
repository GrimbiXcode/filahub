import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Nachbau von PrusaLink für `api/bridge.test.ts` – nur so viel, wie die
 * Brücke anfragt: `/api/version`, `/api/v1/info`, `/api/v1/status`,
 * `/api/v1/job`, `/api/v1/files/…`, die Datei selbst unter `/usb/…`
 * (`refs.download`, wie in der Buddy-Firmware) und ihre Vorschau unter
 * `/thumb/l/usb/…` (`refs.thumbnail`). Anmeldung per `X-Api-Key` oder HTTP-Digest
 * (Benutzer `maker`), wie die Buddy-Firmware sie anbietet. Die Antwortformen
 * folgen der OpenAPI-Beschreibung von PrusaLink; an einem echten Gerät sind
 * sie noch nicht geprüft (Plan, „Vor der Umsetzung zu prüfen“).
 */
export type FakePrusaLinkState = {
  auth: { kind: "api_key"; key: string } | { kind: "digest"; password: string };
  printerState: string;
  job: {
    id: number;
    progress: number;
    timePrinting: number;
    fileName: string;
    meta: Record<string, unknown> | null;
    /** Metadaten nur über `/api/v1/files/…` statt am Job */
    metaOnlyInFiles?: boolean;
    /** Inhalt der Datei unter `/usb/<fileName>`; sonst 404 */
    fileBytes?: Uint8Array;
    /**
     * Kurzname (8.3) wie in der Buddy-Firmware: `name` und `refs.download`
     * nennen ihn, die Datei liegt aber nur unter dem langen Namen
     * (veraltete Kurzform nach dem Ersetzen einer gleichnamigen Datei).
     */
    shortName?: string;
    /** So viele Downloads zuerst mit 503 beantworten (Drucker beschäftigt) */
    fileBusy?: number;
    /**
     * Vorschau unter `/thumb/l/usb/<fileName>` (wie die Datei nur unter dem
     * langen Namen); sonst 404 – keine Vorschau in der Datei.
     */
    thumbnail?: Uint8Array;
    /** So viele Vorschau-Anfragen zuerst mit 503 beantworten */
    thumbnailBusy?: number;
  } | null;
  /** Statt PrusaLink: ein anderer Dienst */
  mode: "prusalink" | "not_found" | "html";
};

const md5 = (value: string) => createHash("md5").update(value).digest("hex");

export async function startFakePrusaLink(initial: FakePrusaLinkState) {
  const state = { ...initial };
  const requests: string[] = [];
  const nonce = "abc123nonce";

  function authorized(req: IncomingMessage): boolean {
    if (state.auth.kind === "api_key")
      return req.headers["x-api-key"] === state.auth.key;
    const header = req.headers.authorization ?? "";
    if (!header.startsWith("Digest ")) return false;
    const field = (name: string) =>
      header.match(new RegExp(`${name}="?([^",]+)"?`))?.[1] ?? "";
    const ha1 = md5(`${field("username")}:Printer API:${state.auth.password}`);
    const ha2 = md5(`${req.method}:${field("uri")}`);
    const expected = md5(
      `${ha1}:${field("nonce")}:${field("nc")}:${field("cnonce")}:auth:${ha2}`
    );
    return field("nonce") === nonce && field("response") === expected;
  }

  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    requests.push(path);
    if (state.mode === "html") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end("<html>Router</html>");
    }
    if (state.mode === "not_found") {
      res.writeHead(404);
      return res.end();
    }
    if (!authorized(req)) {
      res.writeHead(401, {
        "www-authenticate": `Digest realm="Printer API", nonce="${nonce}", qop="auth"`,
      });
      return res.end();
    }
    const json = (body: unknown) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const job = state.job;
    if (path === "/api/version")
      return json({
        api: "2.0.0",
        server: "2.1.2",
        text: "PrusaLink",
        hostname: "mk4s",
        firmware: "6.2.0",
      });
    if (path === "/api/v1/info")
      return json({
        serial: "SN-4711",
        hostname: "mk4s",
        nozzle_diameter: 0.4,
      });
    if (path === "/api/v1/status")
      return json({
        printer: { state: state.printerState, temp_nozzle: 215 },
        ...(job
          ? {
              job: {
                id: job.id,
                progress: job.progress,
                time_printing: job.timePrinting,
                time_remaining: 600,
              },
            }
          : {}),
      });
    if (path === "/api/v1/job") {
      if (!job) {
        res.writeHead(204);
        return res.end();
      }
      return json({
        id: job.id,
        state: state.printerState,
        progress: job.progress,
        time_printing: job.timePrinting,
        file: {
          name: job.shortName ?? job.fileName,
          display_name: job.fileName,
          path: "/usb",
          refs: {
            download: `/usb/${job.shortName ?? job.fileName}`,
            thumbnail: `/thumb/l/usb/${job.shortName ?? job.fileName}`,
          },
          ...(job.meta && !job.metaOnlyInFiles ? { meta: job.meta } : {}),
        },
      });
    }
    if (path.startsWith("/api/v1/files/") && job?.metaOnlyInFiles)
      return json({ name: job.fileName, meta: job.meta });
    if (job?.thumbnail && path === `/thumb/l/usb/${encodeURI(job.fileName)}`) {
      if (job.thumbnailBusy) {
        job.thumbnailBusy -= 1;
        res.writeHead(503);
        return res.end();
      }
      res.writeHead(200, { "content-type": "image/png" });
      return res.end(Buffer.from(job.thumbnail));
    }
    if (job?.fileBytes && path === `/usb/${encodeURI(job.fileName)}`) {
      if (job.fileBusy) {
        job.fileBusy -= 1;
        res.writeHead(503);
        return res.end();
      }
      res.writeHead(200, { "content-type": "application/octet-stream" });
      return res.end(Buffer.from(job.fileBytes));
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    state,
    requests,
    host: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}
