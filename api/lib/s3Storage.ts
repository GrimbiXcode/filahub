import { createHash } from "node:crypto";
import { AwsClient } from "aws4fetch";
import type { FileStorage } from "./fileStorage";
import { isStorageKey } from "./fileStorage";
import type { S3StorageConfig } from "./storageConfig";

/**
 * Dateiablage in einem S3-kompatiblen Objektspeicher (seit 4.4.0).
 *
 * **Warum kein AWS-SDK:** Gebraucht werden vier Aufrufe (PUT, GET, DELETE,
 * ListObjectsV2). Das SDK brächte dafür
 * einen Baum von Dutzenden Paketen ins Laufzeit-Abbild – jedes davon eine
 * Stelle, an der die nächste Schwachstelle auftaucht (siehe die Begründung im
 * `Dockerfile`). `aws4fetch` ist eine Datei ohne Abhängigkeiten und macht
 * genau das Schwierige: die Signatur (SigV4) samt Wiederholung bei 5xx/429.
 *
 * **Dieselbe Schlüsselform wie auf dem Volume** – `<präfix><ab>/<schlüssel>`.
 * Wer vom Verzeichnis umzieht, kopiert es unverändert in den Bucket
 * (`rclone copy`, `aws s3 sync`); die Datenbank bleibt, wie sie ist.
 *
 * **Ausgeliefert wird weiter über die App**, als Strom – keine vorsignierten
 * Adressen. Eine vorsignierte Adresse gälte bis zu ihrem Ablauf für jeden,
 * der sie hat, vorbei an Bereichsprüfung, Sperre und Zugriffsbegrenzung, und
 * die CSP müsste einen fremden Host für Bilder zulassen.
 */

/** Wie lange eine Anfrage bis zur Antwort (nicht bis zum Ende) dauern darf */
const REQUEST_TIMEOUT_MS = 30_000;
/** Wiederholungen bei 5xx und 429 – `aws4fetch` wartet dazwischen exponentiell */
const RETRIES = 3;
/** Schlüssel der Schreibprobe – passt bewusst nicht auf `isStorageKey` */
const PROBE_NAME = ".filahub-schreibprobe";

/** Fehler eines S3-Aufrufs – mit Status und S3-Fehlercode, nie mit Zugangsdaten */
export class S3Error extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(operation: string, status: number, code: string | null) {
    super(`S3 ${operation}: HTTP ${status}${code ? ` (${code})` : ""}`);
    this.status = status;
    this.code = code;
  }
}

/** XML-Entitäten, die S3 in Schlüsseln und Tokens schreibt */
function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16))
    )
    .replace(/&amp;/g, "&");
}

const tag = (xml: string, name: string) => {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return match ? decodeXml(match[1]) : null;
};

/**
 * Eine Seite von ListObjectsV2. Reines XML-Lesen, ohne Parser-Bibliothek: Die
 * Antwort ist flach, und gebraucht werden drei Felder.
 */
export function parseListObjects(xml: string): {
  objects: { key: string; lastModified: Date }[];
  nextToken: string | null;
} {
  const objects: { key: string; lastModified: Date }[] = [];
  for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = tag(match[1], "Key");
    const modified = tag(match[1], "LastModified");
    if (key == null || modified == null) continue;
    const lastModified = new Date(modified);
    if (Number.isNaN(lastModified.getTime())) continue;
    objects.push({ key, lastModified });
  }
  const truncated = tag(xml, "IsTruncated") === "true";
  return {
    objects,
    nextToken: truncated ? tag(xml, "NextContinuationToken") : null,
  };
}

/** Adresse eines Objekts (oder des Buckets, mit `objectKey` leer) */
export function s3Url(config: S3StorageConfig, objectKey: string): URL {
  const path = objectKey
    .split("/")
    .map(part => encodeURIComponent(part))
    .join("/");
  if (config.endpoint) {
    const base = new URL(config.endpoint);
    const basePath = base.pathname.replace(/\/+$/, "");
    if (config.forcePathStyle) {
      base.pathname = `${basePath}/${config.bucket}/${path}`;
    } else {
      base.hostname = `${config.bucket}.${base.hostname}`;
      base.pathname = `${basePath}/${path}`;
    }
    return base;
  }
  return config.forcePathStyle
    ? new URL(
        `https://s3.${config.region}.amazonaws.com/${config.bucket}/${path}`
      )
    : new URL(
        `https://${config.bucket}.s3.${config.region}.amazonaws.com/${path}`
      );
}

export function s3FileStorage(config: S3StorageConfig): FileStorage {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    sessionToken: config.sessionToken ?? undefined,
    service: "s3",
    region: config.region,
    retries: RETRIES,
  });

  /** `<präfix><ab>/<schlüssel>` – dieselbe Form wie im Verzeichnis */
  const objectKey = (key: string) => {
    if (!isStorageKey(key)) throw new Error("Ungültiger Speicherschlüssel");
    return `${config.prefix}${key.slice(0, 2)}/${key}`;
  };

  /**
   * Eine Anfrage mit Zeitlimit **bis zur Antwort**. Danach läuft der Körper
   * frei – ein 45-MB-Download über eine langsame Leitung darf dauern.
   */
  async function request(
    url: URL,
    init: RequestInit & { headers?: Record<string, string> }
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await client.fetch(url.toString(), {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function fail(operation: string, response: Response): Promise<never> {
    const body = await response.text().catch(() => "");
    throw new S3Error(operation, response.status, tag(body, "Code"));
  }

  async function putObject(key: string, data: Uint8Array) {
    const response = await request(s3Url(config, key), {
      method: "PUT",
      // Ein Uint8Array ist ein gültiger Körper; der Typ kennt nur die
      // ArrayBuffer-Variante, `Buffer` aus `node:fs` liegt auf ArrayBufferLike
      body: data as Uint8Array<ArrayBuffer>,
      headers: {
        /*
          Signierte Prüfsumme statt `UNSIGNED-PAYLOAD`: Der Speicher lehnt
          ab, was unterwegs verändert wurde, und die Signatur deckt den
          Inhalt mit ab.
        */
        "x-amz-content-sha256": createHash("sha256").update(data).digest("hex"),
        "content-type": "application/octet-stream",
      },
    });
    if (!response.ok) await fail("PUT", response);
    await response.body?.cancel();
  }

  async function deleteObject(key: string) {
    const response = await request(s3Url(config, key), { method: "DELETE" });
    // 404 ist beim Löschen kein Fehler: weg ist weg
    if (!response.ok && response.status !== 404) await fail("DELETE", response);
    await response.body?.cancel();
  }

  return {
    async put(key, data) {
      await putObject(objectKey(key), data);
    },

    async get(key) {
      const response = await request(s3Url(config, objectKey(key)), {
        method: "GET",
      });
      if (response.status === 404) {
        await response.body?.cancel();
        return null;
      }
      if (!response.ok) await fail("GET", response);
      return new Uint8Array(await response.arrayBuffer());
    },

    async open(key) {
      const response = await request(s3Url(config, objectKey(key)), {
        method: "GET",
      });
      if (response.status === 404) {
        await response.body?.cancel();
        return null;
      }
      if (!response.ok) await fail("GET", response);
      const size = Number(response.headers.get("content-length"));
      if (!response.body || !Number.isFinite(size)) {
        await response.body?.cancel();
        throw new S3Error("GET", response.status, "MissingContentLength");
      }
      return { stream: response.body, size };
    },

    async delete(key) {
      await deleteObject(objectKey(key));
    },

    async list() {
      const result: { key: string; modifiedAt: Date }[] = [];
      let token: string | null = null;
      do {
        const url = s3Url(config, "");
        url.searchParams.set("list-type", "2");
        if (config.prefix) url.searchParams.set("prefix", config.prefix);
        if (token) url.searchParams.set("continuation-token", token);
        const response = await request(url, { method: "GET" });
        if (!response.ok) await fail("LIST", response);
        const page = parseListObjects(await response.text());
        for (const object of page.objects) {
          // Nur, was nach unserer Form aussieht – fremde Objekte im Bucket
          // oder die Schreibprobe fasst der Aufräumlauf nie an.
          const rest = object.key.slice(config.prefix.length);
          const match = /^([0-9a-f]{2})\/([0-9a-f]{32})$/.exec(rest);
          if (!object.key.startsWith(config.prefix) || !match) continue;
          if (!match[2].startsWith(match[1])) continue;
          result.push({ key: match[2], modifiedAt: object.lastModified });
        }
        token = page.nextToken;
      } while (token);
      return result;
    },

    // Ein PUT ist in S3 atomar – halb geschriebene Objekte gibt es nicht
    async removeStaleTemp() {
      return 0;
    },

    /**
     * Schreiben und wieder löschen – ein bloßes HEAD auf den Bucket sagte
     * nur, dass er existiert, nicht, dass die Zugangsdaten schreiben dürfen.
     */
    async isWritable() {
      const probe = `${config.prefix}${PROBE_NAME}`;
      try {
        await putObject(probe, new TextEncoder().encode("ok"));
        await deleteObject(probe);
        return true;
      } catch {
        return false;
      }
    },
  };
}
