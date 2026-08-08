import { beforeAll, describe, expect, it } from "vitest";

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

async function headers() {
  const res = await app.fetch(new Request("http://localhost/health"));
  return res.headers;
}

describe("Schutzkopfzeilen", () => {
  it("liefert eine Content Security Policy", async () => {
    const csp = (await headers()).get("content-security-policy");
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
  });

  it("verbietet das Einbetten in fremde Seiten", async () => {
    const h = await headers();
    // Zweifach abgesichert: moderne Browser lesen die CSP, ältere X-Frame-Options.
    expect(h.get("content-security-policy")).toContain(
      "frame-ancestors 'none'"
    );
    expect(h.get("x-frame-options")).toBe("DENY");
  });

  it("erlaubt Skripte nur von der eigenen Seite und von telegram.org", async () => {
    const csp = (await headers()).get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'self' https://telegram.org");
    /*
      Der wichtigste Test der Datei: Sobald irgendwo wieder ein Inline-Skript
      landet und jemand `'unsafe-inline'` ergänzt, ist die Richtlinie wertlos.
      Das Theme-Skript liegt deshalb in public/theme-init.js.
    */
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it("lädt Bilder nur lokal – keine fremden CDNs", async () => {
    // Gilt nur, solange keine Telegram-Profilbilder angezeigt werden.
    const csp = (await headers()).get("content-security-policy") ?? "";
    expect(csp).toContain("img-src 'self' data:");
  });

  it("unterbindet MIME-Type-Raten", async () => {
    expect((await headers()).get("x-content-type-options")).toBe("nosniff");
  });

  it("gibt beim Verlassen der Seite keine Pfade preis", async () => {
    expect((await headers()).get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin"
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
