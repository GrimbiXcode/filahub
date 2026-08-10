import app from "./app";
import { env } from "./lib/env";
import { startTelegramBot } from "./telegram/bot";

export default app;

/**
 * Meldet Konfigurationen, die rechtlich oder sicherheitstechnisch heikel sind.
 *
 * Bewusst nur Warnungen: Ein Abbruch würde Instanzen lahmlegen, die seit
 * Monaten laufen. Aber stillschweigend soll keine davon weiterlaufen.
 */
function warnAboutConfiguration() {
  if (env.telegramAllowedIds.length === 0 && !env.telegramOpenRegistration) {
    console.warn(
      "[Konfiguration] Weder TELEGRAM_ALLOWED_IDS noch TELEGRAM_OPEN_REGISTRATION " +
        "gesetzt – niemand kann sich anmelden. Freigabeliste eintragen oder die " +
        "Registrierung ausdrücklich öffnen."
    );
  }

  if (env.telegramOpenRegistration) {
    console.warn(
      "[Konfiguration] Offene Registrierung: Jedes Telegram-Konto kann sich " +
        "anlegen. Damit bist du für die Daten unbestimmt vieler Personen " +
        "verantwortlich – siehe PRIVACY.md."
    );
    if (!env.ownerTelegramId) {
      console.warn(
        "[Konfiguration] OWNER_TELEGRAM_ID fehlt. Bei offener Registrierung " +
          "wird niemand automatisch Administrator; die Rolle muss von Hand in " +
          "der Datenbank vergeben werden."
      );
    }
  }

  if (!env.operatorName || !env.operatorAddress || !env.operatorEmail) {
    console.warn(
      "[Konfiguration] LEGAL_OPERATOR_* unvollständig – Impressum und " +
        "Datenschutzerklärung nennen keinen Verantwortlichen. Für eine " +
        "öffentlich erreichbare Instanz ist das eine Pflichtangabe."
    );
  }
}

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  const { migrateDb } = await import("./queries/connection");
  serveStaticFiles(app);

  warnAboutConfiguration();

  // Schema-Migrationen anwenden, bevor Bot und Server auf die DB zugreifen
  await migrateDb();
  console.log("Datenbank-Migrationen angewendet.");

  // Startkatalog nachziehen. Idempotent und bewusst nicht startkritisch:
  // ein Fehler hier darf den Server nicht am Hochfahren hindern.
  try {
    const { seedSpoolPresets } = await import("./queries/presetSeed");
    const stats = await seedSpoolPresets();
    console.log(
      `Preset-Katalog: ${stats.created} neu, ${stats.updated} aktualisiert, ${stats.skipped} unverändert.`
    );
  } catch (error) {
    console.error("Seeding des Preset-Katalogs fehlgeschlagen:", error);
  }

  /*
    Aufbewahrung: einmal beim Start und danach alle sechs Stunden.

    Ein externer Scheduler wäre für einen Container, der ohnehin durchläuft,
    unnötiger Aufwand; `unref()` sorgt dafür, dass das Intervall den Prozess
    nicht am Beenden hindert.
  */
  const { runRetentionSweep } = await import("./queries/retention");
  await runRetentionSweep();
  setInterval(() => void runRetentionSweep(), 6 * 60 * 60 * 1000).unref();

  const port = parseInt(process.env.PORT || "3000");
  startTelegramBot();
  // Auf allen Interfaces lauschen, damit der Container von außen
  // (Reverse Proxy, Docker-Netzwerk) erreichbar ist
  serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
  });
}
