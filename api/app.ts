import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { registerDevLogin } from "./devLogin";
import { env } from "./lib/env";

/**
 * Die Hono-Anwendung – ohne Serverstart, Migrationen und Bot.
 *
 * Bewusst von `api/boot.ts` getrennt: Sonst zöge jeder Test, der nur eine
 * Antwort prüfen will, den kompletten Produktionsstart mit Datenbankzugriff
 * hinter sich her.
 */
const app = new Hono<{ Bindings: HttpBindings }>();

/*
  Schutzkopfzeilen zuerst, damit sie auch für die statischen Dateien und die
  SPA-Auslieferung gelten (`serveStaticFiles` hängt sich in `boot.ts` an).

  `SECURITY.md` erklärt fehlende Kopfzeilen bislang zur Sache des Reverse
  Proxy. Das Beispiel im README setzt aber keine – der dokumentierte Weg führte
  also zu einer ungehärteten Installation. Eine Vorgabe hier kostet nichts und
  wirkt auch dann, wenn davor jemand nichts konfiguriert hat.
*/
app.use(
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      // telegram.org liefert das Login-Widget – aber erst nach Einwilligung,
      // siehe src/pages/Login.tsx.
      scriptSrc: ["'self'", "https://telegram.org"],
      // Der Anmeldedialog des Widgets öffnet sich in einem Rahmen.
      frameSrc: ["https://oauth.telegram.org"],
      connectSrc: ["'self'"],
      // `data:` nur für das eingebettete SVG-Favicon in index.html.
      // Telegram-Profilbilder werden nicht mehr geladen, deshalb reicht das.
      imgSrc: ["'self'", "data:"],
      /*
        `'unsafe-inline'` ist hier unvermeidbar: `src/components/ui/chart.tsx`
        erzeugt ein <style>-Element mit dynamischen CSS-Variablen, und Radix
        setzt durchgehend style-Attribute. Ein Hash ist bei erzeugtem Inhalt
        nicht möglich. Bewusst hingenommenes Restrisiko – der Inhalt stammt aus
        dem Anwendungscode, nicht aus Benutzereingaben.
      */
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
    xFrameOptions: "DENY",
    xContentTypeOptions: "nosniff",
    referrerPolicy: "strict-origin-when-cross-origin",
    crossOriginOpenerPolicy: "same-origin",
    crossOriginResourcePolicy: "same-origin",
    /*
      `crossOriginEmbedderPolicy` bleibt aus (Hono-Vorgabe): eingeschaltet
      bräuchte der Telegram-Rahmen CORP-Kopfzeilen, die telegram.org nicht
      sendet – die Anmeldung fiele aus.
    */
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: [],
      payment: [],
    },
    /*
      HSTS nur im Produktivbetrieb. `secureHeaders` setzt es sonst auch über
      HTTP – und ein Browser, der `localhost` einmal auf HTTPS festgenagelt
      hat, erreicht die Entwicklungsumgebung nicht mehr.
    */
    strictTransportSecurity: env.isProduction
      ? "max-age=31536000; includeSubDomains"
      : false,
  })
);

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
