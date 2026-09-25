import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  ne,
  type SQL,
} from "drizzle-orm";
import {
  buildVariantDisplayName,
  resolveName,
  resolveContainerTare,
} from "@contracts/presets";
import { FALLBACK_LANGUAGE, type LanguageCode } from "@contracts/i18n";
import {
  consumedSince,
  productStock,
  remainingAmount,
  type ContainerForm,
  type ProductStock,
  type SecondaryAmount,
} from "@contracts/materials";
import {
  consumptions,
  materials,
  type MaterialProduct,
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
import {
  PRODUCT_GONE,
  deleteProductIfEmpty,
  insertProduct,
  lockProductInScope,
  updateProduct,
  type ProductData,
} from "./products";

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

/**
 * Wie viele eigene Gebindearten der Bereich schon hat – Grundlage der
 * Obergrenze. `count()` und nicht das Laden aller Zeilen: Der Aufrufer braucht
 * die Zahl, nicht die Gebindearten. Vorbild `countLagerInScope`.
 */
export async function countContainerTypesInScope(
  scope: Scope
): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(containerTypes)
    .where(scopeWhere(containerTypes, scope));
  return Number(rows.at(0)?.value ?? 0);
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

/** Wie viele Dryboxen der Bereich schon hat – Grundlage der Obergrenze. */
export async function countStorageBoxesInScope(scope: Scope): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(storageBoxes)
    .where(scopeWhere(storageBoxes, scope));
  return Number(rows.at(0)?.value ?? 0);
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
  /**
   * Das Material (Produkt), zu dem das Gebinde gehört. Seine Felder werden in
   * `computeMaterialStats` auf die Gebindezeile aufgeflacht – siehe
   * `MaterialOverview`.
   */
  product: MaterialProduct;
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

/**
 * Die Felder des Materials, die auf die Gebindezeile aufgeflacht werden.
 *
 * Gespeichert sind sie seit 4.0.0 **nur** am Material (`material_products`);
 * die Lesesicht reicht sie am Gebinde weiter, damit Suche, Filter, Farbfeld
 * und Freundesansicht dieselbe Form behalten. Eine Kopie in der Datenbank ist
 * das nicht – geschrieben wird immer das Material.
 */
type ProductFields = Pick<
  MaterialProduct,
  | "name"
  | "materialType"
  | "manufacturer"
  | "color"
  | "texture"
  | "densityGramsPerLiter"
>;

export type MaterialOverview = Omit<MaterialWithRelations, "product"> &
  ProductFields & {
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
     * Seit der letzten Wägung abgebuchte Verbräuche in Gramm – ohne Wägung alle
     * (siehe `consumedSince` in `contracts/materials.ts`). Für die Kachel „seitdem
     * abgebucht“ auf der Detailseite; in `remainingWeight` ist der Wert schon
     * abgezogen.
     */
    consumedSinceWeighing: number;
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

/**
 * Berechnet Tara und Restmenge aus letzter Wägung bzw. Nennmenge, abzüglich
 * der seither abgebuchten Verbräuche.
 */
export function computeMaterialStats(
  material: MaterialWithRelations,
  lastWeighing: Weighing | null,
  weighingCount: number,
  language: LanguageCode = FALLBACK_LANGUAGE,
  /** Aus `consumedSince`; 0 = nichts abgebucht (oder von vor 2.9.0) */
  consumedSinceWeighing = 0
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
      consumedSinceWeighing,
      materialType: material.product.materialType,
      kind: material.lager?.materialKind,
      densityGramsPerLiter: material.product.densityGramsPerLiter,
      diameterUm: material.lager?.filamentDiameterUm,
    });
  const { product, ...gebinde } = material;
  return {
    ...gebinde,
    name: product.name,
    materialType: product.materialType,
    manufacturer: product.manufacturer,
    color: product.color,
    texture: product.texture,
    densityGramsPerLiter: product.densityGramsPerLiter,
    tareWeight,
    containerTareWeight,
    containerLabel,
    remainingWeight,
    remainingPercent,
    lastWeighing,
    weighingCount,
    consumedSinceWeighing,
    secondary,
    densityUsed,
  };
}

/** Ein Gebinde in der Übersicht: Werte des Gebindes plus Bestand seines Materials */
export type MaterialListItem = MaterialOverview & {
  /**
   * Bestand des **Materials** über alle seine Gebinde und Lager, samt der
   * geltenden Warnschwelle (`productStock` in `contracts/materials.ts`). Für
   * alle Gebinde desselben Materials derselbe Wert.
   */
  stock: ProductStock;
};

/** Lade-Vorschrift für die Gebindezeile samt allem, was die Restmenge braucht */
const GEBINDE_WITH = {
  product: true,
  containerType: true,
  storageBox: true,
  containerPresetVariant: withPresetPath,
  lager: true,
  weighings: true,
  /*
    Nur die zwei Spalten, die `consumedSince` braucht: Die Übersicht ist
    die teuerste Leseprozedur, und der Verlauf gehört auf die Detailseite.
  */
  consumptions: { columns: { weight: true, consumedAt: true } },
} as const;

/** Gebindezeilen nach `where`, mit Restmenge – aber noch ohne Bestand. */
async function loadGebindeOverviews(
  where: SQL,
  language: LanguageCode
): Promise<MaterialOverview[]> {
  const rows = await getDb().query.materials.findMany({
    where,
    with: GEBINDE_WITH,
    orderBy: (t, { desc: d }) => [d(t.createdAt), d(t.id)],
  });
  /*
    Ein Gebinde ohne Material dürfte es nicht geben (`lockProductInScope`).
    Gäbe es doch eines, soll es die Liste nicht für den ganzen Bereich
    abstürzen lassen – es fehlt dann in der Übersicht, statt alles zu blockieren.
  */
  return rows.flatMap(row => {
    if (!row.product) {
      console.error(`Gebinde ${row.id} ohne Material ${row.productId}`);
      return [];
    }
    const sorted = [...row.weighings].sort(
      (a, b) => b.weighedAt.getTime() - a.weighedAt.getTime() || b.id - a.id
    );
    const last = sorted[0] ?? null;
    const { weighings: _omit, consumptions: _omitToo, ...rest } = row;
    return [
      computeMaterialStats(
        {
          ...rest,
          product: row.product,
          containerType: normalizeRelation(row.containerType),
          storageBox: normalizeRelation(row.storageBox),
          containerPresetVariant: normalizeRelation(row.containerPresetVariant),
          lager: normalizeRelation(row.lager),
        },
        last,
        row.weighings.length,
        language,
        consumedSince(last?.weighedAt ?? null, row.consumptions)
      ),
    ];
  });
}

/**
 * Bestand je Material aus den Gebindezeilen. Die Schwelle des Lagers kommt
 * aus dem mitgeladenen Lager jedes Gebindes.
 */
function stockByProduct(
  gebinde: readonly MaterialOverview[]
): Map<number, ProductStock> {
  const groups = new Map<number, MaterialOverview[]>();
  for (const g of gebinde) {
    const list = groups.get(g.productId);
    if (list) list.push(g);
    else groups.set(g.productId, [g]);
  }
  const result = new Map<number, ProductStock>();
  for (const [productId, list] of groups) {
    result.set(
      productId,
      productStock(
        list.map(g => ({
          remainingWeight: g.remainingWeight,
          nominalWeight: g.nominalWeight,
          lagerLowStockGrams: g.lager?.lowStockGrams,
        }))
      )
    );
  }
  return result;
}

/**
 * Gebinde des Bereichs samt Bestand ihres Materials.
 *
 * Mit `lagerId` kommen nur die Gebinde dieses Lagers – der Bestand zählt aber
 * trotzdem **alle** Gebinde der betroffenen Materialien, auch die in anderen
 * Lagern. Dafür eine zweite Abfrage auf genau diese; ohne sie warnte die
 * Übersicht des einen Lagers, obwohl die volle Rolle im anderen liegt.
 */
export async function findMaterialsInScope(
  scope: Scope,
  language: LanguageCode = FALLBACK_LANGUAGE,
  /**
   * Auf ein Lager einschränken. `undefined` = alle Lager des Bereichs – so
   * bleibt die Schnellsuche über den gesamten Bestand möglich, während die
   * Übersicht auf das gewählte Lager filtert.
   */
  lagerId?: number
): Promise<MaterialListItem[]> {
  const list = await loadGebindeOverviews(
    lagerId != null
      ? and(scopeWhere(materials, scope), eq(materials.lagerId, lagerId))!
      : scopeWhere(materials, scope),
    language
  );
  const productIds = [...new Set(list.map(g => g.productId))];
  const elsewhere =
    lagerId != null && productIds.length > 0
      ? await loadGebindeOverviews(
          and(
            scopeWhere(materials, scope),
            inArray(materials.productId, productIds),
            ne(materials.lagerId, lagerId)
          )!,
          language
        )
      : [];
  const stock = stockByProduct([...list, ...elsewhere]);
  return list.map(g => ({ ...g, stock: stock.get(g.productId)! }));
}

/**
 * Alle Gebinde eines Materials im Bereich, über alle Lager, samt Bestand –
 * für „Weitere Rollen von diesem Material“ und die Material-Seite.
 */
export async function findGebindeOfProduct(
  scope: Scope,
  productId: number,
  language: LanguageCode = FALLBACK_LANGUAGE
): Promise<{ gebinde: MaterialListItem[]; stock: ProductStock }> {
  const list = await loadGebindeOverviews(
    and(scopeWhere(materials, scope), eq(materials.productId, productId))!,
    language
  );
  const stock = stockByProduct(list).get(productId) ?? productStock([]);
  return { gebinde: list.map(g => ({ ...g, stock })), stock };
}

export async function findMaterialInScope(
  scope: Scope,
  id: number,
  language: LanguageCode = FALLBACK_LANGUAGE
) {
  const row = await getDb().query.materials.findFirst({
    where: and(eq(materials.id, id), scopeWhere(materials, scope)),
    with: {
      product: true,
      containerType: true,
      storageBox: true,
      containerPresetVariant: withPresetPath,
      lager: true,
      weighings: { orderBy: (t, { desc: d }) => [d(t.weighedAt), d(t.id)] },
      consumptions: {
        orderBy: (t, { desc: d }) => [d(t.consumedAt), d(t.id)],
      },
    },
  });
  if (!row?.product) return null;
  const product = row.product;
  const last = row.weighings[0] ?? null;
  const { weighings: list, consumptions: consumed, ...rest } = row;
  const { stock } = await findGebindeOfProduct(scope, row.productId, language);
  return {
    ...computeMaterialStats(
      {
        ...rest,
        product,
        containerType: normalizeRelation(row.containerType),
        storageBox: normalizeRelation(row.storageBox),
        containerPresetVariant: normalizeRelation(row.containerPresetVariant),
        lager: normalizeRelation(row.lager),
      },
      last,
      list.length,
      language,
      consumedSince(last?.weighedAt ?? null, consumed)
    ),
    /** Notizen des Materials – die Gebindezeile hat ihre eigenen */
    productNotes: product.notes,
    stock,
    weighings: list,
    consumptions: consumed,
  };
}

/**
 * Fehler des Unique-Index über die Kennung je Lager. Wie `LAGER_NAME_TAKEN`
 * (`api/queries/lager.ts`) am **Namen des Constraints** erkannt, nicht am
 * Meldungstext; der Router macht daraus ein `CONFLICT` mit lesbarer Meldung.
 */
export const IDENTIFIER_TAKEN = "IDENTIFIER_TAKEN";
const IDENTIFIER_INDEX = "materials_identifier_per_lager_unique";

function rethrowIdentifierTaken(error: unknown): never {
  const constraint = (error as { cause?: { constraint?: string } })?.cause
    ?.constraint;
  if (
    constraint === IDENTIFIER_INDEX ||
    (error instanceof Error && error.message.includes(IDENTIFIER_INDEX))
  )
    throw new Error(IDENTIFIER_TAKEN, { cause: error });
  throw error;
}

/** Was am Gebinde selbst eingegeben wird */
export type GebindeData = {
  lagerId: number;
  identifier?: string | null;
  priceCents?: number | null;
  purchaseDate?: string | null;
  nominalWeight: number;
  containerTypeId?: number | null;
  containerPresetVariantId?: number | null;
  storageBoxId?: number | null;
  notes?: string | null;
};

/**
 * Legt ein Gebinde an – zu einem bestehenden Material (`product` ist eine ID)
 * oder zu einem neuen (`product` sind dessen Angaben). Beides in **einer**
 * Transaktion samt Erstwägung: Scheitert das Gebinde an der Kennung, bleibt
 * kein Material ohne Gebinde zurück.
 *
 * Liefert die ID des Gebindes und die des Materials.
 */
export async function createMaterial(
  scope: Scope,
  data: GebindeData,
  product: number | ProductData,
  initialGrossWeight?: number | null
): Promise<{ id: number; productId: number }> {
  return getDb()
    .transaction(async tx => {
      if (
        typeof product === "number" &&
        !(await lockProductInScope(tx, scope, product))
      )
        throw new Error(PRODUCT_GONE);
      const productId =
        typeof product === "number"
          ? product
          : await insertProduct(tx, scope, product);
      const [{ id }] = await tx
        .insert(materials)
        /*
          Der Eigentümer kommt aus dem Bereich, nie aus der Eingabe – und der
          Bereich stammt aus dem **Lager**, das `validateForeignKeys` vorher
          aufgelöst hat. Damit kann die Kopie am Gebinde nicht vom Lager
          abweichen, und ein Gebinde wechselt seinen Bereich nicht dadurch,
          dass jemand eine fremde `lagerId` mitschickt.
        */
        .values({ ...data, productId, ...scopeOwner(scope) })
        .returning({ id: materials.id });
      if (initialGrossWeight != null) {
        await tx
          .insert(weighings)
          .values({ materialId: id, grossWeight: initialGrossWeight });
      }
      return { id, productId };
    })
    .catch(rethrowIdentifierTaken);
}

/**
 * Ändert ein Gebinde und – falls mitgeschickt – sein Material, in einer
 * Transaktion.
 *
 * - `data.productId` ordnet das Gebinde einem anderen Material zu; war es das
 *   letzte Gebinde des alten, wird das alte gelöscht.
 * - `productPatch` ändert das **Material** und damit alle seine Gebinde.
 */
export async function updateMaterial(
  scope: Scope,
  id: number,
  data: Partial<GebindeData & { productId: number }>,
  productPatch: { productId: number; data: Partial<ProductData> } | null,
  previousProductId: number
) {
  await getDb()
    .transaction(async tx => {
      if (
        data.productId != null &&
        data.productId !== previousProductId &&
        !(await lockProductInScope(tx, scope, data.productId))
      )
        throw new Error(PRODUCT_GONE);
      if (productPatch) {
        await updateProduct(
          tx,
          scope,
          productPatch.productId,
          productPatch.data
        );
      }
      if (hasChanges(data)) {
        await tx
          .update(materials)
          .set(data)
          .where(and(eq(materials.id, id), scopeWhere(materials, scope)));
      }
      if (data.productId != null && data.productId !== previousProductId) {
        await deleteProductIfEmpty(tx, scope, previousProductId);
      }
    })
    .catch(rethrowIdentifierTaken);
}

/** Alle vergebenen Kennungen des Bereichs – für die Vorlage beim Import */
export async function findIdentifiersInScope(scope: Scope): Promise<string[]> {
  const rows = await getDb()
    .select({ identifier: materials.identifier })
    .from(materials)
    .where(and(scopeWhere(materials, scope), isNotNull(materials.identifier)));
  return rows.flatMap(row => (row.identifier ? [row.identifier] : []));
}

/**
 * Löscht ein Material samt seinen Wägungen und Verbräuchen.
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
      .delete(consumptions)
      .where(inArray(consumptions.materialId, scoped));
    const deleted = await tx
      .delete(materials)
      .where(and(eq(materials.id, id), scopeWhere(materials, scope)))
      .returning({ productId: materials.productId });
    /*
      Das letzte Gebinde eines Materials nimmt das Material mit – ein
      Material existiert nur, solange es ein Gebinde hat (`api/queries/products.ts`).
    */
    for (const { productId } of deleted) {
      await deleteProductIfEmpty(tx, scope, productId);
    }
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

/**
 * Wie viele Wägungen ein Material schon trägt – Grundlage der Obergrenze.
 *
 * Ohne Bereichsfilter: Der Aufrufer hat die Zugehörigkeit über
 * `materialInScope` bereits geprüft, und gezählt werden muss **alles** am
 * Material. Dieselbe Begründung wie bei `countMaterialsInLager`.
 */
export async function countWeighingsForMaterial(
  materialId: number
): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(weighings)
    .where(eq(weighings.materialId, materialId));
  return Number(rows.at(0)?.value ?? 0);
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

// ---------------------------------------------------------------------------
// Verbräuche – Spiegel der Wägungsfunktionen oben, mit denselben Begründungen
// ---------------------------------------------------------------------------

export async function addConsumption(data: {
  materialId: number;
  weight: number;
  consumedAt?: Date;
  note?: string;
}) {
  const [{ id }] = await getDb()
    .insert(consumptions)
    .values(data)
    .returning({ id: consumptions.id });
  return getDb().query.consumptions.findFirst({
    where: eq(consumptions.id, id),
  });
}

/** Wie `countWeighingsForMaterial` – ohne Bereichsfilter, aus demselben Grund. */
export async function countConsumptionsForMaterial(
  materialId: number
): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(consumptions)
    .where(eq(consumptions.materialId, materialId));
  return Number(rows.at(0)?.value ?? 0);
}

export async function findConsumption(id: number) {
  return getDb().query.consumptions.findFirst({
    where: eq(consumptions.id, id),
  });
}

export async function deleteConsumption(id: number) {
  await getDb().delete(consumptions).where(eq(consumptions.id, id));
}

/**
 * Der zuletzt **erfasste** Verbrauch eines Materials, oder `null` – nach `id`,
 * wie `findLatestWeighingId` und aus demselben Grund. Grundlage von
 * `mayDeleteConsumption`.
 */
export async function findLatestConsumptionId(
  materialId: number
): Promise<number | null> {
  const rows = await getDb()
    .select({ id: consumptions.id })
    .from(consumptions)
    .where(eq(consumptions.materialId, materialId))
    .orderBy(desc(consumptions.id))
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

/**
 * Die blanke Gebindezeile im Bereich, ohne Relationen und Rechnung – für
 * Schreibpfade, die nur Lager, Material und Kennung des Bestands brauchen.
 * `findMaterialInScope` lädt dafür alle Gebinde des Materials samt Wägungen.
 */
export function findMaterialRowInScope(scope: Scope, id: number) {
  return getDb().query.materials.findFirst({
    where: and(eq(materials.id, id), scopeWhere(materials, scope)),
  });
}
