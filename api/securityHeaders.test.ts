import { beforeAll, describe, expect, it } from "vitest";
import { TELEGRAM_LOGIN_FRAME_PATH } from "@contracts/constants";

/**
 * Schutzkopfzeilen auf jeder Antwort.
 *
 * Möglich nur, weil `api/app.ts` von `api/boot.ts` getrennt ist – sonst zöge
 * der Import den Produktionsstart samt Datenbank und Bot hinter sich her.
 *
 * Verzögerter Import wie in `session.test.ts`: `api/lib/env.ts` liest beim
 * Laden aus `process.env`, und die Kopfzeilen hängen von `isProduction` ab.
 */

let app: (typeof import("./app"))["default"];

beforeAll(async () => {
  process.env.APP_SECRET ||= "test-secret";
  app = (await import("./app")).default;
});

async function headers(path = "/health") {
  const res = await app.fetch(new Request(`http://localhost${path}`));
  return res.headers;
}

/** Kopfzeilen des Rahmendokuments mit dem Telegram-Widget. */
function frameHeaders() {
  return headers(TELEGRAM_LOGIN_FRAME_PATH);
}

/**
 * Eine einzelne Richtlinie im Ganzen – `toContain` übersieht sonst, was
 * zusätzlich in ihr steht.
 */
function directive(csp: string | null, name: string): string {
  return (
    csp
      ?.split(";")
      .map(part => part.trim())
      .find(part => part === name || part.startsWith(`${name} `)) ?? ""
  );
}

describe("Schutzkopfzeilen", () => {
  it("liefert eine Content Security Policy", async () => {
    const csp = (await headers()).get("content-security-policy");
    expect(csp).toBeTruthy();
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
  });

  it("verbietet das Einbetten in fremde Seiten", async () => {
    const h = await headers();
    // Zweifach abgesichert: moderne Browser lesen die CSP, ältere X-Frame-Options.
    expect(directive(h.get("content-security-policy"), "frame-ancestors")).toBe(
      "frame-ancestors 'none'"
    );
    expect(h.get("x-frame-options")).toBe("DENY");
  });

  it("erlaubt Skripte nur von der eigenen Seite", async () => {
    /*
      Der wichtigste Test der Datei, und deshalb auf den vollständigen Wert
      und nicht auf ein Teilstück: Sobald irgendwo wieder ein Inline-Skript
      landet und jemand `'unsafe-inline'` ergänzt, ist die Richtlinie wertlos.
      Das Theme-Skript liegt deshalb in public/theme-init.js.

      `'unsafe-eval'` und telegram.org gehören aus demselben Grund nicht
      hierher: `telegram-widget.js` verlangt beides und läuft deshalb in einem
      eigenen Dokument (siehe unten).
    */
    const csp = (await headers()).get("content-security-policy");
    expect(directive(csp, "script-src")).toBe("script-src 'self'");
  });

  it("bettet nur eigene Dokumente ein", async () => {
    const csp = (await headers()).get("content-security-policy");
    expect(directive(csp, "frame-src")).toBe("frame-src 'self'");
  });

  it("lädt Bilder nur lokal – keine fremden CDNs", async () => {
    // Gilt nur, solange keine Telegram-Profilbilder angezeigt werden.
    const csp = (await headers()).get("content-security-policy");
    expect(directive(csp, "img-src")).toBe("img-src 'self' data:");
  });

  it("unterbindet MIME-Type-Raten", async () => {
    expect((await headers()).get("x-content-type-options")).toBe("nosniff");
  });

  it("gibt beim Verlassen der Seite keine Pfade preis", async () => {
    expect((await headers()).get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin"
    );
  });

  it("lässt selbst geöffnete Fenster ihren Öffner behalten", async () => {
    /*
      Der Telegram-Anmeldedialog geht in einem eigenen Fenster auf und
      antwortet über `window.opener`. `same-origin` kappte genau das.
    */
    expect((await headers()).get("cross-origin-opener-policy")).toBe(
      "same-origin-allow-popups"
    );
  });

  it("setzt HSTS außerhalb der Produktion nicht", async () => {
    /*
      Sonst nagelt der Browser `localhost` auf HTTPS fest – und die
      Entwicklungsumgebung ist danach nicht mehr erreichbar, bis man den
      Eintrag von Hand löscht.
    */
    expect((await headers()).get("strict-transport-security")).toBeNull();
  });
});

describe("Rahmendokument für das Telegram-Widget", () => {
  it("erlaubt genau dort eval und das Telegram-Skript", async () => {
    /*
      `telegram-widget.js` setzt seinen Rückruf mit `eval` zusammen. Die
      Ausnahme dafür ist der Sinn dieses Dokuments – und sie muss auf dieses
      Dokument beschränkt bleiben, sonst hätte man sie sich sparen können.
    */
    const csp = (await frameHeaders()).get("content-security-policy");
    expect(directive(csp, "script-src")).toBe(
      "script-src 'self' 'unsafe-eval' https://telegram.org"
    );
    expect(directive(csp, "frame-src")).toBe(
      "frame-src https://oauth.telegram.org"
    );
  });

  it("lässt sich nur von der eigenen Anmeldeseite einbetten", async () => {
    const h = await frameHeaders();
    expect(directive(h.get("content-security-policy"), "frame-ancestors")).toBe(
      "frame-ancestors 'self'"
    );
    // `DENY` verböte auch die eigene Seite – ältere Browser lesen nur das hier.
    expect(h.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("bleibt sonst so eng wie die Anwendung", async () => {
    const csp = (await frameHeaders()).get("content-security-policy");
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
  });
});
