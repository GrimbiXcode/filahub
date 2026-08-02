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
      "TEST_DATABASE_URL ist nicht gesetzt – die Integrationstests brauchen eine eigene MySQL-Datenbank.",
      "",
      "Container starten:",
      "  docker run -d --name filahub-test-db -p 127.0.0.1:3399:3306 \\",
      "    -e MYSQL_DATABASE=filahub_test -e MYSQL_USER=filahub \\",
      "    -e MYSQL_PASSWORD=filahub -e MYSQL_RANDOM_ROOT_PASSWORD=yes mysql:8.4",
      "",
      "Tests ausführen:",
      "  TEST_DATABASE_URL='mysql://filahub:filahub@127.0.0.1:3399/filahub_test' npm run test:integration",
    ].join("\n"),
  );
}

if (process.env.DATABASE_URL && process.env.DATABASE_URL === testUrl) {
  throw new Error(
    "TEST_DATABASE_URL zeigt auf dieselbe Datenbank wie DATABASE_URL. " +
      "Die Integrationstests löschen alle Tabellen – bitte eine eigene Testdatenbank verwenden.",
  );
}

process.env.DATABASE_URL = testUrl;
process.env.APP_SECRET ||= "integration-test-secret";

// Aus einer vorhandenen .env übernommene Telegram-Werte würden die
// Rollenvergabe in `upsertUser` beeinflussen.
delete process.env.OWNER_TELEGRAM_ID;
delete process.env.TELEGRAM_ALLOWED_IDS;
delete process.env.TELEGRAM_BOT_TOKEN;
