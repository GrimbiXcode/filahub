/**
 * Drucker und geladene Gebinde (`printer.*`, seit 4.9.0) gegen eine echte
 * PostgreSQL-Datenbank: Bereichsgrenze, Stufen, eine Rolle in genau einem
 * Platz, Entladen beim Aufbrauchen und Löschen, die Kaskaden.
 *
 * Läuft nur mit `npm run test:integration` und gesetzter `TEST_DATABASE_URL`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { deleteUserAccount } from "./queries/account";
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
  });
  return created.id;
}

async function printer(
  user: User,
  name: string,
  slotCount: number,
  organizationId: number | null = null
) {
  return (
    await callerFor(user).printer.create({ organizationId, name, slotCount })
  ).id;
}

const slotRows = () => db().select().from(schema.printerSlots);

describe("printer.*", () => {
  it("lädt, verschiebt und entlädt ein Gebinde", async () => {
    const lagerId = await lagerFor(anna);
    const black = await spool(anna, lagerId, "Schwarz");
    const mk4 = await printer(anna, "Prusa MK4S", 1);
    const mmu = await printer(anna, "Core One", 5);

    await callerFor(anna).printer.loadSlot({
      ...PERSONAL,
      printerId: mk4,
      slot: 0,
      materialId: black,
    });
    const list = await callerFor(anna).printer.list(PERSONAL);
    expect(list.map(p => [p.name, p.slots])).toEqual([
      ["Core One", []],
      ["Prusa MK4S", [{ slot: 0, materialId: black }]],
    ]);

    // Woanders laden nimmt die Rolle aus dem ersten Drucker
    await callerFor(anna).printer.loadSlot({
      ...PERSONAL,
      printerId: mmu,
      slot: 3,
      materialId: black,
    });
    expect(await slotRows()).toMatchObject([
      { printerId: mmu, slot: 3, materialId: black },
    ]);

    // Weniger Plätze entladen, was darüber lag
    await callerFor(anna).printer.update({
      ...PERSONAL,
      id: mmu,
      slotCount: 2,
    });
    expect(await slotRows()).toEqual([]);

    await expect(
      callerFor(anna).printer.loadSlot({
        ...PERSONAL,
        printerId: mmu,
        slot: 2,
        materialId: black,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await callerFor(anna).printer.loadSlot({
      ...PERSONAL,
      printerId: mk4,
      slot: 0,
      materialId: black,
    });
    await callerFor(anna).printer.loadSlot({
      ...PERSONAL,
      printerId: mk4,
      slot: 0,
      materialId: null,
    });
    expect(await slotRows()).toEqual([]);
  });

  it("verlangt eindeutige Namen je Bereich", async () => {
    await printer(anna, "Prusa MK4S", 1);
    await expect(printer(anna, "prusa mk4s", 1)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    // Ein anderer Bereich darf denselben Namen tragen
    await printer(bert, "Prusa MK4S", 1);
  });

  it("lädt weder fremde noch aufgebrauchte Gebinde", async () => {
    const mk4 = await printer(anna, "MK4", 1);
    const foreign = await spool(bert, await lagerFor(bert), "Rot");
    await expect(
      callerFor(anna).printer.loadSlot({
        ...PERSONAL,
        printerId: mk4,
        slot: 0,
        materialId: foreign,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Fremder Drucker
    await expect(
      callerFor(bert).printer.loadSlot({
        ...PERSONAL,
        printerId: mk4,
        slot: 0,
        materialId: foreign,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const own = await spool(anna, await lagerFor(anna), "Schwarz");
    await callerFor(anna).material.setArchived({
      ...PERSONAL,
      id: own,
      archived: true,
    });
    await expect(
      callerFor(anna).printer.loadSlot({
        ...PERSONAL,
        printerId: mk4,
        slot: 0,
        materialId: own,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("entlädt beim Aufbrauchen, Sammel-Aufbrauchen und Löschen", async () => {
    const lagerId = await lagerFor(anna);
    const ids = [
      await spool(anna, lagerId, "Schwarz"),
      await spool(anna, lagerId, "Weiß"),
      await spool(anna, lagerId, "Rot"),
    ];
    const mmu = await printer(anna, "Core One", 5);
    for (const [slot, materialId] of ids.entries())
      await callerFor(anna).printer.loadSlot({
        ...PERSONAL,
        printerId: mmu,
        slot,
        materialId,
      });
    expect(await slotRows()).toHaveLength(3);

    await callerFor(anna).material.setArchived({
      ...PERSONAL,
      id: ids[0],
      archived: true,
    });
    await callerFor(anna).material.updateMany({
      ...PERSONAL,
      ids: [ids[1]],
      patch: { archived: true },
    });
    expect((await slotRows()).map(r => r.materialId)).toEqual([ids[2]]);

    await callerFor(anna).material.delete({ ...PERSONAL, id: ids[2] });
    expect(await slotRows()).toEqual([]);
  });

  it("hält die Stufen ein: viewer sieht, weigher lädt, editor richtet ein", async () => {
    const orgId = (await callerFor(anna).organization.create({ name: "Hub" }))
      .id;
    const inOrg = { organizationId: orgId };
    const id = await spool(anna, await lagerFor(anna, orgId), "Schwarz", orgId);
    const mk4 = await printer(anna, "MK4", 1, orgId);
    await db()
      .insert(schema.organizationMembers)
      .values({ organizationId: orgId, userId: bert.id, role: "viewer" });

    expect(await callerFor(bert).printer.list(inOrg)).toHaveLength(1);
    await expect(
      callerFor(bert).printer.loadSlot({
        ...inOrg,
        printerId: mk4,
        slot: 0,
        materialId: id,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await db()
      .update(schema.organizationMembers)
      .set({ role: "weigher" })
      .where(eq(schema.organizationMembers.userId, bert.id));
    await callerFor(bert).printer.loadSlot({
      ...inOrg,
      printerId: mk4,
      slot: 0,
      materialId: id,
    });
    await expect(
      callerFor(bert).printer.create({ ...inOrg, name: "XL", slotCount: 5 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      callerFor(bert).printer.delete({ ...inOrg, id: mk4 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Aus dem privaten Bereich ist der Org-Drucker unsichtbar
    expect(await callerFor(anna).printer.list(PERSONAL)).toEqual([]);
    await expect(
      callerFor(anna).printer.delete({ ...PERSONAL, id: mk4 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("zählt bei „Organisation leer?“ mit und geht mit ihr", async () => {
    const orgId = (await callerFor(anna).organization.create({ name: "Leer" }))
      .id;
    const id = await printer(anna, "MK4", 1, orgId);
    await expect(
      callerFor(anna).organization.delete({ organizationId: orgId })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await callerFor(anna).printer.delete({ organizationId: orgId, id });
    await callerFor(anna).organization.delete({ organizationId: orgId });
  });

  it("geht mit dem Konto", async () => {
    const id = await spool(anna, await lagerFor(anna), "Schwarz");
    const mk4 = await printer(anna, "MK4", 1);
    await callerFor(anna).printer.loadSlot({
      ...PERSONAL,
      printerId: mk4,
      slot: 0,
      materialId: id,
    });
    await printer(bert, "MK4", 1);
    await deleteUserAccount(anna.id);
    const left = await db().select().from(schema.printers);
    expect(left.map(p => p.userId)).toEqual([bert.id]);
    expect(await slotRows()).toEqual([]);
  });
});
