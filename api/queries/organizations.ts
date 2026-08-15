import { randomInt } from "node:crypto";
import { and, asc, count, eq, inArray, ne, or } from "drizzle-orm";
import { CODE_ALPHABET, CODE_LENGTH, formatCode } from "@contracts/codes";
import {
  JOIN_CODE_PREFIX,
  isJoinCode,
  type JoinRole,
  type OrganizationRole,
} from "@contracts/organizations";
import {
  lager,
  materials,
  containerTypes,
  customColors,
  customTextures,
  organizationInvitations,
  organizationMembers,
  organizations,
  storageBoxes,
  users,
  weighings,
  type Organization,
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

/**
 * Die Stufe einer Person in **einer** Organisation, oder `undefined`.
 *
 * Der Kern von `resolveScope` (`api/scope.ts`) und damit die meistgerufene
 * Abfrage des Features: Sie läuft bei jedem bereichsbezogenen Aufruf. Deshalb
 * nur die eine Spalte und ein `limit(1)` – der Aufrufer braucht die Stufe, nicht
 * die Zeile.
 *
 * Bewusst ohne Zwischenspeicher. Eine entzogene Rolle muss sofort wirken, und
 * ein Cache wäre genau der Ort, an dem sie es fünf Minuten lang nicht täte.
 */
export async function findMembership(
  userId: number,
  organizationId: number
): Promise<OrganizationRole | undefined> {
  const rows = await getDb()
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, organizationId)
      )
    )
    .limit(1);
  return rows.at(0)?.role;
}

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
  /*
    Eigene Farben und Oberflächen der Organisation. Sie zählen bewusst **nicht**
    zum „ist die Organisation leer?“ in `deleteOrganizationIfEmpty`: Sie sind
    Darstellung und kein Bestand, und eine hinterlegte Farbe soll das Löschen
    einer ansonsten leeren Organisation nicht blockieren.
  */
  await tx
    .delete(customColors)
    .where(eq(customColors.organizationId, organizationId));
  await tx
    .delete(customTextures)
    .where(eq(customTextures.organizationId, organizationId));

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

// ---------------------------------------------------------------------------
// Anlegen, Ändern, Löschen
// ---------------------------------------------------------------------------

/**
 * Legt eine Organisation an und macht die gründende Person zu ihrem ersten
 * Administrator.
 *
 * Beides in **einer** Transaktion: Bräche es dazwischen ab, stünde eine
 * Organisation ohne jedes Mitglied da – niemand könnte sie verwalten und
 * niemand sie löschen.
 */
export async function createOrganization(
  founderUserId: number,
  name: string
): Promise<Organization> {
  return getDb().transaction(async tx => {
    const [org] = await tx.insert(organizations).values({ name }).returning();
    await tx
      .insert(organizationMembers)
      .values({ organizationId: org.id, userId: founderUserId, role: "admin" });
    return org;
  });
}

/**
 * In wie vielen Organisationen diese Person Administrator ist – Grundlage von
 * `MAX_ORGANIZATIONS_PER_USER`.
 *
 * Gezählt wird die **Verwaltungsstufe** und nicht „selbst gegründet“: Ein
 * Gründerfeld gäbe es nur als Spalte an `organizations`, und die bleibt
 * bewusst frei von Personenbezug (siehe den Kommentar an der Tabelle). Für den
 * Zweck der Grenze – zu verhindern, dass ein Konto beliebig viele
 * Organisationen anlegt – ist die Stufe das richtige Maß.
 */
export async function countAdminOrganizations(userId: number): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.role, "admin")
      )
    );
  return Number(rows.at(0)?.value ?? 0);
}

export function findOrganization(id: number) {
  return getDb().query.organizations.findFirst({
    where: eq(organizations.id, id),
  });
}

export async function updateOrganization(
  id: number,
  data: Partial<{ name: string; joinRole: JoinRole; notes: string | null }>
) {
  await getDb().update(organizations).set(data).where(eq(organizations.id, id));
  return findOrganization(id);
}

/**
 * Löscht eine Organisation – aber nur, wenn sie **leer** ist.
 *
 * Dieselbe Regel wie beim Lager und bei der Drybox: Wer löscht, soll nicht
 * nebenbei Bestand mitreißen, den er gerade nicht vor Augen hat. Der Weg über
 * `deleteOrganizationCascade` bleibt der Kontolöschung vorbehalten, die nicht
 * scheitern darf.
 *
 * Gezählt wird **in** der Transaktion, nicht davor: Sonst könnte zwischen
 * Zählen und Löschen ein Lager hineinwandern.
 *
 * Gezählt werden **alle drei** Bestandstabellen, nicht nur die Lager. Bis 2.5.0
 * stand hier allein `lager` – und `deleteOrganizationCascade` riss danach
 * Gebindearten und Dryboxen mit, die niemand gesehen hatte. Genau der Fall, den
 * die Regel oben ausschließen soll: Eine Organisation ohne Lager, aber mit
 * gepflegten Gebindearten galt als „leer“. Material braucht ein Lager und ist
 * damit mitgezählt.
 */
export async function deleteOrganizationIfEmpty(
  id: number
): Promise<{ blockedBy: number | null }> {
  return getDb().transaction(async tx => {
    const lagerRows = await tx
      .select({ value: count() })
      .from(lager)
      .where(eq(lager.organizationId, id));
    const containerRows = await tx
      .select({ value: count() })
      .from(containerTypes)
      .where(eq(containerTypes.organizationId, id));
    const boxRows = await tx
      .select({ value: count() })
      .from(storageBoxes)
      .where(eq(storageBoxes.organizationId, id));
    const inside =
      Number(lagerRows.at(0)?.value ?? 0) +
      Number(containerRows.at(0)?.value ?? 0) +
      Number(boxRows.at(0)?.value ?? 0);
    if (inside > 0) return { blockedBy: inside };
    await deleteOrganizationCascade(tx, id);
    return { blockedBy: null };
  });
}

// ---------------------------------------------------------------------------
// Mitglieder
// ---------------------------------------------------------------------------

export type MemberEntry = {
  userId: number;
  name: string | null;
  telegramUsername: string | null;
  role: OrganizationRole;
  joinedAt: Date;
};

/**
 * Die Mitglieder einer Organisation, ältestes zuerst.
 *
 * Mitgeliefert werden Anzeigename und Telegram-Benutzername – dieselben Felder
 * wie in der Freundesliste. Dass Mitglieder einander sehen, ist eine
 * Offenlegung an Dritte und steht so in `PRIVACY.md`; ohne sie wäre die
 * Mitgliederverwaltung eine Liste nackter Zahlen.
 */
export async function listMembers(
  organizationId: number
): Promise<MemberEntry[]> {
  return getDb()
    .select({
      userId: organizationMembers.userId,
      name: users.name,
      telegramUsername: users.telegramUsername,
      role: organizationMembers.role,
      joinedAt: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, organizationId))
    .orderBy(asc(organizationMembers.createdAt), asc(organizationMembers.id));
}

/** Warum ein Mitgliederschritt nicht ging – oder `null`, wenn er ging. */
export type MemberBlock = "last_admin" | "full" | "not_a_member" | "duplicate";

const MEMBER_UNIQUE = "organization_members_unique";

/**
 * Erkennt den Doppel-Beitritt am **Namen des verletzten Constraints**.
 *
 * Dieselbe Begründung wie bei `isDuplicateLagerName` (`queries/lager.ts`):
 * Drizzle verpackt den Postgres-Fehler, der Index steht am `cause`. Ein bloßes
 * `catch {}` hätte hier jeden Fehler zu „ist bereits Mitglied“ erklärt – auch
 * eine abgerissene Verbindung –, und der Beitretende suchte den Fehler dann an
 * der falschen Stelle.
 */
function isDuplicateMember(error: unknown): boolean {
  const constraint = (error as { cause?: { constraint?: string } })?.cause
    ?.constraint;
  if (constraint === MEMBER_UNIQUE) return true;
  return error instanceof Error && error.message.includes(MEMBER_UNIQUE);
}

/**
 * Nimmt jemanden auf.
 *
 * Die Obergrenze wird **in** der Transaktion geprüft, zusammen mit dem
 * Einfügen: Der offene Beitrittscode ist die einzige Stelle, an der jemand ohne
 * Zutun eines Verwalters hinzukommt, und dort ist gleichzeitiges Beitreten
 * nicht bloß theoretisch.
 *
 * Gezählt wird über die **gesperrten** Zeilen (`FOR UPDATE`) und nicht per
 * `count()`, aus demselben Grund wie in `changeMembership`: Zwei gleichzeitige
 * Beitritte über denselben Code läsen sonst beide denselben Stand und kämen
 * beide durch. Die Sperre greift, weil jede Organisation mindestens eine
 * Mitgliedszeile hat – die des Gründers.
 */
async function addMemberTx(
  tx: DbTransaction,
  organizationId: number,
  userId: number,
  role: OrganizationRole,
  maxMembers: number
): Promise<MemberBlock | null> {
  const existing = await tx
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, organizationId))
    .for("update");
  if (existing.some(m => m.userId === userId)) return "duplicate";
  if (existing.length >= maxMembers) return "full";
  try {
    await tx
      .insert(organizationMembers)
      .values({ organizationId, userId, role });
  } catch (error) {
    if (isDuplicateMember(error)) return "duplicate";
    throw error;
  }
  return null;
}

export async function addMember(
  organizationId: number,
  userId: number,
  role: OrganizationRole,
  maxMembers: number
): Promise<MemberBlock | null> {
  return getDb().transaction(tx =>
    addMemberTx(tx, organizationId, userId, role, maxMembers)
  );
}

/**
 * Ändert die Stufe eines Mitglieds oder entfernt es.
 *
 * **Beide Wege durch dieselbe Funktion**, weil beide an derselben Bedingung
 * hängen: Es muss ein Administrator übrig bleiben. Zwei getrennte Funktionen
 * hätten die Prüfung zweimal – und beim nächsten Umbau irgendwann nur noch
 * einmal.
 *
 * Geprüft wird **in** der Transaktion und mit `FOR UPDATE` auf den
 * Mitgliedszeilen: Zwei Administratoren, die gleichzeitig zurücktreten, kämen
 * sonst beide durch die Zählung, und die Organisation bliebe ohne Verwalter
 * zurück. Genau der Zustand, den die Regel ausschließen soll.
 */
export async function changeMembership(
  organizationId: number,
  userId: number,
  next: OrganizationRole | "remove"
): Promise<MemberBlock | null> {
  return getDb().transaction(async tx => {
    const members = await tx
      .select({
        id: organizationMembers.id,
        userId: organizationMembers.userId,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, organizationId))
      .for("update");

    const target = members.find(m => m.userId === userId);
    if (!target) return "not_a_member";

    const losesAdmin = target.role === "admin" && next !== "admin";
    const otherAdmins = members.filter(
      m => m.role === "admin" && m.userId !== userId
    ).length;
    if (losesAdmin && otherAdmins === 0) return "last_admin";

    if (next === "remove") {
      await tx
        .delete(organizationMembers)
        .where(eq(organizationMembers.id, target.id));
    } else {
      await tx
        .update(organizationMembers)
        .set({ role: next })
        .where(eq(organizationMembers.id, target.id));
    }
    return null;
  });
}

// ---------------------------------------------------------------------------
// Beitrittscode und Einladungen
// ---------------------------------------------------------------------------

/**
 * Erzeugt einen Beitrittscode.
 *
 * `crypto.randomInt` und nicht `Math.random`, aus demselben Grund wie beim
 * Freundescode: Der Code ist kein Anmeldemerkmal, öffnet aber den Weg in eine
 * Organisation. Vorhersagbare Codes ließen sich durchprobieren.
 */
export function generateJoinCode(): string {
  let bare = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    bare += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return formatCode(JOIN_CODE_PREFIX, bare);
}

/**
 * Setzt einen neuen Beitrittscode; der alte ist damit wertlos. `null` schaltet
 * den offenen Beitritt ab.
 *
 * Die Wiederholung fängt die Kollision mit einem bereits vergebenen Code ab –
 * bei 32^8 Möglichkeiten nie zu erwarten, aber `joinCode` ist `unique`, und ein
 * unbehandelter Fehler beim Klick auf „Neuen Code erzeugen“ wäre das falsche
 * Verhalten. Vorbild: `rotateFriendCode`.
 */
export async function setJoinCode(
  organizationId: number,
  code: string | null
): Promise<string | null> {
  if (code === null) {
    await getDb()
      .update(organizations)
      .set({ joinCode: null })
      .where(eq(organizations.id, organizationId));
    return null;
  }
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    const next = attempt === 0 ? code : generateJoinCode();
    try {
      const rows = await getDb()
        .update(organizations)
        .set({ joinCode: next })
        .where(eq(organizations.id, organizationId))
        .returning({ code: organizations.joinCode });
      const written = rows.at(0)?.code;
      if (written) return written;
      throw new Error(`Organisation ${organizationId} existiert nicht`);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Beitrittscode konnte nicht erzeugt werden: ${lastError}`);
}

export async function findOrganizationByJoinCode(code: string) {
  if (!isJoinCode(code)) return undefined;
  const rows = await getDb()
    .select({
      id: organizations.id,
      name: organizations.name,
      joinRole: organizations.joinRole,
    })
    .from(organizations)
    .where(eq(organizations.joinCode, code))
    .limit(1);
  return rows.at(0);
}

/** Eine offene Einladung für diese Person in diese Organisation. */
export async function findOpenInvitation(
  organizationId: number,
  invitedUserId: number
) {
  const rows = await getDb()
    .select()
    .from(organizationInvitations)
    .where(
      and(
        eq(organizationInvitations.organizationId, organizationId),
        eq(organizationInvitations.invitedUserId, invitedUserId),
        eq(organizationInvitations.status, "pending")
      )
    )
    .limit(1);
  return rows.at(0);
}

export async function createInvitation(data: {
  organizationId: number;
  invitedUserId: number;
  invitedByUserId: number;
  role: OrganizationRole;
}) {
  const [row] = await getDb()
    .insert(organizationInvitations)
    .values(data)
    .returning();
  return row;
}

/** Was aus einer beantworteten Einladung geworden ist. */
export type InvitationOutcome =
  | { outcome: "gone" }
  | { outcome: "declined"; organizationId: number }
  | { outcome: "void"; organizationId: number }
  | { outcome: "blocked"; block: MemberBlock }
  | { outcome: "joined"; organizationId: number; role: OrganizationRole };

/** Nur zum Zurückrollen der angenommenen Einladung – verlässt diese Datei nicht. */
class InvitationBlocked extends Error {
  block: MemberBlock;
  constructor(block: MemberBlock) {
    super("invitation blocked");
    this.block = block;
  }
}

/**
 * Beantwortet eine Einladung – und nimmt beim Annehmen gleich auf.
 *
 * **Beides in einer Transaktion, und das ist der Punkt.** Bis 2.5.0 stand das
 * Beantworten hier und das Aufnehmen im Router, jedes in seiner eigenen
 * Transaktion. Scheiterte das zweite – Organisation voll, inzwischen schon
 * Mitglied –, war die Einladung trotzdem auf `accepted` gesetzt: verbraucht,
 * ohne dass jemand beigetreten wäre, und wegen des partiellen Unique-Index auf
 * `pending` nicht einmal neu ausstellbar. Jetzt fällt in dem Fall alles zurück
 * und die Einladung bleibt offen.
 *
 * Der `pending`-Filter im `WHERE` wirkt weiterhin als optimistische Sperre: Zwei
 * gleichzeitige Antworten können nicht beide durchkommen.
 *
 * **Eine Einladung gilt nur, solange die einladende Person die Organisation
 * verwaltet.** Sonst überlebte die Vollmacht ihren Träger: Ein entfernter oder
 * herabgestufter Administrator hätte über eine offene `admin`-Einladung weiter
 * Einfluss, und die verbliebenen Administratoren sähen es kommen. Das
 * widerspräche der Regel am Kopf dieser Datei, dass das Verschwinden der
 * Mitgliedszeile den Zugriff sofort beendet. Der Preis ist eine Einladung, die
 * ins Leere läuft, wenn der Einladende die Organisation regulär verlässt – das
 * ist selten, sichtbar und mit einer neuen Einladung behoben.
 */
export async function respondToInvitation(
  id: number,
  invitedUserId: number,
  accept: boolean,
  maxMembers: number
): Promise<InvitationOutcome> {
  try {
    return await getDb().transaction(async (tx): Promise<InvitationOutcome> => {
      const [row] = await tx
        .update(organizationInvitations)
        .set({
          status: accept ? "accepted" : "declined",
          respondedAt: new Date(),
        })
        .where(
          and(
            eq(organizationInvitations.id, id),
            eq(organizationInvitations.invitedUserId, invitedUserId),
            eq(organizationInvitations.status, "pending")
          )
        )
        .returning();
      if (!row) return { outcome: "gone" };
      if (!accept) {
        return { outcome: "declined", organizationId: row.organizationId };
      }

      const inviter = await tx
        .select({ role: organizationMembers.role })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, row.organizationId),
            eq(organizationMembers.userId, row.invitedByUserId)
          )
        )
        .limit(1);
      if (inviter.at(0)?.role !== "admin") {
        /*
          Die Einladung wird gelöscht statt beantwortet: „abgelehnt“ wäre eine
          Falschaussage über den Eingeladenen, und ein eigener Status kostete
          einen Enum-Wert samt Migration für einen Randfall.
        */
        await tx
          .delete(organizationInvitations)
          .where(eq(organizationInvitations.id, row.id));
        return { outcome: "void", organizationId: row.organizationId };
      }

      const block = await addMemberTx(
        tx,
        row.organizationId,
        invitedUserId,
        row.role,
        maxMembers
      );
      if (block) throw new InvitationBlocked(block);
      return {
        outcome: "joined",
        organizationId: row.organizationId,
        role: row.role,
      };
    });
  } catch (error) {
    if (error instanceof InvitationBlocked) {
      return { outcome: "blocked", block: error.block };
    }
    throw error;
  }
}

/**
 * Zieht eine offene Einladung zurück.
 *
 * Gelöscht statt auf einen Endstand gesetzt: Eine zurückgezogene Einladung ist
 * keine Antwort des Eingeladenen, und der partielle Unique-Index auf `pending`
 * gibt den Platz damit sauber für eine neue frei.
 *
 * Die `organizationId` steht **im `WHERE`** und wird nicht bloß vorher geprüft –
 * sonst ließe sich mit der Verwaltungsstufe in der eigenen Organisation eine
 * fremde Einladung löschen.
 */
export async function revokeInvitation(organizationId: number, id: number) {
  const [row] = await getDb()
    .delete(organizationInvitations)
    .where(
      and(
        eq(organizationInvitations.id, id),
        eq(organizationInvitations.organizationId, organizationId),
        eq(organizationInvitations.status, "pending")
      )
    )
    .returning();
  return row;
}

/**
 * Die offenen Einladungen einer Organisation – für ihre Administratoren.
 *
 * Ohne diese Liste wäre eine ausgesprochene Einladung unsichtbar: Wer sie
 * ausgesprochen hat, sähe nicht, dass sie noch offen ist, und die übrigen
 * Administratoren erführen von ihr überhaupt erst, wenn jemand Neues in der
 * Mitgliederliste steht.
 */
export async function listPendingInvitations(organizationId: number) {
  return getDb()
    .select({
      id: organizationInvitations.id,
      invitedUserId: organizationInvitations.invitedUserId,
      name: users.name,
      telegramUsername: users.telegramUsername,
      role: organizationInvitations.role,
      createdAt: organizationInvitations.createdAt,
    })
    .from(organizationInvitations)
    .innerJoin(users, eq(users.id, organizationInvitations.invitedUserId))
    .where(
      and(
        eq(organizationInvitations.organizationId, organizationId),
        eq(organizationInvitations.status, "pending")
      )
    )
    .orderBy(asc(organizationInvitations.id));
}

/** Offene Einladungen an diese Person – für die Liste und das Abzeichen. */
export async function listOpenInvitations(invitedUserId: number) {
  return getDb()
    .select({
      id: organizationInvitations.id,
      organizationId: organizationInvitations.organizationId,
      organizationName: organizations.name,
      role: organizationInvitations.role,
      createdAt: organizationInvitations.createdAt,
    })
    .from(organizationInvitations)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationInvitations.organizationId)
    )
    .where(
      and(
        eq(organizationInvitations.invitedUserId, invitedUserId),
        eq(organizationInvitations.status, "pending")
      )
    )
    .orderBy(asc(organizationInvitations.id));
}

export async function countOpenInvitations(
  invitedUserId: number
): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(organizationInvitations)
    .where(
      and(
        eq(organizationInvitations.invitedUserId, invitedUserId),
        eq(organizationInvitations.status, "pending")
      )
    );
  return Number(rows.at(0)?.value ?? 0);
}
