import { z } from "zod";
import {
  MAX_MATERIALS_PER_PRINT_JOB,
  MAX_PRINT_DURATION_MINUTES,
  MAX_PRINT_GRAMS,
  PRINT_JOB_STATUSES,
  type PrintJobStatus,
} from "./printJobs";

/**
 * Eingangsfach für Drucke (seit 4.7.0, Plan `docs/plan-prusa-integration.md`,
 * Phase B): Was PrusaSlicer oder die LAN-Brücke über einen Druck melden, landet
 * hier – mit Gramm und Filamentart, aber ohne filahub-Material. Wer es
 * übernimmt, legt über den gewöhnlichen Weg (`createPrintJob`) einen Druck an;
 * erst dabei wird abgebucht.
 *
 * Eingeliefert wird mit einem **API-Schlüssel**, der genau das darf und sonst
 * nichts (`POST /api/ingest/print-imports`, `api/ingestRoutes.ts`).
 */

/** Woher ein Eintrag kommt: geslict (PrusaSlicer-Skript) oder gedruckt (Brücke) */
export const PRINT_IMPORT_SOURCES = ["slicer", "printer"] as const;
export type PrintImportSource = (typeof PRINT_IMPORT_SOURCES)[number];

/**
 * Ein API-Schlüssel: `fh_` und 32 zufällige Bytes in base64url (43 Zeichen).
 * Das Präfix macht ihn für Secret-Scanner und Menschen erkennbar; geprüft
 * wird die Form, bevor überhaupt in der Datenbank gesucht wird.
 */
export const API_TOKEN_PREFIX = "fh_";
export const API_TOKEN_PATTERN = /^fh_[A-Za-z0-9_-]{43}$/;
/** So viel vom Schlüssel zeigt die Liste – genug zum Wiedererkennen */
export const API_TOKEN_DISPLAY_LENGTH = 10;

/** Größe einer Einlieferung – ein Druck mit 16 Filamenten braucht ~4 KB */
export const MAX_INGEST_BODY_BYTES = 64 * 1024;

/** Erledigte Einträge bleiben so lange – für das Entdoppeln von Wiederholungen */
export const PRINT_IMPORT_RESOLVED_RETENTION_DAYS = 30;

/** Ein Filament eines eingelieferten Drucks – dieselbe Form wie `SlicerFilament` */
export const importedFilamentSchema = z.object({
  slot: z.number().int().min(0).max(63),
  /** Gramm dürfen mit Nachkommastellen kommen; gespeichert wird gerundet */
  grams: z
    .number()
    .min(0)
    .max(MAX_PRINT_GRAMS)
    .transform(value => (value > 0 ? Math.max(1, Math.round(value)) : 0)),
  filamentType: z.string().trim().max(50).nullable().optional(),
  colorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Farbe als #rrggbb angeben")
    .transform(value => value.toLowerCase())
    .nullable()
    .optional(),
  profileName: z.string().trim().max(150).nullable().optional(),
  vendor: z.string().trim().max(100).nullable().optional(),
});

export type ImportedFilament = {
  slot: number;
  grams: number;
  filamentType: string | null;
  colorHex: string | null;
  profileName: string | null;
  vendor: string | null;
};

/** Ein Zeitpunkt aus JSON, nicht weit in der Zukunft und nicht vor 2000 */
const timestamp = z
  .string()
  .datetime({ offset: true, message: "Zeitpunkt im ISO-8601-Format angeben" })
  .transform(value => new Date(value))
  .refine(
    date =>
      date.getTime() > Date.UTC(2000, 0, 1) &&
      date.getTime() < Date.now() + 24 * 60 * 60 * 1000,
    { message: "Der Zeitpunkt ist unplausibel" }
  );

/**
 * Die Einlieferung. Unbekannte Felder werden ignoriert, nicht abgelehnt –
 * eine neuere Brücke darf mehr schicken, als dieser Server kennt.
 */
export const printImportInputSchema = z
  .object({
    source: z.enum(PRINT_IMPORT_SOURCES),
    /** Vom Absender, zum Entdoppeln: dieselbe Kennung zweimal = ein Eintrag */
    externalKey: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1, "Titel fehlt").max(255),
    printedAt: timestamp,
    status: z.enum(PRINT_JOB_STATUSES).default("success"),
    progressPercent: z.number().int().min(0).max(100).nullable().optional(),
    durationMinutes: z
      .number()
      .int()
      .min(0)
      .max(MAX_PRINT_DURATION_MINUTES)
      .nullable()
      .optional(),
    printer: z.string().trim().max(100).nullable().optional(),
    filaments: z
      .array(importedFilamentSchema)
      .max(MAX_MATERIALS_PER_PRINT_JOB)
      .default([]),
    /** Gramm aus dem Fortschritt geschätzt (abgebrochener Druck) */
    gramsEstimated: z.boolean().default(false),
  })
  .refine(
    input =>
      new Set(input.filaments.map(f => f.slot)).size === input.filaments.length,
    { message: "Jeder Slot darf nur einmal vorkommen", path: ["filaments"] }
  );

export type PrintImportInput = z.infer<typeof printImportInputSchema>;

/** Ein Eintrag des Fachs, wie ihn die Oberfläche bekommt */
export type PrintImportItem = {
  id: number;
  source: PrintImportSource;
  title: string;
  printedAt: Date;
  status: PrintJobStatus;
  progressPercent: number | null;
  durationMinutes: number | null;
  printer: string | null;
  filaments: ImportedFilament[];
  gramsEstimated: boolean;
  tokenName: string | null;
  /** Vorschau aus der Druckdatei (seit 4.10.0) – ohne Speicherschlüssel */
  preview: { width: number | null; height: number | null } | null;
  createdAt: Date;
};

/**
 * Die Vorschau eines Eintrags: hochladen mit API-Schlüssel (`POST`, Körper
 * sind die Bytes des Bildes). Die Route registriert sich mit dem Muster, die
 * Brücke baut die Adresse mit `previewIngestPath` nach – `api/bridge.test.ts`
 * vergleicht beide.
 */
export const PRINT_IMPORT_PREVIEW_INGEST_ROUTE =
  "/api/ingest/print-imports/:id/preview";

export function printImportPreviewIngestPath(id: number): string {
  return PRINT_IMPORT_PREVIEW_INGEST_ROUTE.replace(":id", String(id));
}

/** Ansehen mit Sitzung (`api/fileRoutes.ts`, `<img src>` im Eingangsfach) */
export const PRINT_IMPORT_PREVIEW_ROUTE =
  "/api/files/print-imports/:id/preview";

export function printImportPreviewPath(id: number): string {
  return PRINT_IMPORT_PREVIEW_ROUTE.replace(":id", String(id));
}

/** Filamente mit Gramm, in fester Form – was die Datenbank speichert */
export function normalizeImportedFilaments(
  filaments: PrintImportInput["filaments"]
): ImportedFilament[] {
  return filaments
    .filter(filament => filament.grams > 0)
    .map(filament => ({
      slot: filament.slot,
      grams: filament.grams,
      filamentType: filament.filamentType || null,
      colorHex: filament.colorHex || null,
      profileName: filament.profileName || null,
      vendor: filament.vendor || null,
    }));
}

/**
 * Liest die gespeicherten Filamente. Was nicht passt, fällt weg statt die
 * Liste zu sprengen – dieselbe Haltung wie `parseStoredPrintSettings`.
 */
export function parseStoredFilaments(raw: unknown): ImportedFilament[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(item => {
    const parsed = importedFilamentSchema.safeParse(item);
    return parsed.success ? normalizeImportedFilaments([parsed.data]) : [];
  });
}
