import { z } from "zod";
import { FALLBACK_LANGUAGE, type LanguageCode } from "./i18n";
import {
  containerFormSchema,
  formFitsKind,
  type ContainerForm,
  type MaterialKind,
} from "./materials";

/**
 * Gemeinsame Schemas und reine Hilfsfunktionen für den Preset-Katalog.
 *
 * Diese Datei wird von Client, Server und Tests importiert und darf deshalb
 * nichts aus `@db` oder `api/` zur Laufzeit laden – nur zod und eigene Logik.
 */

// ---------------------------------------------------------------------------
// Aufzählungen
//
// `CONTAINER_MATERIALS` ist die Vorlage für den `pgEnum` in `db/schema.ts` –
// die Richtung geht von hier nach dort, wie bei `MATERIAL_KINDS` in
// `contracts/materials.ts`. Vorher stand die Liste in beiden Dateien; beim
// Umbenennen wäre eine der beiden Kopien liegen geblieben.
//
// Die übrigen Listen hier (`PRESET_SCOPES`, `PRESET_PROPOSAL_STATUSES`) sind
// noch Spiegel der Enums in `db/schema.ts`. Sie wurden von dieser Änderung
// nicht angefasst und bleiben Doppelungen.
// ---------------------------------------------------------------------------

/**
 * Werkstoff des Gebindes selbst – nicht des Materials darin.
 *
 * `glas` und `folie` sind mit den Gebindeformen dazugekommen: Harz steht in
 * Glasflaschen, Pulver in Folienbeuteln. Neue Werte gehören ans **Ende** – die
 * Reihenfolge bestimmt die Sortierung im Postgres-Enum, und ein Einschub in der
 * Mitte wäre in der Migration eine eigene Übung (`ALTER TYPE … ADD VALUE …
 * BEFORE`).
 */
export const CONTAINER_MATERIALS = [
  "kunststoff",
  "karton",
  "metall",
  "sonstiges",
  "glas",
  "folie",
] as const;
export type ContainerMaterial = (typeof CONTAINER_MATERIALS)[number];

export const PRESET_SCOPES = [
  "manufacturer",
  "series",
  "version",
  "variant",
] as const;
export type PresetScope = (typeof PRESET_SCOPES)[number];

export const PRESET_PROPOSAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "withdrawn",
] as const;
export type PresetProposalStatus = (typeof PRESET_PROPOSAL_STATUSES)[number];

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
    .replace(/[äöüß]/g, c => UMLAUT_MAP[c] ?? c)
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
  materialType: string | null | undefined
): boolean {
  if (tags.length === 0) return true;
  if (!materialType?.trim()) return false;
  const needle = normalizeMaterialType(materialType);
  return tags.some(tag => {
    const t = normalizeMaterialType(tag);
    return (
      needle === t || needle.startsWith(`${t}+`) || needle.startsWith(`${t} `)
    );
  });
}

/** 1000 → „1 kg“, 750 → „750 g“ */
export function formatNominalWeight(grams: number): string {
  return grams % 1000 === 0 ? `${grams / 1000} kg` : `${grams} g`;
}

/**
 * Passt ein Katalog-Gebinde zu dem, was gerade eingetragen wird?
 *
 * Zwei Merkmale sprechen mit: die Materialarten der Serie und die Form des
 * Gebindes. Beide können unbekannt sein – eine Serie muss nicht verschlagwortet
 * sein, und alles, was vor 2.3.0 in den Katalog kam, hat keine Form.
 *
 * Entscheidend ist, dass „passend“ **positive Belege** verlangt und nicht bloß
 * das Fehlen eines Widerspruchs:
 *
 *   - Ein Merkmal, das widerspricht, schließt aus.
 *   - Sonst muss mindestens ein Merkmal zustimmen.
 *   - Zwei unbekannte Merkmale heißen „weiß nicht“, nicht „passt“.
 *
 * Warum das wichtig ist: `materialTypeMatches` hält eine leere Schlagwortliste
 * für passend, und `formFitsKind` hält eine unbekannte Form für passend. Beide
 * einzeln sind richtig so. Zusammengenommen ergaben sie aber, dass eine
 * unverschlagwortete Filamentspule ohne Formangabe unter „Passend zu Harz“
 * stand – eine Behauptung, für die es keinen einzigen Hinweis gab. Solange es
 * nur Filament gab, fiel das nicht auf.
 *
 * **`sonstiges` ist keine Formangabe, sondern deren Fehlen** – siehe die
 * Begründung an `formKnown` unten.
 */
export function containerFits(
  container: {
    form?: ContainerForm | null;
    materialTypes?: readonly string[];
  },
  context: {
    kind?: MaterialKind | null;
    materialType?: string | null;
  }
): boolean {
  const tags = container.materialTypes ?? [];
  const typeKnown = !!context.materialType?.trim() && tags.length > 0;
  const typeFits =
    typeKnown && materialTypeMatches(tags, context.materialType ?? null);

  /*
    `sonstiges` zählt wie eine fehlende Form. Es ist die Auffangform – die
    Aussage „keine der fünf passt“, nicht die Aussage „diese hier“. Als Beleg
    genommen machte sie jedes Gebinde ohne Schlagworte zu einem passenden für
    **jede** Materialart, also genau die Behauptung ohne Hinweis, gegen die diese
    Funktion geschrieben ist. Als Widerspruch genommen schlösse sie es überall
    aus, was der Sinn einer Auffangform gerade nicht ist. Unbekannt ist beides
    nicht: Es fällt in die Mitte, wie ein Katalogeintrag von vor 2.3.0.

    `formFitsKind` bleibt davon unberührt – dort ist `sonstiges` weiter passend,
    weil die Funktion nur nach dem Widerspruch fragt. Die Gebindeauswahl sortiert
    damit die **eigenen** Gebindearten des Benutzers, und ein selbst angelegtes
    „Sonstiges“ gehört nicht nach unten: Es steht in einer kurzen Liste, die er
    selbst gepflegt hat, und wird nicht in „passend“ und „übrige“ geteilt.
  */
  const formKnown =
    container.form != null &&
    container.form !== "sonstiges" &&
    context.kind != null;
  const formFits = formKnown && formFitsKind(container.form, context.kind);

  if (typeKnown && !typeFits) return false;
  if (formKnown && !formFits) return false;
  return typeFits || formFits;
}

// ---------------------------------------------------------------------------
// Mehrsprachige Katalognamen
// ---------------------------------------------------------------------------

/**
 * Übersetzungen eines Katalognamens, nach Sprachcode.
 *
 * Die Basissprache steht weiterhin in der Spalte `name`: Sie ist Pflicht,
 * speist den Slug und dient als Rückfallebene. `nameI18n` enthält nur die
 * Abweichungen davon – für `de` steht dort deshalb im Normalfall nichts.
 *
 * Übersetzt werden Serien und Ausführungen, nicht Hersteller: „Polymaker“ und
 * „eSUN“ sind Eigennamen und in jeder Sprache dieselben.
 *
 * Kommt in `contracts/i18n.ts` eine Sprache dazu, gehört sie auch hierher.
 */
export const nameI18nSchema = z.object({
  de: z.string().trim().max(255).optional(),
  en: z.string().trim().max(255).optional(),
});

export type NameI18n = z.infer<typeof nameI18nSchema>;

/** Eingabefeld: leere Zeichenketten zählen als „keine Übersetzung“ */
export const nameI18nInputSchema = nameI18nSchema
  .transform(value =>
    Object.fromEntries(
      Object.entries(value).filter(([, name]) => (name ?? "").length > 0)
    )
  )
  .optional();

/**
 * Name in der gewünschten Sprache. Fehlt die Übersetzung, gilt der Grundname –
 * ein halb gepflegter Katalog zeigt also deutsche statt leerer Einträge.
 */
export function resolveName(
  entry: { name: string; nameI18n?: NameI18n | null },
  language: LanguageCode
): string {
  return entry.nameI18n?.[language]?.trim() || entry.name;
}

/** Sprachen, für die noch keine Übersetzung hinterlegt ist. */
export function missingTranslations(
  entry: { nameI18n?: NameI18n | null },
  languages: readonly LanguageCode[]
): LanguageCode[] {
  return languages.filter(
    language =>
      language !== FALLBACK_LANGUAGE && !entry.nameI18n?.[language]?.trim()
  );
}

/**
 * Anzeigename einer Variante:
 * „Polymaker · PolyTerra PLA · Kartonspule (ab 2023) · 1 kg“
 *
 * Wird beim Lesen erzeugt, nicht gespeichert – die Namensteile kommen bereits
 * in der gewünschten Sprache herein (siehe `resolveName`).
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
    .map(s => String(s).trim())
    .filter(Boolean)
    .join(" · ");
}

/**
 * Referenz auf das gewählte Gebinde im Formular. Eigene Gebindearten und
 * Preset-Varianten teilen sich eine Auswahlliste, deshalb wird die Herkunft
 * mitkodiert.
 */
export type ContainerRefKind = "own" | "preset";

export function encodeContainerRef(kind: ContainerRefKind, id: number): string {
  return `${kind}:${id}`;
}

export function decodeContainerRef(
  ref: string | null | undefined
): { kind: ContainerRefKind; id: number } | null {
  if (!ref) return null;
  const match = /^(own|preset):(\d+)$/.exec(ref);
  if (!match) return null;
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return { kind: match[1] as ContainerRefKind, id };
}

/**
 * Leergewicht des Gebindes in Gramm. Einzige Stelle, an der die Priorität
 * zwischen Preset-Variante und eigener Gebindeart festgelegt ist – Server
 * (Restmengenberechnung) und Client (Tara-Vorschau) nutzen sie gemeinsam,
 * damit sie nicht auseinanderlaufen können.
 */
export function resolveContainerTare(material: {
  containerType?: { tareWeight: number } | null;
  containerPresetVariant?: { tareWeight: number } | null;
}): number {
  return (
    material.containerPresetVariant?.tareWeight ??
    material.containerType?.tareWeight ??
    0
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
  }
): boolean {
  if (hidden.has(hiddenKey("manufacturer", path.manufacturerId))) return true;
  if (path.seriesId != null && hidden.has(hiddenKey("series", path.seriesId)))
    return true;
  if (
    path.versionId != null &&
    hidden.has(hiddenKey("version", path.versionId))
  )
    return true;
  if (
    path.variantId != null &&
    hidden.has(hiddenKey("variant", path.variantId))
  )
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
    "Schlüssel darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten"
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
  nameI18n: nameI18nInputSchema,
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
    nameI18n: nameI18nInputSchema,
    /** Form des Gebindes; steuert Beschriftung und Sortierung der Auswahl */
    form: containerFormSchema.nullable().optional(),
    containerMaterial: z.enum(CONTAINER_MATERIALS).nullable().optional(),
    validFrom: isoDate,
    validTo: isoDate,
    notes: optionalNotes,
  })
  .refine(v => !v.validFrom || !v.validTo || v.validFrom <= v.validTo, {
    message: "„Gültig ab“ muss vor „Gültig bis“ liegen",
    path: ["validTo"],
  });

/*
  Grenzen der Variantenfelder.
  ---------------------------------------------------------------------------
  Einmal definiert und von `variantFieldsSchema` **und** dem Änderungsvorschlag
  weiter unten benutzt. Vorher standen dieselben Zahlen zweimal im Code; wer die
  eine Stelle anpasste, ließ die andere zurück, und der Vorschlagsweg hätte
  Werte durchgelassen, die die Katalogpflege ablehnt.

  Die Obergrenzen sind mit den Gebindeformen gestiegen: Der Katalog beschrieb
  bis 2.2.0 eine Spule (bis 20 kg Inhalt, bis 5 kg Leergewicht). Ein
  25-kg-Pulvereimer im Metallbehälter passt da nicht hinein.
*/
const variantFields = {
  nominalWeight: z
    .number()
    .int("Nenngewicht muss eine ganze Zahl sein")
    .positive("Nenngewicht muss größer als 0 sein")
    .max(50000, "Nenngewicht ist unplausibel hoch"),
  tareWeight: z
    .number()
    .int("Leergewicht muss eine ganze Zahl sein")
    .min(0, "Leergewicht muss >= 0 sein")
    .max(20000, "Leergewicht ist unplausibel hoch"),
  /*
    Geometrie: bleibt optional und ist in der Oberfläche nur bei Rollen
    sichtbar. Die Untergrenzen sind gelockert, weil eine 100-ml-Kartusche
    schmaler ist als jede Spule, die Breite nach oben, weil ein 10-kg-Pulverbeutel
    breiter ist als jede Spule.
  */
  outerDiameterMm: z
    .number()
    .int()
    .min(20, "Außendurchmesser muss zwischen 20 und 400 mm liegen")
    .max(400, "Außendurchmesser muss zwischen 20 und 400 mm liegen")
    .nullable()
    .optional(),
  widthMm: z
    .number()
    .int()
    .min(5, "Breite muss zwischen 5 und 600 mm liegen")
    .max(600, "Breite muss zwischen 5 und 600 mm liegen")
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
};

/**
 * Die Bohrung muss kleiner als der Außendurchmesser sein.
 *
 * Bleibt für **alle** Formen gültig und braucht die Form nicht zu kennen: Was
 * keine Bohrung hat, lässt das Feld leer, und dann greift die Regel nicht. Eine
 * Flasche, bei der jemand trotzdem eine Bohrung einträgt, soll dieselbe Prüfung
 * bekommen wie eine Spule – die Geometrie ändert sich nicht mit dem Namen.
 */
const boreFitsOuter = (v: {
  boreDiameterMm?: number | null;
  outerDiameterMm?: number | null;
}) =>
  v.boreDiameterMm == null ||
  v.outerDiameterMm == null ||
  v.boreDiameterMm < v.outerDiameterMm;

/* Kein `as const`: zod verlangt ein veränderliches `PropertyKey[]`. */
const BORE_MESSAGE = {
  message: "Die Bohrung muss kleiner als der Außendurchmesser sein",
  path: ["boreDiameterMm"],
};

/*
  Bewusst **keine** Regel „Leergewicht kleiner als Nenngewicht“ mehr.

  Sie galt bis 2.2.0 und war schon damals nur für Spulen richtig: 500 g
  Testpulver in einem 2 kg schweren Metallbehälter verletzen sie, ohne dass an
  der Angabe etwas falsch wäre. Sie zu behalten hieße, ein echtes Gebinde für
  unplausibel zu erklären.

  Kostet nichts: Die Restmenge wird an beiden Lesestellen bei null abgeschnitten
  (`api/queries/filament.ts`, `api/queries/friends.ts`), eine negative Menge kann
  also gar nicht entstehen. Und die **eigenen** Gebindearten des Benutzers
  kannten diese Regel ohnehin nie – der Katalog war strenger als das Formular
  daneben.
*/
export const variantFieldsSchema = z
  .object(variantFields)
  .refine(boreFitsOuter, BORE_MESSAGE);

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
    nameI18n: nameI18nInputSchema,
    materialTypes: materialTypesSchema,
  }),
  version: z.object({
    name: z
      .string()
      .trim()
      .min(1, "Bezeichnung der Ausführung ist erforderlich")
      .max(255, "Bezeichnung darf höchstens 255 Zeichen haben"),
    nameI18n: nameI18nInputSchema,
    /** Form des Gebindes; steuert Beschriftung und Sortierung der Auswahl */
    form: containerFormSchema.nullable().optional(),
    containerMaterial: z.enum(CONTAINER_MATERIALS).nullable().optional(),
    validFrom: isoDate,
    validTo: isoDate,
  }),
  variant: variantFieldsSchema,
});

const nonEmptyPatch = <T extends z.ZodTypeAny>(schema: T) =>
  schema.refine(
    patch =>
      Object.values(patch as Record<string, unknown>).some(
        v => v !== undefined
      ),
    { message: "Der Vorschlag enthält keine Änderungen" }
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
          nameI18n: nameI18nInputSchema,
          /** Form des Gebindes; steuert Beschriftung und Sortierung der Auswahl */
          form: containerFormSchema.nullable().optional(),
          containerMaterial: z.enum(CONTAINER_MATERIALS).nullable().optional(),
          validFrom: isoDate,
          validTo: isoDate,
          notes: optionalNotes,
        })
        .refine(v => !v.validFrom || !v.validTo || v.validFrom <= v.validTo, {
          message: "„Gültig ab“ muss vor „Gültig bis“ liegen",
          path: ["validTo"],
        })
    ),
  }),
  z.object({
    kind: z.literal("change"),
    scope: z.literal("variant"),
    /*
      Dieselben Feldgrenzen wie in `variantFieldsSchema` – nicht abgeschrieben,
      sondern derselbe Baustein. Vorher standen sie hier ein zweites Mal, mit
      eigenen Zahlen und ohne Meldungstexte; ein Vorschlag konnte damit Werte
      tragen, die die Katalogpflege gar nicht angenommen hätte.
    */
    patch: nonEmptyPatch(
      z
        .object({
          nominalWeight: variantFields.nominalWeight.optional(),
          tareWeight: variantFields.tareWeight.optional(),
          outerDiameterMm: variantFields.outerDiameterMm,
          widthMm: variantFields.widthMm,
          boreDiameterMm: variantFields.boreDiameterMm,
          notes: optionalNotes,
        })
        .refine(boreFitsOuter, BORE_MESSAGE)
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
