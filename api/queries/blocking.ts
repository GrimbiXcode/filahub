import { and, count, desc, eq, isNotNull, like, or, sql } from "drizzle-orm";
import type { BlockReason } from "@contracts/limits";
import { unblockRequests, users } from "@db/schema";
import { getDb } from "./connection";

/**
 * Sperre, Entsperrung und die Anträge dazu.
 *
 * Eigene Datei und nicht in `queries/users.ts`: Dort steht, was ein Konto über
 * sich selbst weiß. Hier steht, was die Instanz mit einem Konto tut – der
 * einzige Eingriff im Projekt, der jemanden von seinem eigenen Bestand trennt.
 * Die Trennung macht beim Lesen sofort klar, welcher Art ein Aufruf ist.
 */

/**
 * Sperrt ein Konto und entwertet zugleich seine Sitzungen.
 *
 * Beides in **einem** `UPDATE`: Zwei Anweisungen hinterließen ein Zeitfenster,
 * in dem die Sperre steht, die alten Token aber noch gelten – und genau in
 * diesem Fenster arbeitet ein Angreifer weiter. `tokenVersion` hochzuzählen ist
 * dieselbe Mechanik wie „auf allen Geräten abmelden“ (`revokeSessions`).
 *
 * Gibt `false` zurück, wenn es das Konto nicht gibt oder es **schon** gesperrt
 * war: Der Aufrufer soll eine zweite Sperre nicht als erste protokollieren.
 */
export async function blockUser(options: {
  userId: number;
  reason: BlockReason;
  blockedBy: number;
}): Promise<boolean> {
  const updated = await getDb()
    .update(users)
    .set({
      blockedAt: new Date(),
      blockedBy: options.blockedBy,
      blockedReason: options.reason,
      tokenVersion: sql`${users.tokenVersion} + 1`,
    })
    .where(and(eq(users.id, options.userId), sql`"blockedAt" IS NULL`))
    .returning({ id: users.id });
  return updated.length > 0;
}

/**
 * Hebt die Sperre auf. Die Sitzungen bleiben entwertet – wer entsperrt wird,
 * meldet sich neu an. Ein Token von vor der Sperre wieder gelten zu lassen
 * wäre die falsche Richtung.
 */
export async function unblockUser(userId: number): Promise<boolean> {
  const updated = await getDb()
    .update(users)
    .set({ blockedAt: null, blockedBy: null, blockedReason: null })
    .where(and(eq(users.id, userId), isNotNull(users.blockedAt)))
    .returning({ id: users.id });
  return updated.length > 0;
}

/** Anzahl gesperrter Konten – für die Übersicht. */
export async function countBlockedUsers(): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(users)
    .where(isNotNull(users.blockedAt));
  return Number(rows.at(0)?.value ?? 0);
}

/**
 * Konten für die Verwaltungsseite, auf Wunsch nach Name oder Telegram-Benutzer
 * gefiltert.
 *
 * Liefert bewusst **nicht** die ganze Zeile: `unionId` ist die Telegram-ID und
 * gehört auf keine Liste, die nur zeigen soll, wer da ist und wie es um ihn
 * steht. Wer jemanden sperrt, tut das über die interne ID.
 */
export async function findUsersForAdmin(options: {
  search?: string;
  limit: number;
}) {
  const term = options.search?.trim();
  const filter = term
    ? or(
        like(sql`lower(${users.name})`, `%${term.toLowerCase()}%`),
        like(sql`lower(${users.telegramUsername})`, `%${term.toLowerCase()}%`)
      )
    : undefined;

  return (
    getDb()
      .select({
        id: users.id,
        name: users.name,
        telegramUsername: users.telegramUsername,
        role: users.role,
        createdAt: users.createdAt,
        lastSignInAt: users.lastSignInAt,
        blockedAt: users.blockedAt,
        blockedReason: users.blockedReason,
      })
      .from(users)
      .where(filter)
      /*
      Gesperrte zuerst: Wer diese Seite öffnet, sucht in aller Regel einen
      laufenden Vorgang und nicht den ältesten Benutzer.
    */
      .orderBy(desc(users.blockedAt), desc(users.createdAt))
      .limit(options.limit)
  );
}

/**
 * Legt einen Entsperr-Antrag an.
 *
 * Gibt `null` zurück, wenn bereits einer offen ist – das sichert der partielle
 * Unique-Index `unblock_requests_open_unique`, hier wird der Konflikt nur in
 * eine Antwort übersetzt, die die Oberfläche zeigen kann.
 */
export async function createUnblockRequest(options: {
  userId: number;
  message: string;
}) {
  const inserted = await getDb()
    .insert(unblockRequests)
    .values({ userId: options.userId, message: options.message })
    .onConflictDoNothing()
    .returning();
  return inserted.at(0) ?? null;
}

/** Der jüngste Antrag eines Benutzers – für seine Sperrseite. */
export async function findLatestUnblockRequest(userId: number) {
  const rows = await getDb()
    .select()
    .from(unblockRequests)
    .where(eq(unblockRequests.userId, userId))
    .orderBy(desc(unblockRequests.createdAt))
    .limit(1);
  return rows.at(0) ?? null;
}

export type UnblockRequestForReview = {
  id: number;
  userId: number;
  message: string;
  status: string;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewNote: string | null;
  userName: string | null;
  userTelegramUsername: string | null;
  userBlockedAt: Date | null;
  userBlockedReason: string | null;
};

/**
 * Anträge für die Verwaltungsseite, mit den Angaben zum Antragsteller.
 *
 * Ein `leftJoin` und kein zweiter Aufruf je Zeile: Die Warteschlange zeigt bis
 * zu hundert Einträge, und hundert Einzelabfragen für einen Namen sind der
 * Fehler, den `findAppearanceCatalogsForUsers` an anderer Stelle schon einmal
 * vermeidet.
 */
export async function findUnblockRequestsForReview(
  status: "pending" | "approved" | "rejected" | undefined,
  limit: number
): Promise<UnblockRequestForReview[]> {
  return getDb()
    .select({
      id: unblockRequests.id,
      userId: unblockRequests.userId,
      message: unblockRequests.message,
      status: unblockRequests.status,
      createdAt: unblockRequests.createdAt,
      reviewedAt: unblockRequests.reviewedAt,
      reviewNote: unblockRequests.reviewNote,
      userName: users.name,
      userTelegramUsername: users.telegramUsername,
      userBlockedAt: users.blockedAt,
      userBlockedReason: users.blockedReason,
    })
    .from(unblockRequests)
    .leftJoin(users, eq(users.id, unblockRequests.userId))
    .where(status ? eq(unblockRequests.status, status) : undefined)
    .orderBy(desc(unblockRequests.createdAt))
    .limit(limit);
}

/** Offene Anträge – Zählstand für die Alarmierung. */
export async function countPendingUnblockRequests(): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(unblockRequests)
    .where(eq(unblockRequests.status, "pending"));
  return Number(rows.at(0)?.value ?? 0);
}

/**
 * Beschließt einen Antrag.
 *
 * Nur aus `pending` heraus, und das entscheidet die Datenbank über die
 * `WHERE`-Bedingung: Zwei Administratoren, die gleichzeitig auf „Annehmen“ und
 * „Ablehnen“ drücken, würden sonst beide erfolgreich melden und der zuletzt
 * geschriebene Stand gewänne stillschweigend. Vorbild `closeProposal`.
 */
export async function closeUnblockRequest(
  id: number,
  data: {
    status: "approved" | "rejected";
    reviewedBy: number;
    reviewNote?: string | null;
  }
) {
  const updated = await getDb()
    .update(unblockRequests)
    .set({
      status: data.status,
      reviewedBy: data.reviewedBy,
      reviewedAt: new Date(),
      reviewNote: data.reviewNote ?? null,
    })
    .where(
      and(eq(unblockRequests.id, id), eq(unblockRequests.status, "pending"))
    )
    .returning();
  return updated.at(0) ?? null;
}
