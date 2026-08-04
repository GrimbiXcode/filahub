import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { registerDevLogin } from "./devLogin";
import { env } from "./lib/env";
import { startTelegramBot } from "./telegram/bot";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
// Health-Endpunkt für Docker-Healthchecks und Reverse Proxies
app.get("/health", c => c.json({ status: "ok" }));
// Nur lokal und nur mit DEV_LOGIN=1; sonst wird nichts registriert
registerDevLogin(app);
app.use("/api/trpc/*", async c => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", c => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  const { migrateDb } = await import("./queries/connection");
  serveStaticFiles(app);

  // Schema-Migrationen anwenden, bevor Bot und Server auf die DB zugreifen
  await migrateDb();
  console.log("Datenbank-Migrationen angewendet.");

  // Altdaten aus MySQL übernehmen, falls LEGACY_MYSQL_URL gesetzt ist.
  // Muss vor dem Seeding laufen: sonst legt der Startkatalog Einträge an,
  // die anschließend mit den übernommenen IDs kollidieren. Fehler werden
  // in `migration_state` festgehalten und auf /verwaltung/system angezeigt –
  // der Start läuft weiter, sonst käme man an diese Seite nicht heran.
  const { runLegacyImport } = await import("./queries/legacyImport");
  const legacy = await runLegacyImport();
  console.log(
    `Datenübernahme aus MySQL: ${legacy.status}` +
      (legacy.status === "completed" ? ` (${legacy.rowsCopied} Zeilen)` : "")
  );

  // Startkatalog nachziehen. Idempotent und bewusst nicht startkritisch:
  // ein Fehler hier darf den Server nicht am Hochfahren hindern.
  //
  // Ausgesetzt, solange eine Übernahme offen ist: Das Seeding vergibt neue IDs
  // aus derselben Sequenz und würde genau die Nummern belegen, die der
  // Wiederholungslauf für die Altdaten braucht. Die Altzeilen fielen dann
  // stillschweigend unter `onConflictDoNothing` – und Materialien zeigten über
  // ihre unveränderte `spoolPresetVariantId` plötzlich auf eine fremde Spule.
  if (legacy.status === "completed" || legacy.status === "skipped") {
    try {
      const { seedSpoolPresets } = await import("./queries/presetSeed");
      const stats = await seedSpoolPresets();
      console.log(
        `Preset-Katalog: ${stats.created} neu, ${stats.updated} aktualisiert, ${stats.skipped} unverändert.`
      );
    } catch (error) {
      console.error("Seeding des Preset-Katalogs fehlgeschlagen:", error);
    }
  } else {
    console.warn(
      `Preset-Katalog übersprungen: Die Datenübernahme ist "${legacy.status}". ` +
        "Der Startkatalog würde IDs belegen, die für die Altdaten gebraucht " +
        "werden. Zustand und Wiederholung unter /verwaltung/system."
    );
  }

  const port = parseInt(process.env.PORT || "3000");
  startTelegramBot();
  // Auf allen Interfaces lauschen, damit der Container von außen
  // (Reverse Proxy, Docker-Netzwerk) erreichbar ist
  serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
  });
}
