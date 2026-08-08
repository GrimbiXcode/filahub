import { beforeAll, describe, expect, it } from "vitest";
import * as jose from "jose";

/**
 * Session-Token: Signieren, Prüfen und die Fälle, in denen die Prüfung
 * scheitern *muss*.
 *
 * Der Modulimport passiert verzögert, weil `api/lib/env.ts` beim Laden
 * `process.env.APP_SECRET` liest. Ohne eigenes Secret hinge der Test an der
 * `.env` der Entwicklungsmaschine – und liefe bei jemand anderem anders.
 */

const SECRET = "test-secret-fuer-session-tests"; // allowlist-secret: nur im Test

let signSessionToken: typeof import("./telegram/session").signSessionToken;
let verifySessionToken: typeof import("./telegram/session").verifySessionToken;

beforeAll(async () => {
  process.env.APP_SECRET = SECRET;
  const mod = await import("./telegram/session");
  signSessionToken = mod.signSessionToken;
  verifySessionToken = mod.verifySessionToken;
});

const key = () => new TextEncoder().encode(SECRET);

describe("Session-Token", () => {
  it("übersteht Signieren und Prüfen", async () => {
    const token = await signSessionToken({ unionId: "42", tokenVersion: 3 });
    expect(await verifySessionToken(token)).toEqual({
      unionId: "42",
      tokenVersion: 3,
    });
  });

  it("weist eine leere Zeichenkette ab", async () => {
    expect(await verifySessionToken("")).toBeNull();
  });

  it("weist Unsinn ab", async () => {
    expect(await verifySessionToken("kein.gueltiges.token")).toBeNull();
  });

  it("weist ein mit fremdem Secret signiertes Token ab", async () => {
    const fremd = await new jose.SignJWT({ unionId: "42", tokenVersion: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("anderes-secret"));
    expect(await verifySessionToken(fremd)).toBeNull();
  });

  it("weist ein abgelaufenes Token ab", async () => {
    const abgelaufen = await new jose.SignJWT({
      unionId: "42",
      tokenVersion: 0,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(key());
    expect(await verifySessionToken(abgelaufen)).toBeNull();
  });

  it("weist ein Token ohne unionId ab", async () => {
    const ohne = await new jose.SignJWT({ tokenVersion: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key());
    expect(await verifySessionToken(ohne)).toBeNull();
  });

  /**
   * Der wichtigste Test der Datei. Ohne die Angabe `algorithms: ["HS256"]`
   * beim Prüfen akzeptierte jose auch `alg: none` – und jeder könnte sich ein
   * Token selbst ausstellen. Fällt die Festlegung bei einem Umbau weg, wird
   * das hier rot.
   */
  it("weist `alg: none` ab", async () => {
    const unsigned = new jose.UnsecuredJWT({
      unionId: "42",
      tokenVersion: 0,
    })
      .setIssuedAt()
      .setExpirationTime("1h")
      .encode();
    expect(await verifySessionToken(unsigned)).toBeNull();
  });

  it("weist ein anderes Signaturverfahren ab", async () => {
    // HS512 mit demselben Secret: gültig signiert, aber nicht das vereinbarte
    // Verfahren.
    const hs512 = await new jose.SignJWT({ unionId: "42", tokenVersion: 0 })
      .setProtectedHeader({ alg: "HS512" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key());
    expect(await verifySessionToken(hs512)).toBeNull();
  });

  it("liest Token ohne tokenVersion als Version 0", async () => {
    /*
      Bestandstoken aus der Zeit vor dem Widerruf. Als 0 zu lesen hält
      angemeldet, wer nichts widerrufen hat, und wirft hinaus, wer es tat.
    */
    const alt = await new jose.SignJWT({ unionId: "42" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key());
    expect(await verifySessionToken(alt)).toEqual({
      unionId: "42",
      tokenVersion: 0,
    });
  });

  it("läuft nicht später ab als das Cookie", async () => {
    const { Session } = await import("@contracts/constants");
    const token = await signSessionToken({ unionId: "42", tokenVersion: 0 });
    const { exp } = jose.decodeJwt(token);
    const erwartet = Math.floor((Date.now() + Session.maxAgeMs) / 1000);
    // Eine Sekunde Spielraum für die Laufzeit des Tests selbst.
    expect(Math.abs((exp ?? 0) - erwartet)).toBeLessThanOrEqual(1);
  });
});
