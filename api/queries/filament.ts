import { and, desc, eq, inArray } from "drizzle-orm";
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
import { scopeOwner, scopeWhere, type Scope } from "../scope";
import { getDb } from "./connection";
import { hasChanges } from "./patch";

// ---------------------------------------------------------------------------
// Rollentypen (Verpackung / Spule mit Leergewicht)
// ---------------------------------------------------------------------------

export function findContainerTypesInScope(scope: Scope) {
  return getDb().query.containerTypes.findMany({
    where: scopeWhere(containerTypes, scope),
    orderBy: (t, { asc }) => [asc(t.name)],
  });
}

export async function createContainerType(
  scope: Scope,
  data: {
    name: string;
    manufacturer?: string;
    /**
     * Gebindeform. Fehlt sie, greift die Spaltenvorgabe `rolle`.
     *
     * Steht hier ausdrücklich, obwohl Drizzle die Spalte auch ohne Typeintrag
     * schreiben würde: Ein Feld, das der Parametertyp nicht kennt, lässt sich
     * vom Aufrufer nicht setzen (Fehler wegen überzähliger Eigenschaft) – genau
     * daran ist `preset.copyToOwn` gescheitert und hat jede kopierte Flasche zur
     * Rolle gemacht.
     */
    form?: ContainerForm;
    tareWeight: number;
    sourceVariantId?: number | null;
    notes?: string;
  }
) {
  const [{ id }] = await getDb()
    .insert(containerTypes)
    // Der Eigentümer kommt aus dem Bereich, nie aus der Eingabe.
    .values({ ...data, ...scopeOwner(scope) })
    .returning({ id: containerTypes.id });
  return getDb().query.containerTypes.findFirst({
    where: and(eq(containerTypes.id, id), scopeWhere(containerTypes, scope)),
  });
}

export async function updateContainerType(
  scope: Scope,
  id: number,
  data: Partial<{
    name: string;
    manufacturer: string | null;
    form: ContainerForm;
    tareWeight: number;
    notes: string | null;
  }>
) {
  if (hasChanges(data)) {
    await getDb()
      .update(containerTypes)
      .set(data)
      .where(and(eq(containerTypes.id, id), scopeWhere(containerTypes, scope)));
  }
  /*
    Der Bereichsfilter gehört **auch** ans Rücklesen. Ohne ihn traf das UPDATE
    keine Zeile, das `findFirst` aber die fremde – und der Router gab sie samt
    Name, Hersteller und Freitext-Notizen an den Aufrufer zurück. Die Prüfung
    „nichts gefunden“ schlug nicht an, weil eine Zeile gefunden wurde, nur nicht
    seine.
  */
  return getDb().query.containerTypes.findFirst({
    where: and(eq(containerTypes.id, id), scopeWhere(containerTypes, scope)),
  });
}

/**
 * Wie viele Materialien diese Gebindeart benutzen – Grundlage der Löschsperre.
 *
 * Bereichsgebunden, weil die Anzahl in einer Konfliktmeldung landet: Ohne den
 * Filter verriete „wird noch von 3 Material(ien) verwendet“ die Belegung einer
 * fremden Gebindeart. Dieselbe Erwägung wie bei `lager.delete`.
 */
export async function countMaterialsWithContainerType(
  scope: Scope,
  id: number
) {
  const rows = await getDb()
    .select({ id: materials.id })
    .from(materials)
    .where(
      and(eq(materials.containerTypeId, id), scopeWhere(materials, scope))
    );
  return rows.length;
}

export async function deleteContainerType(scope: Scope, id: number) {
  await getDb()
    .delete(containerTypes)
    .where(and(eq(containerTypes.id, id), scopeWhere(containerTypes, scope)));
}

// ---------------------------------------------------------------------------
// Lagerboxen / Dryboxen (mit Leergewicht)
// ---------------------------------------------------------------------------

export function findStorageBoxesInScope(scope: Scope) {
  return getDb().query.storageBoxes.findMany({
    where: scopeWhere(storageBoxes, scope),
    orderBy: (t, { asc }) => [asc(t.name)],
  });
}

export async function createStorageBox(
  scope: Scope,
  data: {
    name: string;
    location?: string;
    tareWeight: number;
    notes?: string;
  }
) {
  const [{ id }] = await getDb()
    .insert(storageBoxes)
    // Der Eigentümer kommt aus dem Bereich, nie aus der Eingabe.
    .values({ ...data, ...scopeOwner(scope) })
    .returning({ id: storageBoxes.id });
  /*
    Der Bereichsfilter steht seit 2.5.0 auch hier. Bis dahin las die Funktion
    die frisch eingefügte Zeile ohne ihn zurück – richtig, weil die ID gerade
    erst vergeben wurde, aber als einzige der vier Anlegefunktionen aus der
    Reihe. Gleiche Form heißt: Beim nächsten Umbau muss man nicht prüfen,
    welche der vier die Ausnahme war.
  */
  return getDb().query.storageBoxes.findFirst({
    where: and(eq(storageBoxes.id, id), scopeWhere(storageBoxes, scope)),
  });
}

export async function updateStorageBox(
  scope: Scope,
  id: number,
  data: Partial<{
    name: string;
    location: string | null;
    tareWeight: number;
    notes: string | null;
  }>
) {
  if (hasChanges(data)) {
    await getDb()
      .update(storageBoxes)
      .set(data)
      .where(and(eq(storageBoxes.id, id), scopeWhere(storageBoxes, scope)));
  }
  // Bereichsfilter auch beim Rücklesen – siehe `updateContainerType`.
  return getDb().query.storageBoxes.findFirst({
    where: and(eq(storageBoxes.id, id), scopeWhere(storageBoxes, scope)),
  });
}

/** Bereichsgebunden, weil die Anzahl in eine Konfliktmeldung geht. */
export async function countMaterialsWithStorageBox(scope: Scope, id: number) {
  const rows = await getDb()
    .select({ id: materials.id })
    .from(materials)
    .where(and(eq(materials.storageBoxId, id), scopeWhere(materials, scope)));
  return rows.length;
}

export async function deleteStorageBox(scope: Scope, id: number) {
  await getDb()
    .delete(storageBoxes)
    .where(and(eq(storageBoxes.id, id), scopeWhere(storageBoxes, scope)));
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

export async function findMaterialsInScope(
  scope: Scope,
  language: LanguageCode = FALLBACK_LANGUAGE,
  /**
   * Auf ein Lager einschränken. `undefined` = alle Lager des Bereichs – so
   * bleibt die Schnellsuche über den gesamten Bestand möglich, während die
   * Übersicht auf das gewählte Lager filtert.
   */
  lagerId?: number
): Promise<MaterialOverview[]> {
  const db = getDb();
  const rows = await db.query.materials.findMany({
    where:
      lagerId != null
        ? and(scopeWhere(materials, scope), eq(materials.lagerId, lagerId))
        : scopeWhere(materials, scope),
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

export async function findMaterialInScope(
  scope: Scope,
  id: number,
  language: LanguageCode = FALLBACK_LANGUAGE
) {
  const row = await getDb().query.materials.findFirst({
    where: and(eq(materials.id, id), scopeWhere(materials, scope)),
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
  scope: Scope,
  data: {
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
    /*
      Der Eigentümer kommt aus dem Bereich, nie aus der Eingabe – und der
      Bereich stammt aus dem **Lager**, das `validateForeignKeys` vorher
      aufgelöst hat. Damit kann die Kopie am Material nicht vom Lager abweichen,
      und ein Material wechselt seinen Bereich nicht dadurch, dass jemand eine
      fremde `lagerId` mitschickt.
    */
    .values({ ...data, ...scopeOwner(scope) })
    .returning({ id: materials.id });
  if (initialGrossWeight != null) {
    await db
      .insert(weighings)
      .values({ materialId: id, grossWeight: initialGrossWeight });
  }
  return id;
}

export async function updateMaterial(
  scope: Scope,
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
  if (!hasChanges(data)) return;
  await getDb()
    .update(materials)
    .set(data)
    .where(and(eq(materials.id, id), scopeWhere(materials, scope)));
}

/**
 * Löscht ein Material samt seinen Wägungen.
 *
 * **In einer Transaktion und beide Schritte im Bereich.** Bis 2.5.0 lief das
 * Löschen der Wägungen ohne Bereichsfilter und außerhalb jeder Transaktion:
 * Traf das zweite `DELETE` keine Zeile – fremdes Material, oder die
 * Mitgliedschaft ist zwischen Prüfung und Löschen erloschen –, war die
 * Wägungsgeschichte trotzdem weg und das Material blieb mit voller Nennmenge
 * stehen. Genau die Zahl, um die es in dieser App geht.
 *
 * Die Wägungen gehen über einen Unterabfrage-Filter auf das **bereichsgeprüfte**
 * Material, nicht über die rohe `materialId`.
 */
export async function deleteMaterial(scope: Scope, id: number) {
  await getDb().transaction(async tx => {
    const scoped = tx
      .select({ id: materials.id })
      .from(materials)
      .where(and(eq(materials.id, id), scopeWhere(materials, scope)));
    await tx.delete(weighings).where(inArray(weighings.materialId, scoped));
    await tx
      .delete(materials)
      .where(and(eq(materials.id, id), scopeWhere(materials, scope)));
  });
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

/**
 * Die zuletzt **erfasste** Wägung eines Materials, oder `null`.
 *
 * Sortiert nach `id` und nicht nach `weighedAt`: Gefragt ist, was zuletzt
 * eingetragen wurde, nicht was zuletzt gewogen wurde. Eine nachgetragene Wägung
 * mit altem Datum ist trotzdem die zuletzt erfasste – und genau sie will jemand
 * korrigieren, der sich gerade vertippt hat.
 *
 * Grundlage von `mayDeleteWeighing` (`contracts/organizations.ts`). Nutzt den
 * vorhandenen Index `weighings_material_idx`.
 */
export async function findLatestWeighingId(
  materialId: number
): Promise<number | null> {
  const rows = await getDb()
    .select({ id: weighings.id })
    .from(weighings)
    .where(eq(weighings.materialId, materialId))
    .orderBy(desc(weighings.id))
    .limit(1);
  return rows.at(0)?.id ?? null;
}

/** Prüft, ob ein Material zum Bereich gehört. */
export async function materialInScope(scope: Scope, materialId: number) {
  const row = await getDb()
    .select({ id: materials.id })
    .from(materials)
    .where(and(eq(materials.id, materialId), scopeWhere(materials, scope)))
    .limit(1);
  return row.length > 0;
}

/** Gebindearten und Dryboxen des Bereichs (zur Validierung von FKs). */
export async function containerTypeInScope(scope: Scope, id: number) {
  const row = await getDb()
    .select({ id: containerTypes.id })
    .from(containerTypes)
    .where(and(eq(containerTypes.id, id), scopeWhere(containerTypes, scope)))
    .limit(1);
  return row.length > 0;
}

export async function storageBoxInScope(scope: Scope, id: number) {
  const row = await getDb()
    .select({ id: storageBoxes.id })
    .from(storageBoxes)
    .where(and(eq(storageBoxes.id, id), scopeWhere(storageBoxes, scope)))
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

/** Letzte Wägungen aller Materialien des Bereichs (für Statistik). */
export async function findRecentWeighings(scope: Scope, limit = 10) {
  const db = getDb();
  const mats = await db
    .select({ id: materials.id })
    .from(materials)
    .where(scopeWhere(materials, scope));
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
