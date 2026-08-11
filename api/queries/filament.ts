import { and, desc, eq } from "drizzle-orm";
import {
  buildVariantDisplayName,
  resolveName,
  resolveContainerTare,
} from "@contracts/presets";
import { FALLBACK_LANGUAGE, type LanguageCode } from "@contracts/i18n";
import {
  remainingAmount,
  type ContainerForm,
  type SecondaryAmount,
} from "@contracts/materials";
import {
  materials,
  presetContainerVariants,
  containerTypes,
  storageBoxes,
  weighings,
  type Lager,
  type Material,
  type PresetManufacturer,
  type PresetContainerSeries,
  type PresetContainerVariant,
  type PresetContainerVersion,
  type ContainerType,
  type StorageBox,
  type Weighing,
} from "@db/schema";
import { getDb } from "./connection";

// ---------------------------------------------------------------------------
// Rollentypen (Verpackung / Spule mit Leergewicht)
// ---------------------------------------------------------------------------

export function findContainerTypesByUser(userId: number) {
  return getDb().query.containerTypes.findMany({
    where: eq(containerTypes.userId, userId),
    orderBy: (t, { asc }) => [asc(t.name)],
  });
}

export async function createContainerType(data: {
  userId: number;
  name: string;
  manufacturer?: string;
  /**
   * Gebindeform. Fehlt sie, greift die Spaltenvorgabe `rolle`.
   *
   * Steht hier ausdrücklich, obwohl Drizzle die Spalte auch ohne Typeintrag
   * schreiben würde: Ein Feld, das der Parametertyp nicht kennt, lässt sich vom
   * Aufrufer nicht setzen (Fehler wegen überzähliger Eigenschaft) – genau daran
   * ist `preset.copyToOwn` gescheitert und hat jede kopierte Flasche zur Rolle
   * gemacht.
   */
  form?: ContainerForm;
  tareWeight: number;
  sourceVariantId?: number | null;
  notes?: string;
}) {
  const [{ id }] = await getDb()
    .insert(containerTypes)
    .values(data)
    .returning({ id: containerTypes.id });
  return getDb().query.containerTypes.findFirst({
    where: and(
      eq(containerTypes.id, id),
      eq(containerTypes.userId, data.userId)
    ),
  });
}

export async function updateContainerType(
  userId: number,
  id: number,
  data: Partial<{
    name: string;
    manufacturer: string | null;
    form: ContainerForm;
    tareWeight: number;
    notes: string | null;
  }>
) {
  await getDb()
    .update(containerTypes)
    .set(data)
    .where(and(eq(containerTypes.id, id), eq(containerTypes.userId, userId)));
  /*
    Der Besitzerfilter gehört **auch** ans Rücklesen. Ohne ihn traf das UPDATE
    keine Zeile, das `findFirst` aber die fremde – und der Router gab sie samt
    Name, Hersteller und Freitext-Notizen an den Aufrufer zurück. Die Prüfung
    „nichts gefunden“ schlug nicht an, weil eine Zeile gefunden wurde, nur nicht
    seine.
  */
  return getDb().query.containerTypes.findFirst({
    where: and(eq(containerTypes.id, id), eq(containerTypes.userId, userId)),
  });
}

/**
 * Wie viele Materialien diese Gebindeart benutzen – Grundlage der Löschsperre.
 *
 * Besitzergebunden, weil die Anzahl in einer Konfliktmeldung landet: Ohne den
 * Filter verriete „wird noch von 3 Material(ien) verwendet“ die Belegung einer
 * fremden Gebindeart. Dieselbe Erwägung wie bei `lager.delete`.
 */
export async function countMaterialsWithContainerType(
  userId: number,
  id: number
) {
  const rows = await getDb()
    .select({ id: materials.id })
    .from(materials)
    .where(
      and(eq(materials.containerTypeId, id), eq(materials.userId, userId))
    );
  return rows.length;
}

export async function deleteContainerType(userId: number, id: number) {
  await getDb()
    .delete(containerTypes)
    .where(and(eq(containerTypes.id, id), eq(containerTypes.userId, userId)));
}

// ---------------------------------------------------------------------------
// Lagerboxen / Dryboxen (mit Leergewicht)
// ---------------------------------------------------------------------------

export function findStorageBoxesByUser(userId: number) {
  return getDb().query.storageBoxes.findMany({
    where: eq(storageBoxes.userId, userId),
    orderBy: (t, { asc }) => [asc(t.name)],
  });
}

export async function createStorageBox(data: {
  userId: number;
  name: string;
  location?: string;
  tareWeight: number;
  notes?: string;
}) {
  const [{ id }] = await getDb()
    .insert(storageBoxes)
    .values(data)
    .returning({ id: storageBoxes.id });
  return getDb().query.storageBoxes.findFirst({
    where: eq(storageBoxes.id, id),
  });
}

export async function updateStorageBox(
  userId: number,
  id: number,
  data: Partial<{
    name: string;
    location: string | null;
    tareWeight: number;
    notes: string | null;
  }>
) {
  await getDb()
    .update(storageBoxes)
    .set(data)
    .where(and(eq(storageBoxes.id, id), eq(storageBoxes.userId, userId)));
  // Besitzerfilter auch beim Rücklesen – siehe `updateContainerType`.
  return getDb().query.storageBoxes.findFirst({
    where: and(eq(storageBoxes.id, id), eq(storageBoxes.userId, userId)),
  });
}

/** Besitzergebunden, weil die Anzahl in eine Konfliktmeldung geht. */
export async function countMaterialsWithStorageBox(userId: number, id: number) {
  const rows = await getDb()
    .select({ id: materials.id })
    .from(materials)
    .where(and(eq(materials.storageBoxId, id), eq(materials.userId, userId)));
  return rows.length;
}

export async function deleteStorageBox(userId: number, id: number) {
  await getDb()
    .delete(storageBoxes)
    .where(and(eq(storageBoxes.id, id), eq(storageBoxes.userId, userId)));
}

// ---------------------------------------------------------------------------
// Materialien + Wägungen
// ---------------------------------------------------------------------------

export type MaterialWithRelations = Material & {
  containerType: ContainerType | null;
  storageBox: StorageBox | null;
  /**
   * Referenzierte Variante aus dem Preset-Katalog (Alternative zu containerType),
   * mitsamt ihres Pfads: Der Anzeigename wird daraus in der Sprache des
   * Aufrufers erzeugt, statt wie früher vorberechnet in der Spalte zu liegen.
   */
  containerPresetVariant: PresetVariantWithPath | null;
  /**
   * Das Lager, in dem das Material liegt. Wird mitgeladen, weil Materialart und
   * Filamentstärke dort stehen – die Zweitanzeige braucht beides.
   */
  lager: Lager | null;
};

/** Preset-Variante samt der drei Ebenen über ihr */
export type PresetVariantWithPath = PresetContainerVariant & {
  version: PresetContainerVersion & {
    series: PresetContainerSeries & { manufacturer: PresetManufacturer };
  };
};

/** Lade-Vorschrift für den Katalogpfad einer Variante */
const withPresetPath = {
  with: {
    version: { with: { series: { with: { manufacturer: true } } } },
  },
} as const;

export type MaterialOverview = MaterialWithRelations & {
  /** Summe der Leergewichte (Rolle + Box) in Gramm */
  tareWeight: number;
  /** Leergewicht nur der Rolle/Verpackung in Gramm (eigen oder Preset) */
  containerTareWeight: number;
  /** Anzeigename der gewählten Rolle, null wenn keine gewählt ist */
  containerLabel: string | null;
  /** Effektiv übrige Materialmenge in Gramm */
  remainingWeight: number;
  /** Verbleibend in Prozent der Nennmenge (0–100), null ohne Nennmenge */
  remainingPercent: number | null;
  /** Letzte Wägung (falls vorhanden) */
  lastWeighing: Weighing | null;
  /** Anzahl aller Wägungen */
  weighingCount: number;
  /**
   * Restmenge in der Zweiteinheit der Materialart: Meter beim Filament, Liter
   * beim Harz, `null` beim Pulver und immer dann, wenn eine nötige Angabe
   * fehlt.
   *
   * Serverseitig gerechnet, weil die Rechnung Materialart und Stärke braucht
   * und beide am Lager hängen – der Client müsste sich sonst beides zusätzlich
   * holen. Reine Anzeige; `remainingWeight` in Gramm bleibt die Wahrheit.
   */
  secondary: SecondaryAmount | null;
  /** Verwendete Dichte in g/l – für den Hinweis, woher die Zweitanzeige kommt */
  densityUsed: number | null;
};

/**
 * Drizzle liefert bei LEFT JOINs ohne Treffer ein Objekt mit lauter
 * null-Feldern statt null zurück. Normalisiert solche Relationen zu null.
 */
function normalizeRelation<T extends { id: number | null } | null>(
  relation: T
): T extends { id: number } ? T : null {
  return (relation != null && relation.id != null ? relation : null) as never;
}

/** Berechnet Tara und Restmenge aus letzter Wägung bzw. Nennmenge. */
export function computeMaterialStats(
  material: MaterialWithRelations,
  lastWeighing: Weighing | null,
  weighingCount: number,
  language: LanguageCode = FALLBACK_LANGUAGE
): MaterialOverview {
  const containerTareWeight = resolveContainerTare(material);
  const preset = material.containerPresetVariant;
  const containerLabel = preset
    ? buildVariantDisplayName({
        manufacturer: preset.version.series.manufacturer.name,
        series: resolveName(preset.version.series, language),
        version: resolveName(preset.version, language),
        nominalWeight: preset.nominalWeight,
      })
    : (material.containerType?.name ?? null);
  const tareWeight =
    containerTareWeight + (material.storageBox?.tareWeight ?? 0);
  /*
    Restmenge, Prozentwert und Zweitanzeige kommen aus `remainingAmount`
    (`contracts/materials.ts`) – derselben Funktion, die auch die Freundesansicht
    benutzt. Zwei Kopien hatten sich sonst über die Zeit auseinanderentwickelt,
    und der Besitzer und sein Freund hätten für dasselbe Material verschiedene
    Zahlen gesehen.
  */
  const { remainingWeight, remainingPercent, secondary, densityUsed } =
    remainingAmount({
      nominalWeight: material.nominalWeight,
      containerTareWeight,
      boxTareWeight: material.storageBox?.tareWeight,
      grossWeight: lastWeighing?.grossWeight,
      materialType: material.materialType,
      kind: material.lager?.materialKind,
      densityGramsPerLiter: material.densityGramsPerLiter,
      diameterUm: material.lager?.filamentDiameterUm,
    });
  return {
    ...material,
    tareWeight,
    containerTareWeight,
    containerLabel,
    remainingWeight,
    remainingPercent,
    lastWeighing,
    weighingCount,
    secondary,
    densityUsed,
  };
}

export async function findMaterialsByUser(
  userId: number,
  language: LanguageCode = FALLBACK_LANGUAGE,
  /**
   * Auf ein Lager einschränken. `undefined` = alle Lager des Benutzers – so
   * bleibt die Schnellsuche über den gesamten Bestand möglich, während die
   * Übersicht auf das gewählte Lager filtert.
   */
  lagerId?: number
): Promise<MaterialOverview[]> {
  const db = getDb();
  const rows = await db.query.materials.findMany({
    where:
      lagerId != null
        ? and(eq(materials.userId, userId), eq(materials.lagerId, lagerId))
        : eq(materials.userId, userId),
    with: {
      containerType: true,
      storageBox: true,
      containerPresetVariant: withPresetPath,
      lager: true,
      weighings: true,
    },
    orderBy: (t, { desc: d }) => [d(t.createdAt)],
  });
  return rows.map(row => {
    const sorted = [...row.weighings].sort(
      (a, b) => b.weighedAt.getTime() - a.weighedAt.getTime() || b.id - a.id
    );
    const last = sorted[0] ?? null;
    const { weighings: _omit, ...rest } = row;
    return computeMaterialStats(
      {
        ...rest,
        containerType: normalizeRelation(row.containerType),
        storageBox: normalizeRelation(row.storageBox),
        containerPresetVariant: normalizeRelation(row.containerPresetVariant),
        lager: normalizeRelation(row.lager),
      },
      last,
      row.weighings.length,
      language
    );
  });
}

export async function findMaterialById(
  userId: number,
  id: number,
  language: LanguageCode = FALLBACK_LANGUAGE
) {
  const row = await getDb().query.materials.findFirst({
    where: and(eq(materials.id, id), eq(materials.userId, userId)),
    with: {
      containerType: true,
      storageBox: true,
      containerPresetVariant: withPresetPath,
      lager: true,
      weighings: { orderBy: (t, { desc: d }) => [d(t.weighedAt), d(t.id)] },
    },
  });
  if (!row) return null;
  const last = row.weighings[0] ?? null;
  const { weighings: list, ...rest } = row;
  return {
    ...computeMaterialStats(
      {
        ...rest,
        containerType: normalizeRelation(row.containerType),
        storageBox: normalizeRelation(row.storageBox),
        containerPresetVariant: normalizeRelation(row.containerPresetVariant),
        lager: normalizeRelation(row.lager),
      },
      last,
      list.length,
      language
    ),
    weighings: list,
  };
}

export async function createMaterial(
  data: {
    userId: number;
    lagerId: number;
    name: string;
    identifier?: string | null;
    materialType: string;
    manufacturer?: string;
    color?: string;
    texture?: string | null;
    priceCents?: number | null;
    purchaseDate?: string | null;
    nominalWeight: number;
    densityGramsPerLiter?: number | null;
    containerTypeId?: number | null;
    containerPresetVariantId?: number | null;
    storageBoxId?: number | null;
    notes?: string;
  },
  initialGrossWeight?: number | null
) {
  const db = getDb();
  const [{ id }] = await db
    .insert(materials)
    .values(data)
    .returning({ id: materials.id });
  if (initialGrossWeight != null) {
    await db
      .insert(weighings)
      .values({ materialId: id, grossWeight: initialGrossWeight });
  }
  return id;
}

export async function updateMaterial(
  userId: number,
  id: number,
  data: Partial<{
    lagerId: number;
    name: string;
    identifier: string | null;
    materialType: string;
    manufacturer: string | null;
    color: string | null;
    texture: string | null;
    priceCents: number | null;
    purchaseDate: string | null;
    nominalWeight: number;
    densityGramsPerLiter: number | null;
    containerTypeId: number | null;
    containerPresetVariantId: number | null;
    storageBoxId: number | null;
    notes: string | null;
  }>
) {
  await getDb()
    .update(materials)
    .set(data)
    .where(and(eq(materials.id, id), eq(materials.userId, userId)));
}

export async function deleteMaterial(userId: number, id: number) {
  const db = getDb();
  await db.delete(weighings).where(eq(weighings.materialId, id));
  await db
    .delete(materials)
    .where(and(eq(materials.id, id), eq(materials.userId, userId)));
}

export async function addWeighing(data: {
  materialId: number;
  grossWeight: number;
  weighedAt?: Date;
  note?: string;
}) {
  const [{ id }] = await getDb()
    .insert(weighings)
    .values(data)
    .returning({ id: weighings.id });
  return getDb().query.weighings.findFirst({ where: eq(weighings.id, id) });
}

export async function findWeighing(id: number) {
  return getDb().query.weighings.findFirst({ where: eq(weighings.id, id) });
}

export async function deleteWeighing(id: number) {
  await getDb().delete(weighings).where(eq(weighings.id, id));
}

/** Prüft, ob ein Material dem Benutzer gehört. */
export async function materialBelongsToUser(
  userId: number,
  materialId: number
) {
  const row = await getDb()
    .select({ id: materials.id })
    .from(materials)
    .where(and(eq(materials.id, materialId), eq(materials.userId, userId)))
    .limit(1);
  return row.length > 0;
}

/** IDs der ContainerTypes/Boxen des Benutzers (zur Validierung von FKs). */
export async function containerTypeBelongsToUser(userId: number, id: number) {
  const row = await getDb()
    .select({ id: containerTypes.id })
    .from(containerTypes)
    .where(and(eq(containerTypes.id, id), eq(containerTypes.userId, userId)))
    .limit(1);
  return row.length > 0;
}

export async function storageBoxBelongsToUser(userId: number, id: number) {
  const row = await getDb()
    .select({ id: storageBoxes.id })
    .from(storageBoxes)
    .where(and(eq(storageBoxes.id, id), eq(storageBoxes.userId, userId)))
    .limit(1);
  return row.length > 0;
}

/**
 * Prüft, ob eine Preset-Variante existiert und wählbar ist. Der Katalog ist
 * global, deshalb gibt es hier keine Benutzerzuordnung – ausgeblendete Presets
 * bleiben bewusst zuweisbar (z. B. wenn ein Material sie schon nutzt).
 */
export async function presetVariantIsSelectable(id: number) {
  const row = await getDb()
    .select({ id: presetContainerVariants.id })
    .from(presetContainerVariants)
    .where(
      and(
        eq(presetContainerVariants.id, id),
        eq(presetContainerVariants.active, true)
      )
    )
    .limit(1);
  return row.length > 0;
}

/** Anzahl der Materialien, die eine Preset-Variante referenzieren. */
export async function countMaterialsWithPresetVariant(id: number) {
  const rows = await getDb()
    .select({ id: materials.id })
    .from(materials)
    .where(eq(materials.containerPresetVariantId, id));
  return rows.length;
}

/** Letzte Wägungen aller Materialien des Benutzers (für Statistik). */
export async function findRecentWeighings(userId: number, limit = 10) {
  const db = getDb();
  const mats = await db
    .select({ id: materials.id })
    .from(materials)
    .where(eq(materials.userId, userId));
  const ids = mats.map(m => m.id);
  if (ids.length === 0) return [];
  const rows = await db.query.weighings.findMany({
    where: (t, { inArray }) => inArray(t.materialId, ids),
    orderBy: [desc(weighings.weighedAt), desc(weighings.id)],
    limit,
    with: { material: true },
  });
  return rows;
}
