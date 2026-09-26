import { z } from "zod";
import { mayDeleteWeighing } from "./organizations";

/**
 * Druckhistorie (seit 4.2.0): Druckaufträge mit Materialien, Links, Tags und
 * Notizen – und der Kopplung an die Verbräuche.
 *
 * Wie alles in `contracts/` ohne Datenbank; die Regeln hier gelten für Server,
 * Formular und Tests gleichermaßen.
 */

export const PRINT_JOB_STATUSES = ["success", "failed", "cancelled"] as const;
export type PrintJobStatus = (typeof PRINT_JOB_STATUSES)[number];

/** Obergrenzen je Druck – ein Druck ist ein Eintrag, kein Archiv. */
export const MAX_MATERIALS_PER_PRINT_JOB = 16;
export const MAX_LINKS_PER_PRINT_JOB = 10;
export const MAX_TAGS_PER_PRINT_JOB = 20;
export const MAX_TAG_LENGTH = 40;
export const MAX_PRINT_JOB_NOTES_LENGTH = 10_000;
/** Seitengröße der Liste – die Historie wächst unbegrenzt, geladen wird seitenweise. */
export const PRINT_JOB_PAGE_SIZE = 30;
/** Mindestlänge des Freitexts – kürzere Suchen wären ein vollständiger Scan. */
export const PRINT_JOB_SEARCH_MIN_LENGTH = 2;

/**
 * Tags werden **klein** gespeichert, getrimmt, Leerraum zusammengefasst, ohne
 * führendes „#“ und ohne Dubletten. Sie sind Stichworte zum Wiederfinden wie
 * Hashtags; „Vase“ und „vase“ als zwei Tags hätten nur den Filter zerteilt.
 */
export function normalizeTags(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const tag of raw) {
    const clean = tag
      .trim()
      .replace(/^#+/, "")
      .replace(/\s+/g, " ")
      .toLowerCase()
      .slice(0, MAX_TAG_LENGTH);
    if (clean) seen.add(clean);
  }
  return [...seen];
}

/** „vase, Deko #geschenk“ → ["vase", "deko", "geschenk"] – Eingabe im Formular */
export function parseTagInput(input: string): string[] {
  return normalizeTags(input.split(/[,;#\n]+/));
}

/**
 * Ein Link zum Modell (Printables, MakerWorld, Thingiverse …). **Nur
 * `https://`**: Ein `javascript:`-Link wäre ein Skript im eigenen Ursprung,
 * und `http://` ist 2026 keine Adresse, die man jemandem anbietet.
 */
export const printJobLinkSchema = z.object({
  url: z
    .string()
    .trim()
    .max(2000, "Der Link ist zu lang")
    .refine(value => isHttpsUrl(value), {
      message: "Bitte einen Link mit https:// angeben",
    }),
  label: z.string().trim().max(100).nullable().optional(),
});

export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** „https://www.printables.com/model/…“ → „printables.com“ – für die Anzeige */
export function linkHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

/**
 * Eine Materialzeile eines Drucks. `materialId` (das Gebinde) ist optional:
 * Ein Druck kann Gramm eines Materials nennen, ohne dass schon feststeht, von
 * welcher Rolle sie kamen – etwa beim späteren Import aus dem Drucker (#41).
 * Erst mit Gebinde wird abgebucht.
 */
export const printJobMaterialInputSchema = z.object({
  productId: z.number().int().positive(),
  materialId: z.number().int().positive().nullable().optional(),
  grams: z.number().int().min(0).max(100_000),
});

export const printJobInputSchema = z.object({
  title: z.string().trim().min(1, "Bitte einen Titel angeben").max(255),
  printedAt: z.date(),
  status: z.enum(PRINT_JOB_STATUSES),
  durationMinutes: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 30)
    .nullable(),
  printer: z.string().trim().max(100).nullable(),
  notes: z.string().max(MAX_PRINT_JOB_NOTES_LENGTH).nullable(),
  tags: z.array(z.string().max(200)).max(MAX_TAGS_PER_PRINT_JOB * 2),
  links: z.array(printJobLinkSchema).max(MAX_LINKS_PER_PRINT_JOB),
  materials: z
    .array(printJobMaterialInputSchema)
    .max(MAX_MATERIALS_PER_PRINT_JOB),
});

export type PrintJobInput = z.infer<typeof printJobInputSchema>;

/**
 * Löschen eines Drucks: dieselbe Regel wie bei Wägungen und Verbräuchen –
 * `editor` jeden, `weigher` nur den zuletzt erfassten des Bereichs und nur in
 * den ersten `WEIGHING_CORRECTION_MINUTES`. Ein **Alias**, keine Kopie; die
 * Begründung steht bei `mayDeleteWeighing`.
 */
export const mayDeletePrintJob = mayDeleteWeighing;

/**
 * Cursor der seitenweisen Liste: Sortiert wird nach `printedAt desc, id desc`,
 * der Cursor ist der letzte Eintrag der Seite. Als Text, damit er als
 * tRPC-Eingabe ohne Sonderbehandlung durchgeht.
 */
export function encodePrintJobCursor(entry: {
  printedAt: Date;
  id: number;
}): string {
  return `${entry.printedAt.toISOString()}|${entry.id}`;
}

export function decodePrintJobCursor(
  cursor: string | null | undefined
): { printedAt: Date; id: number } | null {
  if (!cursor) return null;
  const [iso, id] = cursor.split("|");
  const printedAt = new Date(iso ?? "");
  const numeric = Number(id);
  if (Number.isNaN(printedAt.getTime()) || !Number.isInteger(numeric))
    return null;
  return { printedAt, id: numeric };
}
