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
 * Drucke ins Eingangsfach (`POST /api/ingest/print-imports`).
 *
 * Bewusst **ohne Abhängigkeiten**: Node 26 führt diese Datei direkt aus
 * (Type Stripping), das Image enthält nichts als Node und sie. Deshalb nur
 * Typsyntax, die sich wegstreichen lässt (keine Enums, keine
 * Parameter-Properties), und keine Importe aus dem übrigen Projekt – die
 * Protokollform steht in `contracts/bridge.ts` ein zweites Mal, mit zod, und
 * `api/bridge.test.ts` prüft beide gegeneinander.
 *
 * Optional:
 *   DATA_DIR             Ablage der Warteschlange (Vorgabe /data)
 *   BRIDGE_ALLOW_PUBLIC  1 = auch Drucker außerhalb des lokalen Netzes
 */

import { createHash, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const BRIDGE_VERSION = "4.8.1";
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
const FILAHUB_TIMEOUT_MS = 15_000;
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

  async get(path: string): Promise<unknown> {
    const base = await this.checkTarget();
    const url = new URL(path, base);
    let response = await this.send(url, this.authHeader(url.pathname));
    if (response.status === 401 && this.printer.authKind === "digest") {
      const challenge = response.headers.get("www-authenticate") ?? "";
      await response.body?.cancel();
      if (this.takeChallenge(challenge))
        response = await this.send(url, this.authHeader(url.pathname));
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
    if (response.status === 204) return null;
    if (!response.ok) {
      await response.body?.cancel();
      throw new PrusaLinkError(
        "error",
        `Unerwartete Antwort HTTP ${response.status}`,
        response.status
      );
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

  async send(url: URL, auth: Record<string, string>): Promise<Response> {
    try {
      return await this.fetchFn(url, {
        headers: { accept: "application/json", ...auth },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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

// ---------------------------------------------------------------------------
// Die Brücke
// ---------------------------------------------------------------------------

type JobTrack = {
  jobId: number;
  fileName: string | null;
  filePath: string | null;
  meta: Record<string, unknown> | null;
  metaTried: boolean;
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
  queue: PrintImport[] = [];
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
    body?: unknown
  ): Promise<FilahubResponse> {
    const url = new URL(path, this.options.filahubUrl);
    const response = await this.fetchFn(url, {
      method,
      headers: {
        authorization: `Bearer ${this.options.token}`,
        "user-agent": `filahub-bridge/${BRIDGE_VERSION}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
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
        meta: null,
        metaTried: false,
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
          meta?: Record<string, unknown>;
        };
      } | null;
      track.fileName = job?.file?.display_name ?? job?.file?.name ?? null;
      track.filePath =
        job?.file?.path && job.file.name
          ? `${job.file.path.replace(/\/$/, "")}/${job.file.name}`
          : null;
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
        // Dann eben ohne Gramm – das Eingangsfach sagt es
      }
    }
  }

  finishJob(
    runtime: PrinterRuntime,
    track: JobTrack,
    printerState: string | null
  ) {
    if (track.jobId < 0) return;
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
      : "PrusaLink nannte zu dieser Datei keinen Filamentverbrauch – Gramm im Eingangsfach eintragen";
    const started = new Date(
      this.now() - (track.timePrinting ?? 0) * 1000
    ).toISOString();
    const item: PrintImport = {
      source: "printer",
      externalKey: `prusalink:${runtime.info?.serial ?? `printer-${runtime.config.id}`}:${track.jobId}:${started.slice(0, 15)}`,
      title: titleFromFileName(track.fileName ?? `Druck ${track.jobId}`),
      printedAt: new Date(this.now()).toISOString(),
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
    this.queue.push(item);
    if (this.queue.length > MAX_QUEUE) this.queue.shift();
  }

  // -- Einliefern, melden -----------------------------------------------------

  async flushQueue(): Promise<void> {
    while (this.queue.length > 0) {
      const item = this.queue[0];
      let response: FilahubResponse;
      try {
        response = await this.filahub(
          "POST",
          "/api/ingest/print-imports",
          item
        );
      } catch {
        return; // Server nicht erreichbar – später noch einmal
      }
      if (this.handleAuthFailure(response)) return;
      if (response.status === 429 || response.status >= 500) return;
      if (response.status === 200 || response.status === 201) {
        this.queue.shift();
        continue;
      }
      // 4xx: der Eintrag ist kaputt und wird es bleiben
      this.write(
        "error",
        `Druck „${item.title}“ von filahub abgelehnt (HTTP ${response.status}) – verworfen`
      );
      this.queue.shift();
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
      const parsed = JSON.parse(raw) as PrintImport[];
      if (Array.isArray(parsed)) this.queue = parsed.slice(-MAX_QUEUE);
      if (this.queue.length > 0)
        this.write("info", `${this.queue.length} vorgemerkte Drucke geladen`);
    } catch {
      // Keine oder unlesbare Warteschlange – leer anfangen
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
    await this.saveQueue();
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
