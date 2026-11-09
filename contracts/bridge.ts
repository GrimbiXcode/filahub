import { z } from "zod";

/**
 * Die LAN-Brücke für PrusaLink (seit 4.7.0, Plan
 * `docs/plan-prusa-integration.md`, Phase C).
 *
 * Die Brücke ist ein Container im Netz des Benutzers (`bridge/`). Sie kennt
 * nur zwei Dinge: die Adresse dieser Instanz und ihren API-Schlüssel. Alles
 * andere – welche Drucker, unter welcher Adresse, mit welchem Zugang – pflegt
 * der Benutzer **in der App**; die Brücke holt es sich ab
 * (`GET /api/bridge/config`) und meldet Zustand und Diagnose zurück
 * (`POST /api/bridge/report`). Fertige Drucke liefert sie ins Eingangsfach
 * (`POST /api/ingest/print-imports`).
 *
 * **Daten fließen nur von innen nach außen.** Der Server ruft nie einen
 * Drucker auf; die Brücke ruft den Server. Die Brücke selbst liegt im Code
 * ohne Abhängigkeiten (`bridge/filahub-bridge.ts`) und kann diese Datei nicht
 * importieren – die Protokollform steht deshalb zweimal, hier mit zod für den
 * Server und dort als Typ. `api/bridge.test.ts` lässt beide gegeneinander
 * laufen.
 */

/** Fassung des Protokolls; die Brücke schickt ihre mit, der Server seine */
export const BRIDGE_PROTOCOL_VERSION = 1;

/** Das Image, das die App im Startbefehl nennt */
export const BRIDGE_IMAGE = "ghcr.io/grimbixcode/filahub-bridge:latest";

/** Wie oft die Brücke die Konfiguration holt – auch der Takt für „testen“ */
export const BRIDGE_CONFIG_POLL_SECONDS = 15;
/** Wie oft sie einen Drucker abfragt */
export const BRIDGE_PRINTER_POLL_SECONDS = 10;
/** Ohne Meldung seit so vielen Sekunden gilt die Brücke als offline */
export const BRIDGE_OFFLINE_AFTER_SECONDS = 90;

/** Drucker je Brücke */
export const MAX_PRINTERS_PER_BRIDGE = 10;
/** Protokollzeilen, die die Brücke mitschickt und die App zeigt */
export const MAX_BRIDGE_LOG_LINES = 40;

/** Wie die Brücke sich bei PrusaLink anmeldet */
export const PRUSALINK_AUTH_KINDS = ["api_key", "digest"] as const;
export type PrusaLinkAuthKind = (typeof PRUSALINK_AUTH_KINDS)[number];

/**
 * Diagnose eines Druckers. Die Brücke meldet **nur** diese Kennungen und die
 * ausgelesenen Felder, nie den Inhalt einer Antwort: Zeigte jemand die Brücke
 * mit einer gestohlenen Sitzung auf einen anderen Dienst im Netz, erführe er
 * nicht mehr als „antwortet nicht wie PrusaLink“.
 */
export const BRIDGE_PRINTER_STATES = [
  /** Verbunden, Werte aktuell */
  "ok",
  /** Noch nicht geprüft (gerade angelegt, Brücke offline) */
  "pending",
  /** Adresse nicht lesbar */
  "invalid_host",
  /** Adresse liegt nicht im lokalen Netz (Brücke lässt nur private Ziele zu) */
  "blocked_public",
  /** Name nicht auflösbar – oft ein `.local`-Name im Container */
  "dns_failed",
  /** Gerät antwortet, Port zu – PrusaLink aus oder falscher Port */
  "refused",
  /** Keine Antwort in der Zeit */
  "timeout",
  /** Kein Weg dorthin (anderes Netz, VLAN, Gerät aus) */
  "unreachable",
  /** Zugang abgelehnt – Schlüssel oder Passwort falsch */
  "unauthorized",
  /** Antwortet, aber nicht wie PrusaLink v1 (alte Firmware, anderer Dienst) */
  "not_prusalink",
  /** TLS-Fehler bei https:// */
  "tls",
  /** Unerwarteter Fehler */
  "error",
] as const;
export type BridgePrinterState = (typeof BRIDGE_PRINTER_STATES)[number];

/** Zustand des Druckers selbst, wie PrusaLink ihn meldet */
export const PRUSALINK_PRINTER_STATES = [
  "IDLE",
  "BUSY",
  "PRINTING",
  "PAUSED",
  "FINISHED",
  "STOPPED",
  "ERROR",
  "ATTENTION",
  "READY",
] as const;

/**
 * Die Druckeradresse: Name oder IP, optional mit Port und `http(s)://`.
 * Normalform `http://host:port` ohne Pfad – die Brücke hängt `/api/v1/…` an.
 */
export function normalizePrinterHost(input: string): string | null {
  const raw = input.trim();
  if (!raw || raw.length > 255) return null;
  const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.pathname !== "/" || url.search || url.hash) return null;
  if (!url.hostname) return null;
  return `${url.protocol}//${url.host}`;
}

/**
 * Ob ein Ziel im lokalen Netz liegt: private IPv4 (RFC 1918), Link-Local,
 * Loopback, IPv6 ULA/Link-Local, oder ein Name ohne öffentliche Endung
 * (`drucker`, `mk4.local`, `mk4.fritz.box`, `.lan`, `.home.arpa`). Die Brücke
 * prüft das nach der Namensauflösung noch einmal an der IP; die App warnt
 * schon beim Eintragen.
 */
export function isPrivateAddress(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (h.includes(":")) {
    return (
      h === "::1" ||
      h.startsWith("fc") ||
      h.startsWith("fd") ||
      h.startsWith("fe80:")
    );
  }
  if (!h.includes(".")) return true;
  return /\.(local|lan|home|internal|localdomain|fritz\.box|home\.arpa|intranet|corp)$/.test(
    h
  );
}

// ---------------------------------------------------------------------------
// Protokoll
// ---------------------------------------------------------------------------

/** Was die Brücke je Drucker abholt – samt entschlüsseltem Zugang */
export type BridgeConfigPrinter = {
  id: number;
  name: string;
  host: string;
  authKind: PrusaLinkAuthKind;
  username: string | null;
  secret: string | null;
  /** Gesetzt, wenn jemand in der App „Verbindung testen“ gedrückt hat */
  testRequestedAt: string | null;
};

export type BridgeConfig = {
  protocol: number;
  configPollSeconds: number;
  printerPollSeconds: number;
  printers: BridgeConfigPrinter[];
};

const shortText = (max: number) => z.string().trim().max(max);

export const bridgeJobSchema = z.object({
  id: z.number().int().nullable().optional(),
  fileName: shortText(255).nullable().optional(),
  progressPercent: z.number().min(0).max(100).nullable().optional(),
  timePrintingSeconds: z.number().int().min(0).nullable().optional(),
  timeRemainingSeconds: z.number().int().min(0).nullable().optional(),
});

export const bridgePrinterReportSchema = z.object({
  id: z.number().int().positive(),
  state: z.enum(BRIDGE_PRINTER_STATES),
  /** Ergänzung zur Kennung, von der Brücke formuliert (kurz) */
  detail: shortText(300).nullable().optional(),
  /** HTTP-Status der letzten Antwort, falls es eine gab */
  httpStatus: z.number().int().min(100).max(599).nullable().optional(),
  checkedAt: z.string().datetime({ offset: true }),
  /** Antwort auf eine Testanfrage – der Zeitpunkt, den die App gesetzt hat */
  testAnsweredFor: z.string().datetime({ offset: true }).nullable().optional(),
  printerState: z.enum(PRUSALINK_PRINTER_STATES).nullable().optional(),
  info: z
    .object({
      model: shortText(80).nullable().optional(),
      firmware: shortText(80).nullable().optional(),
      serial: shortText(80).nullable().optional(),
      nozzleDiameter: z.number().min(0).max(5).nullable().optional(),
    })
    .nullable()
    .optional(),
  job: bridgeJobSchema.nullable().optional(),
  /** Bemerkung, wenn die Gramm eines Drucks nicht lesbar waren */
  metaWarning: shortText(300).nullable().optional(),
});

export const bridgeReportSchema = z.object({
  protocol: z.number().int().min(1),
  version: shortText(40),
  startedAt: z.string().datetime({ offset: true }),
  /** Drucke, die auf das Einliefern warten (Server nicht erreichbar) */
  queued: z.number().int().min(0).max(100_000).default(0),
  printers: z.array(bridgePrinterReportSchema).max(MAX_PRINTERS_PER_BRIDGE),
  log: z
    .array(
      z.object({
        at: z.string().datetime({ offset: true }),
        level: z.enum(["info", "warn", "error"]),
        message: shortText(300),
      })
    )
    .max(MAX_BRIDGE_LOG_LINES)
    .default([]),
});

export type BridgeReport = z.infer<typeof bridgeReportSchema>;
export type BridgePrinterReport = z.infer<typeof bridgePrinterReportSchema>;

/** Was die App über die Brücke selbst weiß */
export type BridgeStatus = Pick<
  BridgeReport,
  "version" | "startedAt" | "queued" | "log" | "protocol"
>;

/** Was die App je Drucker zeigt – die letzte Meldung der Brücke */
export type BridgePrinterStatus = Omit<BridgePrinterReport, "id">;
