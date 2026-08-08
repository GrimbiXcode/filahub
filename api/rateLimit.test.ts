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
