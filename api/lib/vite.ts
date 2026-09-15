import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";

type App = Hono<{ Bindings: HttpBindings }>;

/** Ein Jahr, ohne je nachzufragen – nur für Dateien mit Hash im Namen. */
const IMMUTABLE = "public, max-age=31536000, immutable";
/** Aufbewahren, aber vor jedem Gebrauch beim Server nachfragen. */
const REVALIDATE = "no-cache";

/**
 * Cache-Kopfzeile je nach Pfad. Zwei Klassen, keine dritte:
 *
 *  - Alles unter `/assets/` trägt einen Inhalts-Hash im Namen (Vite). Ändert
 *    sich der Inhalt, ändert sich der Name – der Browser darf die Datei also
 *    ein Jahr lang behalten, ohne je nachzufragen.
 *  - Alles andere heißt bei jeder Version gleich: `index.html`, das Manifest,
 *    die Icons, `theme-init.js`, `version.json`. Das muss der Browser bei
 *    jedem Aufruf neu prüfen.
 *
 * Bis 2.9.1 gab es hier gar keine Kopfzeile, nur das `Last-Modified` von
 * `serveStatic`. Dann schätzt der Browser die Haltbarkeit selbst: ein
 * Zehntel der Zeit seit der letzten Änderung – und die ist im Docker-Abbild
 * der Bauzeitpunkt. Ein Abbild von vor einem Monat hielt `index.html` damit
 * drei Tage lang für frisch, samt Verweisen auf Bundles, die es längst nicht
 * mehr gab. Auf dem iPhone, wo eine Home-Bildschirm-App keinen
 * Neuladen-Knopf hat, half nur noch Löschen und neu Anlegen. Die andere
 * Hälfte der Abhilfe steht in `src/lib/appUpdate.ts`.
 */
export function cacheControlFor(requestPath: string): string {
  return requestPath.startsWith("/assets/") ? IMMUTABLE : REVALIDATE;
}

/**
 * Liefert das Bauergebnis aus `root` aus – in Produktion `dist/public`.
 *
 * `root` ist ein Parameter, damit `api/staticFiles.test.ts` gegen ein
 * Wegwerf-Verzeichnis laufen kann statt gegen einen echten Bau. Ein relativer
 * Pfad gilt ab dem Arbeitsverzeichnis, wie bei `serveStatic` selbst.
 */
export function serveStaticFiles(app: App, root = "./dist/public") {
  /*
    Einmal lesen, nicht je Anfrage: Im Abbild ändert sich die Datei nie, und
    ein fehlendes Bauergebnis soll beim Start auffallen, nicht erst beim
    ersten Aufruf.
  */
  const index = fs.readFileSync(path.resolve(root, "index.html"), "utf-8");

  /*
    Nach `next()`, nicht davor – und nicht über `onFound` von `serveStatic`:
    Der Rückruf kommt erst, wenn die Antwort schon gebaut ist, eine dort
    gesetzte Kopfzeile verpufft. Hier hängt sie an allem, was tatsächlich
    ausgeliefert wurde. Die 404-Antworten bleiben ohne: Ein fehlendes Bundle
    unter `/assets/` mit `immutable` zu beantworten hieße, dem Browser das
    Fehlen für ein Jahr einzuschärfen.
  */
  app.use("*", async (c, next) => {
    await next();
    if (c.res.ok && !c.res.headers.has("Cache-Control")) {
      c.res.headers.set("Cache-Control", cacheControlFor(c.req.path));
    }
  });
  app.use("*", serveStatic({ root }));

  app.notFound(c => {
    const accept = c.req.header("accept") ?? "";
    if (!accept.includes("text/html")) {
      return c.json({ error: "Not Found" }, 404);
    }
    // Die SPA-Auslieferung für tiefe Links – dieselbe Regel wie für `/`.
    return c.html(index, 200, { "Cache-Control": REVALIDATE });
  });
}
