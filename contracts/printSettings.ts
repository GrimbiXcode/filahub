import { z } from "zod";
import type { MaterialKind } from "./materials";

/**
 * Druckeinstellungen je Material (seit 4.1.0).
 *
 * Sie hängen am **Material** (`material_products`), nicht am Gebinde: „Düse
 * 215 °C“ gilt für PolyTerra Schwarz, egal welche Rolle gerade im Drucker
 * steckt. Gespeichert in der eigenen Tabelle `material_print_settings` als
 * jsonb – die Felder sind je Materialart völlig verschieden (Düse und Bett beim
 * Filament, Belichtungszeiten beim Harz), eine Spalte je Feld hieße drei
 * Viertel leere Spalten je Zeile. Vorbild für jsonb mit zod ist `nameI18n`.
 *
 * Die eigene Tabelle hat einen zweiten Grund: Freunde sehen die Einstellungen
 * vorerst nicht, und was nicht in der geladenen Zeile steht, kann keine
 * Projektion durchlassen (siehe `AGENTS.md`, „Freunde und geteiltes Lager“).
 *
 * **Alles ganzzahlig**, wie überall im Projekt: Temperaturen in °C, Zeiten in
 * Millisekunden bzw. Minuten, Längen in Mikrometern bzw. Hundertstelmillimetern.
 * Jedes Feld ist optional – niemand kennt zu jedem Material jeden Wert.
 */

/** Version des jsonb-Inhalts. Erhöhen, wenn sich die Form ändert. */
export const PRINT_SETTINGS_SCHEMA_VERSION = 1;

/** Höchstlänge der Druck-Notizen (Markdown) */
export const MAX_PRINT_NOTES_LENGTH = 5000;

const int = (min: number, max: number) =>
  z.number().int().min(min).max(max).optional();

/** „von … bis …“ – wo beides angegeben ist, darf das Ende nicht vor dem Anfang liegen */
function rangeOk(min: number | undefined, max: number | undefined): boolean {
  return min == null || max == null || min <= max;
}

export const filamentPrintSettingsSchema = z
  .object({
    kind: z.literal("filament"),
    /** Düsentemperatur von/bis in °C */
    nozzleMinC: int(150, 500),
    nozzleMaxC: int(150, 500),
    /** Betttemperatur von/bis in °C */
    bedMinC: int(0, 150),
    bedMaxC: int(0, 150),
    /** Bauraumtemperatur in °C */
    chamberC: int(0, 100),
    /** Bauteillüfter in % */
    fanPercent: int(0, 100),
    /** Höchstgeschwindigkeit in mm/s */
    speedMaxMmS: int(1, 1000),
    /** Fluss/Extrusionsmultiplikator in % */
    flowPercent: int(50, 150),
    /** Rückzug in Hundertstelmillimetern (80 = 0,8 mm) */
    retractionHundredthsMm: int(0, 2000),
    /** Trocknen: Temperatur in °C und Dauer in Minuten */
    dryingC: int(30, 120),
    dryingMinutes: int(0, 2880),
    /** Braucht einen geschlossenen Bauraum (ABS, ASA, PC …) */
    enclosureRequired: z.boolean().optional(),
  })
  .refine(s => rangeOk(s.nozzleMinC, s.nozzleMaxC), {
    message: "Die Düsentemperatur „bis“ liegt unter „von“",
    path: ["nozzleMaxC"],
  })
  .refine(s => rangeOk(s.bedMinC, s.bedMaxC), {
    message: "Die Betttemperatur „bis“ liegt unter „von“",
    path: ["bedMaxC"],
  });

export const resinPrintSettingsSchema = z.object({
  kind: z.literal("resin"),
  /** Belichtung je Schicht in ms */
  exposureMs: int(100, 60_000),
  /** Belichtung der Bodenschichten in ms */
  bottomExposureMs: int(100, 200_000),
  bottomLayers: int(0, 50),
  /** Schichthöhe in µm */
  layerHeightUm: int(10, 300),
  /** Nachhärten in Minuten */
  postCureMinutes: int(0, 240),
});

export const powderPrintSettingsSchema = z.object({
  kind: z.literal("powder"),
  /** Schichthöhe in µm */
  layerHeightUm: int(10, 500),
  /** Anteil frisches Pulver je Druck in % */
  refreshPercent: int(0, 100),
});

/**
 * Die Einstellungen eines Materials – eine Form je Materialart, unterschieden
 * über `kind`. Welche Art gilt, bestimmt das **Lager** der Gebinde; der Server
 * lehnt eine abweichende ab (`product.setPrintSettings`).
 */
export const printSettingsSchema = z.discriminatedUnion("kind", [
  filamentPrintSettingsSchema,
  resinPrintSettingsSchema,
  powderPrintSettingsSchema,
]);

export type PrintSettings = z.infer<typeof printSettingsSchema>;
export type FilamentPrintSettings = z.infer<typeof filamentPrintSettingsSchema>;
export type ResinPrintSettings = z.infer<typeof resinPrintSettingsSchema>;
export type PowderPrintSettings = z.infer<typeof powderPrintSettingsSchema>;

/** Die Felder je Materialart in Anzeigereihenfolge – für Formular und Karte */
export const PRINT_SETTING_FIELDS = {
  filament: [
    "nozzleMinC",
    "nozzleMaxC",
    "bedMinC",
    "bedMaxC",
    "chamberC",
    "fanPercent",
    "speedMaxMmS",
    "flowPercent",
    "retractionHundredthsMm",
    "dryingC",
    "dryingMinutes",
  ],
  resin: [
    "exposureMs",
    "bottomExposureMs",
    "bottomLayers",
    "layerHeightUm",
    "postCureMinutes",
  ],
  powder: ["layerHeightUm", "refreshPercent"],
} as const satisfies Record<MaterialKind, readonly string[]>;

export type PrintSettingField =
  (typeof PRINT_SETTING_FIELDS)[MaterialKind][number];

/** Ob irgendein Wert gesetzt ist – eine leere Karte zeigt die App nicht an. */
export function hasPrintSettings(
  settings: PrintSettings | null | undefined,
  notes?: string | null
): boolean {
  if (notes?.trim()) return true;
  if (!settings) return false;
  return Object.entries(settings).some(
    ([key, value]) => key !== "kind" && value != null && value !== false
  );
}

/**
 * Liest gespeicherte Einstellungen. Was nicht zum Schema passt (eine ältere
 * `schemaVersion`, ein Feld aus einer anderen Art), wird zu `null` statt zu
 * einem Fehler: Eine Seite, die wegen einer alten Zeile nicht lädt, wäre
 * schlimmer als eine leere Karte.
 */
export function parseStoredPrintSettings(raw: unknown): PrintSettings | null {
  const parsed = printSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
