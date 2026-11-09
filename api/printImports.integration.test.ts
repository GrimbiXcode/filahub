import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { BridgeConfig } from "@contracts/bridge";
import * as schema from "@db/schema";
import type { User } from "@db/schema";
import app from "./app";
import { openSecret } from "./lib/apiToken";
import { resetRateLimits } from "./lib/rateLimit";
import { deleteUserAccount } from "./queries/account";
import { blockUser } from "./queries/blocking";
import { getDb } from "./queries/connection";
import { purgeResolvedImports } from "./queries/printImports";
import { findUserByUnionId, upsertUser } from "./queries/users";
import {
  callerFor,
  closeDb,
  countRows,
  resetSchema,
} from "./test/integration-db";

/**
 * Eingangsfach, API-Schlüssel und Drucker-Brücke (seit 4.7.0) gegen eine
 * echte Datenbank: die Routen mit Schlüssel (`api/ingestRoutes.ts`) und die
 * Prozeduren `printImport.*` und `connection.*`.
 */

const db = () => getDb();
const PERSONAL = { organizationId: null } as const;

let anna: User;
let bert: User;

beforeAll(async () => {
  await resetSchema();
}, 60_000);

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await resetSchema();
  resetRateLimits();
  await upsertUser({ unionId: "anna-1", name: "Anna" });
  await upsertUser({ unionId: "bert-1", name: "Bert" });
  anna = (await findUserByUnionId("anna-1"))!;
  bert = (await findUserByUnionId("bert-1"))!;
}, 60_000);

// --- Helfer -----------------------------------------------------------------

async function newToken(
  user: User,
  kind: "slicer" | "bridge" = "slicer",
  organizationId: number | null = null
) {
  return callerFor(user).connection.create({
    kind,
    name: kind === "bridge" ? "Werkstatt" : "Laptop",
    organizationId,
  });
}

function slicedPrint(patch: Record<string, unknown> = {}) {
  return {
    source: "slicer",
    externalKey: "prusaslicer:abc",
    title: "Benchy",
    printedAt: new Date().toISOString(),
    durationMinutes: 63,
    printer: "MK4S",
    filaments: [
      {
        slot: 0,
        grams: 12.4,
        filamentType: "PLA",
        colorHex: "#1A1A1A",
        profileName: "Prusament PLA",
        vendor: "Prusa Polymers",
      },
      { slot: 1, grams: 0, filamentType: "PLA" },
    ],
    ...patch,
  };
}

function ingest(
  token: string | null,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return app.request("/api/ingest/print-imports", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function bridgeGet(token: string) {
  return app.request("/api/bridge/config", {
    headers: { authorization: `Bearer ${token}` },
  });
}

async function bridgeConfig(token: string): Promise<BridgeConfig> {
  return (await (await bridgeGet(token)).json()) as BridgeConfig;
}

function bridgeReport(token: string, body: unknown) {
  return app.request("/api/bridge/report", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function spoolFor(user: User, organizationId: number | null = null) {
  const lager = await callerFor(user).lager.create({
    organizationId,
    name: "Filament",
    materialKind: "filament",
    filamentDiameterUm: 1750,
  });
  await callerFor(user).material.create({
    organizationId,
    lagerId: lager!.id,
    nominalWeight: 1000,
    name: "Prusament PLA Galaxy Black",
    materialType: "PLA",
    manufacturer: "Prusament",
  });
  const [gebinde] = await callerFor(user).material.list({ organizationId });
  return gebinde;
}

// --- Einliefern ---------------------------------------------------------------

describe("Einliefern mit Schlüssel", () => {
  it("legt einen Eintrag an und entdoppelt Wiederholungen", async () => {
    const { token } = await newToken(anna);
    const first = await ingest(token, slicedPrint());
    expect(first.status).toBe(201);
    const again = await ingest(token, slicedPrint({ title: "Anders" }));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ duplicate: true });

    const [item, ...rest] = await callerFor(anna).printImport.list(PERSONAL);
    expect(rest).toEqual([]);
    expect(item).toMatchObject({
      source: "slicer",
      title: "Benchy",
      durationMinutes: 63,
      printer: "MK4S",
      tokenName: "Laptop",
      filaments: [
        {
          slot: 0,
          grams: 12,
          colorHex: "#1a1a1a",
          profileName: "Prusament PLA",
        },
      ],
    });
    expect(await callerFor(anna).printImport.count(PERSONAL)).toBe(1);
    // Bert sieht Annas Fach nicht
    expect(await callerFor(bert).printImport.list(PERSONAL)).toEqual([]);
  });

  it("weist fehlende, falsche und entzogene Schlüssel ab", async () => {
    expect((await ingest(null, slicedPrint())).status).toBe(401);
    expect((await ingest(`fh_${"x".repeat(43)}`, slicedPrint())).status).toBe(
      401
    );
    const { id, token } = await newToken(anna);
    await callerFor(anna).connection.revoke({ ...PERSONAL, id });
    expect((await ingest(token, slicedPrint())).status).toBe(401);
  });

  it("ignoriert ein Sitzungs-Cookie – nur der Schlüssel zählt", async () => {
    const response = await ingest(null, slicedPrint(), {
      cookie: "filament_sid=irgendwas",
    });
    expect(response.status).toBe(401);
  });

  it("protokolliert erst, wenn eine Adresse zu viele ungültige Schlüssel schickt", async () => {
    const bad = `fh_${"y".repeat(43)}`;
    for (let i = 0; i < 20; i++)
      expect(
        (await ingest(bad, {}, { "x-forwarded-for": "203.0.113.9" })).status
      ).toBe(401);
    const blocked = await ingest(bad, {}, { "x-forwarded-for": "203.0.113.9" });
    expect(blocked.status).toBe(429);
    await new Promise(resolve => setTimeout(resolve, 50));
    const audit = await db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.event, "api_token.invalid"));
    expect(audit).toHaveLength(1);
  });

  it("prüft den Körper", async () => {
    const { token } = await newToken(anna);
    expect((await ingest(token, "kein json")).status).toBe(400);
    const invalid = await ingest(token, slicedPrint({ title: "" }));
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({ code: "invalid_body" });
    const future = await ingest(
      token,
      slicedPrint({ printedAt: "2099-01-01T00:00:00Z" })
    );
    expect(future.status).toBe(422);
    const big = await ingest(token, slicedPrint({ title: "x".repeat(70_000) }));
    expect(big.status).toBe(413);
  });

  it("sperrt den Schlüssel mit dem Konto", async () => {
    const { token } = await newToken(anna);
    await blockUser({ userId: anna.id, blockedBy: bert.id, reason: "abuse" });
    const response = await ingest(token, slicedPrint());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "blocked" });
  });

  it("hält das Fach bei 500 offenen Einträgen an", async () => {
    const { token } = await newToken(anna);
    await db()
      .insert(schema.printImports)
      .values(
        Array.from({ length: 500 }, (_, i) => ({
          userId: anna.id,
          source: "slicer" as const,
          externalKey: `k${i}`,
          title: "x",
          printedAt: new Date(),
        }))
      );
    const response = await ingest(token, slicedPrint());
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: "inbox_full" });
  });
});

// --- Übernehmen und verwerfen -----------------------------------------------------

describe("Übernehmen", () => {
  it("legt einen Druck an, bucht ab und erledigt den Eintrag – genau einmal", async () => {
    const gebinde = await spoolFor(anna);
    const { token } = await newToken(anna);
    await ingest(token, slicedPrint());
    const [item] = await callerFor(anna).printImport.list(PERSONAL);
    const input = {
      ...PERSONAL,
      importId: item.id,
      title: item.title,
      printedAt: new Date(),
      status: "success" as const,
      durationMinutes: 63,
      printer: "MK4S",
      notes: null,
      tags: [],
      links: [],
      materials: [
        { productId: gebinde.productId, materialId: gebinde.id, grams: 12 },
      ],
    };
    // Zwei Klicks gleichzeitig: einer gewinnt, der andere bekommt CONFLICT
    const results = await Promise.allSettled([
      callerFor(anna).printImport.resolve(input),
      callerFor(anna).printImport.resolve(input),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({
      reason: { code: "CONFLICT" },
    });
    expect(await countRows("print_jobs")).toBe(1);
    expect(await countRows("consumptions")).toBe(1);
    expect(await callerFor(anna).printImport.list(PERSONAL)).toEqual([]);
    const [row] = await db().select().from(schema.printImports);
    expect(row.printJobId).not.toBeNull();
    expect(row.resolvedAt).not.toBeNull();
  });

  it("verwirft und räumt nach 30 Tagen ab", async () => {
    const { token } = await newToken(anna);
    await ingest(token, slicedPrint());
    const [item] = await callerFor(anna).printImport.list(PERSONAL);
    // Bert kann Annas Eintrag nicht verwerfen
    expect(
      await callerFor(bert).printImport.dismiss({ ...PERSONAL, ids: [item.id] })
    ).toEqual({ dismissed: 0 });
    expect(
      await callerFor(anna).printImport.dismiss({ ...PERSONAL, ids: [item.id] })
    ).toEqual({ dismissed: 1 });
    // Die Kennung bleibt belegt – eine Wiederholung kommt nicht zurück
    expect((await ingest(token, slicedPrint())).status).toBe(200);
    expect(await callerFor(anna).printImport.count(PERSONAL)).toBe(0);
    await db()
      .update(schema.printImports)
      .set({ resolvedAt: new Date(Date.now() - 31 * 24 * 3600 * 1000) });
    expect(await purgeResolvedImports()).toBe(1);
    expect(await countRows("print_imports")).toBe(0);
  });
});

// --- Organisation ----------------------------------------------------------------

describe("Schlüssel einer Organisation", () => {
  it("prüft die Stufe bei jedem Aufruf und endet mit der Mitgliedschaft", async () => {
    const org = await callerFor(anna).organization.create({ name: "Hub" });
    const inOrg = { organizationId: org.id };
    await db()
      .insert(schema.organizationMembers)
      .values({ organizationId: org.id, userId: bert.id, role: "viewer" });
    // viewer darf keinen Schlüssel anlegen
    await expect(newToken(bert, "slicer", org.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await db()
      .update(schema.organizationMembers)
      .set({ role: "weigher" })
      .where(eq(schema.organizationMembers.userId, bert.id));
    const { id, token } = await newToken(bert, "slicer", org.id);
    expect((await ingest(token, slicedPrint())).status).toBe(201);
    // Landet im Fach der Organisation, nicht in Berts eigenem
    expect(await callerFor(anna).printImport.count(inOrg)).toBe(1);
    expect(await callerFor(bert).printImport.count(PERSONAL)).toBe(0);

    // Herabgestuft: Der Schlüssel wirkt sofort nicht mehr
    await db()
      .update(schema.organizationMembers)
      .set({ role: "viewer" })
      .where(eq(schema.organizationMembers.userId, bert.id));
    expect(
      (await ingest(token, slicedPrint({ externalKey: "b" }))).status
    ).toBe(403);

    // Der Administrator sieht und entzieht fremde Schlüssel der Organisation
    const list = await callerFor(anna).connection.list(inOrg);
    expect(list.map(t => [t.id, t.mine, t.ownerName])).toEqual([
      [id, false, "Bert"],
    ]);
    expect(await callerFor(bert).connection.list(PERSONAL)).toEqual([]);

    // Entfernen aus der Organisation löscht den Schlüssel
    await callerFor(anna).organization.removeMember({
      organizationId: org.id,
      userId: bert.id,
    });
    expect(await countRows("api_tokens")).toBe(0);
  });
});

// --- Brücke ------------------------------------------------------------------------

describe("Drucker-Brücke", () => {
  it("liefert die Konfiguration samt Zugang nur an Brücken-Schlüssel", async () => {
    const slicer = await newToken(anna, "slicer");
    expect((await bridgeGet(slicer.token)).status).toBe(403);

    const bridge = await newToken(anna, "bridge");
    await callerFor(anna).connection.addPrinter({
      ...PERSONAL,
      tokenId: bridge.id,
      name: "MK4S",
      host: "192.168.1.50",
      authKind: "api_key",
      username: null,
      secret: "prusa-key-123",
      enabled: true,
    });
    const response = await bridgeGet(bridge.token);
    expect(response.status).toBe(200);
    const config = (await response.json()) as BridgeConfig;
    expect(config.printers).toEqual([
      expect.objectContaining({
        name: "MK4S",
        host: "http://192.168.1.50",
        authKind: "api_key",
        secret: "prusa-key-123",
      }),
    ]);
    // Ein neuer Drucker wird gleich getestet
    expect(config.printers[0].testRequestedAt).not.toBeNull();

    // Verschlüsselt gespeichert, nie im Klartext
    const [row] = await db().select().from(schema.bridgePrinters);
    expect(row.secretCiphertext).not.toContain("prusa-key-123");
    expect(openSecret(row.secretCiphertext)).toBe("prusa-key-123");

    // Die App bekommt den Zugang nie zurück
    const [listed] = await callerFor(anna).connection.list(PERSONAL);
    expect(JSON.stringify(listed)).not.toContain("prusa-key-123");
    expect(listed.printers[0]).toMatchObject({ hasSecret: true });
  });

  it("übernimmt Meldungen und beantwortet Testanfragen", async () => {
    const bridge = await newToken(anna, "bridge");
    const { id } = await callerFor(anna).connection.addPrinter({
      ...PERSONAL,
      tokenId: bridge.id,
      name: "MK4S",
      host: "mk4.local",
      authKind: "digest",
      username: "maker",
      secret: "pw",
      enabled: true,
    });
    const config = await bridgeConfig(bridge.token);
    const testAt = config.printers[0].testRequestedAt;
    const report = {
      protocol: 1,
      version: "4.7.0",
      startedAt: new Date().toISOString(),
      queued: 0,
      printers: [
        {
          id,
          state: "unauthorized",
          detail: "Benutzername oder Passwort abgelehnt",
          httpStatus: 401,
          checkedAt: new Date().toISOString(),
          testAnsweredFor: testAt,
          printerState: null,
          info: null,
          job: null,
          metaWarning: null,
        },
        // Ein fremder Drucker fällt still weg
        { id: 99_999, state: "ok", checkedAt: new Date().toISOString() },
      ],
      log: [{ at: new Date().toISOString(), level: "warn", message: "x" }],
    };
    expect((await bridgeReport(bridge.token, report)).status).toBe(200);
    const [listed] = await callerFor(anna).connection.list(PERSONAL);
    expect(listed.bridgeStatus).toMatchObject({ version: "4.7.0", queued: 0 });
    expect(listed.printers[0]).toMatchObject({
      testRequestedAt: null,
      status: { state: "unauthorized", httpStatus: 401 },
    });

    // „Verbindung testen“ setzt eine neue Anfrage
    await callerFor(anna).connection.testPrinter({
      ...PERSONAL,
      tokenId: bridge.id,
      id,
    });
    const after = await bridgeConfig(bridge.token);
    expect(after.printers[0].testRequestedAt).not.toBeNull();
  });

  it("lässt das Passwort beim Ändern stehen, wenn keins mitkommt", async () => {
    const bridge = await newToken(anna, "bridge");
    const { id } = await callerFor(anna).connection.addPrinter({
      ...PERSONAL,
      tokenId: bridge.id,
      name: "A",
      host: "10.0.0.5",
      authKind: "api_key",
      username: null,
      secret: "alt",
      enabled: true,
    });
    await callerFor(anna).connection.updatePrinter({
      ...PERSONAL,
      tokenId: bridge.id,
      id,
      name: "B",
      host: "10.0.0.6:8080",
      authKind: "api_key",
      username: null,
      enabled: true,
    });
    const config = await bridgeConfig(bridge.token);
    expect(config.printers[0]).toMatchObject({
      name: "B",
      host: "http://10.0.0.6:8080",
      secret: "alt",
    });
    await expect(
      callerFor(anna).connection.addPrinter({
        ...PERSONAL,
        tokenId: bridge.id,
        name: "X",
        host: "ftp://nope",
        authKind: "api_key",
        username: null,
        enabled: true,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Bert kommt an Annas Brücke nicht heran
    await expect(
      callerFor(bert).connection.removePrinter({
        ...PERSONAL,
        tokenId: bridge.id,
        id,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// --- Kaskaden --------------------------------------------------------------------

describe("Kaskaden", () => {
  it("löscht Schlüssel, Drucker und Fach mit dem Konto", async () => {
    const bridge = await newToken(anna, "bridge");
    await callerFor(anna).connection.addPrinter({
      ...PERSONAL,
      tokenId: bridge.id,
      name: "MK4S",
      host: "192.168.1.50",
      authKind: "api_key",
      username: null,
      secret: "k",
      enabled: true,
    });
    await ingest(bridge.token, { ...slicedPrint(), source: "printer" });
    await deleteUserAccount(anna.id);
    expect(await countRows("api_tokens")).toBe(0);
    expect(await countRows("bridge_printers")).toBe(0);
    expect(await countRows("print_imports")).toBe(0);
  });

  it("löscht beides mit der Organisation und zählt offene Einträge als Inhalt", async () => {
    const org = await callerFor(anna).organization.create({ name: "Hub" });
    const { token } = await newToken(anna, "slicer", org.id);
    await ingest(token, slicedPrint());
    // Ein offener Eintrag: die Organisation ist nicht leer
    await expect(
      callerFor(anna).organization.delete({ organizationId: org.id })
    ).rejects.toBeTruthy();
    await db()
      .update(schema.printImports)
      .set({ resolvedAt: new Date() })
      .where(and(eq(schema.printImports.organizationId, org.id)));
    await callerFor(anna).organization.delete({ organizationId: org.id });
    expect(await countRows("api_tokens")).toBe(0);
    expect(await countRows("print_imports")).toBe(0);
  });

  it("nimmt alles in den Datenexport auf – ohne Hash und Zugang", async () => {
    const bridge = await newToken(anna, "bridge");
    await callerFor(anna).connection.addPrinter({
      ...PERSONAL,
      tokenId: bridge.id,
      name: "MK4S",
      host: "192.168.1.50",
      authKind: "api_key",
      username: null,
      secret: "geheim-123",
      enabled: true,
    });
    await ingest(bridge.token, slicedPrint());
    const dump = await callerFor(anna).account.export();
    expect(dump.printImports).toHaveLength(1);
    expect(dump.apiTokens).toHaveLength(1);
    expect(dump.bridgePrinters).toHaveLength(1);
    const text = JSON.stringify(dump);
    expect(text).not.toContain("tokenHash");
    expect(text).not.toContain("secretCiphertext");
    expect(text).not.toContain(bridge.token);
  });
});
