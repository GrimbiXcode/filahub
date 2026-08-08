import { and, eq } from "drizzle-orm";
import {
  buildVariantDisplayName,
  hiddenKey,
  isCurrentVersion,
  isPresetHidden,
  resolveName,
  type NameI18n,
  type PresetScope,
  type SpoolMaterial,
} from "@contracts/presets";
import { FALLBACK_LANGUAGE, type LanguageCode } from "@contracts/i18n";
import {
  hiddenSpoolPresets,
  presetManufacturers,
  presetProposals,
  presetSeriesMaterialTypes,
  presetSpoolSeries,
  presetSpoolVariants,
  presetSpoolVersions,
  type PresetManufacturer,
  type PresetProposal,
  type PresetSpoolSeries,
  type PresetSpoolVariant,
  type PresetSpoolVersion,
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
  series: PresetSpoolSeries[];
  materialTypes: { seriesId: number; materialType: string }[];
  versions: PresetSpoolVersion[];
  variants: PresetSpoolVariant[];
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
      db.query.presetSpoolSeries.findMany({
        where: includeInactive ? undefined : eq(presetSpoolSeries.active, true),
        orderBy: (t, { asc }) => [asc(t.name)],
      }),
      db
        .select({
          seriesId: presetSeriesMaterialTypes.seriesId,
          materialType: presetSeriesMaterialTypes.materialType,
        })
        .from(presetSeriesMaterialTypes),
      db.query.presetSpoolVersions.findMany({
        where: includeInactive
          ? undefined
          : eq(presetSpoolVersions.active, true),
        orderBy: (t, { asc, desc }) => [desc(t.validTo), asc(t.name)],
      }),
      db.query.presetSpoolVariants.findMany({
        where: includeInactive
          ? undefined
          : eq(presetSpoolVariants.active, true),
        orderBy: (t, { asc }) => [asc(t.nominalWeight)],
      }),
    ]);
  return { manufacturers, series, materialTypes, versions, variants };
}

/** Ausgeblendete Presets des Benutzers als Menge von „scope:id“-Schlüsseln */
export async function findHiddenPresetKeys(userId: number) {
  const rows = await getDb()
    .select({
      scope: hiddenSpoolPresets.scope,
      refId: hiddenSpoolPresets.refId,
    })
    .from(hiddenSpoolPresets)
    .where(eq(hiddenSpoolPresets.userId, userId));
  return new Set(rows.map(r => hiddenKey(r.scope, r.refId)));
}

export type CatalogVariantNode = PresetSpoolVariant & { hidden: boolean };
export type CatalogVersionNode = PresetSpoolVersion & {
  hidden: boolean;
  isCurrent: boolean;
  variants: CatalogVariantNode[];
};
export type CatalogSeriesNode = PresetSpoolSeries & {
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

  const variantsByVersion = new Map<number, PresetSpoolVariant[]>();
  for (const variant of rows.variants) {
    const list = variantsByVersion.get(variant.versionId) ?? [];
    list.push(variant);
    variantsByVersion.set(variant.versionId, list);
  }

  const versionsBySeries = new Map<number, PresetSpoolVersion[]>();
  for (const version of rows.versions) {
    const list = versionsBySeries.get(version.seriesId) ?? [];
    list.push(version);
    versionsBySeries.set(version.seriesId, list);
  }

  const seriesByManufacturer = new Map<number, PresetSpoolSeries[]>();
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
export type PresetSpoolOption = {
  /** ID der Preset-Variante */
  id: number;
  displayName: string;
  tareWeight: number;
  nominalWeight: number;
  manufacturer: string;
  series: string;
  version: string;
  spoolMaterial: SpoolMaterial | null;
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
): Promise<PresetSpoolOption[]> {
  const tree = await findCatalogTree(userId);
  const options: PresetSpoolOption[] = [];
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
            spoolMaterial: version.spoolMaterial,
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
    eq(hiddenSpoolPresets.userId, userId),
    eq(hiddenSpoolPresets.scope, scope),
    eq(hiddenSpoolPresets.refId, refId)
  );
  if (!hidden) {
    await db.delete(hiddenSpoolPresets).where(where);
    return;
  }
  const existing = await db
    .select({ id: hiddenSpoolPresets.id })
    .from(hiddenSpoolPresets)
    .where(where)
    .limit(1);
  if (existing.length > 0) return;
  await db.insert(hiddenSpoolPresets).values({ userId, scope, refId });
}

// ---------------------------------------------------------------------------
// Einzelabfragen und Anzeigenamen
// ---------------------------------------------------------------------------

export type PresetVariantWithPath = {
  variant: PresetSpoolVariant;
  version: PresetSpoolVersion;
  series: PresetSpoolSeries;
  manufacturer: PresetManufacturer;
};

/** Lädt eine Variante samt ihres vollständigen Katalogpfads. */
export async function findPresetVariantWithPath(
  id: number
): Promise<PresetVariantWithPath | null> {
  const db = getDb();
  const variant = await db.query.presetSpoolVariants.findFirst({
    where: eq(presetSpoolVariants.id, id),
  });
  if (!variant) return null;
  const version = await db.query.presetSpoolVersions.findFirst({
    where: eq(presetSpoolVersions.id, variant.versionId),
  });
  if (!version) return null;
  const series = await db.query.presetSpoolSeries.findFirst({
    where: eq(presetSpoolSeries.id, version.seriesId),
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
    db.query.presetSpoolSeries.findFirst({
      where: and(
        eq(presetSpoolSeries.manufacturerId, data.manufacturerId),
        eq(presetSpoolSeries.slug, data.slug)
      ),
    });
  const existing = await find();
  if (existing) return existing;
  try {
    await db.insert(presetSpoolSeries).values({
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
  spoolMaterial?: SpoolMaterial | null;
  validFrom?: string | null;
  validTo?: string | null;
  source?: "seed" | "admin" | "community";
  seedRevision?: number;
}) {
  const db = getDb();
  const find = () =>
    db.query.presetSpoolVersions.findFirst({
      where: and(
        eq(presetSpoolVersions.seriesId, data.seriesId),
        eq(presetSpoolVersions.slug, data.slug)
      ),
    });
  const existing = await find();
  if (existing) return existing;
  try {
    await db.insert(presetSpoolVersions).values({
      seriesId: data.seriesId,
      slug: data.slug,
      name: data.name,
      nameI18n: data.nameI18n ?? null,
      spoolMaterial: data.spoolMaterial ?? null,
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
  return getDb().query.presetSpoolVariants.findFirst({
    where: and(
      eq(presetSpoolVariants.versionId, versionId),
      eq(presetSpoolVariants.nominalWeight, nominalWeight)
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
    await db.insert(presetSpoolVariants).values({
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
    .update(presetSpoolSeries)
    .set({ ...data, source })
    .where(eq(presetSpoolSeries.id, id));
  return getDb().query.presetSpoolSeries.findFirst({
    where: eq(presetSpoolSeries.id, id),
  });
}

export async function updateVersion(
  id: number,
  data: Partial<{
    name: string;
    nameI18n: NameI18n | null;
    spoolMaterial: SpoolMaterial | null;
    validFrom: string | null;
    validTo: string | null;
    notes: string | null;
    active: boolean;
  }>,
  source: "admin" | "community" = "admin"
) {
  await getDb()
    .update(presetSpoolVersions)
    .set({ ...data, source })
    .where(eq(presetSpoolVersions.id, id));
  return getDb().query.presetSpoolVersions.findFirst({
    where: eq(presetSpoolVersions.id, id),
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
    .update(presetSpoolVariants)
    .set({ ...data, source })
    .where(eq(presetSpoolVariants.id, id));
  return db.query.presetSpoolVariants.findFirst({
    where: eq(presetSpoolVariants.id, id),
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
      .select({ id: presetSpoolSeries.id })
      .from(presetSpoolSeries)
      .where(eq(presetSpoolSeries.manufacturerId, id));
    return rows.length;
  }
  if (scope === "series") {
    const rows = await db
      .select({ id: presetSpoolVersions.id })
      .from(presetSpoolVersions)
      .where(eq(presetSpoolVersions.seriesId, id));
    return rows.length;
  }
  const rows = await db
    .select({ id: presetSpoolVariants.id })
    .from(presetSpoolVariants)
    .where(eq(presetSpoolVariants.versionId, id));
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
  await db.delete(presetSpoolSeries).where(eq(presetSpoolSeries.id, id));
}

export async function deleteVersion(id: number) {
  await getDb()
    .delete(presetSpoolVersions)
    .where(eq(presetSpoolVersions.id, id));
}

export async function deleteVariant(id: number) {
  const db = getDb();
  await db
    .delete(hiddenSpoolPresets)
    .where(
      and(
        eq(hiddenSpoolPresets.scope, "variant"),
        eq(hiddenSpoolPresets.refId, id)
      )
    );
  await db.delete(presetSpoolVariants).where(eq(presetSpoolVariants.id, id));
}

export function findManufacturerById(id: number) {
  return getDb().query.presetManufacturers.findFirst({
    where: eq(presetManufacturers.id, id),
  });
}

export function findSeriesById(id: number) {
  return getDb().query.presetSpoolSeries.findFirst({
    where: eq(presetSpoolSeries.id, id),
  });
}

export function findVersionById(id: number) {
  return getDb().query.presetSpoolVersions.findFirst({
    where: eq(presetSpoolVersions.id, id),
  });
}

export function findVariantById(id: number) {
  return getDb().query.presetSpoolVariants.findFirst({
    where: eq(presetSpoolVariants.id, id),
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
  sourceSpoolTypeId?: number | null;
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
      sourceSpoolTypeId: data.sourceSpoolTypeId ?? null,
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
