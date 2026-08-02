import { z } from "zod";

/**
 * Gemeinsame Schemas und reine Hilfsfunktionen für den Preset-Katalog.
 *
 * Diese Datei wird von Client, Server und Tests importiert und darf deshalb
 * nichts aus `@db` oder `api/` zur Laufzeit laden – nur zod und eigene Logik.
 */

// ---------------------------------------------------------------------------
// Aufzählungen (Spiegel der Enums in db/schema.ts)
// ---------------------------------------------------------------------------

export const SPOOL_MATERIALS = [
  "kunststoff",
  "karton",
  "metall",
  "sonstiges",
] as const;
export type SpoolMaterial = (typeof SPOOL_MATERIALS)[number];

/** Beschriftung des Spulenmaterials für die Oberfläche */
export const SPOOL_MATERIAL_LABELS: Record<SpoolMaterial, string> = {
  kunststoff: "Kunststoff",
  karton: "Karton",
  metall: "Metall",
  sonstiges: "Sonstiges",
};

export const PRESET_SCOPES = [
  "manufacturer",
  "series",
  "version",
  "variant",
] as const;
export type PresetScope = (typeof PRESET_SCOPES)[number];

/** Beschriftung der Katalogebene für die Oberfläche */
export const PRESET_SCOPE_LABELS: Record<PresetScope, string> = {
  manufacturer: "Hersteller",
  series: "Serie",
  version: "Ausführung",
  variant: "Variante",
};

// ---------------------------------------------------------------------------
// Reine Hilfsfunktionen
// ---------------------------------------------------------------------------

const UMLAUT_MAP: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  ß: "ss",
};

/**
 * Erzeugt einen stabilen Schlüssel aus einem Namen:
 * „Polymaker PolyTerra™ Grün“ → „polymaker-polyterra-gruen“.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUT_MAP[c] ?? c)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

/** Vereinheitlicht eine Materialart für den Vergleich: „ pla+ “ → „PLA+“ */
export function normalizeMaterialType(input: string): string {
  return input.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Weicher Abgleich der Materialart. Ein Preset, das mit „PLA“ verschlagwortet
 * ist, passt auch zu „PLA+“ und „PLA Silk“ – Materialarten sind im Bestand
 * Freitext, deshalb wird nie hart gefiltert, sondern nur gruppiert.
 * Eine leere Schlagwortliste passt zu allem.
 */
export function materialTypeMatches(
  tags: readonly string[],
  materialType: string | null | undefined,
): boolean {
  if (tags.length === 0) return true;
  if (!materialType?.trim()) return false;
  const needle = normalizeMaterialType(materialType);
  return tags.some((tag) => {
    const t = normalizeMaterialType(tag);
    return needle === t || needle.startsWith(`${t}+`) || needle.startsWith(`${t} `);
  });
}

/** 1000 → „1 kg“, 750 → „750 g“ */
export function formatNominalWeight(grams: number): string {
  return grams % 1000 === 0 ? `${grams / 1000} kg` : `${grams} g`;
}

/**
 * Anzeigename einer Variante:
 * „Polymaker · PolyTerra PLA · Kartonspule (ab 2023) · 1 kg“
 */
export function buildVariantDisplayName(parts: {
  manufacturer: string;
  series: string;
  version: string;
  nominalWeight: number;
}): string {
  return [
    parts.manufacturer,
    parts.series,
    parts.version,
    formatNominalWeight(parts.nominalWeight),
  ]
    .map((s) => String(s).trim())
    .filter(Boolean)
    .join(" · ");
}

/**
 * Referenz auf die gewählte Rolle im Formular. Eigene Rollentypen und
 * Preset-Varianten teilen sich eine Auswahlliste, deshalb wird die Herkunft
 * mitkodiert.
 */
export type SpoolRefKind = "own" | "preset";

export function encodeSpoolRef(kind: SpoolRefKind, id: number): string {
  return `${kind}:${id}`;
}

export function decodeSpoolRef(
  ref: string | null | undefined,
): { kind: SpoolRefKind; id: number } | null {
  if (!ref) return null;
  const match = /^(own|preset):(\d+)$/.exec(ref);
  if (!match) return null;
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return { kind: match[1] as SpoolRefKind, id };
}

/**
 * Leergewicht der Rolle in Gramm. Einzige Stelle, an der die Priorität
 * zwischen Preset-Variante und eigenem Rollentyp festgelegt ist – Server
 * (Restmengenberechnung) und Client (Tara-Vorschau) nutzen sie gemeinsam,
 * damit sie nicht auseinanderlaufen können.
 */
export function resolveSpoolTare(material: {
  spoolType?: { tareWeight: number } | null;
  spoolPresetVariant?: { tareWeight: number } | null;
}): number {
  return (
    material.spoolPresetVariant?.tareWeight ?? material.spoolType?.tareWeight ?? 0
  );
}

/** Schlüssel einer Ausblendung, z. B. „series:4“ */
export function hiddenKey(scope: PresetScope, refId: number): string {
  return `${scope}:${refId}`;
}

/**
 * Ausblenden wirkt kaskadierend nach unten: ein ausgeblendeter Hersteller
 * blendet alle seine Serien, Ausführungen und Varianten mit aus.
 */
export function isPresetHidden(
  hidden: ReadonlySet<string>,
  path: {
    manufacturerId: number;
    seriesId?: number;
    versionId?: number;
    variantId?: number;
  },
): boolean {
  if (hidden.has(hiddenKey("manufacturer", path.manufacturerId))) return true;
  if (path.seriesId != null && hidden.has(hiddenKey("series", path.seriesId)))
    return true;
  if (path.versionId != null && hidden.has(hiddenKey("version", path.versionId)))
    return true;
  if (path.variantId != null && hidden.has(hiddenKey("variant", path.variantId)))
    return true;
  return false;
}

/** Eine Ausführung gilt als aktuell, solange kein Gültigkeitsende gesetzt ist. */
export function isCurrentVersion(version: { validTo: string | null }): boolean {
  return version.validTo == null;
}

// ---------------------------------------------------------------------------
// Bausteine für die Eingabevalidierung
// ---------------------------------------------------------------------------

export const slugSchema = z
  .string()
  .trim()
  .min(1, "Schlüssel ist erforderlich")
  .max(100, "Schlüssel darf höchstens 100 Zeichen haben")
  .regex(
    /^[a-z0-9-]+$/,
    "Schlüssel darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten",
  );

export const materialTypeTagSchema = z
  .string()
  .trim()
  .min(1, "Materialart darf nicht leer sein")
  .max(100, "Materialart darf höchstens 100 Zeichen haben")
  .transform(normalizeMaterialType);

export const materialTypesSchema = z
  .array(materialTypeTagSchema)
  .max(20, "Höchstens 20 Materialarten")
  .default([]);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT")
  .nullable()
  .optional();

const optionalNotes = z
  .string()
  .max(2000, "Notiz darf höchstens 2000 Zeichen haben")
  .nullable()
  .optional();

// ---------------------------------------------------------------------------
// Eingaben für die Katalogpflege (Administration)
// ---------------------------------------------------------------------------

export const manufacturerFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Herstellername ist erforderlich")
    .max(255, "Herstellername darf höchstens 255 Zeichen haben"),
  website: z
    .string()
    .trim()
    .url("Bitte eine gültige URL angeben")
    .max(500, "URL darf höchstens 500 Zeichen haben")
    .nullable()
    .optional(),
  notes: optionalNotes,
});

export const seriesFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name der Serie ist erforderlich")
    .max(255, "Name der Serie darf höchstens 255 Zeichen haben"),
  materialTypes: materialTypesSchema,
  notes: optionalNotes,
});

export const versionFieldsSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Bezeichnung der Ausführung ist erforderlich")
      .max(255, "Bezeichnung darf höchstens 255 Zeichen haben"),
    spoolMaterial: z.enum(SPOOL_MATERIALS).nullable().optional(),
    validFrom: isoDate,
    validTo: isoDate,
    notes: optionalNotes,
  })
  .refine((v) => !v.validFrom || !v.validTo || v.validFrom <= v.validTo, {
    message: "„Gültig ab“ muss vor „Gültig bis“ liegen",
    path: ["validTo"],
  });

export const variantFieldsSchema = z
  .object({
    nominalWeight: z
      .number()
      .int("Nenngewicht muss eine ganze Zahl sein")
      .positive("Nenngewicht muss größer als 0 sein")
      .max(20000, "Nenngewicht ist unplausibel hoch"),
    tareWeight: z
      .number()
      .int("Leergewicht muss eine ganze Zahl sein")
      .min(0, "Leergewicht muss >= 0 sein")
      .max(5000, "Leergewicht ist unplausibel hoch"),
    outerDiameterMm: z
      .number()
      .int()
      .min(50, "Außendurchmesser muss zwischen 50 und 400 mm liegen")
      .max(400, "Außendurchmesser muss zwischen 50 und 400 mm liegen")
      .nullable()
      .optional(),
    widthMm: z
      .number()
      .int()
      .min(10, "Breite muss zwischen 10 und 200 mm liegen")
      .max(200, "Breite muss zwischen 10 und 200 mm liegen")
      .nullable()
      .optional(),
    boreDiameterMm: z
      .number()
      .int()
      .min(10, "Bohrung muss zwischen 10 und 200 mm liegen")
      .max(200, "Bohrung muss zwischen 10 und 200 mm liegen")
      .nullable()
      .optional(),
    notes: optionalNotes,
  })
  .refine((v) => v.tareWeight < v.nominalWeight, {
    message: "Das Leergewicht muss kleiner als das Nenngewicht sein",
    path: ["tareWeight"],
  })
  .refine(
    (v) =>
      v.boreDiameterMm == null ||
      v.outerDiameterMm == null ||
      v.boreDiameterMm < v.outerDiameterMm,
    {
      message: "Die Bohrung muss kleiner als der Außendurchmesser sein",
      path: ["boreDiameterMm"],
    },
  );

export type ManufacturerFields = z.infer<typeof manufacturerFieldsSchema>;
export type SeriesFields = z.infer<typeof seriesFieldsSchema>;
export type VersionFields = z.infer<typeof versionFieldsSchema>;
export type VariantFields = z.infer<typeof variantFieldsSchema>;

// ---------------------------------------------------------------------------
// Vorschläge
//
// Ein Vorschlag speichert immer einen vollständigen Schnappschuss, nie einen
// Diff: „neu“ beschreibt den kompletten Pfad Hersteller → Serie → Ausführung →
// Variante über Namen (nicht IDs), „Änderung“ genau eine Ebene. Dadurch lässt
// sich das Annehmen ohne Transaktionen idempotent umsetzen.
// ---------------------------------------------------------------------------

export const proposalNewPayloadSchema = z.object({
  kind: z.literal("new"),
  manufacturer: z.object({
    name: z
      .string()
      .trim()
      .min(1, "Herstellername ist erforderlich")
      .max(255, "Herstellername darf höchstens 255 Zeichen haben"),
    website: z
      .string()
      .trim()
      .url("Bitte eine gültige URL angeben")
      .max(500)
      .optional(),
  }),
  series: z.object({
    name: z
      .string()
      .trim()
      .min(1, "Name der Serie ist erforderlich")
      .max(255, "Name der Serie darf höchstens 255 Zeichen haben"),
    materialTypes: materialTypesSchema,
  }),
  version: z.object({
    name: z
      .string()
      .trim()
      .min(1, "Bezeichnung der Ausführung ist erforderlich")
      .max(255, "Bezeichnung darf höchstens 255 Zeichen haben"),
    spoolMaterial: z.enum(SPOOL_MATERIALS).nullable().optional(),
    validFrom: isoDate,
    validTo: isoDate,
  }),
  variant: variantFieldsSchema,
});

const nonEmptyPatch = <T extends z.ZodTypeAny>(schema: T) =>
  schema.refine(
    (patch) => Object.values(patch as Record<string, unknown>).some((v) => v !== undefined),
    { message: "Der Vorschlag enthält keine Änderungen" },
  );

export const proposalChangePayloadSchema = z.discriminatedUnion("scope", [
  z.object({
    kind: z.literal("change"),
    scope: z.literal("manufacturer"),
    patch: nonEmptyPatch(manufacturerFieldsSchema.partial()),
  }),
  z.object({
    kind: z.literal("change"),
    scope: z.literal("series"),
    patch: nonEmptyPatch(seriesFieldsSchema.partial()),
  }),
  z.object({
    kind: z.literal("change"),
    scope: z.literal("version"),
    patch: nonEmptyPatch(
      z
        .object({
          name: z.string().trim().min(1).max(255).optional(),
          spoolMaterial: z.enum(SPOOL_MATERIALS).nullable().optional(),
          validFrom: isoDate,
          validTo: isoDate,
          notes: optionalNotes,
        })
        .refine((v) => !v.validFrom || !v.validTo || v.validFrom <= v.validTo, {
          message: "„Gültig ab“ muss vor „Gültig bis“ liegen",
          path: ["validTo"],
        }),
    ),
  }),
  z.object({
    kind: z.literal("change"),
    scope: z.literal("variant"),
    patch: nonEmptyPatch(
      z.object({
        nominalWeight: z.number().int().positive().max(20000).optional(),
        tareWeight: z.number().int().min(0).max(5000).optional(),
        outerDiameterMm: z.number().int().min(50).max(400).nullable().optional(),
        widthMm: z.number().int().min(10).max(200).nullable().optional(),
        boreDiameterMm: z.number().int().min(10).max(200).nullable().optional(),
        notes: optionalNotes,
      }),
    ),
  }),
]);

export const proposalPayloadSchema = z.union([
  proposalNewPayloadSchema,
  proposalChangePayloadSchema,
]);

export type ProposalNewPayload = z.infer<typeof proposalNewPayloadSchema>;
export type ProposalChangePayload = z.infer<typeof proposalChangePayloadSchema>;
export type ProposalPayload = z.infer<typeof proposalPayloadSchema>;
