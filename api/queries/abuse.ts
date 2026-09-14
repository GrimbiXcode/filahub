import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import {
  ABUSE_ALERT_THRESHOLDS,
  evaluateAlerts,
  type AbuseAlert,
  type AbuseCounts,
} from "@contracts/limits";
import { auditLog, users } from "@db/schema";
import { getDb } from "./connection";
import { countBlockedUsers, countPendingUnblockRequests } from "./blocking";

/**
 * Auswertung des Sicherheitsprotokolls für die Missbrauchsübersicht.
 *
 * Alle Zahlen kommen aus `audit_log` und damit aus Einträgen, die **nur beim
 * Zuschlagen** geschrieben werden. Das ist der Grund, warum diese Seite
 * überhaupt aussagekräftig ist: Was hier steht, ist nie normaler Betrieb.
 *
 * Genutzt werden die vorhandenen Indizes `audit_log_event_at_idx` (Ereignis +
 * Zeit) und `audit_log_actor_idx`; es kommt keiner hinzu.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function since(ms: number): Date {
  return new Date(Date.now() - ms);
}

/** Wie oft ein Ereignis seit einem Zeitpunkt eingetragen wurde. */
async function countEventsSince(event: string, cutoff: Date): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(auditLog)
    .where(and(eq(auditLog.event, event), gte(auditLog.at, cutoff)));
  return Number(rows.at(0)?.value ?? 0);
}

/**
 * Die Zählstände, auf die `evaluateAlerts` schaut.
 *
 * Getrennt von der Übersicht, weil die Alarmierung alle 15 Minuten läuft und
 * die Seite nur beim Hinschauen: Die Alarmierung braucht vier Zahlen, nicht
 * die ganze Auswertung mit ihren Gruppierungen.
 */
export async function collectAbuseCounts(): Promise<AbuseCounts> {
  const [rateLimited, quotaExceeded, registrationBlocked, pending] =
    await Promise.all([
      countEventsSince("limit.rate_limited", since(HOUR_MS)),
      countEventsSince("limit.quota_exceeded", since(DAY_MS)),
      countEventsSince("registration.rate_limited", since(DAY_MS)),
      countPendingUnblockRequests(),
    ]);
  return {
    rateLimited,
    quotaExceeded,
    registrationBlocked,
    pendingUnblockRequests: pending,
  };
}

export type BucketCount = { bucket: string; hits: number };
export type DailyCount = { day: string; registrations: number };
export type NoisyActor = {
  userId: number | null;
  name: string | null;
  hits: number;
};

export type AbuseOverview = {
  counts: AbuseCounts;
  thresholds: typeof ABUSE_ALERT_THRESHOLDS;
  alerts: AbuseAlert[];
  /** Getroffene Eimer der Zugriffsbegrenzung, 24 Stunden */
  buckets: BucketCount[];
  /** Erreichte Mengenobergrenzen, 24 Stunden */
  quotas: BucketCount[];
  /** Registrierungen je Tag, 14 Tage */
  registrations: DailyCount[];
  /** Konten mit den meisten Abweisungen, 7 Tage */
  noisiest: NoisyActor[];
  blockedUsers: number;
};

/**
 * Gruppiert Abweisungen nach dem Eimer bzw. Kontingent aus `detail`.
 *
 * `detail->>'…'` statt einer eigenen Spalte: Das Protokoll ist bewusst schmal
 * gehalten (siehe `db/schema.ts`), und eine Spalte, die nur diese Seite liest,
 * wäre der falsche Preis. Bei den Zeilenzahlen, um die es hier geht – ein paar
 * hundert je Tag –, ist der Aufwand ohne Belang.
 *
 * **Der Ausdruck steht als roher Text und wird nicht aus Spalten
 * zusammengesetzt.** Postgres verlangt, dass der Ausdruck in `GROUP BY`
 * strukturell dem in `SELECT` gleicht. Drizzle qualifiziert eine
 * Spaltenreferenz aber je nach Klausel verschieden (`"detail"` in der einen,
 * `"audit_log"."detail"` in der anderen) und macht aus einem eingesetzten Wert
 * zwei verschiedene Platzhalter – beides ließ die Abfrage mit `42803`
 * scheitern. `key` ist auf zwei feste Werte eingeschränkt und stammt nie aus
 * einer Eingabe; der rohe Text ist damit keine Lücke.
 */
async function groupByDetail(
  event: string,
  key: "bucket" | "quota",
  cutoff: Date
): Promise<BucketCount[]> {
  const bucket = sql.raw(
    `coalesce("audit_log"."detail"->>'${key}', 'unbekannt')`
  );
  const rows = await getDb()
    .select({ bucket: sql<string>`${bucket}`, hits: count() })
    .from(auditLog)
    .where(and(eq(auditLog.event, event), gte(auditLog.at, cutoff)))
    .groupBy(bucket)
    .orderBy(desc(count()));
  return rows.map(r => ({ bucket: r.bucket, hits: Number(r.hits) }));
}

/** Alles, was `/verwaltung/missbrauch` zeigt – in einem Aufruf. */
export async function getAbuseOverview(): Promise<AbuseOverview> {
  const day = since(DAY_MS);
  const week = since(7 * DAY_MS);

  const [counts, buckets, quotas, registrations, noisiest, blockedUsers] =
    await Promise.all([
      collectAbuseCounts(),
      groupByDetail("limit.rate_limited", "bucket", day),
      groupByDetail("limit.quota_exceeded", "quota", day),
      registrationsPerDay(14),
      findNoisiestActors(week, 10),
      countBlockedUsers(),
    ]);

  return {
    counts,
    thresholds: ABUSE_ALERT_THRESHOLDS,
    alerts: evaluateAlerts(counts),
    buckets,
    quotas,
    registrations,
    noisiest,
    blockedUsers,
  };
}

/**
 * Neue Konten je Tag.
 *
 * Aus `users.createdAt` und nicht aus dem Protokoll: Eine erfolgreiche
 * Registrierung ist kein Sicherheitsereignis und steht dort zu Recht nicht.
 * Für die Frage „läuft die Instanz gerade voll“ ist sie aber die Zahl, auf die
 * es ankommt – die abgewiesenen Versuche daneben sagen erst zusammen mit ihr
 * etwas aus.
 */
async function registrationsPerDay(days: number): Promise<DailyCount[]> {
  const cutoff = since(days * DAY_MS);
  // Roh aus demselben Grund wie in `groupByDetail`: Der Ausdruck muss in
  // SELECT, GROUP BY und ORDER BY buchstäblich derselbe sein.
  const day = sql.raw(`date_trunc('day', "users"."createdAt")`);
  const rows = await getDb()
    .select({
      day: sql<string>`to_char(${day}, 'YYYY-MM-DD')`,
      registrations: count(),
    })
    .from(users)
    .where(gte(users.createdAt, cutoff))
    .groupBy(day)
    .orderBy(sql`${day} DESC`);
  return rows.map(r => ({
    day: r.day,
    registrations: Number(r.registrations),
  }));
}

/**
 * Konten mit den meisten Abweisungen.
 *
 * Beide Ereignisse zusammen: Ob jemand an der Zugriffsbegrenzung oder an einem
 * Kontingent aufläuft, ist für die Frage „wer fällt auf“ dasselbe. Zeilen ohne
 * Konto (Abweisungen vor der Anmeldung) fallen heraus – sie haben keinen Namen,
 * der auf dieser Liste etwas beitrüge, und stehen schon in `buckets`.
 */
async function findNoisiestActors(
  cutoff: Date,
  limit: number
): Promise<NoisyActor[]> {
  const rows = await getDb()
    .select({
      userId: auditLog.actorUserId,
      name: users.name,
      hits: count(),
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(
      and(
        gte(auditLog.at, cutoff),
        sql`${auditLog.actorUserId} IS NOT NULL`,
        sql`${auditLog.event} IN ('limit.rate_limited', 'limit.quota_exceeded')`
      )
    )
    .groupBy(auditLog.actorUserId, users.name)
    .orderBy(desc(count()))
    .limit(limit);
  return rows.map(r => ({
    userId: r.userId,
    name: r.name,
    hits: Number(r.hits),
  }));
}
