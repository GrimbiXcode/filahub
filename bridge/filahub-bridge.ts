/**
 * filahub-Brücke für PrusaLink (seit 4.7.0).
 *
 * Läuft als Container im eigenen Netz und braucht genau zwei Angaben:
 *
 *   FILAHUB_URL    Adresse der filahub-Instanz, z. B. https://filahub.example
 *   FILAHUB_TOKEN  Brücken-Schlüssel aus der App (fh_…)
 *
 * Alles andere – welche Drucker, Adresse, Zugang – pflegt der Benutzer in der
 * App unter „Verbindungen“. Die Brücke holt die Konfiguration regelmäßig ab
 * (`GET /api/bridge/config`), fragt die Drucker über PrusaLink ab, meldet
 * Zustand und Diagnose zurück (`POST /api/bridge/report`) und liefert fertige
 * Drucke ins Eingangsfach (`POST /api/ingest/print-imports`), seit 4.10.0
 * samt der Vorschau aus der Druckdatei (`…/print-imports/:id/preview`).
 *
 * Bewusst **ohne Abhängigkeiten**: Node 26 führt diese Datei direkt aus
 * (Type Stripping), das Image enthält nichts als Node und sie. Deshalb nur
 * Typsyntax, die sich wegstreichen lässt (keine Enums, keine
 * Parameter-Properties), und keine Importe aus dem übrigen Projekt – die
 * Protokollform steht in `contracts/bridge.ts` ein zweites Mal, mit zod, und
 * `api/bridge.test.ts` prüft beide gegeneinander.
 *
 * Optional:
 *   DATA_DIR             Ablage der Warteschlange und ihrer Vorschauen (Vorgabe /data)
 *   BRIDGE_ALLOW_PUBLIC  1 = auch Drucker außerhalb des lokalen Netzes
 */

import { createHash, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { crc32, inflateSync } from "node:zlib";

export const BRIDGE_VERSION = "4.10.0";
export const BRIDGE_PROTOCOL = 1;

// ---------------------------------------------------------------------------
// Protokoll (Gegenstück: contracts/bridge.ts)
// ---------------------------------------------------------------------------

export type AuthKind = "api_key" | "digest";

export type ConfigPrinter = {
  id: number;
  name: string;
  host: string;
  authKind: AuthKind;
  username: string | null;
  secret: string | null;
  testRequestedAt: string | null;
};

export type BridgeConfig = {
  protocol: number;
  configPollSeconds: number;
  printerPollSeconds: number;
  printers: ConfigPrinter[];
};

export type PrinterState =
  | "ok"
  | "pending"
  | "invalid_host"
  | "blocked_public"
  | "dns_failed"
  | "refused"
  | "timeout"
  | "unreachable"
  | "unauthorized"
  | "not_prusalink"
  | "tls"
  | "error";

export type PrinterReport = {
  id: number;
  state: PrinterState;
  detail: string | null;
  httpStatus: number | null;
  checkedAt: string;
  testAnsweredFor: string | null;
  printerState: string | null;
  info: {
    model: string | null;
    firmware: string | null;
    serial: string | null;
    nozzleDiameter: number | null;
  } | null;
  job: {
    id: number | null;
    fileName: string | null;
    progressPercent: number | null;
    timePrintingSeconds: number | null;
    timeRemainingSeconds: number | null;
  } | null;
  metaWarning: string | null;
};

export type LogLine = {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
};

export type ImportedFilament = {
  slot: number;
  grams: number;
  filamentType: string | null;
  colorHex: string | null;
  profileName: string | null;
  vendor: string | null;
};

export type PrintImport = {
  source: "printer";
  externalKey: string;
  title: string;
  printedAt: string;
  status: "success" | "failed" | "cancelled";
  progressPercent: number | null;
  durationMinutes: number | null;
  printer: string | null;
  filaments: ImportedFilament[];
  gramsEstimated: boolean;
};

/**
 * Ein vorgemerkter Druck in der Warteschlange. `importId` steht, sobald
 * filahub den Eintrag angenommen hat – dann fehlt nur noch die Vorschau.
 * `preview` ist der Name ihrer Datei unter `DATA_DIR/previews/` (ohne
 * `DATA_DIR`: nur im Speicher).
 */
export type QueuedImport = {
  item: PrintImport;
  preview: string | null;
  importId: number | null;
  previewTries: number;
};

const PRUSALINK_STATES = [
  "IDLE",
  "BUSY",
  "PRINTING",
  "PAUSED",
  "FINISHED",
  "STOPPED",
  "ERROR",
  "ATTENTION",
  "READY",
];

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

const MAX_LOG_LINES = 40;
const MAX_QUEUE = 500;
const REQUEST_TIMEOUT_MS = 6_000;
/** Den Kopf einer Druckdatei lesen – der Drucker liefert langsam, auch beim Drucken */
const FILE_HEAD_TIMEOUT_MS = 45_000;
/**
 * Höchstens so viel einer Druckdatei wird geladen. Bei bgcode stehen alle
 * Metadaten vor dem ersten G-Code-Block, nach den Vorschaubildern (beim
 * Core One einige 100 KB); gelesen wird nur bis dorthin.
 */
export const FILE_HEAD_MAX_BYTES = 2 * 1024 * 1024;
const BGCODE_MAX_BLOCKS = 256;
/**
 * Versuche, die Gramm aus der Datei zu lesen: beim ersten Sehen des Drucks,
 * dann mit wachsendem Abstand (30 s, 1, 2, 4, 8 min) und ein letztes Mal beim
 * Ende. Beim Start ist der Drucker oft beschäftigt (Vorschau, Zuordnung der
 * MMU-Plätze, Laden des Filaments) und beantwortet den Download nicht.
 */
const META_ATTEMPTS = 6;
/**
 * ASCII-G-Code nennt den Verbrauch erst am Ende (PrusaSlicer 3.0 auch nicht
 * mehr im Kopf). Range-Anfragen kennt die Buddy-Firmware nicht: Nach dem
 * Druck – der Drucker ist dann frei – wird die ganze Datei durchgereicht und
 * nur ihr Ende behalten. Im Hintergrund, damit die Meldungen weiterlaufen.
 */
export const GCODE_TAIL_BYTES = 512 * 1024;
const GCODE_TAIL_MAX_FILE_BYTES = 512 * 1024 * 1024;
const GCODE_TAIL_TIMEOUT_MS = 30 * 60_000;
const META_RETRY_BASE_MS = 30_000;
const BGCODE_MAX_METADATA_BYTES = 1024 * 1024;
const FILAHUB_TIMEOUT_MS = 15_000;
/**
 * Vorschau aus der Druckdatei (seit 4.10.0): `GET /thumb/l/<pfad>` liefert das
 * erste PNG über 16 × 16 px. Höchstens 1 MB – dieselbe Grenze wie der Server
 * (`MAX_PRINT_IMPORT_PREVIEW_BYTES`). Die Firmware muss das Bild erst aus der
 * Datei holen; das dauert beim Drucken.
 */
export const PREVIEW_MAX_BYTES = 1024 * 1024;
const PREVIEW_TIMEOUT_MS = 20_000;
/** Versuche beim ersten Sehen und danach (30 s, 1, 2 min), dazu einer beim Ende */
const PREVIEW_ATTEMPTS = 4;
/** So oft wird das Hochladen der Vorschau wiederholt, bevor sie verfällt */
const PREVIEW_UPLOAD_TRIES = 10;
/** Wird je Durchlauf beschrieben; der HEALTHCHECK prüft sein Alter */
const HEARTBEAT_FILE = "/tmp/filahub-bridge-alive";

/** Ob eine Adresse im lokalen Netz liegt (Gegenstück: `isPrivateAddress`) */
export function isPrivateIp(address: string): boolean {
  const h = address.replace(/^\[|\]$/g, "").toLowerCase();
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  return (
    h === "::1" ||
    h.startsWith("fc") ||
    h.startsWith("fd") ||
    h.startsWith("fe80:")
  );
}

/** „Benchy_0.4n_0.2mm_PLA_MK4S_1h3m.bgcode“ → „Benchy“ (wie im Formular) */
export function titleFromFileName(fileName: string): string {
  const base = fileName
    .replace(/^.*[\\/]/, "")
    .replace(/\.(b?gcode|bgc|gco|g)$/i, "");
  const stripped = base.replace(/_\d+(?:\.\d+)?n_\d+(?:\.\d+)?mm_.*$/, "");
  return (stripped || base || "Druck").slice(0, 255);
}

/** `"A";"B"` bzw. `A;B` → Liste; leere Einträge bleiben als `null` */
export function splitList(value: string | undefined): (string | null)[] {
  if (value === undefined) return [];
  const items: (string | null)[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '"') quoted = !quoted;
    else if (char === "\\" && quoted && i + 1 < value.length)
      current += value[++i];
    else if (char === ";" && !quoted) {
      items.push(current.trim() || null);
      current = "";
    } else current += char;
  }
  items.push(current.trim() || null);
  return items;
}

function normalizeColor(value: string | null | undefined): string | null {
  const match = value?.trim().match(/^#([0-9a-f]{6})$/i);
  return match ? `#${match[1].toLowerCase()}` : null;
}

/**
 * Filamente aus den Metadaten einer Datei, wie PrusaLink sie liefert – mit
 * denselben Schlüsseln wie im G-Code (`filament used [g]` …). Werte dürfen
 * Zahl oder Text sein.
 */
export function filamentsFromMeta(
  meta: Record<string, unknown> | null | undefined
): ImportedFilament[] | null {
  if (!meta) return null;
  const text = (key: string) => {
    const value = meta[key];
    if (value === undefined || value === null) return undefined;
    return Array.isArray(value) ? value.join(",") : String(value);
  };
  const gramsRaw = text("filament used [g]");
  if (gramsRaw === undefined) return null;
  const grams = gramsRaw.split(",").map(v => Number(v.trim()));
  const types = splitList(text("filament_type"));
  const colors = splitList(text("filament_colour"));
  const extruderColors = splitList(text("extruder_colour"));
  const profiles = splitList(text("filament_settings_id"));
  const result: ImportedFilament[] = [];
  grams.forEach((raw, slot) => {
    if (!Number.isFinite(raw) || raw <= 0 || result.length >= 16) return;
    result.push({
      slot,
      grams: Math.round(raw * 100) / 100,
      filamentType: types[slot] ?? null,
      colorHex:
        normalizeColor(extruderColors[slot]) ?? normalizeColor(colors[slot]),
      profileName: profiles[slot]?.replace(/\s*@.*$/, "").trim() || null,
      vendor: null,
    });
  });
  return result;
}

/**
 * Eine Vorschau, die nie brauchbar wird (zu groß) – kein weiterer Versuch,
 * anders als bei einem beschäftigten Drucker.
 */
export class PreviewUnusableError extends Error {}

/** Wohin die Vorschau eines Eintrags geht (Gegenstück: `printImportPreviewIngestPath`) */
export function previewIngestPath(importId: number): string {
  return `/api/ingest/print-imports/${importId}/preview`;
}

/** Eine Druckdatei, deren Kopf sich nicht lesen lässt – mit Grund fürs Protokoll */
export class PrintFileHeadError extends Error {}

/**
 * Metadaten aus dem Anfang einer Druckdatei – für PrusaLink in der
 * Buddy-Firmware (MK4S, Core One, XL), die weder am Job noch in der
 * Dateiliste Metadaten nennt. Dieselben Schlüssel wie in den Metadaten von
 * PrusaLink, damit `filamentsFromMeta` beide liest.
 *
 * - **bgcode:** alle Metadaten-Blöcke bis zum ersten G-Code-Block
 *   (Gegenstück: `readBgcodeMetadata` in `contracts/slicerMetadata.ts`).
 * - **ASCII-G-Code:** Kommentarzeilen `; key = value` im gelesenen Anfang.
 *   Steht der Verbrauch nur am Ende einer großen Datei, bleibt er unbekannt –
 *   PrusaLink in der Buddy-Firmware kennt keine Range-Anfragen.
 *
 * Ergebnis `"more"`: Es fehlen Bytes, `complete` sagt, dass keine mehr kommen.
 * `null`: keine Angaben eines Slicers. Eine kaputte oder unbekannte Datei
 * wirft `PrintFileHeadError` mit dem Grund.
 */
export function metaFromPrintFileHead(
  bytes: Uint8Array,
  complete: boolean
): Record<string, string> | "more" | null {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);
  if (buffer.length < 10 && !complete) return "more";
  if (buffer.subarray(0, 4).toString("latin1") === "GCDE")
    return bgcodeMeta(buffer, complete);
  const end = complete ? buffer.length : buffer.lastIndexOf(0x0a) + 1;
  const text = buffer.subarray(0, end).toString("utf8");
  if (text.includes("\u0000"))
    throw new PrintFileHeadError("weder G-Code noch Binär-G-Code");
  const meta: Record<string, string> = {};
  // Der Kopf endet mit dem ersten Befehl – danach kommt nur noch G-Code
  let reachedGcode = false;
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^; ([^=;]+?) = (.*)$/);
    if (match) meta[match[1]] = match[2].trim();
    else if (/^[GMT]\d/.test(line)) {
      reachedGcode = true;
      break;
    }
  }
  if (meta["filament used [g]"] !== undefined) return meta;
  if (!complete && !reachedGcode) return "more";
  return Object.keys(meta).length ? meta : null;
}

/** `true`, wenn der Anfang zu Binär-G-Code gehört */
export function isBgcodeHead(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    Buffer.from(bytes.buffer, bytes.byteOffset, 4).toString("latin1") === "GCDE"
  );
}

/**
 * Kommentarzeilen `; key = value` aus dem Ende einer ASCII-Datei. Die erste
 * Zeile ist angeschnitten und fällt weg, außer das Ende ist die ganze Datei.
 */
export function metaFromGcodeTail(
  bytes: Uint8Array,
  wholeFile: boolean
): Record<string, string> {
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length)
    .toString("utf8")
    .split(/\r?\n/);
  const meta: Record<string, string> = {};
  for (let i = wholeFile ? 0 : 1; i < text.length; i++) {
    const match = text[i].match(/^; ([^=;]+?) = (.*)$/);
    if (match) meta[match[1]] = match[2].trim();
  }
  return meta;
}

function bgcodeMeta(
  buffer: Buffer,
  complete: boolean
): Record<string, string> | "more" | null {
  const partial = (meta: Record<string, string>) =>
    complete ? (Object.keys(meta).length ? meta : null) : "more";
  if (buffer.length < 10) return partial({});
  const version = buffer.readUInt32LE(4);
  const checksumType = buffer.readUInt16LE(8);
  if (version !== 1 || checksumType > 1)
    throw new PrintFileHeadError(
      `bgcode-Fassung ${version}, Prüfsummenart ${checksumType} unbekannt`
    );
  const checksumBytes = checksumType === 1 ? 4 : 0;
  const meta: Record<string, string> = {};
  let offset = 10;
  for (let blocks = 0; blocks < BGCODE_MAX_BLOCKS; blocks++) {
    if (offset + 12 > buffer.length) {
      // Ein G-Code-Block braucht nur seinen Typ, um das Ende anzuzeigen
      if (offset + 2 <= buffer.length && buffer.readUInt16LE(offset) === 1)
        return meta;
      return partial(meta);
    }
    const type = buffer.readUInt16LE(offset);
    const compression = buffer.readUInt16LE(offset + 2);
    const uncompressedSize = buffer.readUInt32LE(offset + 4);
    if (type === 1) return meta; // G-Code: alle Metadaten gelesen
    if (type > 5) throw new PrintFileHeadError(`unbekannter Blocktyp ${type}`);
    const headerSize = compression === 0 ? 8 : 12;
    const dataSize =
      compression === 0 ? uncompressedSize : buffer.readUInt32LE(offset + 8);
    const paramsSize = type === 5 ? 6 : 2;
    const blockSize = headerSize + paramsSize + dataSize;
    if (type !== 5) {
      if (
        uncompressedSize > BGCODE_MAX_METADATA_BYTES ||
        dataSize > BGCODE_MAX_METADATA_BYTES
      )
        throw new PrintFileHeadError("Metadaten-Block zu groß");
      if (offset + blockSize + checksumBytes > buffer.length)
        return partial(meta);
      const block = buffer.subarray(offset, offset + blockSize);
      if (
        checksumBytes &&
        crc32(block) !== buffer.readUInt32LE(offset + blockSize)
      )
        throw new PrintFileHeadError(`Prüfsumme von Block ${type} falsch`);
      const encoding = block.readUInt16LE(headerSize);
      const data = block.subarray(headerSize + paramsSize);
      let text: string | null = null;
      try {
        if (compression === 0) text = data.toString("utf8");
        else if (compression === 1)
          text = inflateSync(data, {
            maxOutputLength: BGCODE_MAX_METADATA_BYTES,
          }).toString("utf8");
      } catch {
        throw new PrintFileHeadError(
          `Block ${type} lässt sich nicht entpacken`
        );
      }
      if (text === null)
        throw new PrintFileHeadError(
          `Block ${type}: Kompression ${compression} unbekannt`
        );
      if (encoding === 0) {
        for (const line of text.split(/\r?\n/)) {
          const index = line.indexOf("=");
          if (index > 0)
            meta[line.slice(0, index).trim()] = line.slice(index + 1);
        }
      }
    }
    offset += blockSize + checksumBytes;
  }
  throw new PrintFileHeadError("zu viele Blöcke vor dem G-Code");
}

/** Chunks, die ein PNG zum Zeichnen braucht – alles andere fällt weg */
const PNG_KEEP_CHUNKS = new Set(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/**
 * Entfernt aus einem PNG alle Hilfs-Chunks: Text (`tEXt`, `zTXt`, `iTXt`),
 * EXIF, Zeitstempel, Farbprofile, Animation. Behalten werden nur IHDR, PLTE,
 * tRNS, IDAT und IEND, Byte für Byte – die Bildpunkte bleiben unverändert.
 * Der Server lehnt jedes Bild mit Metadaten ab (`hasMetadata` in
 * `contracts/printFiles.ts`); PrusaSlicer schreibt zwar keine, aber was in
 * der Datei steckt, bestimmt am Ende das Programm, das sie erzeugt hat.
 *
 * `null`, wenn es kein vollständiges, unversehrtes PNG ist (Signatur, IHDR
 * zuerst, Bilddaten, Prüfsummen der behaltenen Chunks, IEND).
 */
export function stripPngMetadata(bytes: Uint8Array): Uint8Array | null {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);
  if (buffer.length < 8 + 12 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE))
    return null;
  const kept: Buffer[] = [PNG_SIGNATURE];
  let offset = 8;
  let first = true;
  let hasImage = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (length > 0x7fffffff || end > buffer.length) return null;
    const type = buffer.subarray(offset + 4, offset + 8).toString("latin1");
    if (first && type !== "IHDR") return null;
    first = false;
    if (PNG_KEEP_CHUNKS.has(type)) {
      const crc = buffer.readUInt32BE(offset + 8 + length);
      if (crc32(buffer.subarray(offset + 4, offset + 8 + length)) !== crc)
        return null;
      kept.push(buffer.subarray(offset, end));
      if (type === "IDAT") hasImage = true;
    }
    offset = end;
    // Was hinter dem Bildende steht, gehört nicht zum Bild
    if (type === "IEND")
      return hasImage ? new Uint8Array(Buffer.concat(kept)) : null;
  }
  return null;
}

/** Fehlerursache aus `fetch` → Diagnosekennung */
export function classifyNetworkError(error: unknown): {
  state: PrinterState;
  detail: string;
} {
  const err = error as { name?: string; code?: string; cause?: unknown };
  const cause = (err?.cause ?? {}) as { code?: string; message?: string };
  const code = cause.code ?? err?.code ?? "";
  if (err?.name === "TimeoutError" || err?.name === "AbortError")
    return {
      state: "timeout",
      detail: "Keine Antwort innerhalb von 6 Sekunden",
    };
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "EAI_NONAME")
    return { state: "dns_failed", detail: `Name nicht auflösbar (${code})` };
  if (code === "ECONNREFUSED")
    return { state: "refused", detail: "Verbindung abgelehnt" };
  if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT")
    return {
      state: "timeout",
      detail: `Zeitüberschreitung beim Verbinden (${code})`,
    };
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH")
    return { state: "unreachable", detail: `Kein Weg zum Gerät (${code})` };
  if (
    code.startsWith("ERR_TLS") ||
    code.includes("CERT") ||
    code === "DEPTH_ZERO_SELF_SIGNED_CERT"
  )
    return { state: "tls", detail: `TLS-Fehler (${code})` };
  return {
    state: "error",
    detail: (cause.message ?? (error as Error)?.message ?? "unbekannt").slice(
      0,
      200
    ),
  };
}

// ---------------------------------------------------------------------------
// PrusaLink
// ---------------------------------------------------------------------------

type FetchFn = typeof fetch;

export class PrusaLinkError extends Error {
  state: PrinterState;
  httpStatus: number | null;
  constructor(state: PrinterState, detail: string, httpStatus: number | null) {
    super(detail);
    this.state = state;
    this.httpStatus = httpStatus;
  }
}

const md5 = (value: string) => createHash("md5").update(value).digest("hex");

/** Ein Drucker unter PrusaLink – Anmeldung per API-Schlüssel oder Digest */
export class PrusaLinkClient {
  printer: ConfigPrinter;
  fetchFn: FetchFn;
  allowPublic: boolean;
  resolve: (host: string) => Promise<string[]>;
  digest: {
    realm: string;
    nonce: string;
    qop: string | null;
    nc: number;
  } | null = null;

  constructor(
    printer: ConfigPrinter,
    options: {
      fetchFn: FetchFn;
      allowPublic: boolean;
      resolve: (host: string) => Promise<string[]>;
    }
  ) {
    this.printer = printer;
    this.fetchFn = options.fetchFn;
    this.allowPublic = options.allowPublic;
    this.resolve = options.resolve;
  }

  /** Vor jedem Kontakt: Adresse lesbar und im lokalen Netz? */
  async checkTarget(): Promise<URL> {
    let url: URL;
    try {
      url = new URL(this.printer.host);
    } catch {
      throw new PrusaLinkError("invalid_host", "Adresse nicht lesbar", null);
    }
    if (this.allowPublic) return url;
    const host = url.hostname.replace(/^\[|\]$/g, "");
    let addresses: string[];
    try {
      addresses = /^[\d.]+$|:/.test(host) ? [host] : await this.resolve(host);
    } catch (error) {
      const { state, detail } = classifyNetworkError({ cause: error });
      throw new PrusaLinkError(
        state === "error" ? "dns_failed" : state,
        detail,
        null
      );
    }
    if (addresses.length === 0 || !addresses.every(isPrivateIp))
      throw new PrusaLinkError(
        "blocked_public",
        `${host} liegt nicht im lokalen Netz (${addresses.join(", ") || "?"})`,
        null
      );
    return url;
  }

  /** Anfrage samt Anmeldung; wirft bei allem außer 2xx */
  async request(
    path: string,
    accept = "application/json",
    timeoutMs = REQUEST_TIMEOUT_MS
  ): Promise<Response> {
    const base = await this.checkTarget();
    const url = new URL(path, base);
    // Ein Pfad wie „//andere.host/…“ führte zu einem fremden Ziel
    if (url.origin !== base.origin)
      throw new PrusaLinkError("error", "Pfad außerhalb des Druckers", null);
    const send = () =>
      this.send(url, this.authHeader(url.pathname), accept, timeoutMs);
    let response = await send();
    if (response.status === 401 && this.printer.authKind === "digest") {
      const challenge = response.headers.get("www-authenticate") ?? "";
      await response.body?.cancel();
      if (this.takeChallenge(challenge)) response = await send();
    }
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw new PrusaLinkError(
        "unauthorized",
        this.printer.authKind === "api_key"
          ? "API-Schlüssel abgelehnt"
          : "Benutzername oder Passwort abgelehnt",
        response.status
      );
    }
    if (response.status === 404) {
      await response.body?.cancel();
      throw new PrusaLinkError(
        "not_prusalink",
        `${url.pathname} nicht gefunden – Firmware zu alt oder kein PrusaLink`,
        404
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new PrusaLinkError(
        "error",
        `Unerwartete Antwort HTTP ${response.status}`,
        response.status
      );
    }
    return response;
  }

  async get(path: string): Promise<unknown> {
    const response = await this.request(path);
    if (response.status === 204) {
      await response.body?.cancel();
      return null;
    }
    const type = response.headers.get("content-type") ?? "";
    const text = await response.text();
    if (!type.includes("json"))
      throw new PrusaLinkError(
        "not_prusalink",
        "Antwort ist kein JSON – kein PrusaLink",
        response.status
      );
    try {
      return JSON.parse(text);
    } catch {
      throw new PrusaLinkError(
        "not_prusalink",
        "Antwort ist kein gültiges JSON",
        response.status
      );
    }
  }

  /**
   * Liest den Anfang einer Datei vom Drucker, bis `parse` genug hat, und
   * bricht die Übertragung dann ab – höchstens `FILE_HEAD_MAX_BYTES`.
   */
  async readFileHead<T>(
    path: string,
    parse: (bytes: Uint8Array, complete: boolean) => T | "more"
  ): Promise<T> {
    const response = await this.request(
      path,
      "application/octet-stream",
      FILE_HEAD_TIMEOUT_MS
    );
    const reader = response.body?.getReader();
    if (!reader) return parse(new Uint8Array(0), true) as T;
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (value) {
          chunks.push(value);
          length += value.length;
        }
        const complete = done || length >= FILE_HEAD_MAX_BYTES;
        const bytes = Buffer.concat(chunks, length).subarray(
          0,
          FILE_HEAD_MAX_BYTES
        );
        const result = parse(bytes, complete);
        if (result !== "more" || complete) return result as T;
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }

  /**
   * Lädt ein Bild vom Drucker, höchstens `maxBytes`. Größer: Fehler, und die
   * Übertragung wird abgebrochen.
   */
  async readImage(path: string, maxBytes: number): Promise<Uint8Array> {
    const response = await this.request(path, "image/png", PREVIEW_TIMEOUT_MS);
    const reader = response.body?.getReader();
    if (!reader) return new Uint8Array(0);
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > maxBytes)
          throw new PreviewUnusableError(
            `Vorschau größer als ${Math.round(maxBytes / 1024)} KB`
          );
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    return new Uint8Array(Buffer.concat(chunks, length));
  }

  /**
   * Reicht eine ganze Datei durch und behält nur die letzten `tailBytes` –
   * für ASCII-G-Code, dessen Verbrauch erst am Ende steht.
   */
  async readFileTail(
    path: string,
    tailBytes: number
  ): Promise<{ tail: Uint8Array; total: number }> {
    const response = await this.request(
      path,
      "application/octet-stream",
      GCODE_TAIL_TIMEOUT_MS
    );
    const reader = response.body?.getReader();
    if (!reader) return { tail: new Uint8Array(0), total: 0 };
    let chunks: Uint8Array[] = [];
    let kept = 0;
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > GCODE_TAIL_MAX_FILE_BYTES)
          throw new PrusaLinkError("error", "Datei zu groß", null);
        chunks.push(value);
        kept += value.length;
        // Erst bei doppelter Menge kürzen – nicht bei jedem Stück kopieren
        if (kept > tailBytes * 2) {
          const merged = Buffer.concat(chunks, kept);
          chunks = [merged.subarray(kept - tailBytes)];
          kept = tailBytes;
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    const merged = Buffer.concat(chunks, kept);
    return { tail: merged.subarray(Math.max(0, kept - tailBytes)), total };
  }

  async send(
    url: URL,
    auth: Record<string, string>,
    accept = "application/json",
    timeoutMs = REQUEST_TIMEOUT_MS
  ): Promise<Response> {
    try {
      return await this.fetchFn(url, {
        headers: { accept, ...auth },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "manual",
      });
    } catch (error) {
      const { state, detail } = classifyNetworkError(error);
      throw new PrusaLinkError(state, detail, null);
    }
  }

  authHeader(uri: string): Record<string, string> {
    const secret = this.printer.secret ?? "";
    if (this.printer.authKind === "api_key")
      return secret ? { "x-api-key": secret } : {};
    if (!this.digest) return {};
    const username = this.printer.username ?? "maker";
    const { realm, nonce, qop } = this.digest;
    const ha1 = md5(`${username}:${realm}:${secret}`);
    const ha2 = md5(`GET:${uri}`);
    if (!qop) {
      const response = md5(`${ha1}:${nonce}:${ha2}`);
      return {
        authorization: `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`,
      };
    }
    this.digest.nc += 1;
    const nc = this.digest.nc.toString(16).padStart(8, "0");
    const cnonce = randomBytes(8).toString("hex");
    const response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`);
    return {
      authorization: `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=auth, nc=${nc}, cnonce="${cnonce}", response="${response}"`,
    };
  }

  /** Liest `WWW-Authenticate: Digest …`; `false`, wenn es keiner ist */
  takeChallenge(header: string): boolean {
    if (!/^Digest\s/i.test(header)) return false;
    const field = (name: string) =>
      header.match(new RegExp(`${name}="?([^",]+)"?`, "i"))?.[1] ?? null;
    const realm = field("realm");
    const nonce = field("nonce");
    if (!realm || !nonce) return false;
    const qop = field("qop");
    const fresh = this.digest?.nonce !== nonce;
    // Derselbe Nonce noch einmal abgelehnt: das Passwort ist falsch
    if (!fresh && !/stale="?true/i.test(header)) return false;
    this.digest = {
      realm,
      nonce,
      qop: qop && qop.split(",").includes("auth") ? "auth" : null,
      nc: 0,
    };
    return true;
  }
}

/**
 * Erst die Kurzform, bei 404 der lange Name im selben Verzeichnis – die
 * Kurzform kann veraltet sein, wenn eine gleichnamige Datei kurz vorher
 * ersetzt wurde. Für die Datei selbst und für ihre Vorschau.
 */
async function withFallbackPath<T>(
  primary: string,
  fallback: string | null,
  read: (path: string) => Promise<T>
): Promise<T> {
  try {
    return await read(encodeURI(primary));
  } catch (error) {
    const notFound =
      error instanceof PrusaLinkError && error.httpStatus === 404;
    if (!notFound || !fallback) throw error;
    return await read(encodeURI(fallback));
  }
}

/**
 * Ein Eintrag aus `queue.json`. Bis 4.9 lag dort der Druck selbst, seit
 * 4.10.0 ein `QueuedImport` – beides wird gelesen, damit ein Update keine
 * vorgemerkten Drucke verliert.
 */
function toQueuedImport(raw: unknown): QueuedImport[] {
  if (!raw || typeof raw !== "object") return [];
  const value = raw as Partial<QueuedImport> & Partial<PrintImport>;
  if (value.item && typeof value.item === "object")
    return [
      {
        item: value.item,
        preview: typeof value.preview === "string" ? value.preview : null,
        importId: typeof value.importId === "number" ? value.importId : null,
        previewTries:
          typeof value.previewTries === "number" ? value.previewTries : 0,
      },
    ];
  if (typeof value.externalKey === "string")
    return [
      {
        item: value as PrintImport,
        preview: null,
        importId: null,
        previewTries: 0,
      },
    ];
  return [];
}

// ---------------------------------------------------------------------------
// Die Brücke
// ---------------------------------------------------------------------------

type JobTrack = {
  jobId: number;
  fileName: string | null;
  filePath: string | null;
  /** `file.refs.download` – die Datei selbst, z. B. `/usb/BENCHY~1.BGC` */
  downloadPath: string | null;
  /** Statt der Kurzform: der lange Name im selben Verzeichnis */
  longPath: string | null;
  /** ASCII-G-Code ohne Verbrauch im Kopf: nach dem Druck das Ende lesen */
  needsTail: boolean;
  /** `file.refs.thumbnail`, z. B. `/thumb/l/usb/BENCHY~1.BGC` */
  thumbnailPath: string | null;
  /** Statt der Kurzform: `/thumb/l` mit dem langen Namen */
  longThumbnailPath: string | null;
  /** Die Vorschau, ohne Metadaten – gesetzt, sobald sie geladen ist */
  preview: Uint8Array | null;
  /** Kein weiterer Versuch: geladen, keine in der Datei oder unbrauchbar */
  previewDone: boolean;
  previewAttempts: number;
  nextPreviewAt: number;
  /** Ein laufender Versuch im Hintergrund – die Abfrage wartet nicht darauf */
  previewTask: Promise<void> | null;
  meta: Record<string, unknown> | null;
  metaTried: boolean;
  /** Versuche, die Datei selbst zu lesen, und wann der nächste dran ist */
  metaAttempts: number;
  nextMetaAt: number;
  lastMetaError: string | null;
  progress: number | null;
  timePrinting: number | null;
  firstSeenAt: number;
  lastPrinterState: string | null;
};

type PrinterRuntime = {
  config: ConfigPrinter;
  client: PrusaLinkClient;
  report: PrinterReport;
  info: PrinterReport["info"];
  job: JobTrack | null;
  /** Für welche Testanfrage zuletzt geantwortet wurde */
  answeredTest: string | null;
};

type FilahubResponse = { status: number; json: unknown };

export type BridgeOptions = {
  filahubUrl: string;
  token: string;
  dataDir: string | null;
  allowPublic: boolean;
  fetchFn?: FetchFn;
  resolve?: (host: string) => Promise<string[]>;
  now?: () => number;
};

export class Bridge {
  options: BridgeOptions;
  fetchFn: FetchFn;
  resolve: (host: string) => Promise<string[]>;
  now: () => number;
  startedAt: string;
  config: BridgeConfig | null = null;
  printers = new Map<number, PrinterRuntime>();
  queue: QueuedImport[] = [];
  /** Vorschauen der Warteschlange ohne `DATA_DIR` – sonst liegen sie als Datei */
  previewMemory = new Map<string, Uint8Array>();
  /** Vorschauen, die gerade auf den Datenträger geschrieben werden */
  previewWrites = new Map<string, Promise<void>>();
  /** Laufende Lesevorgänge nach dem Druck (Ende einer ASCII-Datei) */
  background = new Set<Promise<void>>();
  /** Beim Herunterfahren: Drucke, deren Ende noch gelesen wird, ohne Gramm vormerken */
  abandon = new Set<() => void>();
  log: LogLine[] = [];
  lastConfigAt = 0;
  /** Bis wann der Server nicht gefragt wird (Schlüssel ungültig) */
  pausedUntil = 0;
  stopped = false;

  constructor(options: BridgeOptions) {
    this.options = options;
    this.fetchFn = options.fetchFn ?? fetch;
    this.resolve =
      options.resolve ??
      (async host =>
        (await lookup(host, { all: true })).map(entry => entry.address));
    this.now = options.now ?? Date.now;
    this.startedAt = new Date(this.now()).toISOString();
  }

  write(level: LogLine["level"], message: string) {
    const line = { at: new Date(this.now()).toISOString(), level, message };
    this.log.push(line);
    if (this.log.length > MAX_LOG_LINES) this.log.shift();
    const out = `[${line.at}] ${level.toUpperCase()} ${message}`;
    if (level === "error") console.error(out);
    else console.log(out);
  }

  // -- filahub --------------------------------------------------------------

  async filahub(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    /** Statt JSON: Bytes mit diesem Typ (die Vorschau) */
    raw?: { bytes: Uint8Array; contentType: string }
  ): Promise<FilahubResponse> {
    const url = new URL(path, this.options.filahubUrl);
    const response = await this.fetchFn(url, {
      method,
      headers: {
        authorization: `Bearer ${this.options.token}`,
        "user-agent": `filahub-bridge/${BRIDGE_VERSION}`,
        ...(raw
          ? { "content-type": raw.contentType }
          : body
            ? { "content-type": "application/json" }
            : {}),
      },
      body: raw ? raw.bytes : body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(FILAHUB_TIMEOUT_MS),
    });
    const json: unknown = await response.json().catch(() => null);
    return { status: response.status, json };
  }

  /** 401/403 vom Server: Schlüssel entzogen, Konto gesperrt, Mitgliedschaft weg */
  handleAuthFailure(response: FilahubResponse): boolean {
    if (response.status !== 401 && response.status !== 403) return false;
    const message =
      (response.json as { error?: string } | null)?.error ?? "abgelehnt";
    this.write(
      "error",
      `filahub lehnt den Brücken-Schlüssel ab (${response.status}: ${message}). Neuer Versuch in 5 Minuten – wurde er entzogen, in der App einen neuen anlegen.`
    );
    this.pausedUntil = this.now() + 5 * 60_000;
    return true;
  }

  async refreshConfig(): Promise<void> {
    let response: FilahubResponse;
    try {
      response = await this.filahub("GET", "/api/bridge/config");
    } catch (error) {
      this.write(
        "warn",
        `filahub unter ${this.options.filahubUrl} nicht erreichbar: ${(error as Error).message}`
      );
      return;
    }
    if (this.handleAuthFailure(response)) return;
    if (response.status !== 200) {
      this.write(
        "warn",
        `Abholen der Konfiguration scheiterte mit HTTP ${response.status}`
      );
      return;
    }
    const config = response.json as BridgeConfig;
    if (config.protocol > BRIDGE_PROTOCOL)
      this.write(
        "warn",
        `filahub spricht Protokoll ${config.protocol}, diese Brücke ${BRIDGE_PROTOCOL} – bitte den Container aktualisieren (docker pull).`
      );
    this.config = config;
    this.lastConfigAt = this.now();
    this.reconcile(config.printers);
  }

  reconcile(printers: ConfigPrinter[]) {
    const seen = new Set<number>();
    for (const config of printers) {
      seen.add(config.id);
      const existing = this.printers.get(config.id);
      const changed =
        existing &&
        (existing.config.host !== config.host ||
          existing.config.authKind !== config.authKind ||
          existing.config.username !== config.username ||
          existing.config.secret !== config.secret);
      if (!existing || changed) {
        if (!existing)
          this.write("info", `Drucker „${config.name}“ hinzugekommen`);
        else
          this.write(
            "info",
            `Drucker „${config.name}“: Einstellungen geändert`
          );
        this.printers.set(config.id, {
          config,
          client: new PrusaLinkClient(config, {
            fetchFn: this.fetchFn,
            allowPublic: this.options.allowPublic,
            resolve: this.resolve,
          }),
          report: this.emptyReport(config.id),
          info: null,
          job: existing && !changed ? existing.job : null,
          answeredTest: existing?.answeredTest ?? null,
        });
      } else {
        existing.config = config;
        existing.client.printer = config;
      }
    }
    for (const id of [...this.printers.keys()])
      if (!seen.has(id)) {
        this.write("info", `Drucker ${id} entfernt`);
        this.printers.delete(id);
      }
  }

  emptyReport(id: number): PrinterReport {
    return {
      id,
      state: "pending",
      detail: null,
      httpStatus: null,
      checkedAt: new Date(this.now()).toISOString(),
      testAnsweredFor: null,
      printerState: null,
      info: null,
      job: null,
      metaWarning: null,
    };
  }

  // -- Drucker ----------------------------------------------------------------

  async pollPrinter(runtime: PrinterRuntime): Promise<void> {
    const { client, config } = runtime;
    const test =
      config.testRequestedAt && config.testRequestedAt !== runtime.answeredTest
        ? config.testRequestedAt
        : null;
    const previous = runtime.report.state;
    try {
      const status = (await client.get("/api/v1/status")) as {
        printer?: { state?: string };
        job?: {
          id?: number;
          progress?: number;
          time_printing?: number;
          time_remaining?: number;
        };
      } | null;
      if (!status || typeof status !== "object" || !status.printer)
        throw new PrusaLinkError(
          "not_prusalink",
          "Antwort ohne Druckerzustand – kein PrusaLink v1",
          200
        );
      if (!runtime.info || test) runtime.info = await this.readInfo(client);
      const printerState = PRUSALINK_STATES.includes(status.printer.state ?? "")
        ? (status.printer.state as string)
        : null;
      await this.trackJob(runtime, status.job ?? null, printerState);
      runtime.report = {
        ...runtime.report,
        state: "ok",
        detail: null,
        httpStatus: 200,
        printerState,
        info: runtime.info,
        job: runtime.job
          ? {
              id: runtime.job.jobId,
              fileName: runtime.job.fileName,
              progressPercent: runtime.job.progress,
              timePrintingSeconds: runtime.job.timePrinting,
              timeRemainingSeconds:
                typeof status.job?.time_remaining === "number"
                  ? Math.max(0, Math.round(status.job.time_remaining))
                  : null,
            }
          : null,
      };
      if (previous !== "ok")
        this.write("info", `Drucker „${config.name}“ verbunden`);
    } catch (error) {
      const failure =
        error instanceof PrusaLinkError
          ? error
          : new PrusaLinkError("error", (error as Error).message, null);
      if (failure.state !== previous || test)
        this.write(
          "warn",
          `Drucker „${config.name}“: ${failure.state} – ${failure.message}`
        );
      runtime.report = {
        ...runtime.report,
        state: failure.state,
        detail: failure.message.slice(0, 300),
        httpStatus: failure.httpStatus,
        printerState: null,
        job: null,
      };
    }
    runtime.report.checkedAt = new Date(this.now()).toISOString();
    if (test) {
      runtime.report.testAnsweredFor = test;
      runtime.answeredTest = test;
    }
  }

  async readInfo(client: PrusaLinkClient): Promise<PrinterReport["info"]> {
    const text = (value: unknown) =>
      typeof value === "string" && value.trim()
        ? value.trim().slice(0, 80)
        : null;
    const info = {
      model: null,
      firmware: null,
      serial: null,
      nozzleDiameter: null,
    } as NonNullable<PrinterReport["info"]>;
    try {
      const version = (await client.get("/api/version")) as Record<
        string,
        unknown
      > | null;
      info.firmware = text(version?.firmware) ?? text(version?.server);
      info.model = text(version?.printer) ?? text(version?.hostname);
    } catch (error) {
      if (error instanceof PrusaLinkError && error.state === "unauthorized")
        throw error;
    }
    try {
      const details = (await client.get("/api/v1/info")) as Record<
        string,
        unknown
      > | null;
      info.serial = text(details?.serial);
      info.model = info.model ?? text(details?.hostname);
      info.nozzleDiameter =
        typeof details?.nozzle_diameter === "number"
          ? details.nozzle_diameter
          : null;
    } catch (error) {
      if (error instanceof PrusaLinkError && error.state === "unauthorized")
        throw error;
    }
    return info;
  }

  /**
   * Verfolgt den laufenden Druck. Endet er – PrusaLink meldet FINISHED,
   * STOPPED oder ERROR, oder der Job verschwindet –, wird er eingeliefert.
   */
  async trackJob(
    runtime: PrinterRuntime,
    job: { id?: number; progress?: number; time_printing?: number } | null,
    printerState: string | null
  ): Promise<void> {
    const current = runtime.job;
    const jobId = typeof job?.id === "number" ? job.id : null;
    const ended =
      printerState === "FINISHED" ||
      printerState === "STOPPED" ||
      printerState === "ERROR";

    // Ein erledigter Job trägt seine ID negativ (siehe unten)
    if (current && (jobId === null || jobId !== Math.abs(current.jobId))) {
      /*
        Keine letzte Vorschau: Der Job ist verschwunden, die Datei womöglich
        gelöscht oder schon der nächste Druck dran – ein 404 hieße dann nicht
        „keine Vorschau in der Datei“. Ein laufender Versuch zählt noch.
      */
      if (current.jobId > 0) await this.readFileMeta(runtime, current, true);
      this.finishJob(runtime, current, current.lastPrinterState);
      runtime.job = null;
    }
    if (jobId === null) return;
    // PrusaLink zeigt einen fertigen Job weiter an – er ist schon gemeldet
    if (runtime.job && runtime.job.jobId < 0) return;

    let track = runtime.job;
    if (!track) {
      track = {
        jobId,
        fileName: null,
        filePath: null,
        downloadPath: null,
        longPath: null,
        needsTail: false,
        thumbnailPath: null,
        longThumbnailPath: null,
        preview: null,
        previewDone: false,
        previewAttempts: 0,
        nextPreviewAt: 0,
        previewTask: null,
        meta: null,
        metaTried: false,
        metaAttempts: 0,
        nextMetaAt: 0,
        lastMetaError: null,
        progress: null,
        timePrinting: null,
        firstSeenAt: this.now(),
        lastPrinterState: printerState,
      };
      runtime.job = track;
      await this.readJobDetails(runtime, track);
      this.write(
        "info",
        `Drucker „${runtime.config.name}“: Druck ${jobId} (${track.fileName ?? "unbekannte Datei"})`
      );
    }
    if (typeof job?.progress === "number") track.progress = job.progress;
    if (typeof job?.time_printing === "number")
      track.timePrinting = Math.round(job.time_printing);
    track.lastPrinterState = printerState;
    await this.readFileMeta(runtime, track, ended);
    this.startPreview(runtime, track, ended);
    if (ended) {
      this.finishJob(runtime, track, printerState);
      // Erledigt merken, damit derselbe Job nicht noch einmal gemeldet wird
      runtime.job = { ...track, jobId: -track.jobId };
    }
  }

  async readJobDetails(runtime: PrinterRuntime, track: JobTrack) {
    try {
      const job = (await runtime.client.get("/api/v1/job")) as {
        file?: {
          name?: string;
          display_name?: string;
          path?: string;
          refs?: { download?: string; thumbnail?: string };
          meta?: Record<string, unknown>;
        };
      } | null;
      track.fileName = job?.file?.display_name ?? job?.file?.name ?? null;
      track.filePath =
        job?.file?.path && job.file.name
          ? `${job.file.path.replace(/\/$/, "")}/${job.file.name}`
          : null;
      const download = job?.file?.refs?.download;
      track.downloadPath =
        typeof download === "string" && /^\/[^/]/.test(download)
          ? download
          : track.filePath;
      track.longPath =
        job?.file?.path && job.file.display_name
          ? `${job.file.path.replace(/\/$/, "")}/${job.file.display_name}`
          : null;
      if (track.longPath === track.downloadPath) track.longPath = null;
      // Die Buddy-Firmware nennt die Vorschau unter `/thumb/l<Kurzpfad>`
      const thumbnail = job?.file?.refs?.thumbnail;
      track.thumbnailPath =
        typeof thumbnail === "string" && /^\/thumb\/[a-z]\/[^/]/.test(thumbnail)
          ? thumbnail
          : null;
      track.longThumbnailPath =
        track.thumbnailPath && track.longPath
          ? `/thumb/l${track.longPath}`
          : null;
      if (track.longThumbnailPath === track.thumbnailPath)
        track.longThumbnailPath = null;
      track.meta = job?.file?.meta ?? null;
    } catch (error) {
      this.write(
        "warn",
        `Drucker „${runtime.config.name}“: Angaben zum Druck nicht lesbar (${(error as Error).message})`
      );
    }
    if (!filamentsFromMeta(track.meta) && track.filePath && !track.metaTried) {
      track.metaTried = true;
      try {
        const file = (await runtime.client.get(
          `/api/v1/files${track.filePath}`
        )) as { meta?: Record<string, unknown> } | null;
        track.meta = file?.meta ?? track.meta;
      } catch {
        // Die Buddy-Firmware kennt die Route mit Metadaten nicht – weiter unten
      }
    }
  }

  /**
   * Die Buddy-Firmware (MK4S, Core One, XL) nennt nirgends Metadaten: den
   * Anfang der Datei selbst lesen. Bei bgcode stehen sie vor dem G-Code.
   * Wiederholt mit wachsendem Abstand; `final` ist der letzte Versuch beim
   * Ende des Drucks und wartet den Abstand nicht ab.
   */
  async readFileMeta(runtime: PrinterRuntime, track: JobTrack, final: boolean) {
    if (filamentsFromMeta(track.meta) || !track.downloadPath) return;
    if (track.needsTail) return; // der Kopf hilft nicht, das Ende kommt nach dem Druck
    if (track.metaAttempts >= META_ATTEMPTS + (final ? 1 : 0)) return;
    if (!final && this.now() < track.nextMetaAt) return;
    track.metaAttempts += 1;
    track.nextMetaAt =
      this.now() + META_RETRY_BASE_MS * 2 ** (track.metaAttempts - 1);
    const name = runtime.config.name;
    let reason: string;
    try {
      let bgcode = false;
      const parse = (bytes: Uint8Array, complete: boolean) => {
        bgcode = isBgcodeHead(bytes);
        return metaFromPrintFileHead(bytes, complete);
      };
      const meta = await this.withFilePath(runtime, track, path =>
        runtime.client.readFileHead(path, parse)
      );
      if (meta) track.meta = { ...meta, ...(track.meta ?? {}) };
      if (filamentsFromMeta(track.meta)) {
        if (track.metaAttempts > 1)
          this.write(
            "info",
            `Drucker „${name}“: Filamentverbrauch im ${track.metaAttempts}. Versuch gelesen`
          );
        return;
      }
      if (!bgcode) {
        track.needsTail = true;
        this.write(
          "info",
          `Drucker „${name}“: G-Code nennt den Verbrauch erst am Ende – die Datei wird nach dem Druck gelesen`
        );
        return;
      }
      // Nur Schlüsselnamen, nie Werte – sie sagen, was der Slicer schrieb
      const keys = Object.keys(meta ?? {})
        .filter(key => /filament/i.test(key))
        .slice(0, 8);
      reason = meta
        ? `kein „filament used [g]“ in der Datei${keys.length ? ` (vorhanden: ${keys.join(", ")})` : ""}`
        : "keine Angaben eines Slicers in der Datei";
    } catch (error) {
      reason = `Datei nicht lesbar: ${(error as Error).message}`;
    }
    const last = track.metaAttempts >= META_ATTEMPTS || final;
    // Derselbe Grund nicht bei jedem Versuch ins Protokoll
    if (reason !== track.lastMetaError || last)
      this.write(
        "warn",
        `Drucker „${name}“: Filamentverbrauch nicht gelesen, ${track.metaAttempts}. Versuch – ${reason}${last ? "" : " (neuer Versuch folgt)"}`
      );
    track.lastMetaError = reason;
  }

  /**
   * Erst die Kurzform aus `refs.download`, bei 404 der lange Name im selben
   * Verzeichnis – die Kurzform kann veraltet sein, wenn eine gleichnamige
   * Datei kurz vorher ersetzt wurde.
   */
  async withFilePath<T>(
    runtime: PrinterRuntime,
    track: JobTrack,
    read: (path: string) => Promise<T>
  ): Promise<T> {
    return withFallbackPath(track.downloadPath ?? "", track.longPath, read);
  }

  /**
   * Die Vorschau aus der Druckdatei: beim ersten Sehen des Drucks, dann nach
   * 30 s, 1 und 2 min und ein letztes Mal beim Ende – wie beim Verbrauch, nur
   * mit weniger Versuchen. **Im Hintergrund:** Die Firmware braucht beim
   * Drucken bis zu 20 s je Anfrage, mit dem Rückgriff auf den langen Namen
   * das Doppelte; Zustand und Testantworten des Druckers sollen darauf nicht
   * warten. Endet der Druck, während ein Versuch läuft, wartet nur das
   * Vormerken (`finishJob`).
   */
  startPreview(runtime: PrinterRuntime, track: JobTrack, final: boolean) {
    if (track.previewTask || track.previewDone || !track.thumbnailPath) return;
    if (track.previewAttempts >= PREVIEW_ATTEMPTS + (final ? 1 : 0)) return;
    if (!final && this.now() < track.nextPreviewAt) return;
    track.previewAttempts += 1;
    track.nextPreviewAt =
      this.now() + META_RETRY_BASE_MS * 2 ** (track.previewAttempts - 1);
    const task: Promise<void> = this.readPreview(runtime, track, final)
      .catch(() => undefined)
      .finally(() => {
        track.previewTask = null;
        this.background.delete(task);
      });
    track.previewTask = task;
    this.background.add(task);
  }

  /**
   * Ein Versuch. Ohne Vorschau in der Datei (404 auch unter dem langen
   * Namen), zu groß oder kein lesbares PNG: kein weiterer Versuch. Scheitert
   * alles, geht der Druck ohne Vorschau ins Fach.
   */
  async readPreview(runtime: PrinterRuntime, track: JobTrack, final: boolean) {
    if (!track.thumbnailPath) return;
    const name = runtime.config.name;
    let bytes: Uint8Array;
    try {
      bytes = await withFallbackPath(
        track.thumbnailPath,
        track.longThumbnailPath,
        path => runtime.client.readImage(path, PREVIEW_MAX_BYTES)
      );
    } catch (error) {
      if (error instanceof PrusaLinkError && error.httpStatus === 404) {
        track.previewDone = true;
        this.write(
          "info",
          track.previewAttempts > 1
            ? `Drucker „${name}“: Vorschau nicht mehr gefunden – der Druck kommt ohne sie`
            : `Drucker „${name}“: keine Vorschau in der Datei`
        );
        return;
      }
      if (error instanceof PreviewUnusableError) {
        track.previewDone = true;
        this.write(
          "warn",
          `Drucker „${name}“: ${error.message} – der Druck kommt ohne sie`
        );
        return;
      }
      const last = track.previewAttempts >= PREVIEW_ATTEMPTS || final;
      this.write(
        "warn",
        `Drucker „${name}“: Vorschau nicht geladen, ${track.previewAttempts}. Versuch – ${(error as Error).message}${last ? "" : " (neuer Versuch folgt)"}`
      );
      return;
    }
    track.previewDone = true;
    const clean = stripPngMetadata(bytes);
    if (!clean) {
      this.write(
        "warn",
        `Drucker „${name}“: Vorschau ist kein lesbares PNG – der Druck kommt ohne sie`
      );
      return;
    }
    track.preview = clean;
  }

  /** Ende einer ASCII-Datei lesen und mit dem Kopf zusammenführen */
  async readTail(runtime: PrinterRuntime, track: JobTrack) {
    const name = runtime.config.name;
    try {
      const { tail, total } = await this.withFilePath(runtime, track, path =>
        runtime.client.readFileTail(path, GCODE_TAIL_BYTES)
      );
      track.meta = {
        ...(track.meta ?? {}),
        ...metaFromGcodeTail(tail, total <= tail.length),
      };
      if (filamentsFromMeta(track.meta))
        this.write(
          "info",
          `Drucker „${name}“: Filamentverbrauch aus dem Ende der Datei gelesen (${(total / 1024 / 1024).toFixed(1)} MB)`
        );
      else
        this.write(
          "warn",
          `Drucker „${name}“: Filamentverbrauch nicht gelesen – auch am Ende der Datei steht kein „filament used [g]“`
        );
    } catch (error) {
      this.write(
        "warn",
        `Drucker „${name}“: Filamentverbrauch nicht gelesen – Ende der Datei nicht lesbar: ${(error as Error).message}`
      );
    }
  }

  /** Bis alle Lesevorgänge im Hintergrund fertig sind (Tests, Herunterfahren) */
  async settle(): Promise<void> {
    while (this.background.size > 0 || this.previewWrites.size > 0)
      await Promise.all([...this.background, ...this.previewWrites.values()]);
  }

  finishJob(
    runtime: PrinterRuntime,
    track: JobTrack,
    printerState: string | null
  ) {
    if (track.jobId < 0) return;
    const endedAt = this.now();
    const needsTail = track.needsTail && !filamentsFromMeta(track.meta);
    const pendingPreview = track.previewTask;
    if (needsTail || pendingPreview) {
      const snapshot = { ...track };
      if (needsTail)
        this.write(
          "info",
          `Drucker „${runtime.config.name}“: Druck ${track.jobId} beendet – lese das Ende der Datei`
        );
      let done = false;
      const enqueue = () => {
        if (done) return;
        done = true;
        // Die Vorschau kommt im Hintergrund am ursprünglichen Track an
        snapshot.preview = track.preview;
        this.enqueueImport(runtime, snapshot, printerState, endedAt);
      };
      const task = (pendingPreview ?? Promise.resolve())
        .then(() => (needsTail ? this.readTail(runtime, snapshot) : undefined))
        .then(enqueue)
        .finally(() => {
          this.background.delete(task);
          this.abandon.delete(enqueue);
        });
      this.background.add(task);
      this.abandon.add(enqueue);
      return;
    }
    this.enqueueImport(runtime, track, printerState, endedAt);
  }

  enqueueImport(
    runtime: PrinterRuntime,
    track: JobTrack,
    printerState: string | null,
    endedAt: number
  ) {
    const progress = track.progress;
    const status: PrintImport["status"] =
      printerState === "FINISHED"
        ? "success"
        : printerState === "ERROR"
          ? "failed"
          : printerState === "STOPPED"
            ? "cancelled"
            : progress !== null && progress >= 99
              ? "success"
              : "cancelled";
    const full = filamentsFromMeta(track.meta);
    const factor =
      status === "success" || progress === null
        ? 1
        : Math.max(0, Math.min(1, progress / 100));
    const filaments = (full ?? []).map(f => ({
      ...f,
      grams: Math.round(f.grams * factor * 100) / 100,
    }));
    runtime.report.metaWarning = full
      ? null
      : "Zu dieser Datei war kein Filamentverbrauch lesbar – Gramm im Eingangsfach eintragen";
    const started = new Date(
      endedAt - (track.timePrinting ?? 0) * 1000
    ).toISOString();
    const item: PrintImport = {
      source: "printer",
      externalKey: `prusalink:${runtime.info?.serial ?? `printer-${runtime.config.id}`}:${track.jobId}:${started.slice(0, 15)}`,
      title: titleFromFileName(track.fileName ?? `Druck ${track.jobId}`),
      printedAt: new Date(endedAt).toISOString(),
      status,
      progressPercent:
        progress === null
          ? null
          : Math.max(0, Math.min(100, Math.round(progress))),
      durationMinutes:
        track.timePrinting === null
          ? null
          : Math.round(track.timePrinting / 60),
      printer: runtime.config.name.slice(0, 100),
      filaments,
      gramsEstimated: factor < 1 && filaments.length > 0,
    };
    this.write(
      "info",
      `Drucker „${runtime.config.name}“: Druck ${track.jobId} ${status} – fürs Eingangsfach vorgemerkt`
    );
    const preview = track.preview
      ? this.storePreview(item.externalKey, track.preview)
      : null;
    this.queue.push({ item, preview, importId: null, previewTries: 0 });
    if (this.queue.length > MAX_QUEUE) this.dropEntry(this.queue.shift());
  }

  // -- Vorschauen der Warteschlange -------------------------------------------

  /**
   * Legt die Vorschau eines vorgemerkten Drucks ab: als Datei neben der
   * Warteschlange, nicht in ihr. `queue.json` bleibt so klein und wird bei
   * jedem Durchlauf neu geschrieben; 500 Drucke mit Vorschau als base64
   * wären bis zu 650 MB, die jedes Mal durch `JSON.stringify` gingen.
   * Erst beim Einliefern frisch vom Drucker zu holen, ginge auch – aber dann
   * kann die Datei gelöscht, der Stick gezogen oder der Drucker aus sein, und
   * das Einliefern wartet ohnehin oft genau dann, wenn etwas nicht läuft.
   */
  storePreview(externalKey: string, bytes: Uint8Array): string {
    const name = `${createHash("sha256").update(externalKey).digest("hex").slice(0, 32)}.png`;
    if (!this.options.dataDir) {
      this.previewMemory.set(name, bytes);
      return name;
    }
    const dir = join(this.options.dataDir, "previews");
    // Geschrieben wird im Hintergrund; bis dahin – und scheitert es: weiter –
    // hält der Speicher sie
    this.previewMemory.set(name, bytes);
    const task = mkdir(dir, { recursive: true })
      .then(() => writeFile(join(dir, name), bytes))
      .then(() => {
        this.previewMemory.delete(name);
      })
      .catch(error => {
        this.write(
          "warn",
          `Vorschau nicht gespeichert in ${dir}: ${(error as Error).message}`
        );
      })
      .finally(() => {
        if (this.previewWrites.get(name) === task)
          this.previewWrites.delete(name);
      });
    this.previewWrites.set(name, task);
    return name;
  }

  async loadPreview(name: string): Promise<Uint8Array | null> {
    const inMemory = this.previewMemory.get(name);
    if (inMemory) return inMemory;
    if (!this.options.dataDir || !/^[0-9a-f]{32}\.png$/.test(name)) return null;
    try {
      return new Uint8Array(
        await readFile(join(this.options.dataDir, "previews", name))
      );
    } catch {
      return null;
    }
  }

  /** Entfernt einen Eintrag samt Vorschau aus dem Speicher und vom Datenträger */
  dropEntry(entry: QueuedImport | undefined) {
    if (!entry?.preview) return;
    const name = entry.preview;
    entry.preview = null;
    this.previewMemory.delete(name);
    const dataDir = this.options.dataDir;
    if (!dataDir || !/^[0-9a-f]{32}\.png$/.test(name)) return;
    // Erst löschen, wenn das Schreiben durch ist – sonst bliebe sie liegen
    const pending = this.previewWrites.get(name) ?? Promise.resolve();
    void pending
      .then(() => unlink(join(dataDir, "previews", name)))
      .catch(() => undefined);
  }

  /**
   * Lädt die Vorschau zu einem angenommenen Eintrag hoch.
   *
   * - `"done"`: erledigt – angenommen oder endgültig abgelehnt (4xx, auch
   *   ein voller Speicher: Die Vorschau ist verzichtbar, und bis jemand Platz
   *   schafft, vergingen sonst Tage).
   * - `"retry"`: Server gerade nicht bereit (429, 5xx, Netz) – beim nächsten
   *   Durchlauf noch einmal, höchstens `PREVIEW_UPLOAD_TRIES`-mal.
   * - `"stop"`: Schlüssel abgelehnt – der ganze Durchlauf hält an.
   */
  async uploadPreview(entry: QueuedImport): Promise<"done" | "retry" | "stop"> {
    if (!entry.preview || entry.importId === null) return "done";
    const bytes = await this.loadPreview(entry.preview);
    if (!bytes) return "done";
    let response: FilahubResponse;
    try {
      response = await this.filahub(
        "POST",
        previewIngestPath(entry.importId),
        undefined,
        { bytes, contentType: "image/png" }
      );
    } catch {
      return this.retryPreview(entry);
    }
    if (this.handleAuthFailure(response)) return "stop";
    const body = response.json as { error?: string; code?: string } | null;
    const storageFull = body?.code === "storage_full";
    if ((response.status === 429 && !storageFull) || response.status >= 500)
      return this.retryPreview(entry);
    if (response.status !== 200 && response.status !== 201)
      this.write(
        "warn",
        `Vorschau zu „${entry.item.title}“ von filahub abgelehnt (HTTP ${response.status}: ${body?.error ?? "abgelehnt"}) – der Druck bleibt ohne`
      );
    return "done";
  }

  retryPreview(entry: QueuedImport): "done" | "retry" {
    entry.previewTries += 1;
    if (entry.previewTries < PREVIEW_UPLOAD_TRIES) return "retry";
    this.write(
      "warn",
      `Vorschau zu „${entry.item.title}“ nach ${PREVIEW_UPLOAD_TRIES} Versuchen aufgegeben – der Druck bleibt ohne`
    );
    return "done";
  }

  /**
   * Nimmt genau diesen Eintrag aus der Warteschlange – nicht einfach den
   * ersten: Während auf das Netz gewartet wird, kann `enqueueImport` (auch aus
   * einem Lesevorgang im Hintergrund) Einträge anhängen und bei voller
   * Warteschlange den ältesten verdrängen.
   */
  removeEntry(entry: QueuedImport) {
    const index = this.queue.indexOf(entry);
    if (index >= 0) this.queue.splice(index, 1);
    this.dropEntry(entry);
  }

  // -- Einliefern, melden -----------------------------------------------------

  /**
   * Liefert die vorgemerkten Drucke der Reihe nach ein; ein Druck, der nicht
   * angenommen wird, hält die nach ihm auf (Reihenfolge im Fach). Eine
   * Vorschau, deren Hochladen später noch einmal versucht wird, hält
   * **nichts** auf: Ihr Eintrag bleibt stehen, die übrigen gehen weiter.
   */
  async flushQueue(): Promise<void> {
    for (const entry of [...this.queue]) {
      if (!this.queue.includes(entry)) continue; // inzwischen verdrängt
      if (entry.importId === null) {
        let response: FilahubResponse;
        try {
          response = await this.filahub(
            "POST",
            "/api/ingest/print-imports",
            entry.item
          );
        } catch {
          return; // Server nicht erreichbar – später noch einmal
        }
        if (this.handleAuthFailure(response)) return;
        if (response.status === 429 || response.status >= 500) return;
        if (response.status !== 200 && response.status !== 201) {
          // 4xx: der Eintrag ist kaputt und wird es bleiben
          this.write(
            "error",
            `Druck „${entry.item.title}“ von filahub abgelehnt (HTTP ${response.status}) – verworfen`
          );
          this.removeEntry(entry);
          continue;
        }
        // Auch eine Wiederholung (200) nennt die ID – die Vorschau folgt
        const id = (response.json as { id?: unknown } | null)?.id;
        entry.importId = typeof id === "number" ? id : null;
        if (entry.importId === null) {
          this.removeEntry(entry);
          continue;
        }
      }
      const result = await this.uploadPreview(entry);
      if (result === "stop") return;
      if (result === "done") this.removeEntry(entry);
    }
  }

  async sendReport(): Promise<void> {
    const body = {
      protocol: BRIDGE_PROTOCOL,
      version: BRIDGE_VERSION,
      startedAt: this.startedAt,
      queued: this.queue.length,
      printers: [...this.printers.values()].map(r => r.report),
      log: this.log.slice(-MAX_LOG_LINES),
    };
    try {
      const response = await this.filahub("POST", "/api/bridge/report", body);
      if (this.handleAuthFailure(response)) return;
      if (response.status !== 200)
        this.write("warn", `Meldung abgelehnt mit HTTP ${response.status}`);
    } catch {
      // Wird beim nächsten Durchlauf wiederholt
    }
  }

  // -- Ablauf -------------------------------------------------------------------

  /** Ein Durchlauf: Konfiguration (falls fällig), Drucker, Warteschlange, Meldung */
  async tick(): Promise<void> {
    if (this.now() < this.pausedUntil) return;
    const configEvery = (this.config?.configPollSeconds ?? 15) * 1000;
    if (!this.config || this.now() - this.lastConfigAt >= configEvery)
      await this.refreshConfig();
    if (this.now() < this.pausedUntil) return;
    for (const runtime of this.printers.values())
      await this.pollPrinter(runtime);
    await this.flushQueue();
    await this.saveQueue();
    await this.sendReport();
  }

  /** Testanfragen sollen nicht auf den nächsten Takt warten */
  async quickCheck(): Promise<void> {
    if (this.now() < this.pausedUntil) return;
    await this.refreshConfig();
    const pending = [...this.printers.values()].filter(
      r =>
        r.config.testRequestedAt && r.config.testRequestedAt !== r.answeredTest
    );
    if (pending.length === 0) return;
    for (const runtime of pending) await this.pollPrinter(runtime);
    await this.sendReport();
  }

  async loadQueue(): Promise<void> {
    if (!this.options.dataDir) return;
    try {
      const raw = await readFile(
        join(this.options.dataDir, "queue.json"),
        "utf8"
      );
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed))
        this.queue = parsed.flatMap(toQueuedImport).slice(-MAX_QUEUE);
      if (this.queue.length > 0)
        this.write("info", `${this.queue.length} vorgemerkte Drucke geladen`);
    } catch {
      // Keine oder unlesbare Warteschlange – leer anfangen
    }
    await this.removeStalePreviews();
  }

  /** Vorschaudateien, zu denen kein Eintrag mehr gehört (Absturz, Neustart) */
  async removeStalePreviews(): Promise<void> {
    if (!this.options.dataDir) return;
    const dir = join(this.options.dataDir, "previews");
    const wanted = new Set(this.queue.map(entry => entry.preview));
    try {
      for (const name of await readdir(dir))
        if (/^[0-9a-f]{32}\.png$/.test(name) && !wanted.has(name))
          await unlink(join(dir, name)).catch(() => undefined);
    } catch {
      // Kein Verzeichnis – nichts aufzuräumen
    }
  }

  async saveQueue(): Promise<void> {
    if (!this.options.dataDir) return;
    try {
      await mkdir(this.options.dataDir, { recursive: true });
      const file = join(this.options.dataDir, "queue.json");
      await writeFile(`${file}.tmp`, JSON.stringify(this.queue));
      await rename(`${file}.tmp`, file);
    } catch (error) {
      this.write(
        "warn",
        `Warteschlange nicht gespeichert in ${this.options.dataDir}: ${(error as Error).message}`
      );
    }
  }

  async run(): Promise<void> {
    this.write(
      "info",
      `filahub-Brücke ${BRIDGE_VERSION} startet – spricht mit ${this.options.filahubUrl}`
    );
    await this.loadQueue();
    let lastTick = 0;
    while (!this.stopped) {
      const tickEvery = (this.config?.printerPollSeconds ?? 10) * 1000;
      try {
        if (this.now() - lastTick >= tickEvery) {
          lastTick = this.now();
          await this.tick();
        } else {
          await this.quickCheck();
        }
      } catch (error) {
        this.write(
          "error",
          `Unerwarteter Fehler: ${(error as Error).stack ?? error}`
        );
      }
      // Lebenszeichen für den HEALTHCHECK des Containers
      await writeFile(HEARTBEAT_FILE, String(this.now())).catch(
        () => undefined
      );
      await new Promise(resolve => setTimeout(resolve, 3_000));
    }
    // Ein Druck geht nicht verloren, nur weil sein Ende noch gelesen wurde
    for (const enqueue of [...this.abandon]) enqueue();
    await this.saveQueue();
    // Vorschauen, die gerade geschrieben werden, nicht abschneiden
    await Promise.all(this.previewWrites.values());
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

function fromEnv(): BridgeOptions {
  const filahubUrl = process.env.FILAHUB_URL?.trim() ?? "";
  const token = process.env.FILAHUB_TOKEN?.trim() ?? "";
  if (!/^https?:\/\//.test(filahubUrl)) {
    console.error(
      "FILAHUB_URL fehlt oder ist keine Adresse (z. B. https://filahub.example). Den fertigen Startbefehl zeigt die App unter Verbindungen."
    );
    process.exit(2);
  }
  if (!/^fh_[A-Za-z0-9_-]{43}$/.test(token)) {
    console.error(
      "FILAHUB_TOKEN fehlt oder hat nicht die Form fh_… – bitte den Befehl aus der App kopieren."
    );
    process.exit(2);
  }
  return {
    filahubUrl,
    token,
    dataDir: process.env.DATA_DIR ?? "/data",
    allowPublic: process.env.BRIDGE_ALLOW_PUBLIC === "1",
  };
}

if (process.argv[1]?.endsWith("filahub-bridge.ts")) {
  const bridge = new Bridge(fromEnv());
  const stop = () => {
    bridge.stopped = true;
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  void bridge.run().then(() => process.exit(0));
}
