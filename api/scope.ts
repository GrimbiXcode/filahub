import { TRPCError } from "@trpc/server";
import { sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { roleAllows, type OrganizationRole } from "@contracts/organizations";
import { findMembership } from "./queries/organizations";

/**
 * Der Bereich, in dem eine Anfrage arbeitet: der persönliche Bestand oder der
 * einer Organisation.
 *
 * Das Gegenstück zu `resolveShare` bei den Freunden, und die zweite Stelle, an
 * der die Mandantengrenze absichtlich überschritten wird. Drei Regeln tragen
 * das Ganze:
 *
 * 1. **Ein `Scope` entsteht ausschließlich aus `resolveScope`.** Der Wert ist
 *    kein Datentransport, sondern ein Nachweis: Wer einen hat, hat die
 *    Mitgliedschaft und die Stufe geprüft. Deshalb nimmt keine Abfragefunktion
 *    eine `organizationId` entgegen – sonst wäre die Prüfung eine Frage der
 *    Disziplin am Aufrufort.
 * 2. **Jede Abfragefunktion nimmt den `Scope` als ersten Parameter**, genau an
 *    der Stelle, an der bis 2.4.1 die `userId` stand. Wer die Auflösung
 *    vergisst, bekommt einen Compile-Fehler statt einer offenen Abfrage.
 * 3. **Die Stufenprüfung steht hier und nicht im SQL.** Wanderte sie dorthin,
 *    behielte eine entzogene Rolle ihren Zugriff, und kein Test, der nur die
 *    Abfrage betrachtet, bemerkte es. Dieselbe Begründung wie beim
 *    Freundschaftsstatus in `resolveShare` (`api/queries/friends.ts`).
 *
 * Hier und nicht in `api/queries/`, weil `resolveScope` `TRPCError` wirft: Der
 * Abfrage-Layer kennt tRPC nicht und soll es nicht kennen.
 */
export type Scope =
  | { kind: "personal"; userId: number }
  | { kind: "organization"; organizationId: number; role: OrganizationRole };

/**
 * Das Eingabefeld, das **jede** bereichsbezogene Prozedur trägt.
 *
 * `nullable()` und bewusst **nicht** `optional()`: `{ organizationId: undefined }`
 * und `{}` fallen im Cache von TanStack Query auf denselben Schlüssel. Genau
 * diese Falle ist in `src/pages/Home.tsx` für `lagerId` dokumentiert – sie ließ
 * dort die Daten eines anderen Lagers stehen. Ein Feld, das immer mitkommt,
 * kann das nicht.
 */
export const scopeInput = z.object({
  /** `null` = persönlicher Bereich */
  organizationId: z.number().int().positive().nullable(),
});

/**
 * Löst den gewünschten Bereich auf und prüft die Mindeststufe.
 *
 * Der persönliche Bereich ist immer erlaubt; `required` spielt dort keine Rolle,
 * weil man im eigenen Bestand alles darf. Für eine Organisation entscheidet die
 * Mitgliedszeile – bei **jedem** Aufruf neu und nicht einmalig beim Anmelden:
 * Anders als eine Freigabe hat die Mitgliedschaft keine zweite Bedingung neben
 * sich, ihr Verschwinden muss den Zugriff also sofort beenden.
 *
 * **Die beiden Fehlerfälle sind verschieden, und das ist Absicht:**
 *
 * - Wer **kein Mitglied** ist, bekommt `NOT_FOUND`. Die Existenz einer fremden
 *   Organisation geht ihn nichts an – dieselbe Regel wie bei fremden Zeilen
 *   überall im Projekt.
 * - Wer Mitglied ist, aber die **Stufe nicht reicht**, bekommt `FORBIDDEN`. Er
 *   kennt die Organisation ohnehin; „nicht gefunden“ wäre hier eine Lüge, die
 *   beim Suchen des Fehlers Zeit kostet und nichts schützt.
 */
export async function resolveScope(
  viewerId: number,
  organizationId: number | null,
  required: OrganizationRole
): Promise<Scope> {
  if (organizationId == null) return { kind: "personal", userId: viewerId };

  const role = await findMembership(viewerId, organizationId);
  if (!role) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Organisation nicht gefunden",
    });
  }
  if (!roleAllows(role, required)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Dafür reichen deine Rechte in dieser Organisation nicht.",
    });
  }
  return { kind: "organization", organizationId, role };
}

/** Die beiden Eigentümerspalten, wie sie auf allen vier Fachtabellen heißen. */
type OwnedTable = { userId: PgColumn; organizationId: PgColumn };

/**
 * Die **einzige** Stelle, die einen Bereich in eine `where`-Bedingung übersetzt.
 *
 * Die jeweils zweite Bedingung (`organizationId IS NULL` bzw. `userId IS NULL`)
 * ist durch den XOR-Check in der Datenbank redundant – und genau deshalb billig.
 * Dieselbe Erwägung wie beim `materials.userId`-Filter im Suchpfad der Freunde:
 * Sie macht eine verletzte Zusicherung unerreichbar statt bloß unwahrscheinlich.
 *
 * Gebaut mit `sql` statt mit `and(eq(…), isNull(…))`, obwohl das die
 * naheliegendere Schreibweise wäre: `and()` ist als `SQL | undefined` typisiert,
 * und `undefined` heißt bei Drizzle **keine** `where`-Bedingung – also ein
 * Vollzugriff über alle Bereiche hinweg. Der Rückgabetyp müsste diese
 * Möglichkeit dann entweder weiterreichen oder mit `!` wegbehaupten. An der
 * Stelle, die die Mandantengrenze zieht, ist beides zu viel verlangt.
 */
export function scopeWhere(table: OwnedTable, scope: Scope): SQL {
  return scope.kind === "personal"
    ? sql`${table.userId} = ${scope.userId} AND ${table.organizationId} IS NULL`
    : sql`${table.organizationId} = ${scope.organizationId} AND ${table.userId} IS NULL`;
}

/**
 * Das Gegenstück beim Einfügen: setzt genau eine der beiden Spalten.
 *
 * Immer beide Felder, auch das leere. Würde nur das gesetzte zurückgegeben,
 * ließe ein `{ ...alteWerte, ...scopeOwner(scope) }` den alten Eigentümer
 * stehen – und die Zeile gehörte beiden.
 */
export function scopeOwner(scope: Scope): {
  userId: number | null;
  organizationId: number | null;
} {
  return scope.kind === "personal"
    ? { userId: scope.userId, organizationId: null }
    : { userId: null, organizationId: scope.organizationId };
}

/** Kurzform für die Stellen, die nur wissen wollen, ob sie eine Org bedienen. */
export function scopeOrganizationId(scope: Scope): number | null {
  return scope.kind === "organization" ? scope.organizationId : null;
}
