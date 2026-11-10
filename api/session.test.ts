import { beforeAll, describe, expect, it } from "vitest";
import { decode, sign } from "hono/jwt";

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

const now = () => Math.floor(Date.now() / 1000);
const inOneHour = () => ({ iat: now(), exp: now() + 3600 });
const base64url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

/**
 * Ein Token, wie es `jose` bis 4.8.0 ausgestellt hat (Kopf ohne `typ`),
 * signiert mit `SECRET`, gültig bis 2100. Es hält fest, dass der Wechsel auf
 * `hono/jwt` keine bestehende Sitzung abmeldet.
 */
const JOSE_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJ1bmlvbklkIjoiNDIiLCJ0b2tlblZlcnNpb24iOjcsImNsaWVudElkIjoidGVsZWdyYW0iLCJpYXQiOjE3OTAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMH0.vV7h2GUX5-yo0vux5LcTPz-mO9SM0rxq2nzP48V4TJo";

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
    const fremd = await sign(
      { unionId: "42", tokenVersion: 0, ...inOneHour() },
      "anderes-secret",
      "HS256"
    );
    expect(await verifySessionToken(fremd)).toBeNull();
  });

  it("weist ein abgelaufenes Token ab", async () => {
    const abgelaufen = await sign(
      { unionId: "42", tokenVersion: 0, iat: now() - 7200, exp: now() - 3600 },
      SECRET,
      "HS256"
    );
    expect(await verifySessionToken(abgelaufen)).toBeNull();
  });

  it("weist ein Token ohne unionId ab", async () => {
    const ohne = await sign(
      { tokenVersion: 0, ...inOneHour() },
      SECRET,
      "HS256"
    );
    expect(await verifySessionToken(ohne)).toBeNull();
  });

  /**
   * Der wichtigste Test der Datei. Ohne festgelegtes Verfahren beim Prüfen
   * käme `alg: none` durch – und jeder könnte sich ein Token selbst
   * ausstellen. Fällt die Festlegung bei einem Umbau weg, wird
   * das hier rot.
   */
  it("weist `alg: none` ab", async () => {
    const unsigned = `${base64url({ alg: "none" })}.${base64url({
      unionId: "42",
      tokenVersion: 0,
      ...inOneHour(),
    })}.`;
    expect(await verifySessionToken(unsigned)).toBeNull();
  });

  it("weist ein anderes Signaturverfahren ab", async () => {
    // HS512 mit demselben Secret: gültig signiert, aber nicht das vereinbarte
    // Verfahren.
    const hs512 = await sign(
      { unionId: "42", tokenVersion: 0, ...inOneHour() },
      SECRET,
      "HS512"
    );
    expect(await verifySessionToken(hs512)).toBeNull();
  });

  it("liest Token ohne tokenVersion als Version 0", async () => {
    /*
      Bestandstoken aus der Zeit vor dem Widerruf. Als 0 zu lesen hält
      angemeldet, wer nichts widerrufen hat, und wirft hinaus, wer es tat.
    */
    const alt = await sign({ unionId: "42", ...inOneHour() }, SECRET, "HS256");
    expect(await verifySessionToken(alt)).toEqual({
      unionId: "42",
      tokenVersion: 0,
    });
  });

  it("läuft nicht später ab als das Cookie", async () => {
    const { Session } = await import("@contracts/constants");
    const token = await signSessionToken({ unionId: "42", tokenVersion: 0 });
    const { exp } = decode(token).payload;
    const erwartet = Math.floor((Date.now() + Session.maxAgeMs) / 1000);
    // Eine Sekunde Spielraum für die Laufzeit des Tests selbst.
    expect(Math.abs((exp ?? 0) - erwartet)).toBeLessThanOrEqual(1);
  });

  it("nimmt ein Token an, das noch `jose` ausgestellt hat", async () => {
    expect(await verifySessionToken(JOSE_TOKEN)).toEqual({
      unionId: "42",
      tokenVersion: 7,
    });
  });

  it("weist ein Token ohne Ablauf ab", async () => {
    const ewig = await sign(
      { unionId: "42", tokenVersion: 0, iat: now() },
      SECRET,
      "HS256"
    );
    expect(await verifySessionToken(ewig)).toBeNull();
  });

  it("weist ein Token mit nicht-textueller unionId ab", async () => {
    const zahl = await sign(
      { unionId: 42, tokenVersion: 0, ...inOneHour() },
      SECRET,
      "HS256"
    );
    expect(await verifySessionToken(zahl)).toBeNull();
  });
});
