import { createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  isStorageKey,
  localFileStorage,
  newStorageKey,
  type FileStorage,
} from "./lib/fileStorage";
import { S3Error, parseListObjects, s3FileStorage } from "./lib/s3Storage";
import type { S3StorageConfig } from "./lib/storageConfig";
import { startFakeS3, type FakeS3 } from "./test/fakeS3";

/**
 * Die Ablage (seit 4.4.0 mit zwei Treibern): **eine** Testreihe, die jeder
 * Treiber bestehen muss – Verzeichnis, S3 gegen den Nachbau in
 * `api/test/fakeS3.ts` und, wenn `S3_TEST_*` gesetzt ist, S3 gegen einen
 * echten Speicher (MinIO, moto, ein Test-Bucket). Was der eine Treiber anders
 * macht als der andere, ist ein Fehler – der Rest der App kennt nur die
 * Schnittstelle.
 */

type Harness = {
  storage: FileStorage;
  /** Legt ein Objekt an, das nicht von der App stammt */
  addForeign(): Promise<void>;
  cleanup(): Promise<void>;
};

const bytes = (text: string) => new TextEncoder().encode(text);
/** Vergleich über die Prüfsumme – `toEqual` auf ein MB dauert Sekunden */
const digest = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");

async function readAll(stream: ReadableStream<Uint8Array>) {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function contract(name: string, make: () => Promise<Harness>) {
  describe(`Ablage: ${name}`, () => {
    let harness: Harness;
    let storage: FileStorage;
    beforeAll(async () => {
      harness = await make();
      storage = harness.storage;
    });
    afterAll(async () => {
      await harness?.cleanup();
    });

    it("legt ab und liest zurück – Byte für Byte", async () => {
      const key = newStorageKey();
      const data = new Uint8Array(randomBytes(1024 * 1024 + 7));
      await storage.put(key, data);
      expect(digest((await storage.get(key))!)).toBe(digest(data));
      const opened = await storage.open(key);
      expect(opened?.size).toBe(data.length);
      expect(digest(await readAll(opened!.stream))).toBe(digest(data));
    });

    it("meldet Fehlendes als null, Löschen ist wiederholbar", async () => {
      const key = newStorageKey();
      expect(await storage.get(key)).toBeNull();
      expect(await storage.open(key)).toBeNull();
      await storage.put(key, bytes("x"));
      await storage.delete(key);
      await storage.delete(key);
      expect(await storage.get(key)).toBeNull();
    });

    it("überschreibt denselben Schlüssel nicht halb", async () => {
      const key = newStorageKey();
      await storage.put(key, bytes("erste"));
      await storage.put(key, bytes("zweite"));
      expect(new TextDecoder().decode((await storage.get(key))!)).toBe(
        "zweite"
      );
      await storage.delete(key);
    });

    it("listet nur Schlüssel der App, samt Änderungszeit", async () => {
      const keys = [newStorageKey(), newStorageKey(), newStorageKey()];
      for (const key of keys) await storage.put(key, bytes(key));
      await harness.addForeign();
      const listed = await storage.list();
      const mine = listed.filter(entry => keys.includes(entry.key));
      expect(mine.map(e => e.key).sort()).toEqual([...keys].sort());
      for (const entry of listed) {
        expect(entry.key).toMatch(/^[0-9a-f]{32}$/);
        expect(entry.modifiedAt.getTime()).toBeGreaterThan(0);
      }
      for (const key of keys) await storage.delete(key);
    });

    it("prüft jeden Schlüssel, bevor er einen Pfad wird", async () => {
      for (const bad of [
        "../etc/passwd",
        "ABCDEF",
        "a/b",
        "",
        "x".repeat(32),
      ]) {
        await expect(storage.put(bad, bytes("x"))).rejects.toThrow();
        await expect(storage.get(bad)).rejects.toThrow();
        await expect(storage.open(bad)).rejects.toThrow();
        await expect(storage.delete(bad)).rejects.toThrow();
      }
    });

    it("ist beschreibbar und hinterlässt dabei nichts", async () => {
      const before = (await storage.list()).length;
      expect(await storage.isWritable()).toBe(true);
      expect((await storage.list()).length).toBe(before);
    });
  });
}

// --- Verzeichnis ------------------------------------------------------------

contract("Verzeichnis", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "filahub-ablage-"));
  return {
    storage: localFileStorage(dir),
    async addForeign() {
      await mkdir(path.join(dir, "zz"), { recursive: true });
      await writeFile(path.join(dir, "zz", "fremd.txt"), "x");
      await writeFile(path.join(dir, "README"), "x");
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
});

// --- S3 gegen den Nachbau ---------------------------------------------------

function configFor(fake: FakeS3, prefix = "instanz/"): S3StorageConfig {
  return {
    driver: "s3",
    bucket: fake.bucket,
    region: "us-east-1",
    endpoint: fake.endpoint,
    forcePathStyle: true,
    prefix,
    accessKeyId: fake.accessKeyId,
    secretAccessKey: fake.secretAccessKey,
    sessionToken: null,
  };
}

let fake: FakeS3;

contract("S3 (Nachbau)", async () => {
  // Kleine Seiten, damit das Weiterblättern der Liste mitgeprüft wird
  fake = await startFakeS3({ pageSize: 2 });
  return {
    storage: s3FileStorage(configFor(fake)),
    async addForeign() {
      fake.objects.set("instanz/zz/fremd.txt", {
        body: Buffer.from("x"),
        lastModified: new Date(),
      });
      fake.objects.set("andere-instanz/ab/" + "ab".padEnd(32, "0"), {
        body: Buffer.from("x"),
        lastModified: new Date(),
      });
    },
    cleanup: () => fake.close(),
  };
});

describe("S3-Treiber im Einzelnen", () => {
  let server: FakeS3;
  beforeAll(async () => {
    server = await startFakeS3({ pageSize: 2 });
  });
  afterAll(() => server.close());

  it("legt unter Präfix und Unterordner ab – wie im Verzeichnis", async () => {
    const storage = s3FileStorage(configFor(server, "a/b/"));
    const key = newStorageKey();
    await storage.put(key, bytes("x"));
    expect([...server.objects.keys()]).toContain(
      `a/b/${key.slice(0, 2)}/${key}`
    );
    await storage.delete(key);
  });

  it("signiert jede Anfrage und die Prüfsumme des Inhalts", async () => {
    server.requests.length = 0;
    const storage = s3FileStorage(configFor(server));
    await storage.put(newStorageKey(), bytes("inhalt"));
    await storage.list();
    expect(server.requests.length).toBeGreaterThan(0);
    for (const request of server.requests)
      expect(request.authorization).toMatch(
        /^AWS4-HMAC-SHA256 Credential=FAKEACCESSKEY\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=[^,]*x-amz-content-sha256[^,]*, Signature=[0-9a-f]{64}$/
      );
  });

  it("wiederholt bei 503 und gibt bei falschen Zugangsdaten auf", async () => {
    const storage = s3FileStorage(configFor(server));
    const key = newStorageKey();
    server.failNext(2, 503);
    await storage.put(key, bytes("trotzdem"));
    expect(await storage.get(key)).toEqual(bytes("trotzdem"));

    const wrong = s3FileStorage({
      ...configFor(server),
      accessKeyId: "FALSCH",
      secretAccessKey: "sehr-geheim-123",
    });
    const error = await wrong.get(key).catch(e => e);
    expect(error).toBeInstanceOf(S3Error);
    expect(error).toMatchObject({ status: 403, code: "AccessDenied" });
    // Die Meldung nennt nie ein Geheimnis
    expect(String(error.message)).not.toMatch(/sehr-geheim|FALSCH/);
    expect(await wrong.isWritable()).toBe(false);
  });

  it("meldet einen nicht erreichbaren Speicher als nicht beschreibbar", async () => {
    const storage = s3FileStorage({
      ...configFor(server),
      endpoint: "http://127.0.0.1:1",
    });
    expect(await storage.isWritable()).toBe(false);
  });

  it("gibt einen hängenden Speicher nach dem Zeitlimit auf", async () => {
    const storage = s3FileStorage(configFor(server), { timeoutMs: 300 });
    const key = newStorageKey();
    await storage.put(key, bytes("da"));
    for (const mode of ["headers", "body"] as const) {
      server.stallNext(mode);
      const started = Date.now();
      const error = await storage.get(key).catch(e => e);
      expect(error).toMatchObject({ code: "Timeout" });
      expect(Date.now() - started).toBeLessThan(3000);
    }
    server.stallNext("headers");
    await expect(storage.put(key, bytes("neu"))).rejects.toMatchObject({
      code: "Timeout",
    });
    // Eine Schreibprobe gegen einen hängenden Speicher hält den Start nicht auf
    server.stallNext("headers");
    expect(await storage.isWritable()).toBe(false);
  });

  it("liefert die richtige Größe auch ohne content-length", async () => {
    const storage = s3FileStorage(configFor(server));
    const key = newStorageKey();
    await storage.put(key, bytes("hallo welt"));
    server.chunked = true;
    try {
      const opened = await storage.open(key);
      expect(opened?.size).toBe(10);
      expect(new TextDecoder().decode(await readAll(opened!.stream))).toBe(
        "hallo welt"
      );
    } finally {
      server.chunked = false;
    }
  });

  it("liest ListObjectsV2 samt Sonderzeichen und Weiterblättern", () => {
    const page = parseListObjects(
      `<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>a&amp;b&lt;c</NextContinuationToken>` +
        `<Contents><Key>x/a&amp;b</Key><LastModified>2026-09-01T10:00:00.000Z</LastModified></Contents>` +
        `<Contents><Key>kaputt</Key><LastModified>gestern</LastModified></Contents></ListBucketResult>`
    );
    expect(page.nextToken).toBe("a&b<c");
    expect(page.objects).toEqual([
      { key: "x/a&b", lastModified: new Date("2026-09-01T10:00:00.000Z") },
    ]);
    expect(
      parseListObjects(
        "<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>"
      )
    ).toEqual({ objects: [], nextToken: null });
  });
});

// --- S3 gegen einen echten Speicher (optional) --------------------------------

/*
  Mit gesetzten `S3_TEST_*` läuft dieselbe Reihe gegen einen echten
  S3-kompatiblen Speicher – dort wird auch die Signatur nachgerechnet. Der
  Bucket muss existieren; die Tests räumen ihre Schlüssel unter einem
  zufälligen Präfix selbst ab.
*/
const real = {
  endpoint: process.env.S3_TEST_ENDPOINT,
  bucket: process.env.S3_TEST_BUCKET,
  accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY,
  region: process.env.S3_TEST_REGION ?? "us-east-1",
};

if (real.endpoint && real.bucket && real.accessKeyId && real.secretAccessKey) {
  contract("S3 (echter Speicher)", async () => {
    /*
      Ein zufälliges Präfix trennt parallele Läufe im selben Bucket.
      `S3_TEST_PREFIX` überschreibt es – auch leer: moto rechnet die Signatur
      einer Liste mit `/` im `prefix` falsch nach (boto3 scheitert dort
      genauso wie dieser Client, AWS nimmt beide an).
    */
    const prefix =
      process.env.S3_TEST_PREFIX ??
      `filahub-test-${newStorageKey().slice(0, 8)}/`;
    const config: S3StorageConfig = {
      driver: "s3",
      bucket: real.bucket!,
      region: real.region,
      endpoint: real.endpoint!,
      forcePathStyle: process.env.S3_TEST_FORCE_PATH_STYLE !== "false",
      prefix,
      accessKeyId: real.accessKeyId!,
      secretAccessKey: real.secretAccessKey!,
      sessionToken: null,
    };
    const base = s3FileStorage(config);
    /*
      Aufgeräumt wird nur, was die Tests selbst angelegt haben – nie „alles,
      was die Liste zeigt“. Mit leerem Präfix (moto, siehe oben) enthielte
      die Liste sonst die Dateien einer App, die denselben Bucket benutzt.
    */
    const created = new Set<string>();
    const storage: FileStorage = {
      ...base,
      put: async (key, data) => {
        if (isStorageKey(key)) created.add(key);
        await base.put(key, data);
      },
    };
    const foreign = s3FileStorage({ ...config, prefix: `${prefix}zz-` });
    return {
      storage,
      async addForeign() {
        // Ein Objekt unter dem Präfix, aber nicht in der Form der App
        await foreign.put("f".repeat(32), bytes("fremd"));
      },
      async cleanup() {
        for (const key of created) await base.delete(key);
        await foreign.delete("f".repeat(32));
      },
    };
  });
}
