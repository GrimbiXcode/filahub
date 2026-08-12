/** Hilfsfunktionen für die Integrationstests (nur mit `TEST_DATABASE_URL`). */
import { sql } from "drizzle-orm";
import { closePool, getDb, migrateDb } from "../queries/connection";
import { appRouter } from "../router";
import type { User } from "@db/schema";
import type { LanguageCode } from "@contracts/i18n";

/**
 * Leert die Testdatenbank und spielt anschließend alle Migrationen ein.
 * So startet jeder Lauf auf demselben Stand und der Testlauf ist
 * beliebig wiederholbar.
 *
 * `DROP SCHEMA … CASCADE` statt einer Tabellenliste: so verschwinden auch die
 * Enum-Typen und Sequenzen. Das Schema `drizzle` muss mit weg – dort steht die
 * Migrationshistorie, sonst hielte Drizzle die Migrationen für erledigt.
 *
 * **Der Wiederholungsversuch fängt einen echten Wettlauf**, keinen erdachten:
 * `recordAudit` schreibt bewusst ohne `await` (`api/queries/audit.ts`) – ein
 * Protokolleintrag soll die Antwort nicht aufhalten. Ein solcher `INSERT` kann
 * beim Beginn des nächsten Tests noch unterwegs sein und hält dann eine Sperre
 * auf `audit_log`, während das `DROP SCHEMA` die exklusive Sperre darauf will.
 * Postgres meldet das als Verklemmung (`40P01`) und bricht einen der beiden ab.
 * Ohne diese Schleife scheitert also gelegentlich ein Test an dem, was der
 * **vorige** noch nachreichte – ein Fehlschlag, der mit dem geprüften Verhalten
 * nichts zu tun hat und beim nächsten Lauf verschwindet.
 */
export async function resetSchema() {
  const db = getDb();
  for (let attempt = 0; ; attempt++) {
    try {
      await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
      await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
      break;
    } catch (error) {
      const code = (error as { cause?: { code?: string } })?.cause?.code;
      if (code !== "40P01" || attempt >= 4) throw error;
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  await db.execute(sql`CREATE SCHEMA public`);
  await migrateDb();
}

/** Schließt den Verbindungspool, sonst endet der Vitest-Prozess nicht. */
export async function closeDb() {
  await closePool();
}

/** tRPC-Aufrufer im Namen eines Benutzers – prüft Middleware und Rollen mit. */
export function callerFor(user: User, language: LanguageCode = "de") {
  return appRouter.createCaller({
    req: new Request("http://localhost/api/trpc"),
    resHeaders: new Headers(),
    user,
    language,
    // Feste Adresse: Die Tests sollen sich nicht gegenseitig in die Sperre
    // laufen lassen, und die geprüften Prozeduren sind ohnehin authentifiziert.
    clientIp: "127.0.0.1",
  });
}

/** Zeilenanzahl einer Tabelle. */
export async function countRows(table: string) {
  const result = await getDb().execute<{ c: string }>(
    sql`SELECT COUNT(*) AS c FROM ${sql.identifier(table)}`
  );
  return Number(result.rows[0].c);
}
