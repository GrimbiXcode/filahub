import { and, eq } from "drizzle-orm";
import {
  buildVariantDisplayName,
  hiddenKey,
  isCurrentVersion,
  isPresetHidden,
  resolveName,
  type NameI18n,
  type PresetScope,
  type ContainerMaterial,
} from "@contracts/presets";
import { FALLBACK_LANGUAGE, type LanguageCode } from "@contracts/i18n";
import type { ContainerForm } from "@contracts/materials";
import {
  hiddenContainerPresets,
  presetManufacturers,
  presetProposals,
  presetSeriesMaterialTypes,
  presetContainerSeries,
  presetContainerVariants,
  presetContainerVersions,
  type PresetManufacturer,
  type PresetProposal,
  type PresetContainerSeries,
  type PresetContainerVariant,
  type PresetContainerVersion,
} from "@db/schema";
import { getDb } from "./connection";

// ---------------------------------------------------------------------------
// Rohdaten des Katalogs
//
// Der Katalog ist global (kein userId) und klein – deshalb werden die vier
// Ebenen mit einfachen Selects geladen und in JS zum Baum verknüpft, statt
// über vier Ebenen zu joinen.
// ---------------------------------------------------------------------------

type CatalogRows = {
  manufacturers: PresetManufacturer[];
  series: PresetContainerSeries[];
  materialTypes: { seriesId: number; materialType: string }[];
  versions: PresetContainerVersion[];
  variants: PresetContainerVariant[];
};

async function loadCatalogRows(includeInactive: boolean): Promise<CatalogRows> {
  const db = getDb();
  const [manufacturers, series, materialTypes, versions, variants] =
    await Promise.all([
      db.query.presetManufacturers.findMany({
        where: includeInactive
          ? undefined
          : eq(presetManufacturers.active, true),
        orderBy: (t, { asc }) => [asc(t.name)],
      }),
      db.query.presetContainerSeries.findMany({
        where: includeInactive
          ? undefined
          : eq(presetContainerSeries.active, true),
        orderBy: (t, { asc }) => [asc(t.name)],
      }),
      db
        .select({
          seriesId: presetSeriesMaterialTypes.seriesId,
          materialType: presetSeriesMaterialTypes.materialType,
        })
        .from(presetSeriesMaterialTypes),
      db.query.presetContainerVersions.findMany({
        where: includeInactive
          ? undefined
          : eq(presetContainerVersions.active, true),
        orderBy: (t, { asc, desc }) => [desc(t.validTo), asc(t.name)],
      }),
      db.query.presetContainerVariants.findMany({
        where: includeInactive
          ? undefined
          : eq(presetContainerVariants.active, true),
        orderBy: (t, { asc }) => [asc(t.nominalWeight)],
      }),
    ]);
  return { manufacturers, series, materialTypes, versions, variants };
}

/** Ausgeblendete Presets des Benutzers als Menge von „scope:id“-Schlüsseln */
export async function findHiddenPresetKeys(userId: number) {
  const rows = await getDb()
    .select({
      scope: hiddenContainerPresets.scope,
      refId: hiddenContainerPresets.refId,
    })
    .from(hiddenContainerPresets)
    .where(eq(hiddenContainerPresets.userId, userId));
  return new Set(rows.map(r => hiddenKey(r.scope, r.refId)));
}

export type CatalogVariantNode = PresetContainerVariant & { hidden: boolean };
export type CatalogVersionNode = PresetContainerVersion & {
  hidden: boolean;
  isCurrent: boolean;
  variants: CatalogVariantNode[];
};
export type CatalogSeriesNode = PresetContainerSeries & {
  hidden: boolean;
  materialTypes: string[];
  versions: CatalogVersionNode[];
};
export type CatalogManufacturerNode = PresetManufacturer & {
  hidden: boolean;
  series: CatalogSeriesNode[];
};

/**
 * Vollständiger Katalogbaum. `hidden` markiert, was der Benutzer für sich
 * ausgeblendet hat – ausgeblendete Zweige werden mitgeliefert (ausgegraut in
 * der Oberfläche), damit man sie wiederfindet.
 */
export async function findCatalogTree(
  userId: number,
  options: { includeInactive?: boolean } = {}
): Promise<CatalogManufacturerNode[]> {
  const [rows, hidden] = await Promise.all([
    loadCatalogRows(options.includeInactive ?? false),
    findHiddenPresetKeys(userId),
  ]);

  const typesBySeries = new Map<number, string[]>();
  for (const row of rows.materialTypes) {
    const list = typesBySeries.get(row.seriesId) ?? [];
    list.push(row.materialType);
    typesBySeries.set(row.seriesId, list);
  }

  const variantsByVersion = new Map<number, PresetContainerVariant[]>();
  for (const variant of rows.variants) {
    const list = variantsByVersion.get(variant.versionId) ?? [];
    list.push(variant);
    variantsByVersion.set(variant.versionId, list);
  }

  const versionsBySeries = new Map<number, PresetContainerVersion[]>();
  for (const version of rows.versions) {
    const list = versionsBySeries.get(version.seriesId) ?? [];
    list.push(version);
    versionsBySeries.set(version.seriesId, list);
  }

  const seriesByManufacturer = new Map<number, PresetContainerSeries[]>();
  for (const series of rows.series) {
    const list = seriesByManufacturer.get(series.manufacturerId) ?? [];
    list.push(series);
    seriesByManufacturer.set(series.manufacturerId, list);
  }

  return rows.manufacturers.map(manufacturer => ({
    ...manufacturer,
    hidden: isPresetHidden(hidden, { manufacturerId: manufacturer.id }),
    series: (seriesByManufacturer.get(manufacturer.id) ?? []).map(series => ({
      ...series,
      materialTypes: (typesBySeries.get(series.id) ?? []).sort(),
      hidden: isPresetHidden(hidden, {
        manufacturerId: manufacturer.id,
        seriesId: series.id,
      }),
      versions: (versionsBySeries.get(series.id) ?? []).map(version => ({
        ...version,
        isCurrent: isCurrentVersion(version),
        hidden: isPresetHidden(hidden, {
          manufacturerId: manufacturer.id,
          seriesId: series.id,
          versionId: version.id,
        }),
        variants: (variantsByVersion.get(version.id) ?? []).map(variant => ({
          ...variant,
          hidden: isPresetHidden(hidden, {
            manufacturerId: manufacturer.id,
            seriesId: series.id,
            versionId: version.id,
            variantId: variant.id,
          }),
        })),
      })),
    })),
  }));
}

/** Eine Rolle zur Auswahl im Materialformular – eigen oder aus dem Katalog */
export type PresetContainerOption = {
  /** ID der Preset-Variante */
  id: number;
  displayName: string;
  tareWeight: number;
  nominalWeight: number;
  manufacturer: string;
  series: string;
  version: string;
  containerMaterial: ContainerMaterial | null;
  /**
   * Form des Gebindes; `null` bei allem, was vor 2.3.0 in den Katalog kam.
   * Die Gebindeauswahl reiht damit passende Formen nach oben.
   */
  form: ContainerForm | null;
  /** Aktuell ausgelieferte Ausführung der Serie */
  isCurrent: boolean;
  /** Materialarten der Serie; leer = passt zu allem */
  materialTypes: string[];
};

/**
 * Flache Liste aller für den Benutzer sichtbaren Preset-Varianten.
 * Ausgeblendete Zweige fallen hier – anders als im Baum – heraus.
 */
export async function findPresetOptionsForUser(
  userId: number,
  language: LanguageCode = FALLBACK_LANGUAGE
): Promise<PresetContainerOption[]> {
  const tree = await findCatalogTree(userId);
  const options: PresetContainerOption[] = [];
  for (const manufacturer of tree) {
    if (manufacturer.hidden) continue;
    for (const series of manufacturer.series) {
      if (series.hidden) continue;
      for (const version of series.versions) {
        if (version.hidden) continue;
        for (const variant of version.variants) {
          if (variant.hidden) continue;
          const seriesName = resolveName(series, language);
          const versionName = resolveName(version, language);
          options.push({
            id: variant.id,
            displayName: buildVariantDisplayName({
              manufacturer: manufacturer.name,
              series: seriesName,
              version: versionName,
              nominalWeight: variant.nominalWeight,
            }),
            tareWeight: variant.tareWeight,
            nominalWeight: variant.nominalWeight,
            manufacturer: manufacturer.name,
            series: seriesName,
            version: versionName,
            containerMaterial: version.containerMaterial,
            form: version.form,
            isCurrent: version.isCurrent,
            materialTypes: series.materialTypes,
          });
        }
      }
    }
  }
  return options;
}

/** Setzt oder entfernt eine Ausblendung. */
export async function setHiddenPreset(
  userId: number,
  scope: PresetScope,
  refId: number,
  hidden: boolean
) {
  const db = getDb();
  const where = and(
    eq(hiddenContainerPresets.userId, userId),
    eq(hiddenContainerPresets.scope, scope),
    eq(hiddenContainerPresets.refId, refId)
  );
  if (!hidden) {
    await db.delete(hiddenContainerPresets).where(where);
    return;
  }
  const existing = await db
    .select({ id: hiddenContainerPresets.id })
    .from(hiddenContainerPresets)
    .where(where)
    .limit(1);
  if (existing.length > 0) return;
  await db.insert(hiddenContainerPresets).values({ userId, scope, refId });
}

// ---------------------------------------------------------------------------
// Einzelabfragen und Anzeigenamen
// ---------------------------------------------------------------------------

export type PresetVariantWithPath = {
  variant: PresetContainerVariant;
  version: PresetContainerVersion;
  series: PresetContainerSeries;
  manufacturer: PresetManufacturer;
};

/** Lädt eine Variante samt ihres vollständigen Katalogpfads. */
export async function findPresetVariantWithPath(
  id: number
): Promise<PresetVariantWithPath | null> {
  const db = getDb();
  const variant = await db.query.presetContainerVariants.findFirst({
    where: eq(presetContainerVariants.id, id),
  });
  if (!variant) return null;
  const version = await db.query.presetContainerVersions.findFirst({
    where: eq(presetContainerVersions.id, variant.versionId),
  });
  if (!version) return null;
  const series = await db.query.presetContainerSeries.findFirst({
    where: eq(presetContainerSeries.id, version.seriesId),
  });
  if (!series) return null;
  const manufacturer = await db.query.presetManufacturers.findFirst({
    where: eq(presetManufacturers.id, series.manufacturerId),
  });
  if (!manufacturer) return null;
  return { variant, version, series, manufacturer };
}

/*
 * Die früheren Helfer `buildDisplayNameForVersion` und
 * `refreshVariantDisplayNames` sind entfallen: Der Anzeigename einer Variante
 * wird nicht mehr gespeichert, sondern beim Lesen aus den drei Ebenen darüber
 * erzeugt (siehe `findPresetOptionsForUser` und `computeMaterialStats`).
 * Damit kann er nicht mehr von den Stammdaten abweichen – und er kommt in der
 * Sprache des Aufrufers heraus statt in der, die beim Anlegen galt.
 */

/** Ersetzt die Materialarten einer Serie vollständig. */
export async function setSeriesMaterialTypes(
  seriesId: number,
  materialTypes: string[]
) {
  const db = getDb();
  await db
    .delete(presetSeriesMaterialTypes)
    .where(eq(presetSeriesMaterialTypes.seriesId, seriesId));
  const unique = [...new Set(materialTypes)];
  if (unique.length === 0) return;
  await db
    .insert(presetSeriesMaterialTypes)
    .values(unique.map(materialType => ({ seriesId, materialType })));
}

// ---------------------------------------------------------------------------
// „find or create“ über den natürlichen Schlüssel
//
// Alle Aufrufe sind idempotent: Es wird bewusst ohne Transaktion gearbeitet,
// deshalb dürfen mehrfache Ausführungen (Retry nach Abbruch, zwei parallele
// Freigaben) nie Duplikate erzeugen. Die Unique-Keys sind die eigentliche
// Absicherung.
// ---------------------------------------------------------------------------

/** SQLSTATE 23505 = unique_violation (Verstoß gegen einen Unique-Key) */
function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}

export async function findOrCreateManufacturer(data: {
  slug: string;
  name: string;
  website?: string | null;
  source?: "seed" | "admin" | "community";
  seedRevision?: number;
}) {
  const db = getDb();
  const find = () =>
    db.query.presetManufacturers.findFirst({
      where: eq(presetManufacturers.slug, data.slug),
    });
  const existing = await find();
  if (existing) return existing;
  try {
    await db.insert(presetManufacturers).values({
      slug: data.slug,
      name: data.name,
      website: data.website ?? null,
      source: data.source ?? "admin",
      seedRevision: data.seedRevision ?? 0,
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
  const created = await find();
  if (!created) throw new Error("Hersteller konnte nicht angelegt werden");
  return created;
}

export async function findOrCreateSeries(data: {
  manufacturerId: number;
  slug: string;
  name: string;
  nameI18n?: NameI18n | null;
  source?: "seed" | "admin" | "community";
  seedRevision?: number;
}) {
  const db = getDb();
  const find = () =>
    db.query.presetContainerSeries.findFirst({
      where: and(
        eq(presetContainerSeries.manufacturerId, data.manufacturerId),
        eq(presetContainerSeries.slug, data.slug)
      ),
    });
  const existing = await find();
  if (existing) return existing;
  try {
    await db.insert(presetContainerSeries).values({
      manufacturerId: data.manufacturerId,
      slug: data.slug,
      name: data.name,
      nameI18n: data.nameI18n ?? null,
      source: data.source ?? "admin",
      seedRevision: data.seedRevision ?? 0,
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
  const created = await find();
  if (!created) throw new Error("Serie konnte nicht angelegt werden");
  return created;
}

export async function findOrCreateVersion(data: {
  seriesId: number;
  slug: string;
  name: string;
  nameI18n?: NameI18n | null;
  form?: ContainerForm | null;
  containerMaterial?: ContainerMaterial | null;
  validFrom?: string | null;
  validTo?: string | null;
  source?: "seed" | "admin" | "community";
  seedRevision?: number;
}) {
  const db = getDb();
  const find = () =>
    db.query.presetContainerVersions.findFirst({
      where: and(
        eq(presetContainerVersions.seriesId, data.seriesId),
        eq(presetContainerVersions.slug, data.slug)
      ),
    });
  const existing = await find();
  if (existing) return existing;
  try {
    await db.insert(presetContainerVersions).values({
      seriesId: data.seriesId,
      slug: data.slug,
      name: data.name,
      nameI18n: data.nameI18n ?? null,
      form: data.form ?? null,
      containerMaterial: data.containerMaterial ?? null,
      validFrom: data.validFrom ?? null,
      validTo: data.validTo ?? null,
      source: data.source ?? "admin",
      seedRevision: data.seedRevision ?? 0,
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
  const created = await find();
  if (!created) throw new Error("Ausführung konnte nicht angelegt werden");
  return created;
}

export async function findVariantByNominalWeight(
  versionId: number,
  nominalWeight: number
) {
  return getDb().query.presetContainerVariants.findFirst({
    where: and(
      eq(presetContainerVariants.versionId, versionId),
      eq(presetContainerVariants.nominalWeight, nominalWeight)
    ),
  });
}

export async function createVariant(data: {
  versionId: number;
  nominalWeight: number;
  tareWeight: number;
  outerDiameterMm?: number | null;
  widthMm?: number | null;
  boreDiameterMm?: number | null;
  notes?: string | null;
  source?: "seed" | "admin" | "community";
  seedRevision?: number;
}) {
  const db = getDb();
  try {
    await db.insert(presetContainerVariants).values({
      versionId: data.versionId,
      nominalWeight: data.nominalWeight,
      tareWeight: data.tareWeight,
      outerDiameterMm: data.outerDiameterMm ?? null,
      widthMm: data.widthMm ?? null,
      boreDiameterMm: data.boreDiameterMm ?? null,
      notes: data.notes ?? null,
      source: data.source ?? "admin",
      seedRevision: data.seedRevision ?? 0,
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
  const created = await findVariantByNominalWeight(
    data.versionId,
    data.nominalWeight
  );
  if (!created) throw new Error("Variante konnte nicht angelegt werden");
  return created;
}

// ---------------------------------------------------------------------------
// Katalogpflege (Administration)
//
// Wird ein Seed-Eintrag bearbeitet, wechselt dessen `source` auf „admin“ bzw.
// bei übernommenen Community-Vorschlägen auf „community“ – ab dann fasst ihn
// das Seeding nie wieder an.
// ---------------------------------------------------------------------------

export async function updateManufacturer(
  id: number,
  data: Partial<{
    name: string;
    website: string | null;
    notes: string | null;
    active: boolean;
  }>,
  source: "admin" | "community" = "admin"
) {
  await getDb()
    .update(presetManufacturers)
    .set({ ...data, source })
    .where(eq(presetManufacturers.id, id));
  return getDb().query.presetManufacturers.findFirst({
    where: eq(presetManufacturers.id, id),
  });
}

export async function updateSeries(
  id: number,
  data: Partial<{
    name: string;
    nameI18n: NameI18n | null;
    notes: string | null;
    active: boolean;
  }>,
  source: "admin" | "community" = "admin"
) {
  await getDb()
    .update(presetContainerSeries)
    .set({ ...data, source })
    .where(eq(presetContainerSeries.id, id));
  return getDb().query.presetContainerSeries.findFirst({
    where: eq(presetContainerSeries.id, id),
  });
}

/*
  Die Feldliste ist handgeschrieben und muss beim Ergänzen einer Spalte
  mitwachsen. Sie ist **keine** Zusicherung: Der Router übergibt hier ein
  aufgesammeltes Objekt, kein Literal, und TypeScript prüft überzählige
  Eigenschaften nur bei Literalen. Ein hier vergessenes Feld wird also still
  verworfen, ohne Typfehler – genau das ist mit `form` beim ersten Versuch
  passiert.
*/
export async function updateVersion(
  id: number,
  data: Partial<{
    name: string;
    nameI18n: NameI18n | null;
    form: ContainerForm | null;
    containerMaterial: ContainerMaterial | null;
    validFrom: string | null;
    validTo: string | null;
    notes: string | null;
    active: boolean;
  }>,
  source: "admin" | "community" = "admin"
) {
  await getDb()
    .update(presetContainerVersions)
    .set({ ...data, source })
    .where(eq(presetContainerVersions.id, id));
  return getDb().query.presetContainerVersions.findFirst({
    where: eq(presetContainerVersions.id, id),
  });
}

export async function updateVariant(
  id: number,
  data: Partial<{
    nominalWeight: number;
    tareWeight: number;
    outerDiameterMm: number | null;
    widthMm: number | null;
    boreDiameterMm: number | null;
    notes: string | null;
    active: boolean;
  }>,
  source: "admin" | "community" = "admin"
) {
  const db = getDb();
  await db
    .update(presetContainerVariants)
    .set({ ...data, source })
    .where(eq(presetContainerVariants.id, id));
  return db.query.presetContainerVariants.findFirst({
    where: eq(presetContainerVariants.id, id),
  });
}

/** Zählt die direkten Kinder einer Katalogebene (Löschschutz). */
export async function countCatalogChildren(
  scope: "manufacturer" | "series" | "version",
  id: number
) {
  const db = getDb();
  if (scope === "manufacturer") {
    const rows = await db
      .select({ id: presetContainerSeries.id })
      .from(presetContainerSeries)
      .where(eq(presetContainerSeries.manufacturerId, id));
    return rows.length;
  }
  if (scope === "series") {
    const rows = await db
      .select({ id: presetContainerVersions.id })
      .from(presetContainerVersions)
      .where(eq(presetContainerVersions.seriesId, id));
    return rows.length;
  }
  const rows = await db
    .select({ id: presetContainerVariants.id })
    .from(presetContainerVariants)
    .where(eq(presetContainerVariants.versionId, id));
  return rows.length;
}

export async function deleteManufacturer(id: number) {
  await getDb()
    .delete(presetManufacturers)
    .where(eq(presetManufacturers.id, id));
}

export async function deleteSeries(id: number) {
  const db = getDb();
  await db
    .delete(presetSeriesMaterialTypes)
    .where(eq(presetSeriesMaterialTypes.seriesId, id));
  await db
    .delete(presetContainerSeries)
    .where(eq(presetContainerSeries.id, id));
}

export async function deleteVersion(id: number) {
  await getDb()
    .delete(presetContainerVersions)
    .where(eq(presetContainerVersions.id, id));
}

export async function deleteVariant(id: number) {
  const db = getDb();
  await db
    .delete(hiddenContainerPresets)
    .where(
      and(
        eq(hiddenContainerPresets.scope, "variant"),
        eq(hiddenContainerPresets.refId, id)
      )
    );
  await db
    .delete(presetContainerVariants)
    .where(eq(presetContainerVariants.id, id));
}

export function findManufacturerById(id: number) {
  return getDb().query.presetManufacturers.findFirst({
    where: eq(presetManufacturers.id, id),
  });
}

export function findSeriesById(id: number) {
  return getDb().query.presetContainerSeries.findFirst({
    where: eq(presetContainerSeries.id, id),
  });
}

export function findVersionById(id: number) {
  return getDb().query.presetContainerVersions.findFirst({
    where: eq(presetContainerVersions.id, id),
  });
}

export function findVariantById(id: number) {
  return getDb().query.presetContainerVariants.findFirst({
    where: eq(presetContainerVariants.id, id),
  });
}

// ---------------------------------------------------------------------------
// Vorschläge
// ---------------------------------------------------------------------------

export async function createProposal(data: {
  userId: number;
  kind: "new" | "change";
  targetType: PresetScope;
  targetId?: number | null;
  payload: unknown;
  sourceContainerTypeId?: number | null;
  comment?: string | null;
}) {
  const db = getDb();
  const [{ id }] = await db
    .insert(presetProposals)
    .values({
      userId: data.userId,
      kind: data.kind,
      targetType: data.targetType,
      targetId: data.targetId ?? null,
      payload: data.payload,
      sourceContainerTypeId: data.sourceContainerTypeId ?? null,
      comment: data.comment ?? null,
    })
    .returning({ id: presetProposals.id });
  return db.query.presetProposals.findFirst({
    where: eq(presetProposals.id, id),
  });
}

export function findProposal(id: number) {
  return getDb().query.presetProposals.findFirst({
    where: eq(presetProposals.id, id),
  });
}

export function findProposalsByUser(userId: number) {
  return getDb().query.presetProposals.findMany({
    where: eq(presetProposals.userId, userId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
}

/** Anzahl offener Vorschläge eines Benutzers (Schutz gegen Flut) */
export async function countOpenProposals(userId: number) {
  const rows = await getDb()
    .select({ id: presetProposals.id })
    .from(presetProposals)
    .where(
      and(
        eq(presetProposals.userId, userId),
        eq(presetProposals.status, "pending")
      )
    );
  return rows.length;
}

export type ProposalWithUsers = PresetProposal & {
  submittedBy: { id: number; name: string | null } | null;
  reviewedByUser: { id: number; name: string | null } | null;
};

/**
 * Vorschläge für die Moderation. Einreicher und Prüfer werden per zweitem
 * Select geladen und in JS verknüpft – zwei Relationen auf dieselbe Tabelle
 * sind in Drizzle eine bekannte Fehlerquelle.
 */
export async function findProposalsForReview(
  status: PresetProposal["status"] | undefined,
  limit = 100
): Promise<ProposalWithUsers[]> {
  const db = getDb();
  const proposals = await db.query.presetProposals.findMany({
    where: status ? eq(presetProposals.status, status) : undefined,
    orderBy: (t, { asc, desc }) => [asc(t.status), desc(t.createdAt)],
    limit,
  });
  if (proposals.length === 0) return [];

  const userIds = [
    ...new Set(
      proposals.flatMap(p =>
        [p.userId, p.reviewedBy].filter((x): x is number => x != null)
      )
    ),
  ];
  const users = await db.query.users.findMany({
    where: (t, { inArray: within }) => within(t.id, userIds),
    columns: { id: true, name: true },
  });
  const byId = new Map(users.map(u => [u.id, u]));

  return proposals.map(p => ({
    ...p,
    // `userId` ist null, wenn der Einreicher sein Konto gelöscht hat. Der
    // Vorschlag bleibt als Moderationsnachweis stehen, die Person nicht.
    submittedBy: p.userId != null ? (byId.get(p.userId) ?? null) : null,
    reviewedByUser:
      p.reviewedBy != null ? (byId.get(p.reviewedBy) ?? null) : null,
  }));
}

/**
 * Schließt einen Vorschlag ab. Der `pending`-Filter wirkt als optimistische
 * Sperre: klicken zwei Administratoren gleichzeitig, gewinnt genau einer.
 * Gibt false zurück, wenn der Vorschlag bereits bearbeitet war.
 */
export async function closeProposal(
  id: number,
  data: {
    status: "approved" | "rejected" | "withdrawn";
    reviewedBy?: number | null;
    reviewNote?: string | null;
    resultId?: number | null;
  }
): Promise<boolean> {
  const updated = await getDb()
    .update(presetProposals)
    .set({
      status: data.status,
      reviewedBy: data.reviewedBy ?? null,
      reviewedAt: new Date(),
      reviewNote: data.reviewNote ?? null,
      resultId: data.resultId ?? null,
    })
    .where(
      and(eq(presetProposals.id, id), eq(presetProposals.status, "pending"))
    )
    .returning({ id: presetProposals.id });
  return updated.length > 0;
}
