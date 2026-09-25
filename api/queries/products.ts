import { and, count, eq, ne, notExists } from "drizzle-orm";
import type { MaterialKind } from "@contracts/materials";
import { lager, materialProducts, materials } from "@db/schema";
import { scopeOwner, scopeWhere, type Scope } from "../scope";
import { getDb } from "./connection";
import { hasChanges } from "./patch";

/**
 * Materialien – das Produkt über den Gebinden, seit 4.0.0.
 *
 * Achtung, Namen: Die Tabelle heißt `material_products`, die Oberfläche sagt
 * „Material“; die Gebinde stehen in `materials` (siehe `db/schema.ts`).
 *
 * **Ein Material existiert nur, solange es ein Gebinde hat.** Jeder Pfad, der
 * einem Material sein letztes Gebinde nimmt – löschen, einem anderen Material
 * zuordnen, zusammenführen –, löscht es in derselben Transaktion mit
 * (`deleteProductIfEmpty`). Dadurch ist die Materialart eines Materials immer
 * bekannt: Sie steht am Lager seiner Gebinde.
 */

/** Transaktion oder Datenbank – beide haben dieselben Abfragemethoden. */
type Executor = Pick<
  ReturnType<typeof getDb>,
  "select" | "insert" | "update" | "delete"
>;

/** Was an einem Material eingegeben wird */
export type ProductData = {
  name: string;
  materialType: string;
  manufacturer?: string | null;
  color?: string | null;
  texture?: string | null;
  densityGramsPerLiter?: number | null;
  notes?: string | null;
};

/** Ein Material samt dem, was seine Gebinde über es verraten. */
export type ProductListItem = typeof materialProducts.$inferSelect & {
  /** Materialart und Stärke aus dem Lager der Gebinde; `null` ohne Gebinde */
  kind: MaterialKind | null;
  diameterUm: number | null;
  /** Anzahl der Gebinde */
  gebindeCount: number;
};

/**
 * Alle Materialien des Bereichs, mit Materialart, Stärke und Anzahl ihrer
 * Gebinde – für die Auswahl im Formular und die Vorschläge zum
 * Zusammenführen.
 */
export async function findProductsInScope(
  scope: Scope
): Promise<ProductListItem[]> {
  const rows = await getDb().query.materialProducts.findMany({
    where: scopeWhere(materialProducts, scope),
    with: {
      materials: {
        columns: { id: true },
        with: {
          lager: {
            columns: { materialKind: true, filamentDiameterUm: true },
          },
        },
      },
    },
    orderBy: (t, { asc }) => [asc(t.name), asc(t.id)],
  });
  return rows.map(({ materials: gebinde, ...product }) => {
    const first = gebinde.find(g => g.lager != null)?.lager ?? null;
    return {
      ...product,
      kind: first?.materialKind ?? null,
      diameterUm: first?.filamentDiameterUm ?? null,
      gebindeCount: gebinde.length,
    };
  });
}

/** Ein Material des Bereichs, ohne Gebinde – oder `undefined`. */
export function findProductRowInScope(scope: Scope, id: number) {
  return getDb().query.materialProducts.findFirst({
    where: and(
      eq(materialProducts.id, id),
      scopeWhere(materialProducts, scope)
    ),
  });
}

/**
 * Alle Materialarten des Bereichs, jede Schreibweise einmal.
 *
 * Futter für `canonicalMaterialType`: Was hier steht, ist die Schreibweise,
 * die eine neue Eingabe derselben Vergleichsform bekommt. Seit der Migration
 * `0019_material_type_case.sql` führt ein Bereich je Vergleichsform nur noch
 * eine Schreibweise; sollten es durch zwei gleichzeitige Anfragen doch einmal
 * zwei sein, sorgt die Sortierung dafür, dass stets dieselbe gewinnt.
 */
export async function findMaterialTypesInScope(
  scope: Scope
): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ materialType: materialProducts.materialType })
    .from(materialProducts)
    .where(scopeWhere(materialProducts, scope))
    .orderBy(materialProducts.materialType);
  return rows.map(row => row.materialType);
}

/** Wie viele Materialien der Bereich hat – Grundlage der Obergrenze. */
export async function countProductsInScope(scope: Scope): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(materialProducts)
    .where(scopeWhere(materialProducts, scope));
  return Number(rows.at(0)?.value ?? 0);
}

/** Legt ein Material an; der Eigentümer kommt aus dem Bereich. */
export async function insertProduct(
  executor: Executor,
  scope: Scope,
  data: ProductData
): Promise<number> {
  const [{ id }] = await executor
    .insert(materialProducts)
    .values({ ...data, ...scopeOwner(scope) })
    .returning({ id: materialProducts.id });
  return id;
}

export async function updateProduct(
  executor: Executor,
  scope: Scope,
  id: number,
  data: Partial<ProductData>
) {
  if (!hasChanges(data)) return;
  await executor
    .update(materialProducts)
    .set(data)
    .where(
      and(eq(materialProducts.id, id), scopeWhere(materialProducts, scope))
    );
}

/** Fehlerkennung: Das Material gibt es (im Bereich) nicht mehr. */
export const PRODUCT_GONE = "PRODUCT_GONE";

/**
 * Sperrt die Zeile eines Materials bis zum Ende der Transaktion und sagt, ob
 * es sie im Bereich gibt.
 *
 * **Die Klammer um die Regel „ein Material existiert nur mit Gebinde“ unter
 * Gleichzeitigkeit.** Ohne sie konnte ein Gebinde für ein Material entstehen,
 * dessen letztes Gebinde eine zweite Anfrage im selben Moment löschte: Das
 * `NOT EXISTS` in `deleteProductIfEmpty` sieht ein noch nicht bestätigtes
 * Gebinde nicht, und danach zeigte das neue Gebinde auf ein gelöschtes
 * Material – Fremdschlüssel gibt es keine. Wer ein Gebinde an ein Material
 * hängt, und wer ein Material leer löscht, nimmt deshalb zuerst diese Sperre;
 * der Zweite wartet und sieht dann den Stand des Ersten.
 */
export async function lockProductInScope(
  executor: Executor,
  scope: Scope,
  id: number
): Promise<boolean> {
  const rows = await executor
    .select({ id: materialProducts.id })
    .from(materialProducts)
    .where(
      and(eq(materialProducts.id, id), scopeWhere(materialProducts, scope))
    )
    .for("update");
  return rows.length > 0;
}

/**
 * Löscht ein Material, wenn kein Gebinde mehr darauf zeigt – die Klammer um
 * die Regel „ein Material existiert nur mit Gebinde“. In derselben
 * Transaktion aufrufen wie den Schritt, der das letzte Gebinde nimmt; die
 * Sperre davor ordnet es gegen ein gleichzeitiges Anlegen (siehe
 * `lockProductInScope`).
 */
export async function deleteProductIfEmpty(
  executor: Executor,
  scope: Scope,
  id: number
) {
  if (!(await lockProductInScope(executor, scope, id))) return;
  await executor
    .delete(materialProducts)
    .where(
      and(
        eq(materialProducts.id, id),
        scopeWhere(materialProducts, scope),
        notExists(
          executor
            .select({ id: materials.id })
            .from(materials)
            .where(eq(materials.productId, id))
        )
      )
    );
}

/**
 * Materialart und Stärke der Lager, in denen die Gebinde eines Materials
 * liegen – ohne das Gebinde `exceptMaterialId` (das gerade verschoben wird).
 * Je Kombination ein Eintrag.
 */
export async function findProductLagerKinds(
  productId: number,
  exceptMaterialId?: number
): Promise<{ kind: MaterialKind; diameterUm: number | null }[]> {
  const rows = await getDb()
    .selectDistinct({
      kind: lager.materialKind,
      diameterUm: lager.filamentDiameterUm,
    })
    .from(materials)
    .innerJoin(lager, eq(lager.id, materials.lagerId))
    .where(
      exceptMaterialId != null
        ? and(
            eq(materials.productId, productId),
            ne(materials.id, exceptMaterialId)
          )
        : eq(materials.productId, productId)
    );
  return rows;
}

/**
 * Führt `sourceId` in `targetId` zusammen: Die Gebinde wandern, das leere
 * Material wird gelöscht. In einer Transaktion und beide Schritte im Bereich.
 */
export async function mergeProducts(
  scope: Scope,
  sourceId: number,
  targetId: number
): Promise<number> {
  return getDb().transaction(async tx => {
    // Beide sperren, in fester Reihenfolge – sonst verklemmen sich zwei
    // gegenläufige Zusammenführungen.
    for (const id of [sourceId, targetId].sort((a, b) => a - b)) {
      if (!(await lockProductInScope(tx, scope, id)))
        throw new Error(PRODUCT_GONE);
    }
    const moved = await tx
      .update(materials)
      .set({ productId: targetId })
      .where(
        and(eq(materials.productId, sourceId), scopeWhere(materials, scope))
      )
      .returning({ id: materials.id });
    await deleteProductIfEmpty(tx, scope, sourceId);
    return moved.length;
  });
}
