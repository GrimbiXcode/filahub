import { and, asc, eq, inArray, ne, or } from "drizzle-orm";
import type { OrganizationRole } from "@contracts/organizations";
import {
  lager,
  materials,
  containerTypes,
  organizationInvitations,
  organizationMembers,
  organizations,
  storageBoxes,
  weighings,
} from "@db/schema";
import { getDb, type DbTransaction } from "./connection";

/**
 * Organisationen: gemeinsamer Bestand mehrerer Personen.
 *
 * Die zweite Stelle nach den Freundes-Lesepfaden, an der die Mandantengrenze
 * absichtlich überschritten wird – und die weitreichendere: Ein Mitglied sieht
 * nicht eine gefilterte Projektion, sondern den Bestand selbst, und je nach
 * Stufe darf es ihn ändern. Entsprechend eng sind die Regeln.
 *
 * 1. **Die Mitgliedszeile allein gewährt den Zugriff.** Anders als bei einer
 *    Freigabe gibt es keine zweite Bedingung, die danebensteht. Ihr
 *    Verschwinden muss den Zugriff deshalb sofort beenden – geprüft wird bei
 *    **jedem** Aufruf und nicht einmalig beim Anmelden.
 * 2. **Eine `organizationId` aus einer Eingabe ist eine Behauptung**, bis sie
 *    gegen die Mitgliedschaft aufgelöst wurde. Keine Abfragefunktion nimmt sie
 *    ungeprüft an; sonst wäre die Prüfung eine Frage der Disziplin am
 *    Aufrufort. (Die Auflösung selbst, `resolveScope`, kommt mit dem nächsten
 *    Schritt hinzu.)
 * 3. **Es bleibt immer mindestens ein Administrator.** Eine Organisation ohne
 *    ist nicht mehr verwaltbar und niemand könnte das reparieren. Die einzige
 *    Ausnahme ist die Kontolöschung nach Art. 17 DSGVO – sie darf daran nicht
 *    scheitern, siehe `handleAdminAccountDeletion`.
 */

/** Mitgliedschaft samt Organisation – die Form, die `organization.list` liefert. */
export type Membership = {
  organizationId: number;
  name: string;
  role: OrganizationRole;
  joinedAt: Date;
};

/** Die Organisationen einer Person, alphabetisch. */
export async function listMemberships(userId: number): Promise<Membership[]> {
  const rows = await getDb()
    .select({
      organizationId: organizationMembers.organizationId,
      name: organizations.name,
      role: organizationMembers.role,
      joinedAt: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationMembers.organizationId)
    )
    .where(eq(organizationMembers.userId, userId))
    .orderBy(asc(organizations.name), asc(organizations.id));
  return rows;
}

/**
 * Einladungen, die diese Person betreffen – in **beiden** Richtungen.
 *
 * Für den Datenexport nach Art. 15 DSGVO: Eine Einladung, die sie ausgesprochen
 * hat, sagt ebenso etwas über sie aus wie eine, die sie bekommen hat.
 */
export async function listInvitationsForUser(userId: number) {
  return getDb()
    .select({
      id: organizationInvitations.id,
      organizationId: organizationInvitations.organizationId,
      organizationName: organizations.name,
      invitedUserId: organizationInvitations.invitedUserId,
      invitedByUserId: organizationInvitations.invitedByUserId,
      role: organizationInvitations.role,
      status: organizationInvitations.status,
      respondedAt: organizationInvitations.respondedAt,
      createdAt: organizationInvitations.createdAt,
    })
    .from(organizationInvitations)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationInvitations.organizationId)
    )
    .where(
      or(
        eq(organizationInvitations.invitedUserId, userId),
        eq(organizationInvitations.invitedByUserId, userId)
      )
    )
    .orderBy(asc(organizationInvitations.id));
}

/**
 * Löscht eine Organisation samt ihrem gesamten Bestand.
 *
 * **Die Reihenfolge ist Handarbeit und muss es bleiben** – das Schema kennt
 * keine Fremdschlüssel, es gibt also kein `ON DELETE CASCADE`, das hier etwas
 * abnähme. Dieselbe Falle wie in `deleteUserAccount`: Eine übrig gebliebene
 * `lagerId` oder `containerTypeId` zeigt später auf eine **neu vergebene** ID,
 * also auf den Bestand einer fremden Stelle.
 *
 * Erwartet eine laufende Transaktion, weil sie nie allein steht: Entweder
 * löscht ein Administrator die Organisation, oder die Kontolöschung räumt die
 * letzte auf, die niemanden mehr hat.
 */
export async function deleteOrganizationCascade(
  tx: DbTransaction,
  organizationId: number
): Promise<void> {
  // Wägungen hängen am Material und müssen vor ihm gehen.
  await tx
    .delete(weighings)
    .where(
      inArray(
        weighings.materialId,
        tx
          .select({ id: materials.id })
          .from(materials)
          .where(eq(materials.organizationId, organizationId))
      )
    );
  await tx
    .delete(materials)
    .where(eq(materials.organizationId, organizationId));
  /*
    Lager, Gebindearten und Dryboxen **nach** dem Material: Es zeigt auf alle
    drei. Freigaben (`lager_shares`) gibt es hier nicht – ein Lager einer
    Organisation lässt sich nicht an Freunde freigeben, und `setLagerShare`
    verlangt einen menschlichen Eigentümer.
  */
  await tx.delete(lager).where(eq(lager.organizationId, organizationId));
  await tx
    .delete(containerTypes)
    .where(eq(containerTypes.organizationId, organizationId));
  await tx
    .delete(storageBoxes)
    .where(eq(storageBoxes.organizationId, organizationId));

  await tx
    .delete(organizationInvitations)
    .where(eq(organizationInvitations.organizationId, organizationId));
  await tx
    .delete(organizationMembers)
    .where(eq(organizationMembers.organizationId, organizationId));
  await tx.delete(organizations).where(eq(organizations.id, organizationId));
}

/** Was die Kontolöschung mit einer Organisation gemacht hat. */
export type AdminSuccession =
  | { organizationId: number; outcome: "deleted" }
  | { organizationId: number; outcome: "promoted"; newAdminUserId: number };

/**
 * Räumt die Organisationen auf, in denen ein zu löschendes Konto der **letzte**
 * Administrator ist.
 *
 * Überall sonst verweigert die Anwendung den Schritt, der den letzten
 * Administrator entfernt. Hier darf sie es nicht: Ein Löschverlangen nach
 * Art. 17 DSGVO ist keine Bitte, und eine Organisation, die daran hängt, wäre
 * ein Grund, ihm nicht nachzukommen. Also wird entschieden statt abgelehnt:
 *
 * - **Es gibt weitere Mitglieder** → das am längsten dabei befindliche wird
 *   Administrator. Willkürlich ist das nicht: Wer am längsten dabei ist, kennt
 *   die Organisation am ehesten, und die Regel ist ohne Zusatzdaten
 *   entscheidbar. Bei gleichem Zeitstempel entscheidet die kleinere ID – es
 *   muss deterministisch sein, sonst hinge das Ergebnis an der Sortierung.
 * - **Es gibt keine weiteren** → die Organisation und ihr Bestand werden
 *   gelöscht. Sie stehen zu lassen hieße, Daten ohne jeden Zugang zu behalten.
 *
 * Organisationen, in denen noch ein anderer Administrator ist, kommen hier gar
 * nicht vor – dort genügt das Entfernen der Mitgliedschaft.
 *
 * Gibt zurück, was geschehen ist, damit der Aufrufer es protokollieren und die
 * Betroffenen benachrichtigen kann. Diese Funktion schreibt selbst **kein**
 * Audit-Log: Sie läuft in der Transaktion der Kontolöschung, und ein Eintrag,
 * der bei deren Abbruch mit zurückgerollt wird, wäre kein Protokoll.
 */
export async function handleAdminAccountDeletion(
  tx: DbTransaction,
  userId: number
): Promise<AdminSuccession[]> {
  const adminOf = await tx
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.role, "admin")
      )
    );

  const result: AdminSuccession[] = [];
  for (const { organizationId } of adminOf) {
    /*
      Alle Mitglieder außer dem ausscheidenden Konto, ältestes zuerst. Der
      zweite Sortierschlüssel ist kein Beiwerk: Zwei Beitritte in derselben
      Millisekunde sind selten, aber möglich, und ohne ihn entschiede die
      Sortierung der Datenbank, wer die Organisation erbt.
    */
    const remaining = await tx
      .select({
        id: organizationMembers.id,
        userId: organizationMembers.userId,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          ne(organizationMembers.userId, userId)
        )
      )
      .orderBy(asc(organizationMembers.createdAt), asc(organizationMembers.id));

    if (remaining.length === 0) {
      await deleteOrganizationCascade(tx, organizationId);
      result.push({ organizationId, outcome: "deleted" });
      continue;
    }

    // Ist schon jemand anderes Administrator, ist nichts zu tun.
    if (remaining.some(m => m.role === "admin")) continue;

    const successor = remaining[0];
    await tx
      .update(organizationMembers)
      .set({ role: "admin" })
      .where(eq(organizationMembers.id, successor.id));
    result.push({
      organizationId,
      outcome: "promoted",
      newAdminUserId: successor.userId,
    });
  }
  return result;
}
