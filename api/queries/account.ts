import { and, eq, inArray, ne } from "drizzle-orm";
import {
  ACCOUNT_EXPORT_VERSION,
  type AccountExportSection,
} from "@contracts/account";
import * as schema from "@db/schema";
import { getDb } from "./connection";

/**
 * Betroffenenrechte: Auskunft, Datenübertragbarkeit und Löschung.
 *
 * Art. 15, 17 und 20 DSGVO bzw. Art. 25, 28 und 32 revDSG. Beides muss ohne
 * Zutun des Betreibers funktionieren – eine Auskunft von Hand aus der Datenbank
 * zu klauben ist fehleranfällig und hält die Monatsfrist nicht zuverlässig ein.
 */

export type AccountExport = {
  formatVersion: number;
  exportedAt: string;
} & Record<AccountExportSection, unknown>;

/**
 * Trägt alle Daten zusammen, die an einem Konto hängen.
 *
 * Die Reihenfolge der Abschnitte entspricht `ACCOUNT_EXPORT_SECTIONS`; der
 * Integrationstest hält beides deckungsgleich.
 */
export async function exportUserData(userId: number): Promise<AccountExport> {
  const db = getDb();

  const profile = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  if (!profile) {
    throw new Error(`Benutzer ${userId} existiert nicht`);
  }

  const materials = await db.query.materials.findMany({
    where: eq(schema.materials.userId, userId),
  });

  /*
    Wägungen hängen am Material, nicht am Benutzer. Ohne eigene Rollen gibt es
    auch keine Wägungen – die leere `inArray`-Liste würde Drizzle sonst zu
    `in ()` machen, was Postgres ablehnt.
  */
  const materialIds = materials.map(m => m.id);
  const weighings =
    materialIds.length === 0
      ? []
      : await db.query.weighings.findMany({
          where: inArray(schema.weighings.materialId, materialIds),
        });

  const [spoolTypes, storageBoxes, hiddenSpoolPresets, presetProposals] =
    await Promise.all([
      db.query.spoolTypes.findMany({
        where: eq(schema.spoolTypes.userId, userId),
      }),
      db.query.storageBoxes.findMany({
        where: eq(schema.storageBoxes.userId, userId),
      }),
      db.query.hiddenSpoolPresets.findMany({
        where: eq(schema.hiddenSpoolPresets.userId, userId),
      }),
      db.query.presetProposals.findMany({
        where: eq(schema.presetProposals.userId, userId),
      }),
    ]);

  /*
    Login-Codes hängen an der Telegram-ID, nicht am Benutzerdatensatz. Sie
    gehören trotzdem in die Auskunft: Sie tragen Telegram-Name und -Benutzername
    und sind damit Daten über diese Person.
  */
  const loginCodes = await db.query.loginCodes.findMany({
    where: eq(schema.loginCodes.telegramId, profile.unionId),
  });

  /*
    Sicherheitsprotokoll, soweit es diese Person betrifft. Ohne `ipHash`:
    Der Wert ist für die betroffene Person wertlos und würde nur einem
    Dritten helfen, der den Export in die Hände bekommt.
  */
  const auditLog = await db
    .select({
      at: schema.auditLog.at,
      event: schema.auditLog.event,
      detail: schema.auditLog.detail,
    })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.actorUserId, userId))
    .orderBy(schema.auditLog.at);

  return {
    formatVersion: ACCOUNT_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    profile,
    materials,
    weighings,
    spoolTypes,
    storageBoxes,
    hiddenSpoolPresets,
    presetProposals,
    loginCodes,
    auditLog,
  };
}

export type AccountDeletionResult = {
  /** Angenommene Vorschläge, die anonymisiert statt gelöscht wurden. */
  anonymizedProposals: number;
};

/**
 * Löscht ein Konto mitsamt allem, was daran hängt.
 *
 * Das Schema kennt **keine** Fremdschlüssel – es gibt also kein `ON DELETE
 * CASCADE`, das hier etwas abnehmen würde. Die Reihenfolge unten ist Handarbeit
 * und muss es bleiben; alles läuft in einer Transaktion, damit ein Fehler in der
 * Mitte kein halb gelöschtes Konto hinterlässt.
 *
 * Zwei Feinheiten, die leicht übersehen werden:
 *
 *  - `preset_proposals.sourceSpoolTypeId` muss gelöst werden, **bevor** die
 *    Rollentypen verschwinden – sonst zeigt die Spalte mangels Fremdschlüssel
 *    stillschweigend auf eine später neu vergebene ID.
 *  - Die globalen Katalogtabellen werden **nicht** angefasst. Sie haben keine
 *    `userId` und damit keinen Personenbezug; würde man sie mitlöschen, zeigten
 *    die `materials.spoolPresetVariantId` anderer Benutzer ins Leere.
 */
export async function deleteUserAccount(
  userId: number
): Promise<AccountDeletionResult> {
  const db = getDb();

  return db.transaction(async tx => {
    const user = await tx.query.users.findFirst({
      where: eq(schema.users.id, userId),
      columns: { id: true, unionId: true },
    });
    if (!user) {
      throw new Error(`Benutzer ${userId} existiert nicht`);
    }

    // 1. Verweise auf eigene Rollentypen lösen, bevor diese gelöscht werden
    await tx
      .update(schema.presetProposals)
      .set({ sourceSpoolTypeId: null })
      .where(eq(schema.presetProposals.userId, userId));

    // 2. Wägungen der eigenen Rollen
    await tx
      .delete(schema.weighings)
      .where(
        inArray(
          schema.weighings.materialId,
          tx
            .select({ id: schema.materials.id })
            .from(schema.materials)
            .where(eq(schema.materials.userId, userId))
        )
      );

    // 3.–6. Eigener Bestand
    await tx
      .delete(schema.materials)
      .where(eq(schema.materials.userId, userId));
    await tx
      .delete(schema.hiddenSpoolPresets)
      .where(eq(schema.hiddenSpoolPresets.userId, userId));
    await tx
      .delete(schema.spoolTypes)
      .where(eq(schema.spoolTypes.userId, userId));
    await tx
      .delete(schema.storageBoxes)
      .where(eq(schema.storageBoxes.userId, userId));

    /*
      7. Offene, abgelehnte und zurückgezogene Vorschläge verschwinden ganz –
         sie haben nichts im Katalog hinterlassen.
    */
    await tx
      .delete(schema.presetProposals)
      .where(
        and(
          eq(schema.presetProposals.userId, userId),
          ne(schema.presetProposals.status, "approved")
        )
      );

    /*
      8. Angenommene Vorschläge bleiben als Moderationsnachweis stehen, aber
         ohne Einreicher und ohne dessen Freitext-Begründung. Der daraus
         entstandene Katalogeintrag (`resultId`) bleibt unberührt – er ist
         globales Gemeingut und trägt keinen Personenbezug mehr.
    */
    const anonymized = await tx
      .update(schema.presetProposals)
      .set({ userId: null, comment: null })
      .where(
        and(
          eq(schema.presetProposals.userId, userId),
          eq(schema.presetProposals.status, "approved")
        )
      )
      .returning({ id: schema.presetProposals.id });

    // 9. War die Person Moderator, bleibt die Entscheidung, nicht der Name
    await tx
      .update(schema.presetProposals)
      .set({ reviewedBy: null })
      .where(eq(schema.presetProposals.reviewedBy, userId));

    // 10. Login-Codes hängen an der Telegram-ID
    await tx
      .delete(schema.loginCodes)
      .where(eq(schema.loginCodes.telegramId, user.unionId));

    /*
      11. Sicherheitsprotokoll anonymisieren, nicht löschen.

      Würden die Einträge mitgelöscht, wäre die Vorfallaufklärung mit einem
      Klick auszuhebeln: Wer sich unbefugt Zugang verschafft hat, löscht das
      Konto und damit die eigenen Spuren. Was bleibt, ist der Ablauf – Zeit,
      Ereignis, gehashte Adresse –, nicht die Person. Nach der
      Aufbewahrungsfrist von 90 Tagen verschwinden auch diese Zeilen
      (siehe api/queries/audit.ts).

      Gedeckt über Art. 17 Abs. 3 lit. b/e DSGVO; die Datenschutzerklärung
      benennt es.
    */
    await tx
      .update(schema.auditLog)
      .set({ actorUserId: null, telegramId: null })
      .where(eq(schema.auditLog.actorUserId, userId));
    await tx
      .update(schema.auditLog)
      .set({ subjectUserId: null })
      .where(eq(schema.auditLog.subjectUserId, userId));

    // 12. Zuletzt das Konto selbst
    await tx.delete(schema.users).where(eq(schema.users.id, userId));

    return { anonymizedProposals: anonymized.length };
  });
}
