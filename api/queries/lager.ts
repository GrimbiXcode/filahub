import { and, count, eq } from "drizzle-orm";
import type { MaterialKind } from "@contracts/materials";
import { lager, lagerShares, materials } from "@db/schema";
import { scopeOwner, scopeWhere, type Scope } from "../scope";
import { getDb } from "./connection";
import { hasChanges } from "./patch";

/**
 * Lager – die Ebene über den Materialien.
 *
 * Muster wie `api/queries/filament.ts`: Der Eigentümer steht in der
 * `where`-Klausel jeder Abfrage, es gibt keinen globalen Scope und keine
 * Fremdschlüssel.
 *
 * Seit 2.5.0 ist der Eigentümer **entweder** ein Mensch **oder** eine
 * Organisation, und jede Funktion nimmt dafür einen `Scope` an der Stelle, an
 * der bis 2.4.1 die `userId` stand. Übersetzt wird er an genau einer Stelle
 * (`scopeWhere` in `api/scope.ts`); wer ihn hat, hat die Mitgliedschaft und die
 * Stufe bereits geprüft. Freigaben an Freunde gibt es weiterhin nur für
 * persönliche Lager – sie liegen in `api/queries/friends.ts`; hier steht nur,
 * was beim **Löschen** mit ihnen geschieht.
 */

export function findLagerInScope(scope: Scope) {
  return getDb().query.lager.findMany({
    where: scopeWhere(lager, scope),
    orderBy: (t, { asc }) => [asc(t.name)],
  });
}

/** Ein Lager des Bereichs. `undefined`, wenn es nicht dazugehört. */
export function findLagerInScopeById(scope: Scope, id: number) {
  return getDb().query.lager.findFirst({
    where: and(eq(lager.id, id), scopeWhere(lager, scope)),
  });
}

/**
 * Fehler der beiden Unique-Indizes über den Namen.
 *
 * Ohne diese Umwandlung reicht tRPC die rohe Postgres-Meldung durch – es gibt
 * keinen `errorFormatter` –, und die Lager-Seite zeigt sie wörtlich in einem
 * Toast: `duplicate key value violates unique constraint …`. Ein doppelter Name
 * ist ein gewöhnlicher Bedienfehler und gehört als Konflikt beantwortet.
 *
 * **Zwei Namen seit 2.5.0**, weil der frühere `unique(userId, name)` durch zwei
 * partielle Indizes ersetzt ist (NULL-Werte sind in einem Unique-Index
 * voneinander verschieden, siehe `db/migrations/0014_organizations.sql`). Wer
 * hier nur den alten Namen prüft, bekommt im Org-Kontext wieder die rohe
 * Postgres-Meldung im Toast.
 */
export const LAGER_NAME_TAKEN = "LAGER_NAME_TAKEN";

const LAGER_NAME_INDEXES = [
  "lager_name_per_user_unique",
  "lager_name_per_organization_unique",
];

/**
 * Erkennt den Namenskonflikt am **Namen des verletzten Constraints**, nicht am
 * Meldungstext.
 *
 * Drizzle verpackt den Postgres-Fehler: Die äußere `message` nennt nur die
 * ausgeführte Anweisung, der Index steht am `cause`. Bis 2.4.1 fiel das nicht
 * auf, weil nur ein Test darauf stand, der jede Art von Fehler akzeptierte –
 * die Lager-Seite zeigte in Wahrheit die rohe Postgres-Meldung im Toast. Der
 * Meldungstext bleibt als zweiter Weg stehen, falls eine spätere
 * Drizzle-Fassung wieder durchreicht.
 */
function isDuplicateLagerName(error: unknown): boolean {
  const constraint = (error as { cause?: { constraint?: string } })?.cause
    ?.constraint;
  if (constraint && LAGER_NAME_INDEXES.includes(constraint)) return true;
  return (
    error instanceof Error &&
    LAGER_NAME_INDEXES.some(name => error.message.includes(name))
  );
}

export async function createLager(
  scope: Scope,
  data: {
    name: string;
    materialKind: MaterialKind;
    filamentDiameterUm?: number | null;
    notes?: string | null;
  }
) {
  let id: number;
  try {
    const [row] = await getDb()
      .insert(lager)
      // Der Eigentümer kommt aus dem Bereich, nie aus der Eingabe.
      .values({ ...data, ...scopeOwner(scope) })
      .returning({ id: lager.id });
    id = row.id;
  } catch (error) {
    if (isDuplicateLagerName(error))
      throw new Error(LAGER_NAME_TAKEN, { cause: error });
    throw error;
  }
  return findLagerInScopeById(scope, id);
}

export async function updateLager(
  scope: Scope,
  id: number,
  data: Partial<{
    name: string;
    materialKind: MaterialKind;
    filamentDiameterUm: number | null;
    notes: string | null;
  }>
) {
  try {
    if (hasChanges(data)) {
      await getDb()
        .update(lager)
        .set(data)
        .where(and(eq(lager.id, id), scopeWhere(lager, scope)));
    }
  } catch (error) {
    if (isDuplicateLagerName(error))
      throw new Error(LAGER_NAME_TAKEN, { cause: error });
    throw error;
  }
  /*
    Der Bereichsfilter gehört **auch** ans Rücklesen. Ohne ihn trifft das UPDATE
    keine Zeile, das `findFirst` aber die fremde – und ein Aufrufer, der dem
    Rückgabewert vertraut statt vorab zu prüfen, gibt Name und Notizen eines
    fremden Lagers heraus. Freitext, der einen Ort verraten kann.
  */
  return findLagerInScopeById(scope, id);
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
 * Bei einem Lager einer Organisation trifft der Freigabe-Schritt nie etwas – es
 * lässt sich nicht freigeben. Der Fall wird trotzdem **nicht** verzweigt: Eine
 * Kaskade, die je nach Bereich etwas anderes tut, ist die teurere Annahme als
 * ein `DELETE`, das null Zeilen trifft.
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
  scope: Scope,
  id: number
): Promise<{ revoked: number[]; blockedBy: number | null }> {
  return getDb().transaction(async tx => {
    const own = await tx
      .select({ id: lager.id })
      .from(lager)
      .where(and(eq(lager.id, id), scopeWhere(lager, scope)))
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
 * Wie viele Lager der Bereich schon hat – Grundlage der Obergrenze.
 *
 * `count()` und nicht das Laden aller Zeilen: Der Aufrufer braucht die Zahl,
 * nicht die Lager. Welche Grenze gilt, entscheidet der Aufrufer
 * (`MAX_LAGER_PER_USER` bzw. `MAX_LAGER_PER_ORGANIZATION`).
 */
export async function countLagerInScope(scope: Scope): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(lager)
    .where(scopeWhere(lager, scope));
  return Number(rows.at(0)?.value ?? 0);
}

/**
 * Belegung aller Lager des Bereichs auf einmal – für die Lager-Seite.
 *
 * Eine Abfrage statt einer je Lager, und eine Zahl statt des Bestands: Die Seite
 * braucht eine Handvoll Ganzzahlen, nicht jedes Material mit Gebinde, Drybox,
 * Preset-Pfad und Wägungsverlauf.
 */
export async function countMaterialsByLager(
  scope: Scope
): Promise<Map<number, number>> {
  const rows = await getDb()
    .select({ lagerId: materials.lagerId, value: count() })
    .from(materials)
    .where(scopeWhere(materials, scope))
    .groupBy(materials.lagerId);
  return new Map(rows.map(r => [r.lagerId, Number(r.value)]));
}

/**
 * Wie viele Materialien in diesem Lager liegen.
 *
 * Ohne Bereichsfilter: Der Aufrufer hat die Zugehörigkeit schon geprüft, und
 * gezählt werden muss **alles** darin, nicht nur ein Teil.
 */
export async function countMaterialsInLager(id: number): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(materials)
    .where(eq(materials.lagerId, id));
  return Number(rows.at(0)?.value ?? 0);
}

/**
 * Gehört dieses Lager zum Bereich? Gleiche Bauform wie `containerTypeInScope`
 * und `storageBoxInScope` in `api/queries/filament.ts`, damit
 * `validateForeignKeys` einheitlich prüft.
 */
export async function lagerInScope(scope: Scope, id: number) {
  const rows = await getDb()
    .select({ id: lager.id })
    .from(lager)
    .where(and(eq(lager.id, id), scopeWhere(lager, scope)))
    .limit(1);
  return rows.length > 0;
}

/**
 * Welcher Organisation gehört dieses Lager – oder `null`, wenn einer Person
 * oder wenn es das Lager nicht gibt.
 *
 * Ohne Bereichsfilter, und das ist hier der Punkt: Gefragt wird nicht „darf ich
 * darauf zugreifen“, sondern „was für ein Lager ist das“. Gebraucht wird es an
 * genau einer Stelle – dem Riegel in `friendRouter.setLagerVisibility`, der
 * eine verständliche Meldung geben soll statt „nicht gefunden“.
 *
 * **Geliefert wird die ID und kein `boolean`**, weil der Aufrufer sie braucht:
 * Die verständliche Meldung darf nur bekommen, wer die Organisation ohnehin
 * kennt. Ein bloßes Ja/Nein zwänge ihn, sie allen zu geben – und damit jedem
 * zu verraten, welche Lager-IDs es gibt und welche davon einer Organisation
 * gehören.
 */
export async function organizationOfLager(id: number): Promise<number | null> {
  const rows = await getDb()
    .select({ organizationId: lager.organizationId })
    .from(lager)
    .where(eq(lager.id, id))
    .limit(1);
  return rows.at(0)?.organizationId ?? null;
}
