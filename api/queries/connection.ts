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
