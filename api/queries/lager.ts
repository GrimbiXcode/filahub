import { and, count, eq } from "drizzle-orm";
import type { MaterialKind } from "@contracts/materials";
import { lager, lagerShares, materials } from "@db/schema";
import { getDb } from "./connection";

/**
 * Lager – die Ebene über den Materialien.
 *
 * Muster wie `api/queries/filament.ts`: Der Besitzer steht in der
 * `where`-Klausel jeder Abfrage, es gibt keinen globalen Scope und keine
 * Fremdschlüssel. Ein Lager gehört immer genau einem Benutzer – auch seit es
 * (2.4.0) an Freunde freigegeben werden kann. Die Freigaben selbst liegen in
 * `api/queries/friends.ts`; hier steht nur, was beim **Löschen** mit ihnen
 * geschieht.
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

/**
 * Fehler des Unique-Index über `(userId, name)`.
 *
 * Ohne diese Umwandlung reicht tRPC die rohe Postgres-Meldung durch – es gibt
 * keinen `errorFormatter` –, und die Lager-Seite zeigt sie wörtlich in einem
 * Toast: `duplicate key value violates unique constraint …`. Ein doppelter Name
 * ist ein gewöhnlicher Bedienfehler und gehört als Konflikt beantwortet.
 */
export const LAGER_NAME_TAKEN = "LAGER_NAME_TAKEN";

function isDuplicateLagerName(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("lager_name_per_user_unique")
  );
}

export async function createLager(data: {
  userId: number;
  name: string;
  materialKind: MaterialKind;
  filamentDiameterUm?: number | null;
  notes?: string | null;
}) {
  let id: number;
  try {
    const [row] = await getDb()
      .insert(lager)
      .values(data)
      .returning({ id: lager.id });
    id = row.id;
  } catch (error) {
    if (isDuplicateLagerName(error))
      throw new Error(LAGER_NAME_TAKEN, { cause: error });
    throw error;
  }
  return getDb().query.lager.findFirst({
    where: and(eq(lager.id, id), eq(lager.userId, data.userId)),
  });
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
  try {
    await getDb()
      .update(lager)
      .set(data)
      .where(and(eq(lager.id, id), eq(lager.userId, userId)));
  } catch (error) {
    if (isDuplicateLagerName(error))
      throw new Error(LAGER_NAME_TAKEN, { cause: error });
    throw error;
  }
  /*
    Der Besitzerfilter gehört **auch** ans Rücklesen. Ohne ihn trifft das UPDATE
    keine Zeile, das `findFirst` aber die fremde – und ein Aufrufer, der dem
    Rückgabewert vertraut statt vorab zu prüfen, gibt Name und Notizen eines
    fremden Lagers heraus. Freitext, der einen Ort verraten kann.
  */
  return getDb().query.lager.findFirst({
    where: and(eq(lager.id, id), eq(lager.userId, userId)),
  });
}

/**
 * Löscht ein Lager **samt seinen Freigaben** und meldet, wessen Zugriff damit
 * endete.
 *
 * Die Kaskade ist keine Aufräumarbeit, sondern die Gegenrichtung zu der in
 * `deleteFriendship`: Bliebe die Freigabezeile stehen, zeigte ihre `lagerId`
 * mangels Fremdschlüssel irgendwann auf ein **neu vergebenes** Lager – und
 * jemand sähe einen Bestand, den nie jemand für ihn freigegeben hat.
 *
 * Erst die Freigaben, dann das Lager: dieselbe Reihenfolge wie beim Löschen
 * eines Kontos, und aus demselben Grund. Beides in einer Transaktion, damit es
 * keinen Zwischenzustand mit dem einen ohne das andere gibt.
 *
 * Der Rückgabewert trägt die betroffenen Empfänger zum Aufrufer, weil das
 * Protokoll sie braucht: Ein Eintrag „Lager gelöscht“ beantwortet nicht,
 * **wessen** Zugriff endete.
 *
 * **Die Leerprüfung liegt mit drin**, nicht davor. Draußen wäre sie ein
 * Prüfen-dann-Handeln über zwei Verbindungen: Zählt sie null, während in einem
 * anderen Reiter gerade Material in dieses Lager geschrieben wird, verschwindet
 * das Lager unter der neuen Zeile. Es gibt keine Fremdschlüssel, die das
 * abfangen – das Material bliebe mit einer `lagerId` ins Nichts zurück,
 * unsichtbar in jeder Übersicht. `FOR UPDATE` auf der Lagerzeile hält den
 * Prüfzeitpunkt bis zum Löschen.
 *
 * `blockedBy` sagt dem Aufrufer, warum nichts geschah: `null` heißt gelöscht,
 * eine Zahl heißt „so viele Materialien liegen noch darin“.
 */
export async function deleteLager(
  userId: number,
  id: number
): Promise<{ revoked: number[]; blockedBy: number | null }> {
  return getDb().transaction(async tx => {
    const own = await tx
      .select({ id: lager.id })
      .from(lager)
      .where(and(eq(lager.id, id), eq(lager.userId, userId)))
      .limit(1)
      .for("update");
    if (own.length === 0) return { revoked: [], blockedBy: null };

    const used = await tx
      .select({ value: count() })
      .from(materials)
      .where(eq(materials.lagerId, id));
    const inside = Number(used.at(0)?.value ?? 0);
    if (inside > 0) return { revoked: [], blockedBy: inside };

    const removed = await tx
      .delete(lagerShares)
      .where(eq(lagerShares.lagerId, id))
      .returning({ sharedWithUserId: lagerShares.sharedWithUserId });
    await tx.delete(lager).where(eq(lager.id, id));
    return { revoked: removed.map(r => r.sharedWithUserId), blockedBy: null };
  });
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
/**
 * Belegung aller eigenen Lager auf einmal – für die Lager-Seite.
 *
 * Eine Abfrage statt einer je Lager, und eine Zahl statt des Bestands: Die Seite
 * braucht `MAX_LAGER_PER_USER` Ganzzahlen, nicht jedes Material mit Gebinde,
 * Drybox, Preset-Pfad und Wägungsverlauf.
 */
export async function countMaterialsByLager(
  userId: number
): Promise<Map<number, number>> {
  const rows = await getDb()
    .select({ lagerId: materials.lagerId, value: count() })
    .from(materials)
    .where(eq(materials.userId, userId))
    .groupBy(materials.lagerId);
  return new Map(rows.map(r => [r.lagerId, Number(r.value)]));
}

export async function countMaterialsInLager(id: number): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(materials)
    .where(eq(materials.lagerId, id));
  return Number(rows.at(0)?.value ?? 0);
}

/**
 * Gehört dieses Lager dem Benutzer? Gleiche Bauform wie
 * `containerTypeBelongsToUser` und `storageBoxBelongsToUser` in
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
