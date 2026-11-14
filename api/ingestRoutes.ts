import { createHash } from "node:crypto";
import type { Context, Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { TRPCError } from "@trpc/server";
import type { z } from "zod";
import {
  BRIDGE_CONFIG_POLL_SECONDS,
  BRIDGE_PRINTER_POLL_SECONDS,
  BRIDGE_PROTOCOL_VERSION,
  bridgeReportSchema,
  type BridgeConfig,
} from "@contracts/bridge";
import {
  MAX_OPEN_PRINT_IMPORTS_PER_SCOPE,
  MAX_PRINT_IMPORT_PREVIEW_BYTES,
  MAX_STORAGE_BYTES_PER_SCOPE,
} from "@contracts/limits";
import { detectPrintFile } from "@contracts/printFiles";
import {
  MAX_INGEST_BODY_BYTES,
  printImportInputSchema,
} from "@contracts/printImports";
import type { ApiToken } from "@db/schema";
import { bearerToken, hashApiToken } from "./lib/apiToken";
import { clientIpFrom } from "./lib/clientIp";
import { getFileStorage, newStorageKey } from "./lib/fileStorage";
import { assertWithinLimit } from "./lib/quota";
import { consumeRateLimit } from "./lib/rateLimit";
import {
  applyBridgeReport,
  bridgeConfigPrinters,
  findTokenByHash,
  touchApiToken,
} from "./queries/apiTokens";
import { recordAudit } from "./queries/audit";
import { removeStoredFiles, usedStorageInScope } from "./queries/printFiles";
import {
  attachImportPreview,
  countOpenImportsInScope,
  findOpenImportPreviewState,
  insertPrintImport,
} from "./queries/printImports";
import { resolveScope, type Scope } from "./scope";

/**
 * Die Routen für Absender mit API-Schlüssel (seit 4.7.0): das
 * PrusaSlicer-Skript und die LAN-Brücke.
 *
 * - `POST /api/ingest/print-imports` – einen Druck ins Eingangsfach (beide
 *   Schlüsselarten).
 * - `POST /api/ingest/print-imports/:id/preview` – seine Vorschau, die Bytes
 *   eines Bildes als Körper (seit 4.10.0, beide Schlüsselarten).
 * - `GET /api/bridge/config` – die Drucker der Brücke samt Zugang.
 * - `POST /api/bridge/report` – Zustand und Diagnose der Brücke.
 *
 * Hono statt tRPC, wie bei `api/fileRoutes.ts`: Die Absender sind Skripte
 * und sollen weder superjson noch Batching sprechen müssen.
 *
 * **Kein Cookie, keine Sitzung.** Angemeldet wird ausschließlich über
 * `Authorization: Bearer fh_…`; ein mitgeschicktes Cookie wird nicht
 * angesehen. Damit gibt es keine CSRF-Fläche, und ohne CORS-Kopfzeilen kann
 * keine fremde Seite im Browser hier etwas abrufen.
 *
 * Bei **jedem** Aufruf neu geprüft: Schlüssel vorhanden, Konto nicht
 * gesperrt, Mitgliedschaft mit mindestens `weigher` – ein Austritt beendet
 * den Schlüssel sofort.
 */

type App = Hono<{ Bindings: HttpBindings }>;
type Ctx = Context<{ Bindings: HttpBindings }>;

type FailCode =
  | "unauthenticated"
  | "blocked"
  | "forbidden"
  | "wrong_kind"
  | "rate_limited"
  | "too_large"
  | "invalid_json"
  | "invalid_body"
  | "inbox_full"
  | "not_found"
  | "unsupported_type"
  | "has_metadata"
  | "storage_full"
  | "save_failed";

function fail(
  c: Ctx,
  status: 400 | 401 | 403 | 404 | 413 | 415 | 422 | 429 | 500,
  code: FailCode,
  message: string
) {
  return c.json({ error: message, code }, status, {
    "Cache-Control": "no-store",
  });
}

/** Ungültige Schlüssel je Adresse – vor der Anmeldung gibt es nichts anderes */
const INVALID_TOKEN_LIMIT = 20;
/** Einlieferungen je Schlüssel und Minute */
const INGEST_LIMIT = 120;
/** Abholen und Melden der Brücke zusammen je Minute (normal sind ~10) */
const BRIDGE_LIMIT = 60;
/** Vorschauen je Schlüssel und Minute – eine je Druck */
const PREVIEW_LIMIT = 60;

type Authenticated = { token: ApiToken; scope: Scope };

/**
 * Prüft den Schlüssel. Gibt entweder den Schlüssel samt Bereich zurück oder
 * die fertige Fehlerantwort.
 */
async function authenticate(
  c: Ctx,
  options: { bridgeOnly: boolean; bucket: string; limit: number }
): Promise<Authenticated | Response> {
  const ip = clientIpFrom(c.req.raw.headers);
  const raw = bearerToken(c.req.header("authorization"));
  const found = raw ? await findTokenByHash(hashApiToken(raw)) : null;
  if (!found) {
    const result = consumeRateLimit(
      `api_token.invalid:${ip ?? "?"}`,
      INVALID_TOKEN_LIMIT,
      60_000
    );
    if (!result.allowed) {
      // Wie bei der Anmeldung: nur das Zuschlagen, nicht jeder Versuch
      recordAudit({ event: "api_token.invalid", ip });
      return fail(c, 429, "rate_limited", "Zu viele ungültige Schlüssel.");
    }
    return fail(
      c,
      401,
      "unauthenticated",
      "Schlüssel fehlt oder ist ungültig."
    );
  }
  const { token, blockedAt } = found;
  if (blockedAt) return fail(c, 403, "blocked", "Das Konto ist gesperrt.");
  if (options.bridgeOnly && token.kind !== "bridge")
    return fail(
      c,
      403,
      "wrong_kind",
      "Dieser Schlüssel ist kein Schlüssel für die Drucker-Brücke."
    );
  const limited = consumeRateLimit(
    `${options.bucket}:t${token.id}`,
    options.limit,
    60_000
  );
  if (!limited.allowed) {
    recordAudit({
      event: "limit.rate_limited",
      actorUserId: token.userId,
      ip,
      detail: { bucket: options.bucket, tokenId: token.id },
    });
    return fail(c, 429, "rate_limited", "Zu viele Aufrufe – bitte langsamer.");
  }
  let scope: Scope;
  try {
    scope = await resolveScope(token.userId, token.organizationId, "weigher");
  } catch (error) {
    if (error instanceof TRPCError)
      return fail(
        c,
        403,
        "forbidden",
        "Der Schlüssel hat keinen Zugriff mehr auf diesen Bereich."
      );
    throw error;
  }
  void touchApiToken(token.id).catch(() => undefined);
  return { token, scope };
}

/** Liest den Körper als JSON, höchstens `MAX_INGEST_BODY_BYTES` */
async function readJson<T extends z.ZodTypeAny>(
  c: Ctx,
  schema: T
): Promise<{ data: z.infer<T> } | Response> {
  const declared = Number(c.req.header("content-length") ?? 0);
  if (declared > MAX_INGEST_BODY_BYTES)
    return fail(c, 413, "too_large", "Die Anfrage ist zu groß.");
  const text = await c.req.text();
  if (new TextEncoder().encode(text).length > MAX_INGEST_BODY_BYTES)
    return fail(c, 413, "too_large", "Die Anfrage ist zu groß.");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail(c, 400, "invalid_json", "Der Körper ist kein JSON.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(
      c,
      422,
      "invalid_body",
      `${issue?.path.join(".") || "Anfrage"}: ${issue?.message ?? "ungültig"}`
    );
  }
  return { data: parsed.data };
}

/**
 * Liest den Körper als Bytes, höchstens `max`. Ohne `content-length` wird
 * mitgezählt und abgebrochen, sobald es mehr wird – sonst läge bis zum
 * Body-Limit des Servers (50 MB) alles im Speicher.
 */
async function readBytes(c: Ctx, max: number): Promise<Uint8Array | null> {
  const declared = Number(c.req.header("content-length") ?? 0);
  if (declared > max) return null;
  const reader = c.req.raw.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > max) return null;
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks, length);
}

function positiveInt(value: string | undefined): number | null {
  if (!value || !/^\d{1,15}$/.test(value)) return null;
  const n = Number(value);
  return n > 0 ? n : null;
}

/** Das Kontingent des Bereichs, zugeschlagen als Antwort statt als Fehler */
class StorageFull extends Error {}

export function registerIngestRoutes(app: App) {
  app.post("/api/ingest/print-imports", async c => {
    const auth = await authenticate(c, {
      bridgeOnly: false,
      bucket: "ingest",
      limit: INGEST_LIMIT,
    });
    if (auth instanceof Response) return auth;
    const body = await readJson(c, printImportInputSchema);
    if (body instanceof Response) return body;

    if (
      (await countOpenImportsInScope(auth.scope)) >=
      MAX_OPEN_PRINT_IMPORTS_PER_SCOPE
    ) {
      recordAudit({
        event: "limit.quota_exceeded",
        actorUserId: auth.token.userId,
        ip: clientIpFrom(c.req.raw.headers),
        detail: {
          quota: "open_print_imports_per_scope",
          max: MAX_OPEN_PRINT_IMPORTS_PER_SCOPE,
        },
      });
      return fail(
        c,
        429,
        "inbox_full",
        `Im Eingangsfach liegen schon ${MAX_OPEN_PRINT_IMPORTS_PER_SCOPE} Drucke. Bitte zuerst übernehmen oder verwerfen.`
      );
    }
    const result = await insertPrintImport(
      auth.scope,
      auth.token.id,
      body.data
    );
    return c.json(result, result.duplicate ? 200 : 201, {
      "Cache-Control": "no-store",
    });
  });

  /*
    Die Vorschau eines Eintrags (seit 4.10.0). Höchstens eine je Eintrag; eine
    zweite – die Brücke wiederholt nach einem Netzfehler – bekommt `200` mit
    `duplicate`, ohne dass etwas gespeichert wird. Dieselben Regeln wie beim
    Hochladen eines Fotos (`api/fileRoutes.ts`): Typ aus den Bytes, nur
    Bilder, keine Metadaten, Maße vom Server gelesen, Kontingent des Bereichs
    nach der Bereichsprüfung und noch einmal unter Sperre.
  */
  app.post("/api/ingest/print-imports/:id/preview", async c => {
    const auth = await authenticate(c, {
      bridgeOnly: false,
      bucket: "ingest_preview",
      limit: PREVIEW_LIMIT,
    });
    if (auth instanceof Response) return auth;
    const importId = positiveInt(c.req.param("id"));
    // Fremder, erledigter oder unbekannter Eintrag: dieselbe Antwort
    const state = importId
      ? await findOpenImportPreviewState(auth.scope, importId)
      : null;
    if (!importId || !state)
      return fail(c, 404, "not_found", "Eintrag nicht gefunden.");
    if (state.hasPreview)
      return c.json({ id: importId, duplicate: true }, 200, {
        "Cache-Control": "no-store",
      });

    const bytes = await readBytes(c, MAX_PRINT_IMPORT_PREVIEW_BYTES);
    if (!bytes) return fail(c, 413, "too_large", "Die Vorschau ist zu groß.");
    const detected = detectPrintFile(bytes);
    if (!detected || detected.kind !== "image")
      return fail(
        c,
        415,
        "unsupported_type",
        "Als Vorschau angenommen werden PNG, JPEG und WebP."
      );
    if (detected.hasMetadata)
      return fail(
        c,
        422,
        "has_metadata",
        "Die Vorschau enthält Metadaten (Text oder EXIF). Bitte ohne sie senden."
      );

    const ip = clientIpFrom(c.req.raw.headers);
    const assertRoom = (used: number) => {
      try {
        assertWithinLimit({
          current: used,
          max: MAX_STORAGE_BYTES_PER_SCOPE,
          adding: bytes.length,
          quota: "storage_per_scope",
          message: "Der Speicherplatz für Dateien ist aufgebraucht.",
          actorUserId: auth.token.userId,
          ip,
        });
      } catch (error) {
        if (error instanceof TRPCError) throw new StorageFull(error.message);
        throw error;
      }
    };
    const storageFull = (error: StorageFull) =>
      fail(c, 429, "storage_full", error.message);
    try {
      assertRoom(await usedStorageInScope(auth.scope));
    } catch (error) {
      if (error instanceof StorageFull) return storageFull(error);
      throw error;
    }

    // Erst die Datei, dann die Zeile – wie bei den Fotos
    const storageKey = newStorageKey();
    try {
      await getFileStorage().put(storageKey, bytes);
      const result = await attachImportPreview(
        auth.scope,
        importId,
        {
          storageKey,
          mimeType: detected.mimeType,
          sizeBytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          width: detected.width,
          height: detected.height,
        },
        assertRoom
      );
      if (result !== "saved") await removeStoredFiles([storageKey]);
      if (result === "gone")
        return fail(c, 404, "not_found", "Eintrag nicht gefunden.");
      return c.json(
        { id: importId, duplicate: result === "exists" },
        result === "saved" ? 201 : 200,
        { "Cache-Control": "no-store" }
      );
    } catch (error) {
      await removeStoredFiles([storageKey]);
      if (error instanceof StorageFull) return storageFull(error);
      console.error("Vorschau ließ sich nicht speichern", error);
      return fail(
        c,
        500,
        "save_failed",
        "Die Vorschau ließ sich nicht speichern."
      );
    }
  });

  app.get("/api/bridge/config", async c => {
    const auth = await authenticate(c, {
      bridgeOnly: true,
      bucket: "bridge",
      limit: BRIDGE_LIMIT,
    });
    if (auth instanceof Response) return auth;
    const config: BridgeConfig = {
      protocol: BRIDGE_PROTOCOL_VERSION,
      configPollSeconds: BRIDGE_CONFIG_POLL_SECONDS,
      printerPollSeconds: BRIDGE_PRINTER_POLL_SECONDS,
      printers: await bridgeConfigPrinters(auth.token.id),
    };
    return c.json(config, 200, { "Cache-Control": "no-store" });
  });

  app.post("/api/bridge/report", async c => {
    const auth = await authenticate(c, {
      bridgeOnly: true,
      bucket: "bridge",
      limit: BRIDGE_LIMIT,
    });
    if (auth instanceof Response) return auth;
    const body = await readJson(c, bridgeReportSchema);
    if (body instanceof Response) return body;
    await applyBridgeReport(auth.token.id, body.data);
    return c.json({ ok: true }, 200, { "Cache-Control": "no-store" });
  });
}
