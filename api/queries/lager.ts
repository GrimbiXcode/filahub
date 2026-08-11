import { and, count, eq } from "drizzle-orm";
import type { MaterialKind } from "@contracts/materials";
import { lager, materials } from "@db/schema";
import { getDb } from "./connection";

/**
 * Lager – die Ebene über den Materialien.
 *
 * Muster wie `api/queries/filament.ts`: Der Besitzer steht in der
 * `where`-Klausel jeder Abfrage, es gibt keinen globalen Scope und keine
 * Fremdschlüssel. Ein Lager gehört immer genau einem Benutzer; geteilt wird es
 * erst ab Schritt 3 (2.4.0), und auch dann bleibt der Eigentümer eindeutig.
 */

export function findLagerByUser(userId: number) {
  return getDb().query.lager.findMany({
    where: eq(lager.userId, userId),
    orderBy: (t, { asc }) => [asc(t.name)],
  });
}

/** Ein Lager des Benutzers. `undefined`, wenn es ihm nicht gehört. */
export function findLagerById(userId: number, id: number) {
  return getDb().query.lager.findFirst({
    where: and(eq(lager.id, id), eq(lager.userId, userId)),
  });
}

export async function createLager(data: {
  userId: number;
  name: string;
  materialKind: MaterialKind;
  filamentDiameterUm?: number | null;
  notes?: string | null;
}) {
  const [{ id }] = await getDb()
    .insert(lager)
    .values(data)
    .returning({ id: lager.id });
  return getDb().query.lager.findFirst({ where: eq(lager.id, id) });
}

export async function updateLager(
  userId: number,
  id: number,
  data: Partial<{
    name: string;
    materialKind: MaterialKind;
    filamentDiameterUm: number | null;
    notes: string | null;
  }>
) {
  await getDb()
    .update(lager)
    .set(data)
    .where(and(eq(lager.id, id), eq(lager.userId, userId)));
  return getDb().query.lager.findFirst({ where: eq(lager.id, id) });
}

export async function deleteLager(userId: number, id: number) {
  await getDb()
    .delete(lager)
    .where(and(eq(lager.id, id), eq(lager.userId, userId)));
}

/**
 * Wie viele Lager der Benutzer schon hat – Grundlage der Obergrenze.
 *
 * `count()` und nicht das Laden aller Zeilen: Der Aufrufer braucht die Zahl,
 * nicht die Lager.
 */
export async function countLagerByUser(userId: number): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(lager)
    .where(eq(lager.userId, userId));
  return Number(rows.at(0)?.value ?? 0);
}

/**
 * Wie viele Materialien in diesem Lager liegen – Grundlage der Löschsperre.
 *
 * Ohne Besitzerfilter: Der Aufrufer hat die Zugehörigkeit schon geprüft, und
 * gezählt werden muss **alles** darin, nicht nur die eigenen Zeilen (die es
 * mangels Freigabe heute ohnehin nur gibt).
 */
export async function countMaterialsInLager(id: number): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(materials)
    .where(eq(materials.lagerId, id));
  return Number(rows.at(0)?.value ?? 0);
}

/**
 * Gehört dieses Lager dem Benutzer? Gleiche Bauform wie
 * `spoolTypeBelongsToUser` und `storageBoxBelongsToUser` in
 * `api/queries/filament.ts`, damit `validateForeignKeys` einheitlich prüft.
 */
export async function lagerBelongsToUser(userId: number, id: number) {
  const rows = await getDb()
    .select({ id: lager.id })
    .from(lager)
    .where(and(eq(lager.id, id), eq(lager.userId, userId)))
    .limit(1);
  return rows.length > 0;
}
