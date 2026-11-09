/**
 * Sammelbearbeitung (`material.updateMany`, seit 4.6.0) gegen eine echte
 * PostgreSQL-Datenbank: alles oder nichts, Bereichsgrenze, Stufen und die
 * Drybox aus dem eigenen Bereich.
 *
 * Läuft nur mit `npm run test:integration` und gesetzter `TEST_DATABASE_URL`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { findUserByUnionId, upsertUser } from "./queries/users";
import * as schema from "@db/schema";
import type { User } from "@db/schema";
import { callerFor, closeDb, resetSchema } from "./test/integration-db";

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
  await upsertUser({ unionId: "anna-1", name: "Anna" });
  await upsertUser({ unionId: "bert-1", name: "Bert" });
  anna = (await findUserByUnionId("anna-1"))!;
  bert = (await findUserByUnionId("bert-1"))!;
}, 60_000);

async function lagerFor(user: User, organizationId: number | null = null) {
  const lager = await callerFor(user).lager.create({
    organizationId,
    name: "Filament",
    materialKind: "filament",
    filamentDiameterUm: 1750,
  });
  return lager!.id;
}

async function spool(
  user: User,
  lagerId: number,
  color: string,
  organizationId: number | null = null
) {
  const created = await callerFor(user).material.create({
    organizationId,
    lagerId,
    name: `PolyTerra ${color}`,
    materialType: "PLA",
    manufacturer: "Polymaker",
    color,
    nominalWeight: 1000,
    priceCents: 1999,
  });
  return created.id;
}

async function rows(ids: number[]) {
  return db()
    .select()
    .from(schema.materials)
    .where(inArray(schema.materials.id, ids))
    .orderBy(schema.materials.id);
}

describe("material.updateMany", () => {
  it("setzt die angehakten Felder für alle und lässt den Rest stehen", async () => {
    const lagerId = await lagerFor(anna);
    const ids = [
      await spool(anna, lagerId, "Schwarz"),
      await spool(anna, lagerId, "Weiß"),
    ];
    const box = await callerFor(anna).storageBox.create({
      ...PERSONAL,
      name: "Drybox 1",
      tareWeight: 800,
    });
    const result = await callerFor(anna).material.updateMany({
      ...PERSONAL,
      ids: [...ids, ids[0]],
      patch: { priceCents: 2499, storageBoxId: box!.id },
    });
    expect(result).toEqual({ updated: 2 });
    for (const row of await rows(ids)) {
      expect(row.priceCents).toBe(2499);
      expect(row.storageBoxId).toBe(box!.id);
      expect(row.nominalWeight).toBe(1000);
      expect(row.purchaseDate).toBeNull();
    }

    // `null` leert
    await callerFor(anna).material.updateMany({
      ...PERSONAL,
      ids,
      patch: { priceCents: null, purchaseDate: "2026-10-01" },
    });
    for (const row of await rows(ids)) {
      expect(row.priceCents).toBeNull();
      expect(row.purchaseDate).toBe("2026-10-01");
      expect(row.storageBoxId).toBe(box!.id);
    }
  });

  it("markiert als aufgebraucht und behält den ersten Zeitpunkt", async () => {
    const lagerId = await lagerFor(anna);
    const first = await spool(anna, lagerId, "Schwarz");
    const second = await spool(anna, lagerId, "Weiß");
    const earlier = new Date("2026-01-01T00:00:00Z");
    await db()
      .update(schema.materials)
      .set({ archivedAt: earlier })
      .where(eq(schema.materials.id, first));
    await callerFor(anna).material.updateMany({
      ...PERSONAL,
      ids: [first, second],
      patch: { archived: true },
    });
    const [a, b] = await rows([first, second]);
    expect(a.archivedAt?.toISOString()).toBe(earlier.toISOString());
    expect(b.archivedAt).not.toBeNull();
  });

  it("ändert nichts, wenn auch nur ein Gebinde fremd ist", async () => {
    const annasLager = await lagerFor(anna);
    const own = await spool(anna, annasLager, "Schwarz");
    const foreign = await spool(bert, await lagerFor(bert), "Rot");
    await expect(
      callerFor(anna).material.updateMany({
        ...PERSONAL,
        ids: [own, foreign],
        patch: { priceCents: 1 },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const [ownRow, foreignRow] = await rows([own, foreign]);
    expect(ownRow.priceCents).toBe(1999);
    expect(foreignRow.priceCents).toBe(1999);
  });

  it("nimmt keine fremde Drybox an", async () => {
    const own = await spool(anna, await lagerFor(anna), "Schwarz");
    const bertsBox = await callerFor(bert).storageBox.create({
      ...PERSONAL,
      name: "Berts Box",
      tareWeight: 500,
    });
    await expect(
      callerFor(anna).material.updateMany({
        ...PERSONAL,
        ids: [own],
        patch: { storageBoxId: bertsBox!.id },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await rows([own]))[0].storageBoxId).toBeNull();
  });

  it("lehnt einen leeren Änderungssatz ab", async () => {
    const own = await spool(anna, await lagerFor(anna), "Schwarz");
    await expect(
      callerFor(anna).material.updateMany({
        ...PERSONAL,
        ids: [own],
        patch: {},
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("verlangt in einer Organisation die Stufe editor", async () => {
    const orgId = (await callerFor(anna).organization.create({ name: "Hub" }))
      .id;
    const inOrg = { organizationId: orgId };
    const lagerId = await lagerFor(anna, orgId);
    const id = await spool(anna, lagerId, "Schwarz", orgId);
    await db()
      .insert(schema.organizationMembers)
      .values({ organizationId: orgId, userId: bert.id, role: "weigher" });
    await expect(
      callerFor(bert).material.updateMany({
        ...inOrg,
        ids: [id],
        patch: { priceCents: 1 },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db()
      .update(schema.organizationMembers)
      .set({ role: "editor" })
      .where(eq(schema.organizationMembers.userId, bert.id));
    await callerFor(bert).material.updateMany({
      ...inOrg,
      ids: [id],
      patch: { priceCents: 1 },
    });
    expect((await rows([id]))[0].priceCents).toBe(1);
    // Aus dem privaten Bereich ist das Org-Gebinde nicht erreichbar
    await expect(
      callerFor(anna).material.updateMany({
        ...PERSONAL,
        ids: [id],
        patch: { priceCents: 2 },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
