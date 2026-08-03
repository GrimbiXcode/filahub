import { and, desc, eq } from "drizzle-orm";
import { resolveSpoolTare } from "@contracts/presets";
import {
  materials,
  presetSpoolVariants,
  spoolTypes,
  storageBoxes,
  weighings,
  type Material,
  type PresetSpoolVariant,
  type SpoolType,
  type StorageBox,
  type Weighing,
} from "@db/schema";
import { getDb } from "./connection";

// ---------------------------------------------------------------------------
// Rollentypen (Verpackung / Spule mit Leergewicht)
// ---------------------------------------------------------------------------

export function findSpoolTypesByUser(userId: number) {
  return getDb().query.spoolTypes.findMany({
    where: eq(spoolTypes.userId, userId),
    orderBy: (t, { asc }) => [asc(t.name)],
  });
}

export async function createSpoolType(data: {
  userId: number;
  name: string;
  manufacturer?: string;
  tareWeight: number;
  sourceVariantId?: number | null;
  notes?: string;
}) {
  const [{ id }] = await getDb()
    .insert(spoolTypes)
    .values(data)
    .returning({ id: spoolTypes.id });
  return getDb().query.spoolTypes.findFirst({ where: eq(spoolTypes.id, id) });
}

export async function updateSpoolType(
  userId: number,
  id: number,
  data: Partial<{
    name: string;
    manufacturer: string | null;
    tareWeight: number;
    notes: string | null;
  }>
) {
  await getDb()
    .update(spoolTypes)
    .set(data)
    .where(and(eq(spoolTypes.id, id), eq(spoolTypes.userId, userId)));
  return getDb().query.spoolTypes.findFirst({ where: eq(spoolTypes.id, id) });
}

export async function countMaterialsWithSpoolType(id: number) {
  const rows = await getDb()
    .select({ id: materials.id })
    .from(materials)
    .where(eq(materials.spoolTypeId, id));
  return rows.length;
}

export async function deleteSpoolType(userId: number, id: number) {
  await getDb()
    .delete(spoolTypes)
    .where(and(eq(spoolTypes.id, id), eq(spoolTypes.userId, userId)));
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
  return getDb().query.storageBoxes.findFirst({
    where: eq(storageBoxes.id, id),
  });
}

export async function countMaterialsWithStorageBox(id: number) {
  const rows = await getDb()
    .select({ id: materials.id })
    .from(materials)
    .where(eq(materials.storageBoxId, id));
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
  spoolType: SpoolType | null;
  storageBox: StorageBox | null;
  /** Referenzierte Variante aus dem Preset-Katalog (Alternative zu spoolType) */
  spoolPresetVariant: PresetSpoolVariant | null;
};

export type MaterialOverview = MaterialWithRelations & {
  /** Summe der Leergewichte (Rolle + Box) in Gramm */
  tareWeight: number;
  /** Leergewicht nur der Rolle/Verpackung in Gramm (eigen oder Preset) */
  spoolTareWeight: number;
  /** Anzeigename der gewählten Rolle, null wenn keine gewählt ist */
  spoolLabel: string | null;
  /** Effektiv übrige Materialmenge in Gramm */
  remainingWeight: number;
  /** Verbleibend in Prozent der Nennmenge (0–100), null ohne Nennmenge */
  remainingPercent: number | null;
  /** Letzte Wägung (falls vorhanden) */
  lastWeighing: Weighing | null;
  /** Anzahl aller Wägungen */
  weighingCount: number;
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
  weighingCount: number
): MaterialOverview {
  const spoolTareWeight = resolveSpoolTare(material);
  const spoolLabel =
    material.spoolPresetVariant?.displayName ??
    material.spoolType?.name ??
    null;
  const tareWeight = spoolTareWeight + (material.storageBox?.tareWeight ?? 0);
  const remainingWeight =
    lastWeighing != null
      ? Math.max(0, lastWeighing.grossWeight - tareWeight)
      : material.nominalWeight;
  const remainingPercent =
    material.nominalWeight > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round((remainingWeight / material.nominalWeight) * 100)
          )
        )
      : null;
  return {
    ...material,
    tareWeight,
    spoolTareWeight,
    spoolLabel,
    remainingWeight,
    remainingPercent,
    lastWeighing,
    weighingCount,
  };
}

export async function findMaterialsByUser(
  userId: number
): Promise<MaterialOverview[]> {
  const db = getDb();
  const rows = await db.query.materials.findMany({
    where: eq(materials.userId, userId),
    with: {
      spoolType: true,
      storageBox: true,
      spoolPresetVariant: true,
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
        spoolType: normalizeRelation(row.spoolType),
        storageBox: normalizeRelation(row.storageBox),
        spoolPresetVariant: normalizeRelation(row.spoolPresetVariant),
      },
      last,
      row.weighings.length
    );
  });
}

export async function findMaterialById(userId: number, id: number) {
  const row = await getDb().query.materials.findFirst({
    where: and(eq(materials.id, id), eq(materials.userId, userId)),
    with: {
      spoolType: true,
      storageBox: true,
      spoolPresetVariant: true,
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
        spoolType: normalizeRelation(row.spoolType),
        storageBox: normalizeRelation(row.storageBox),
        spoolPresetVariant: normalizeRelation(row.spoolPresetVariant),
      },
      last,
      list.length
    ),
    weighings: list,
  };
}

export async function createMaterial(
  data: {
    userId: number;
    name: string;
    identifier?: string | null;
    materialType: string;
    manufacturer?: string;
    color?: string;
    priceCents?: number | null;
    purchaseDate?: string | null;
    nominalWeight: number;
    spoolTypeId?: number | null;
    spoolPresetVariantId?: number | null;
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
    name: string;
    identifier: string | null;
    materialType: string;
    manufacturer: string | null;
    color: string | null;
    priceCents: number | null;
    purchaseDate: string | null;
    nominalWeight: number;
    spoolTypeId: number | null;
    spoolPresetVariantId: number | null;
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

/** IDs der SpoolTypes/Boxen des Benutzers (zur Validierung von FKs). */
export async function spoolTypeBelongsToUser(userId: number, id: number) {
  const row = await getDb()
    .select({ id: spoolTypes.id })
    .from(spoolTypes)
    .where(and(eq(spoolTypes.id, id), eq(spoolTypes.userId, userId)))
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
    .select({ id: presetSpoolVariants.id })
    .from(presetSpoolVariants)
    .where(
      and(eq(presetSpoolVariants.id, id), eq(presetSpoolVariants.active, true))
    )
    .limit(1);
  return row.length > 0;
}

/** Anzahl der Materialien, die eine Preset-Variante referenzieren. */
export async function countMaterialsWithPresetVariant(id: number) {
  const rows = await getDb()
    .select({ id: materials.id })
    .from(materials)
    .where(eq(materials.spoolPresetVariantId, id));
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
