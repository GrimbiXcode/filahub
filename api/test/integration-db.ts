/** Hilfsfunktionen für die Integrationstests (nur mit `TEST_DATABASE_URL`). */
import { sql } from "drizzle-orm";
import { getDb, migrateDb } from "../queries/connection";
import { appRouter } from "../router";
import type { User } from "@db/schema";

/**
 * Leert die Testdatenbank und spielt anschließend alle Migrationen ein.
 * So startet jeder Lauf auf demselben Stand und der Testlauf ist
 * beliebig wiederholbar.
 */
export async function resetSchema() {
  const db = getDb();
  const [rows] = (await db.execute(
    sql`SELECT TABLE_NAME AS name FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE()`
  )) as unknown as [{ name: string }[]];

  if (rows.length > 0) {
    const list = rows.map(r => `\`${r.name}\``).join(", ");
    await db.execute(sql.raw("SET FOREIGN_KEY_CHECKS = 0"));
    await db.execute(sql.raw(`DROP TABLE IF EXISTS ${list}`));
    await db.execute(sql.raw("SET FOREIGN_KEY_CHECKS = 1"));
  }

  await migrateDb();
}

/** Schließt den mysql2-Pool, sonst endet der Vitest-Prozess nicht. */
export async function closeDb() {
  const client = (
    getDb() as unknown as { $client?: { end?: () => Promise<void> } }
  ).$client;
  await client?.end?.();
}

/** tRPC-Aufrufer im Namen eines Benutzers – prüft Middleware und Rollen mit. */
export function callerFor(user: User) {
  return appRouter.createCaller({
    req: new Request("http://localhost/api/trpc"),
    resHeaders: new Headers(),
    user,
  });
}

/** Zeilenanzahl einer Tabelle. */
export async function countRows(table: string) {
  const [rows] = (await getDb().execute(
    sql.raw(`SELECT COUNT(*) AS c FROM \`${table}\``)
  )) as unknown as [{ c: number }[]];
  return Number(rows[0].c);
}
