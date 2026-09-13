import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { registerDevLogin } from "./devLogin";
import { TELEGRAM_LOGIN_FRAME_PATH } from "@contracts/constants";
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

/** Kopfzeilen, die für jede Antwort gleich sind – unabhängig von der CSP. */
const sharedHeaders = {
  xContentTypeOptions: "nosniff",
  referrerPolicy: "strict-origin-when-cross-origin",
  /*
    `same-origin-allow-popups`, nicht `same-origin`: Das Telegram-Widget lässt
    den Anmeldedialog in einem eigenen Fenster aufgehen und schickt das
    Ergebnis über `window.opener` zurück. Unter `same-origin` kappt der Browser
    genau diese Verbindung – der Dialog liefe durch, die Anmeldung käme aber
    nie an. Der Schutz, auf den es ankommt, bleibt: Ein fremdes Dokument, das
    diese Anwendung öffnet, bekommt weiterhin keinen Zugriff auf ihr Fenster.
  */
  crossOriginOpenerPolicy: "same-origin-allow-popups",
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
};

/** Quellen, die beide Richtlinien gleich eng halten. */
const sharedCsp = {
  defaultSrc: ["'self'"],
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
};

/** Die Richtlinie für die Anwendung selbst: kein fremdes Skript, kein `eval`. */
const appHeaders = secureHeaders({
  ...sharedHeaders,
  contentSecurityPolicy: {
    ...sharedCsp,
    scriptSrc: ["'self'"],
    // Eingebettet wird nur das eigene Rahmendokument mit dem Telegram-Widget.
    frameSrc: ["'self'"],
    frameAncestors: ["'none'"],
  },
  xFrameOptions: "DENY",
});

/**
 * Die Ausnahme für `public/telegram-login.html`.
 *
 * `telegram-widget.js` setzt den Rückruf aus `data-onauth` mit `eval`
 * zusammen; ohne `'unsafe-eval'` bricht die Anmeldung ab. Statt der ganzen
 * Anwendung diese Tür zu öffnen, bekommt sie allein dieses eine Dokument –
 * es trägt keinen Anwendungscode und keine Benutzerdaten, und `frame-ancestors
 * 'self'` lässt nur die eigene Anmeldeseite es einbetten.
 */
const telegramFrameHeaders = secureHeaders({
  ...sharedHeaders,
  contentSecurityPolicy: {
    ...sharedCsp,
    scriptSrc: ["'self'", "'unsafe-eval'", "https://telegram.org"],
    // Der Anmeldedialog des Widgets öffnet sich in einem Rahmen.
    frameSrc: ["https://oauth.telegram.org"],
    frameAncestors: ["'self'"],
  },
  /*
    `DENY` wie beim Rest verböte auch das Einbetten durch die eigene
    Anmeldeseite – ältere Browser lesen X-Frame-Options statt
    `frame-ancestors`.
  */
  xFrameOptions: "SAMEORIGIN",
});

app.use((c, next) =>
  c.req.path === TELEGRAM_LOGIN_FRAME_PATH
    ? telegramFrameHeaders(c, next)
    : appHeaders(c, next)
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
