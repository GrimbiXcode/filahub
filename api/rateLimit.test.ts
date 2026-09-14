import { beforeEach, describe, expect, it } from "vitest";
import { consumeRateLimit, resetRateLimits } from "./lib/rateLimit";
import { clientIpFrom } from "./lib/clientIp";

beforeEach(() => {
  resetRateLimits();
});

describe("consumeRateLimit", () => {
  it("lässt bis zum Limit durch und sperrt danach", () => {
    const now = 1_000_000;
    for (let i = 1; i <= 3; i++) {
      const result = consumeRateLimit("k", 3, 60_000, now);
      expect(result.allowed, `Versuch ${i}`).toBe(true);
    }
    expect(consumeRateLimit("k", 3, 60_000, now).allowed).toBe(false);
  });

  it("zählt verbleibende Versuche herunter", () => {
    const now = 1_000_000;
    expect(consumeRateLimit("k", 3, 60_000, now).remaining).toBe(2);
    expect(consumeRateLimit("k", 3, 60_000, now).remaining).toBe(1);
    expect(consumeRateLimit("k", 3, 60_000, now).remaining).toBe(0);
  });

  it("hält Schlüssel auseinander", () => {
    const now = 1_000_000;
    consumeRateLimit("a", 1, 60_000, now);
    expect(consumeRateLimit("a", 1, 60_000, now).allowed).toBe(false);
    // Ein anderer Schlüssel darf davon nichts merken.
    expect(consumeRateLimit("b", 1, 60_000, now).allowed).toBe(true);
  });

  it("öffnet nach Ablauf des Fensters wieder", () => {
    const now = 1_000_000;
    consumeRateLimit("k", 1, 60_000, now);
    expect(consumeRateLimit("k", 1, 60_000, now).allowed).toBe(false);
    expect(consumeRateLimit("k", 1, 60_000, now + 60_001).allowed).toBe(true);
  });

  it("nennt eine Wartezeit von mindestens einer Sekunde", () => {
    const now = 1_000_000;
    consumeRateLimit("k", 1, 60_000, now);
    const blocked = consumeRateLimit("k", 1, 60_000, now + 59_999);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});

describe("Eimer je Benutzer statt je Adresse", () => {
  /*
    Die Achsenkorrektur aus 2.8.0, als Zusicherung festgehalten.

    Bis dahin zählte `rateLimited` ausschließlich nach IP. Für die Anmeldung ist
    das richtig – vorher gibt es nichts anderes –, für alles Angemeldete war es
    die falsche Achse: Eine Werkstatt hinter einem NAT teilte sich einen Eimer
    und sperrte sich gegenseitig aus, während ein Angreifer die Adresse ohnehin
    leichter wechselt als das Konto.

    Geprüft wird hier die Schlüsselbildung, nicht die Middleware: Dass aus
    Benutzer und Adresse verschiedene Schlüssel entstehen, ist die ganze
    Aussage – und sie lässt sich ohne tRPC-Kontext prüfen.
  */
  const KEY = "material.create";

  it("sperrt zwei Benutzer hinter einer Adresse nicht gegenseitig", () => {
    const now = 1_000_000;
    // Benutzer 1 reizt sein Kontingent aus.
    expect(consumeRateLimit(`${KEY}:u1`, 1, 60_000, now).allowed).toBe(true);
    expect(consumeRateLimit(`${KEY}:u1`, 1, 60_000, now).allowed).toBe(false);
    // Benutzer 2 am selben Anschluss darf trotzdem.
    expect(consumeRateLimit(`${KEY}:u2`, 1, 60_000, now).allowed).toBe(true);
  });

  it("hält Prozeduren desselben Benutzers auseinander", () => {
    const now = 1_000_000;
    consumeRateLimit(`${KEY}:u1`, 1, 60_000, now);
    expect(consumeRateLimit(`${KEY}:u1`, 1, 60_000, now).allowed).toBe(false);
    // Die Grundlast ist ein eigener Eimer und bleibt davon unberührt.
    expect(consumeRateLimit(`authed:u1`, 1, 60_000, now).allowed).toBe(true);
  });

  it("trennt Benutzer- und Adresseimer derselben Prozedur", () => {
    const now = 1_000_000;
    consumeRateLimit(`${KEY}:u1`, 1, 60_000, now);
    expect(consumeRateLimit(`${KEY}:u1`, 1, 60_000, now).allowed).toBe(false);
    /*
      Der Rückfall auf die Adresse, wenn wider Erwarten kein Benutzer im
      Kontext steht. Er darf den Benutzereimer weder füllen noch aus ihm
      schöpfen – sonst wäre die Sperre über eine fehlende Kopfzeile zu umgehen.
    */
    expect(consumeRateLimit(`${KEY}:203.0.113.9`, 1, 60_000, now).allowed).toBe(
      true
    );
  });
});

describe("clientIpFrom", () => {
  const headers = (values: Record<string, string>) => new Headers(values);

  it("nimmt bei einem Proxy den letzten Eintrag", () => {
    /*
      Der entscheidende Test. `x-forwarded-for` darf der Client selbst setzen,
      der Proxy hängt seinen Wert hinten an. Nähme man den ersten Eintrag,
      könnte ein Angreifer bei jedem Versuch eine andere Adresse behaupten und
      die Sperre wäre wirkungslos.
    */
    const ip = clientIpFrom(
      headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" })
    );
    expect(ip).toBe("203.0.113.9");
  });

  it("kommt mit einem einzelnen Eintrag zurecht", () => {
    expect(clientIpFrom(headers({ "x-forwarded-for": "203.0.113.9" }))).toBe(
      "203.0.113.9"
    );
  });

  it("räumt Leerzeichen weg", () => {
    expect(
      clientIpFrom(headers({ "x-forwarded-for": "  203.0.113.9  " }))
    ).toBe("203.0.113.9");
  });

  it("weicht auf x-real-ip aus", () => {
    expect(clientIpFrom(headers({ "x-real-ip": "203.0.113.9" }))).toBe(
      "203.0.113.9"
    );
  });

  it("liefert null, wenn nichts ankommt", () => {
    expect(clientIpFrom(headers({}))).toBeNull();
  });
});
