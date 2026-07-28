import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: ReturnType<typeof drizzle<typeof fullSchema>>;

export function getDb() {
  if (!instance) {
    instance = drizzle(env.databaseUrl, {
      mode: "planetscale",
      schema: fullSchema,
    });
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
