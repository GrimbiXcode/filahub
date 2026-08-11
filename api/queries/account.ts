import { and, eq, inArray, ne, or } from "drizzle-orm";
import {
  ACCOUNT_EXPORT_VERSION,
  type AccountExportSection,
} from "@contracts/account";
import { visibilityAllows, type FriendVisibility } from "@contracts/friends";
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

  const lager = await db.query.lager.findMany({
    where: eq(schema.lager.userId, userId),
  });

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

  const [
    containerTypes,
    storageBoxes,
    hiddenContainerPresets,
    presetProposals,
  ] = await Promise.all([
    db.query.containerTypes.findMany({
      where: eq(schema.containerTypes.userId, userId),
    }),
    db.query.storageBoxes.findMany({
      where: eq(schema.storageBoxes.userId, userId),
    }),
    db.query.hiddenContainerPresets.findMany({
      where: eq(schema.hiddenContainerPresets.userId, userId),
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
    Freundschaften und Ausleih-Vorgänge, jeweils in **beiden** Richtungen: Eine
    Freundschaft betrifft die Person auch dann, wenn die Anfrage von der anderen
    Seite kam.

    Mitgeliefert wird der Anzeigename der Gegenseite. Das ist eine bewusste
    Entscheidung und der Gegenfall zum `ipHash` unten: Dort hilft der Wert nur
    einem Dritten, hier hilft er der betroffenen Person – ohne den Namen wäre
    die Zeile eine sinnlose Zahlenkolonne, und aus der Oberfläche kennt sie ihn
    ohnehin. Begründet in COMPLIANCE.md, Abschnitt „Decisions on record“.
  */
  const [friendshipRows, loanRows] = await Promise.all([
    db
      .select()
      .from(schema.friendships)
      .where(
        or(
          eq(schema.friendships.userId, userId),
          eq(schema.friendships.friendUserId, userId)
        )
      ),
    db
      .select()
      .from(schema.loanRequests)
      .where(
        or(
          eq(schema.loanRequests.userId, userId),
          eq(schema.loanRequests.ownerUserId, userId)
        )
      ),
  ]);

  const counterpartIds = [
    ...friendshipRows.flatMap(r => [r.userId, r.friendUserId]),
    ...loanRows.flatMap(r => [r.userId, r.ownerUserId]),
  ].filter(id => id !== userId);
  const counterpartNames = await loadCounterpartNames(counterpartIds);

  const friendships = friendshipRows.map(row => ({
    ...row,
    counterpartName:
      counterpartNames.get(
        row.userId === userId ? row.friendUserId : row.userId
      ) ?? null,
  }));
  const loanRequests = loanRows.map(row => ({
    ...row,
    counterpartName:
      counterpartNames.get(
        row.userId === userId ? row.ownerUserId : row.userId
      ) ?? null,
  }));

  /*
    Freigaben von Lagern, ebenfalls in beiden Richtungen: die erteilten (ein
    Lager dieser Person, freigegeben an jemanden) und die bekommenen (ein
    fremdes Lager, freigegeben an diese Person). `direction` steht dabei, weil
    die Zeile allein es nicht sagt – der Eigentümer steht am Lager, nicht an der
    Freigabe, und ohne die Angabe müsste die betroffene Person `lagerId` gegen
    den Abschnitt `lager` prüfen, um die eigenen von den fremden zu trennen.

    Bei den erteilten Freigaben steht der Name des Empfängers dabei, aus
    demselben Grund wie bei den Freundschaften. Bei den bekommenen nicht: Diese
    Person kennt den Namen aus der Freundesliste ohnehin, und der Bezug ist die
    Freundschaft, nicht die Freigabe.

    **Die bekommenen sind verdichtet**, genau wie in `loadReceivedShares`: eine
    Zeile je Besitzer mit der höchsten Stufe, ohne Lager-Kennungen und ohne
    Zeitstempel je Lager. Die Rohzeilen herauszugeben hieße, über die Auskunft
    dieselbe Auskunft zu erteilen, die der Freundes-Lesepfad verweigert – wie
    viele Lager der Freund hat, welche davon er einzeln freigibt und wann er das
    geändert hat. Das ist sein Bestand, nicht der dieser Person; was sie betrifft,
    ist die Stufe, die für sie gilt.
  */
  const ownLagerIds = lager.map(l => l.id);
  const [grantedShares, receivedRows] = await Promise.all([
    ownLagerIds.length === 0
      ? []
      : db
          .select()
          .from(schema.lagerShares)
          .where(inArray(schema.lagerShares.lagerId, ownLagerIds)),
    db
      .select({
        ownerId: schema.lager.userId,
        visibility: schema.lagerShares.visibility,
      })
      .from(schema.lagerShares)
      .innerJoin(schema.lager, eq(schema.lager.id, schema.lagerShares.lagerId))
      .where(eq(schema.lagerShares.sharedWithUserId, userId)),
  ]);
  const shareRecipientNames = await loadCounterpartNames(
    grantedShares.map(r => r.sharedWithUserId)
  );
  const receivedByOwner = new Map<number, FriendVisibility>();
  for (const row of receivedRows) {
    const current = receivedByOwner.get(row.ownerId);
    if (current == null || visibilityAllows(row.visibility, current))
      receivedByOwner.set(row.ownerId, row.visibility);
  }
  const lagerShares = [
    ...grantedShares.map(row => ({
      ...row,
      direction: "granted" as const,
      counterpartName: shareRecipientNames.get(row.sharedWithUserId) ?? null,
    })),
    ...[...receivedByOwner].map(([ownerId, visibility]) => ({
      direction: "received" as const,
      ownerUserId: ownerId,
      visibility,
      counterpartName: null,
    })),
  ];

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
    lager,
    materials,
    weighings,
    containerTypes,
    storageBoxes,
    hiddenContainerPresets,
    presetProposals,
    loginCodes,
    friendships,
    lagerShares,
    loanRequests,
    auditLog,
  };
}

/** Anzeigenamen der Gegenseiten. `users.name` ist nullable. */
async function loadCounterpartNames(
  ids: number[]
): Promise<Map<number, string | null>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await getDb()
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(inArray(schema.users.id, unique));
  return new Map(rows.map(r => [r.id, r.name]));
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
 *  - `preset_proposals.sourceContainerTypeId` muss gelöst werden, **bevor** die
 *    Rollentypen verschwinden – sonst zeigt die Spalte mangels Fremdschlüssel
 *    stillschweigend auf eine später neu vergebene ID.
 *  - Die globalen Katalogtabellen werden **nicht** angefasst. Sie haben keine
 *    `userId` und damit keinen Personenbezug; würde man sie mitlöschen, zeigten
 *    die `materials.containerPresetVariantId` anderer Benutzer ins Leere.
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
      .set({ sourceContainerTypeId: null })
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
    /*
      Freigaben in **beiden** Richtungen, und zwar **vor** den Lagern: die
      erteilten (die Unterabfrage liest die Lagerzeilen, die es gleich nicht
      mehr gibt) und die bekommenen. Eine übrig gebliebene `lagerId` oder
      `sharedWithUserId` zeigte mangels Fremdschlüssel später auf eine neu
      vergebene ID – jemand sähe einen fremden Bestand, ohne dass ihn je jemand
      freigegeben hat. Dieselbe Falle wie bei `materials.lagerId` unten, nur
      folgenschwerer.
    */
    await tx
      .delete(schema.lagerShares)
      .where(
        or(
          eq(schema.lagerShares.sharedWithUserId, userId),
          inArray(
            schema.lagerShares.lagerId,
            tx
              .select({ id: schema.lager.id })
              .from(schema.lager)
              .where(eq(schema.lager.userId, userId))
          )
        )
      );
    /*
      Lager **nach** den Materialien: Ein `materials.lagerId` zeigt mangels
      Fremdschlüssel sonst auf eine später neu vergebene Lager-ID – also auf den
      Bestand eines fremden Menschen. Dieselbe Falle behandelt Schritt 1 für
      `preset_proposals.sourceContainerTypeId`.
    */
    await tx.delete(schema.lager).where(eq(schema.lager.userId, userId));
    await tx
      .delete(schema.hiddenContainerPresets)
      .where(eq(schema.hiddenContainerPresets.userId, userId));
    await tx
      .delete(schema.containerTypes)
      .where(eq(schema.containerTypes.userId, userId));
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
      10a. Freundschaften und Ausleih-Vorgänge, jeweils in **beiden**
           Richtungen.

      Die zweite Richtung ist der leicht zu übersehende Teil (Vorbild: der
      `reviewedBy`-Schritt weiter unten). Ohne sie blieben Zeilen stehen, in
      denen dieses Konto die Gegenseite war – und die zeigten mangels
      Fremdschlüssel später auf eine neu vergebene ID, also auf einen
      fremden Menschen. Dieselbe Falle behandelt Schritt 1.

      Anders als angenommene Preset-Vorschläge bleibt hier nichts als Nachweis
      stehen: Es gibt keinen Moderationszweck, der das trüge. Beim Freund
      verschwindet damit auch seine Seite des Vorgangs – unvermeidlich, die
      Zeile ist gemeinsames Datum beider Personen.
    */
    await tx
      .delete(schema.friendships)
      .where(
        or(
          eq(schema.friendships.userId, userId),
          eq(schema.friendships.friendUserId, userId)
        )
      );
    await tx
      .delete(schema.loanRequests)
      .where(
        or(
          eq(schema.loanRequests.userId, userId),
          eq(schema.loanRequests.ownerUserId, userId)
        )
      );

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
