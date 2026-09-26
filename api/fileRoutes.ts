import { createHash } from "node:crypto";
import type { Context, Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { TRPCError } from "@trpc/server";
import { Zip, ZipPassThrough, strToU8 } from "fflate";
import { eq } from "drizzle-orm";
import type { User } from "@db/schema";
import { printJobFiles, printJobs } from "@db/schema";
import {
  MAX_3MF_BYTES,
  MAX_FILES_PER_PRINT_JOB,
  MAX_IMAGE_BYTES,
  MAX_STORAGE_BYTES_PER_SCOPE,
  MAX_THUMBNAIL_BYTES,
} from "@contracts/limits";
import {
  contentDisposition,
  detectPrintFile,
  sanitizeFileName,
} from "@contracts/printFiles";
import { clientIpFrom } from "./lib/clientIp";
import { getFileStorage, newStorageKey } from "./lib/fileStorage";
import { assertWithinLimit } from "./lib/quota";
import { consumeRateLimit } from "./lib/rateLimit";
import { getDb } from "./queries/connection";
import { recordAudit } from "./queries/audit";
import {
  countFilesOfPrintJob,
  findPrintFileWithOwner,
  insertPrintFile,
  removeStoredFiles,
  usedStorageInScope,
} from "./queries/printFiles";
import { findPrintJobRowInScope } from "./queries/printJobs";
import { resolveScope } from "./scope";
import { authenticateRequest } from "./telegram/auth";

/**
 * Hochladen und Ausliefern von Dateien zu Drucken (seit 4.3.0).
 *
 * Eigene Hono-Routen statt tRPC: superjson ist für Binärdaten ungeeignet, und
 * ein Bild soll als `<img src>` ladbar sein. Die Regeln der tRPC-Prozeduren
 * gelten trotzdem, nur von Hand:
 *
 * - **Anmeldung** aus dem Session-Cookie wie `createContext`.
 * - **Sperre** wie `authedQuery` – außer beim Export, der wie
 *   `account.export` Betroffenenrecht ist (Art. 15/20 DSGVO).
 * - **Bereich** über `resolveScope`; Nicht-Mitglied → 404, zu niedrige
 *   Stufe → 403. Eine Datei eines fremden Bereichs ist 404, nicht 403 –
 *   sonst wäre die Antwort ein Orakel über fremde Datei-IDs.
 * - **Zugriffsbegrenzung** je Benutzer, direkt über `consumeRateLimit`.
 * - **Typ aus den Bytes** (`detectPrintFile`), nie aus Endung oder
 *   `Content-Type`; Fotos mit Metadaten werden abgelehnt.
 */

type App = Hono<{ Bindings: HttpBindings }>;
type Ctx = Context<{ Bindings: HttpBindings }>;

function fail(
  c: Ctx,
  status: 400 | 401 | 403 | 404 | 413 | 415 | 422 | 429 | 500,
  message: string
) {
  return c.json({ error: message }, status);
}

/** Übersetzt die Fehler aus `resolveScope` und `assertWithinLimit` */
function failFromTrpc(c: Ctx, error: unknown) {
  if (error instanceof TRPCError) {
    if (error.code === "NOT_FOUND") return fail(c, 404, error.message);
    if (error.code === "FORBIDDEN") return fail(c, 403, error.message);
    if (error.code === "TOO_MANY_REQUESTS") return fail(c, 429, error.message);
    if (error.code === "BAD_REQUEST") return fail(c, 400, error.message);
  }
  throw error;
}

async function currentUser(c: Ctx): Promise<User | null> {
  try {
    return await authenticateRequest(c.req.raw.headers);
  } catch {
    return null;
  }
}

/** Zugriffsbegrenzung je Benutzer – protokolliert wird nur das Zuschlagen */
function rateLimitedFor(
  c: Ctx,
  user: User,
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const result = consumeRateLimit(`${key}:u${user.id}`, limit, windowMs);
  if (result.allowed) return false;
  recordAudit({
    event: "limit.rate_limited",
    actorUserId: user.id,
    ip: clientIpFrom(c.req.raw.headers),
    detail: { bucket: key },
  });
  return true;
}

function positiveInt(value: string | undefined): number | null {
  if (!value || !/^\d{1,15}$/.test(value)) return null;
  const n = Number(value);
  return n > 0 ? n : null;
}

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

async function readUpload(value: unknown): Promise<{
  name: string;
  bytes: Uint8Array;
} | null> {
  if (!(value instanceof File)) return null;
  return { name: value.name, bytes: new Uint8Array(await value.arrayBuffer()) };
}

export function registerFileRoutes(app: App) {
  /*
    Export aller eigenen Dateien als ZIP – neben dem JSON-Export, der sie per
    SHA-256 nennt. Vor `/api/files/:id` registriert, sonst griffe die Route
    mit dem Platzhalter.
  */
  app.get("/api/files/export", async c => {
    const user = await currentUser(c);
    if (!user) return fail(c, 401, "Nicht angemeldet.");
    // Keine Sperrprüfung: Auskunft und Übertragbarkeit (Art. 15/20 DSGVO)
    if (rateLimitedFor(c, user, "files.export", 5, 60 * 60 * 1000))
      return fail(c, 429, "Zu viele Exporte. Bitte später erneut versuchen.");

    const files = await getDb()
      .select({ file: printJobFiles })
      .from(printJobFiles)
      .innerJoin(printJobs, eq(printJobs.id, printJobFiles.printJobId))
      .where(eq(printJobs.userId, user.id))
      .orderBy(printJobFiles.printJobId, printJobFiles.id);

    const storage = getFileStorage();
    const manifest: object[] = [];
    let next = 0;
    let zip: Zip;
    /*
      Datei für Datei, erst wenn der Empfänger die vorige abgenommen hat
      (`pull`): Ein Gigabyte Fotos läge sonst vollständig im Speicher, bevor
      der erste Teil hinausgeht.
    */
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        zip = new Zip((error, chunk, final) => {
          if (error) return controller.error(error);
          controller.enqueue(chunk);
          if (final) controller.close();
        });
      },
      async pull() {
        if (next < files.length) {
          const { file } = files[next++];
          const bytes = await storage.get(file.storageKey);
          const path = `druck-${file.printJobId}/${file.id}-${sanitizeFileName(file.originalName)}`;
          manifest.push({
            path: bytes ? path : null,
            printJobId: file.printJobId,
            originalName: file.originalName,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            sha256: file.sha256,
            createdAt: file.createdAt,
          });
          if (!bytes) return;
          // Ohne Kompression: Fotos und 3MF sind es schon
          const entry = new ZipPassThrough(path);
          zip.add(entry);
          entry.push(bytes, true);
          return;
        }
        if (next === files.length) {
          next++;
          const index = new ZipPassThrough("dateien.json");
          zip.add(index);
          index.push(strToU8(JSON.stringify(manifest, null, 2)), true);
          zip.end();
        }
      },
    });
    const day = new Date().toISOString().slice(0, 10);
    return new Response(stream, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": contentDisposition(
          "attachment",
          `filahub-dateien-${day}.zip`
        ),
        "cache-control": "no-store",
      },
    });
  });

  app.post("/api/files/print-jobs/:id", async c => {
    const user = await currentUser(c);
    if (!user) return fail(c, 401, "Nicht angemeldet.");
    if (user.blockedAt) return fail(c, 403, "Dein Konto ist gesperrt.");
    if (rateLimitedFor(c, user, "files.upload", 30, 60_000))
      return fail(c, 429, "Zu viele Uploads. Bitte kurz warten.");

    const printJobId = positiveInt(c.req.param("id"));
    if (!printJobId) return fail(c, 404, "Druck nicht gefunden");
    const orgParam = c.req.query("organizationId");
    const organizationId = orgParam ? positiveInt(orgParam) : null;
    if (orgParam && !organizationId)
      return fail(c, 404, "Organisation nicht gefunden");

    let scope;
    try {
      scope = await resolveScope(user.id, organizationId, "weigher");
    } catch (error) {
      return failFromTrpc(c, error);
    }
    if (!(await findPrintJobRowInScope(scope, printJobId)))
      return fail(c, 404, "Druck nicht gefunden");

    const body = await c.req.parseBody();
    const upload = await readUpload(body.file);
    if (!upload) return fail(c, 400, "Keine Datei erhalten.");
    const detected = detectPrintFile(upload.bytes);
    if (!detected)
      return fail(
        c,
        415,
        "Dieser Dateityp wird nicht angenommen. Möglich sind Fotos (JPEG, PNG, WebP) und 3MF-Projekte."
      );

    let thumbnail: { bytes: Uint8Array } | null = null;
    if (detected.kind === "image") {
      if (detected.hasMetadata)
        return fail(
          c,
          422,
          "Das Foto enthält noch Metadaten (etwa den Aufnahmeort). Bitte über die App hochladen – sie entfernt sie."
        );
      if (upload.bytes.length > MAX_IMAGE_BYTES)
        return fail(c, 413, "Das Foto ist zu groß.");
      const thumb = await readUpload(body.thumbnail);
      if (thumb) {
        const kind = detectPrintFile(thumb.bytes);
        if (
          !kind ||
          kind.kind !== "image" ||
          kind.hasMetadata ||
          thumb.bytes.length > MAX_THUMBNAIL_BYTES
        )
          return fail(c, 422, "Die Vorschau des Fotos ist ungültig.");
        thumbnail = thumb;
      }
    } else if (upload.bytes.length > MAX_3MF_BYTES) {
      return fail(c, 413, "Die 3MF-Datei ist zu groß.");
    }

    const adding = upload.bytes.length + (thumbnail?.bytes.length ?? 0);
    try {
      // Obergrenzen nach der Bereichsprüfung – sonst verrieten sie Fremdes
      assertWithinLimit({
        current: await countFilesOfPrintJob(printJobId),
        max: MAX_FILES_PER_PRINT_JOB,
        quota: "files_per_print_job",
        message: `Ein Druck trägt höchstens ${MAX_FILES_PER_PRINT_JOB} Dateien.`,
        actorUserId: user.id,
        ip: clientIpFrom(c.req.raw.headers),
      });
      assertWithinLimit({
        current: await usedStorageInScope(scope),
        max: MAX_STORAGE_BYTES_PER_SCOPE,
        adding,
        quota: "storage_per_scope",
        message:
          "Der Speicherplatz für Dateien ist aufgebraucht. Bitte alte Fotos oder Projekte löschen.",
        actorUserId: user.id,
        ip: clientIpFrom(c.req.raw.headers),
      });
    } catch (error) {
      return failFromTrpc(c, error);
    }

    // Erst die Dateien, dann die Zeile – siehe `api/queries/printFiles.ts`
    const storage = getFileStorage();
    const storageKey = newStorageKey();
    const thumbnailKey = thumbnail ? newStorageKey() : null;
    const written: string[] = [];
    try {
      await storage.put(storageKey, upload.bytes);
      written.push(storageKey);
      if (thumbnail && thumbnailKey) {
        await storage.put(thumbnailKey, thumbnail.bytes);
        written.push(thumbnailKey);
      }
      const view = await insertPrintFile(scope, printJobId, {
        kind: detected.kind,
        originalName: sanitizeFileName(
          upload.name,
          detected.kind === "image" ? "foto" : "projekt.3mf"
        ),
        mimeType: detected.mimeType,
        sizeBytes: upload.bytes.length,
        sha256: sha256(upload.bytes),
        storageKey,
        thumbnailKey,
        thumbnailBytes: thumbnail?.bytes.length ?? 0,
        width: detected.kind === "image" ? detected.width : null,
        height: detected.kind === "image" ? detected.height : null,
      });
      if (!view) {
        await removeStoredFiles(written);
        return fail(c, 404, "Druck nicht gefunden");
      }
      return c.json(view, 201);
    } catch (error) {
      await removeStoredFiles(written);
      console.error("Hochladen fehlgeschlagen", error);
      return fail(c, 500, "Die Datei ließ sich nicht speichern.");
    }
  });

  const serve = (variant: "file" | "thumbnail") => async (c: Ctx) => {
    const user = await currentUser(c);
    if (!user) return fail(c, 401, "Nicht angemeldet.");
    if (user.blockedAt) return fail(c, 403, "Dein Konto ist gesperrt.");
    // Großzügig: Eine Druckliste lädt Dutzende Vorschauen auf einmal
    if (rateLimitedFor(c, user, "files.get", 1200, 60_000))
      return fail(c, 429, "Zu viele Anfragen. Bitte kurz warten.");

    const id = positiveInt(c.req.param("id"));
    const row = id ? await findPrintFileWithOwner(id) : null;
    if (!row) return fail(c, 404, "Datei nicht gefunden");
    if (row.organizationId != null) {
      try {
        await resolveScope(user.id, row.organizationId, "viewer");
      } catch {
        return fail(c, 404, "Datei nicht gefunden");
      }
    } else if (row.userId !== user.id) {
      return fail(c, 404, "Datei nicht gefunden");
    }

    const key =
      variant === "thumbnail" && row.file.thumbnailKey
        ? row.file.thumbnailKey
        : row.file.storageKey;
    const bytes = await getFileStorage().get(key);
    if (!bytes) return fail(c, 404, "Datei nicht gefunden");
    const mimeType =
      key === row.file.storageKey
        ? row.file.mimeType
        : (detectPrintFile(bytes)?.mimeType ?? "application/octet-stream");
    const isModel = row.file.kind === "model_3mf";
    return new Response(bytes, {
      headers: {
        "content-type": mimeType,
        "content-length": String(bytes.length),
        // 3MF immer als Download – der Browser soll nichts damit anfangen
        "content-disposition": contentDisposition(
          isModel ? "attachment" : "inline",
          row.file.originalName
        ),
        /*
          `private`: Die Datei gehört einer Person oder Organisation, kein
          geteilter Cache darf sie halten. Eine Stunde, weil sich eine Datei
          nie ändert (neues Hochladen = neue ID) – ein entzogener Zugriff wirkt
          im eigenen Browser also spätestens nach einer Stunde.
        */
        "cache-control": "private, max-age=3600",
        etag: `"${row.file.sha256}${variant === "thumbnail" ? "-t" : ""}"`,
      },
    });
  };

  app.get("/api/files/:id{[0-9]+}/thumbnail", serve("thumbnail"));
  app.get("/api/files/:id{[0-9]+}", serve("file"));
}
