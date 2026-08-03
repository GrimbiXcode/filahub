/**
 * Vorbereitung der Integrationstests.
 *
 * Läuft vor dem Import der Testdateien und damit vor `api/lib/env.ts` –
 * nur so greift die hier gesetzte `DATABASE_URL`.
 *
 * Die Testdatenbank wird bei jedem Lauf komplett neu aufgebaut. Damit das
 * niemals die Entwicklungs- oder Produktionsdatenbank trifft, kommt die
 * Verbindung ausschließlich aus `TEST_DATABASE_URL` und darf nicht mit
 * `DATABASE_URL` übereinstimmen.
 */
import "dotenv/config";

const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error(
    [
      "TEST_DATABASE_URL ist nicht gesetzt – die Integrationstests brauchen eine eigene Postgres-Datenbank.",
      "",
      "Container starten:",
      "  docker run -d --name filahub-test-db -p 127.0.0.1:5433:5432 \\",
      "    -e POSTGRES_DB=filahub_test -e POSTGRES_USER=filahub \\",
      "    -e POSTGRES_PASSWORD=filahub postgres:17-alpine",
      "",
      "Tests ausführen:",
      "  TEST_DATABASE_URL='postgres://filahub:filahub@127.0.0.1:5433/filahub_test' npm run test:integration",
    ].join("\n")
  );
}

if (process.env.DATABASE_URL && process.env.DATABASE_URL === testUrl) {
  throw new Error(
    "TEST_DATABASE_URL zeigt auf dieselbe Datenbank wie DATABASE_URL. " +
      "Die Integrationstests löschen alle Tabellen – bitte eine eigene Testdatenbank verwenden."
  );
}

process.env.DATABASE_URL = testUrl;
process.env.APP_SECRET ||= "integration-test-secret";

// Aus einer vorhandenen .env übernommene Telegram-Werte würden die
// Rollenvergabe in `upsertUser` beeinflussen.
delete process.env.OWNER_TELEGRAM_ID;
delete process.env.TELEGRAM_ALLOWED_IDS;
delete process.env.TELEGRAM_BOT_TOKEN;

// Die Datenübernahme bekommt ihre Quelle ausschließlich über
// TEST_LEGACY_MYSQL_URL (siehe api/legacyImport.integration.test.ts) – eine
// LEGACY_MYSQL_URL aus der .env würde sonst in die Tests hineinwirken.
delete process.env.LEGACY_MYSQL_URL;
