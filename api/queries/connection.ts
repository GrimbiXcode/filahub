import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let pool: Pool | undefined;
let instance: ReturnType<typeof drizzle<typeof fullSchema>>;

/**
 * Der Pool wird bewusst selbst gehalten statt Drizzle nur die URL zu geben:
 * die Tests brauchen `end()` (sonst endet der Vitest-Prozess nicht) und die
 * Verwaltungsseite zeigt seine Kennzahlen an.
 */
export function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: env.databaseUrl });
  }
  return pool;
}

export function getDb() {
  if (!instance) {
    instance = drizzle(getPool(), { schema: fullSchema });
  }
  return instance;
}

/**
 * Der Transaktionsgriff, wie ihn `getDb().transaction(...)` übergibt.
 *
 * Abgeleitet statt von Hand geschrieben: Die Drizzle-Signatur trägt das ganze
 * Schema samt Relations im Typ, und jede handgetippte Fassung liefe beim
 * nächsten Schema-Umbau davon. Gebraucht wird er dort, wo mehrere Module an
 * **einer** Transaktion mitschreiben – etwa die Kontolöschung, die den
 * Organisationsteil aus `queries/organizations.ts` mit hineinnimmt.
 */
export type DbTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

/**
 * Führt ausstehende SQL-Migrationen aus db/migrations aus.
 * Wird beim Server-Start (Produktion) aufgerufen, damit sich frische
 * Deployments (z. B. Coolify) selbst initialisieren.
 */
export async function migrateDb() {
  await migrate(getDb(), { migrationsFolder: "db/migrations" });
}

/** Schließt den Verbindungspool (Tests, sauberes Herunterfahren). */
export async function closePool() {
  await pool?.end();
  pool = undefined;
  instance = undefined as unknown as typeof instance;
}
