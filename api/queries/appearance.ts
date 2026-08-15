import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  normalizeAppearanceName,
  type AppearanceCatalog,
  type TextureKind,
} from "@contracts/appearance";
import { customColors, customTextures, materials } from "@db/schema";
import { scopeOwner, scopeWhere, type Scope } from "../scope";
import { getDb } from "./connection";
import { hasChanges } from "./patch";

/**
 * Eigene Farben und Oberflächen – die Zuordnung Name → Farbcode bzw. Muster.
 *
 * Wie überall in `queries/` steht der Bereich vorn und kommt aus
 * `resolveScope`; der Eigentümer wird nie aus der Eingabe übernommen.
 *
 * Der mitgelieferte Katalog liegt dagegen im Code (`contracts/appearance.ts`)
 * und taucht hier nicht auf: Er ist für alle gleich und braucht weder Abfrage
 * noch Migration.
 */

// ---------------------------------------------------------------------------
// Farben
// ---------------------------------------------------------------------------

export function findCustomColorsInScope(scope: Scope) {
  return getDb().query.customColors.findMany({
    where: scopeWhere(customColors, scope),
    orderBy: (t, { asc }) => [asc(t.name)],
  });
}

export async function createCustomColor(
  scope: Scope,
  data: { name: string; hex: string }
) {
  const [{ id }] = await getDb()
    .insert(customColors)
    .values({
      ...data,
      /*
        Die Vergleichsform setzt die Abfrageschicht und nicht der Aufrufer: Sie
        muss zu `resolveColorHex` passen, nicht zur Eingabemaske. Käme sie von
        außen, wäre der Unique-Index eine Frage der Disziplin am Schreibort.
      */
      nameKey: normalizeAppearanceName(data.name),
      // Der Eigentümer kommt aus dem Bereich, nie aus der Eingabe.
      ...scopeOwner(scope),
    })
    .returning({ id: customColors.id });
  return getDb().query.customColors.findFirst({
    where: eq(customColors.id, id),
  });
}

export async function updateCustomColor(
  scope: Scope,
  id: number,
  data: Partial<{ name: string; hex: string }>
) {
  const patch =
    data.name === undefined
      ? data
      : { ...data, nameKey: normalizeAppearanceName(data.name) };
  if (hasChanges(patch)) {
    await getDb()
      .update(customColors)
      .set(patch)
      .where(and(eq(customColors.id, id), scopeWhere(customColors, scope)));
  }
  // Bereichsfilter auch beim Rücklesen – siehe `updateContainerType`.
  return getDb().query.customColors.findFirst({
    where: and(eq(customColors.id, id), scopeWhere(customColors, scope)),
  });
}

export async function deleteCustomColor(scope: Scope, id: number) {
  await getDb()
    .delete(customColors)
    .where(and(eq(customColors.id, id), scopeWhere(customColors, scope)));
}

// ---------------------------------------------------------------------------
// Oberflächen
// ---------------------------------------------------------------------------

export function findCustomTexturesInScope(scope: Scope) {
  return getDb().query.customTextures.findMany({
    where: scopeWhere(customTextures, scope),
    orderBy: (t, { asc }) => [asc(t.name)],
  });
}

export async function createCustomTexture(
  scope: Scope,
  data: { name: string; kind: TextureKind }
) {
  const [{ id }] = await getDb()
    .insert(customTextures)
    .values({
      ...data,
      nameKey: normalizeAppearanceName(data.name),
      ...scopeOwner(scope),
    })
    .returning({ id: customTextures.id });
  return getDb().query.customTextures.findFirst({
    where: eq(customTextures.id, id),
  });
}

export async function updateCustomTexture(
  scope: Scope,
  id: number,
  data: Partial<{ name: string; kind: TextureKind }>
) {
  const patch =
    data.name === undefined
      ? data
      : { ...data, nameKey: normalizeAppearanceName(data.name) };
  if (hasChanges(patch)) {
    await getDb()
      .update(customTextures)
      .set(patch)
      .where(and(eq(customTextures.id, id), scopeWhere(customTextures, scope)));
  }
  return getDb().query.customTextures.findFirst({
    where: and(eq(customTextures.id, id), scopeWhere(customTextures, scope)),
  });
}

export async function deleteCustomTexture(scope: Scope, id: number) {
  await getDb()
    .delete(customTextures)
    .where(and(eq(customTextures.id, id), scopeWhere(customTextures, scope)));
}

// ---------------------------------------------------------------------------
// Katalog fremder Bestände (Freunde)
// ---------------------------------------------------------------------------

type MutableCatalog = {
  colors: Map<string, string>;
  textures: Map<string, TextureKind>;
};

/**
 * Die eigenen Einträge mehrerer **Menschen** in einem Zug, als Katalog je
 * Eigentümer.
 *
 * Gebraucht für die Bestandsliste eines Freundes: Dort wird serverseitig
 * aufgelöst, weil der Katalog des Betrachters die Farben des Freundes nicht
 * kennt. Eine Abfrage für alle beteiligten Eigentümer statt einer je Material –
 * die Liste kann Bestände mehrerer Freunde mischen.
 *
 * Nur persönliche Bestände: Eine Freigabe an Freunde verlangt einen
 * menschlichen Eigentümer (`setLagerShare`), Organisationszeilen können hier
 * also nicht vorkommen.
 */
export async function findAppearanceCatalogsForUsers(
  userIds: readonly number[]
): Promise<Map<number, AppearanceCatalog>> {
  const catalogs = new Map<number, MutableCatalog>();
  const ids = [...new Set(userIds)];
  /*
    Ohne diese Abkürzung würde Drizzle aus der leeren Liste `in ()` bauen, was
    Postgres ablehnt – dieselbe Falle wie bei den Wägungen in
    `queries/account.ts`.
  */
  if (ids.length === 0) return catalogs;

  const db = getDb();
  const [colors, textures] = await Promise.all([
    db
      .select()
      .from(customColors)
      .where(
        and(
          inArray(customColors.userId, ids),
          isNull(customColors.organizationId)
        )
      ),
    db
      .select()
      .from(customTextures)
      .where(
        and(
          inArray(customTextures.userId, ids),
          isNull(customTextures.organizationId)
        )
      ),
  ]);

  function forUser(userId: number): MutableCatalog {
    const existing = catalogs.get(userId);
    if (existing) return existing;
    const fresh: MutableCatalog = { colors: new Map(), textures: new Map() };
    catalogs.set(userId, fresh);
    return fresh;
  }

  for (const color of colors) {
    if (color.userId == null) continue;
    forUser(color.userId).colors.set(color.nameKey, color.hex);
  }
  for (const texture of textures) {
    if (texture.userId == null) continue;
    forUser(texture.userId).textures.set(texture.nameKey, texture.kind);
  }
  return catalogs;
}

// ---------------------------------------------------------------------------
// Betroffene Materialien
// ---------------------------------------------------------------------------

/**
 * Wie viele Materialien diesen Farb- bzw. Oberflächennamen tragen.
 *
 * Nur für die Rückfrage vor dem Löschen – **kein** Hindernis: Anders als bei
 * einer Gebindeart hängt hier keine Zahl am Material, der Name steht als
 * Freitext darin und bleibt lesbar. Es fällt nur die Darstellung auf das
 * Rückfallfeld zurück.
 *
 * Verglichen wird in TypeScript und nicht in SQL, weil die Vergleichsform
 * Akzente faltet – das nachzubauen hieße, dieselbe Regel ein zweites Mal zu
 * schreiben, und die beiden könnten auseinanderlaufen. Geladen wird dafür genau
 * eine Spalte des eigenen Bestands.
 */
export async function countMaterialsWithAppearanceName(
  scope: Scope,
  column: "color" | "texture",
  name: string
): Promise<number> {
  const key = normalizeAppearanceName(name);
  if (!key) return 0;
  const rows = await getDb()
    .select({ value: materials[column] })
    .from(materials)
    .where(scopeWhere(materials, scope));
  return rows.filter(
    row => row.value != null && normalizeAppearanceName(row.value) === key
  ).length;
}
