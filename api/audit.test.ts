import { beforeAll, describe, expect, it } from "vitest";
import { AUDIT_EVENTS, AUDIT_RETENTION_DAYS } from "@contracts/audit";

/**
 * Der Fingerabdruck der Client-Adresse.
 *
 * Verzögerter Import, weil `api/lib/env.ts` beim Laden `APP_SECRET` liest –
 * genau der Schlüssel, um den es hier geht.
 */

const SECRET = "audit-test-secret"; // allowlist-secret: nur im Test

let hashIp: typeof import("./queries/audit").hashIp;

beforeAll(async () => {
  process.env.APP_SECRET = SECRET;
  hashIp = (await import("./queries/audit")).hashIp;
});

describe("hashIp", () => {
  it("gibt die Adresse nicht im Klartext zurück", () => {
    const hash = hashIp("203.0.113.9");
    expect(hash).not.toBeNull();
    expect(hash).not.toContain("203.0.113.9");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("erkennt dieselbe Adresse wieder", () => {
    // Ohne diese Eigenschaft wäre das Protokoll zur Aufklärung wertlos.
    expect(hashIp("203.0.113.9")).toBe(hashIp("203.0.113.9"));
  });

  it("unterscheidet verschiedene Adressen", () => {
    expect(hashIp("203.0.113.9")).not.toBe(hashIp("203.0.113.10"));
  });

  it("gibt null zurück, wenn keine Adresse bekannt ist", () => {
    expect(hashIp(null)).toBeNull();
    expect(hashIp(undefined)).toBeNull();
    expect(hashIp("")).toBeNull();
  });

  it("hängt vom Schlüssel ab, ist also kein einfacher Hash", async () => {
    /*
      Der Kern der Sache. Ein blanker SHA256 wäre bei IPv4 praktisch
      Klartext: 2^32 Werte lassen sich in Minuten durchrechnen. Erst der
      Schlüssel macht die Zuordnung für Dritte unmöglich.
    */
    const { createHash } = await import("node:crypto");
    const plain = createHash("sha256").update("203.0.113.9").digest("hex");
    expect(hashIp("203.0.113.9")).not.toBe(plain);
  });
});

describe("Ereignisliste", () => {
  it("enthält keine Doppelungen", () => {
    expect(new Set(AUDIT_EVENTS).size).toBe(AUDIT_EVENTS.length);
  });

  it("passt in die Spaltenbreite von 64 Zeichen", () => {
    for (const event of AUDIT_EVENTS) {
      expect(event.length, event).toBeLessThanOrEqual(64);
    }
  });

  it("hält eine begrenzte Aufbewahrung fest", () => {
    // Das Protokoll ist selbst personenbezogen; unbegrenzt wäre es von
    // Art. 6 Abs. 1 lit. f nicht gedeckt.
    expect(AUDIT_RETENTION_DAYS).toBeGreaterThan(0);
    expect(AUDIT_RETENTION_DAYS).toBeLessThanOrEqual(365);
  });
});
