/**
 * Druckhistorie gegen eine echte PostgreSQL-Datenbank (seit 4.2.0): die
 * Kopplung an die Verbräuche, Suche und Filter, Seiten, Stufen und Kaskaden.
 *
 * Läuft nur mit `npm run test:integration` und gesetzter `TEST_DATABASE_URL`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { PrintJobInput } from "@contracts/printJobs";
import { getDb } from "./queries/connection";
import { deleteUserAccount } from "./queries/account";
import { findUserByUnionId, upsertUser } from "./queries/users";
import * as schema from "@db/schema";
import type { User } from "@db/schema";
import {
  callerFor,
  closeDb,
  countRows,
  resetSchema,
} from "./test/integration-db";

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
  extra: { color?: string; organizationId?: number | null } = {}
) {
  return callerFor(user).material.create({
    organizationId: extra.organizationId ?? null,
    lagerId,
    name: `PolyTerra ${extra.color ?? "Schwarz"}`,
    materialType: "PLA",
    manufacturer: "Polymaker",
    color: extra.color ?? "Schwarz",
    nominalWeight: 1000,
  });
}

function job(overrides: Partial<PrintJobInput> = {}): PrintJobInput {
  return {
    title: "Vase",
    printedAt: new Date("2026-09-01T10:00:00Z"),
    status: "success",
    durationMinutes: 95,
    printer: "MK4",
    notes: null,
    tags: [],
    links: [],
    materials: [],
    ...overrides,
  };
}

async function remaining(user: User, materialId: number) {
  const detail = await callerFor(user).material.byId({
    ...PERSONAL,
    id: materialId,
  });
  return detail.remainingWeight;
}

describe("Druck erfassen und Verbrauch", () => {
  it("bucht je Zeile mit Gebinde einen Verbrauch ab", async () => {
    const lagerId = await lagerFor(anna);
    const a = await spool(anna, lagerId);
    const b = await spool(anna, lagerId, { color: "Rot" });
    const { id } = await callerFor(anna).print.create({
      ...PERSONAL,
      ...job({
        materials: [
          { productId: a.productId, materialId: a.id, grams: 42 },
          { productId: b.productId, materialId: b.id, grams: 8 },
          // Material ohne feststehende Rolle – wird nicht abgebucht (#41)
          { productId: b.productId, materialId: null, grams: 5 },
        ],
      }),
    });
    expect(await remaining(anna, a.id)).toBe(958);
    expect(await remaining(anna, b.id)).toBe(992);
    const detail = await callerFor(anna).print.byId({ ...PERSONAL, id });
    expect(detail.materials.map(m => [m.name, m.grams, m.booked])).toEqual([
      ["PolyTerra Schwarz", 42, true],
      ["PolyTerra Rot", 8, true],
      ["PolyTerra Rot", 5, false],
    ]);
    // Der Verbrauch trägt Zeitpunkt und Titel des Drucks
    const [consumption] = await db()
      .select()
      .from(schema.consumptions)
      .where(eq(schema.consumptions.materialId, a.id));
    expect(consumption).toMatchObject({ weight: 42, note: "Vase" });
    expect(consumption.consumedAt.toISOString()).toBe(
      "2026-09-01T10:00:00.000Z"
    );
  });

  it("bucht beim Ändern nur um, wenn Material oder Zeitpunkt sich ändern", async () => {
    const lagerId = await lagerFor(anna);
    const a = await spool(anna, lagerId);
    const input = job({
      materials: [{ productId: a.productId, materialId: a.id, grams: 42 }],
    });
    const { id } = await callerFor(anna).print.create({
      ...PERSONAL,
      ...input,
    });
    const before = await db().select().from(schema.consumptions);
    await callerFor(anna).print.update({
      ...PERSONAL,
      id,
      ...input,
      title: "Große Vase",
      tags: ["Deko"],
    });
    const same = await db().select().from(schema.consumptions);
    expect(same.map(c => c.id)).toEqual(before.map(c => c.id));
    await callerFor(anna).print.update({
      ...PERSONAL,
      id,
      ...input,
      materials: [{ productId: a.productId, materialId: a.id, grams: 50 }],
    });
    const after = await db().select().from(schema.consumptions);
    expect(after).toHaveLength(1);
    expect(after[0].id).not.toBe(before[0].id);
    expect(await remaining(anna, a.id)).toBe(950);
  });

  it("nimmt beim Löschen die Verbräuche auf Wunsch zurück", async () => {
    const lagerId = await lagerFor(anna);
    const a = await spool(anna, lagerId);
    const make = () =>
      callerFor(anna).print.create({
        ...PERSONAL,
        ...job({
          materials: [{ productId: a.productId, materialId: a.id, grams: 100 }],
        }),
      });
    const first = await make();
    const second = await make();
    expect(await remaining(anna, a.id)).toBe(800);
    await callerFor(anna).print.delete({
      ...PERSONAL,
      id: second.id,
      revertConsumptions: true,
    });
    expect(await remaining(anna, a.id)).toBe(900);
    await callerFor(anna).print.delete({
      ...PERSONAL,
      id: first.id,
      revertConsumptions: false,
    });
    expect(await remaining(anna, a.id)).toBe(900);
    expect(await countRows("print_jobs")).toBe(0);
    expect(await countRows("print_job_materials")).toBe(0);
  });

  it("löst die Buchung, wenn der Verbrauch einzeln gelöscht wird", async () => {
    const lagerId = await lagerFor(anna);
    const a = await spool(anna, lagerId);
    const { id } = await callerFor(anna).print.create({
      ...PERSONAL,
      ...job({
        materials: [{ productId: a.productId, materialId: a.id, grams: 10 }],
      }),
    });
    const [consumption] = await db().select().from(schema.consumptions);
    await callerFor(anna).material.deleteConsumption({
      ...PERSONAL,
      id: consumption.id,
    });
    const detail = await callerFor(anna).print.byId({ ...PERSONAL, id });
    expect(detail.materials[0].booked).toBe(false);
  });

  it("behält den Namen, wenn Gebinde und Material verschwinden", async () => {
    const lagerId = await lagerFor(anna);
    const a = await spool(anna, lagerId);
    const { id } = await callerFor(anna).print.create({
      ...PERSONAL,
      ...job({
        materials: [{ productId: a.productId, materialId: a.id, grams: 10 }],
      }),
    });
    await callerFor(anna).material.delete({ ...PERSONAL, id: a.id });
    const detail = await callerFor(anna).print.byId({ ...PERSONAL, id });
    expect(detail.materials[0]).toMatchObject({
      name: "PolyTerra Schwarz",
      productId: null,
      materialId: null,
      booked: false,
      grams: 10,
    });
  });

  it("behält beim Bearbeiten Zeilen, deren Material gelöscht ist", async () => {
    const lagerId = await lagerFor(anna);
    const a = await spool(anna, lagerId);
    const b = await spool(anna, lagerId, { color: "Rot" });
    const { id } = await callerFor(anna).print.create({
      ...PERSONAL,
      ...job({
        materials: [
          { productId: a.productId, materialId: a.id, grams: 10 },
          { productId: b.productId, materialId: b.id, grams: 20 },
        ],
      }),
    });
    await callerFor(anna).material.delete({ ...PERSONAL, id: a.id });
    // Das Formular kann die verwaiste Zeile nicht mitschicken – und bucht um
    await callerFor(anna).print.update({
      ...PERSONAL,
      id,
      ...job({
        materials: [{ productId: b.productId, materialId: b.id, grams: 25 }],
      }),
    });
    const detail = await callerFor(anna).print.byId({ ...PERSONAL, id });
    expect(detail.materials.map(m => [m.name, m.productId, m.grams])).toEqual([
      ["PolyTerra Schwarz", null, 10],
      ["PolyTerra Rot", b.productId, 25],
    ]);
    expect(await remaining(anna, b.id)).toBe(975);
  });

  it("lässt einen Druck umdatieren, dessen Rolle inzwischen aufgebraucht ist", async () => {
    const lagerId = await lagerFor(anna);
    const a = await spool(anna, lagerId);
    const b = await spool(anna, lagerId, { color: "Rot" });
    const { id } = await callerFor(anna).print.create({
      ...PERSONAL,
      ...job({
        materials: [{ productId: a.productId, materialId: a.id, grams: 10 }],
      }),
    });
    await callerFor(anna).material.setArchived({
      ...PERSONAL,
      id: a.id,
      archived: true,
    });
    const later = new Date("2026-09-02T10:00:00Z");
    await callerFor(anna).print.update({
      ...PERSONAL,
      id,
      ...job({
        printedAt: later,
        materials: [{ productId: a.productId, materialId: a.id, grams: 10 }],
      }),
    });
    const [consumption] = await db()
      .select()
      .from(schema.consumptions)
      .where(eq(schema.consumptions.materialId, a.id));
    expect(consumption.consumedAt).toEqual(later);
    // Neu hinzukommen darf das aufgebrauchte Gebinde aber nicht
    await callerFor(anna).material.setArchived({
      ...PERSONAL,
      id: b.id,
      archived: true,
    });
    await expect(
      callerFor(anna).print.update({
        ...PERSONAL,
        id,
        ...job({
          printedAt: later,
          materials: [
            { productId: a.productId, materialId: a.id, grams: 10 },
            { productId: b.productId, materialId: b.id, grams: 5 },
          ],
        }),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("zieht beim Zusammenführen mit", async () => {
    const lagerId = await lagerFor(anna);
    const a = await spool(anna, lagerId);
    const b = await spool(anna, lagerId);
    const { id } = await callerFor(anna).print.create({
      ...PERSONAL,
      ...job({
        materials: [{ productId: b.productId, materialId: b.id, grams: 10 }],
      }),
    });
    await callerFor(anna).product.merge({
      ...PERSONAL,
      sourceId: b.productId,
      targetId: a.productId,
    });
    const detail = await callerFor(anna).print.byId({ ...PERSONAL, id });
    expect(detail.materials[0].productId).toBe(a.productId);
    const list = await callerFor(anna).print.list({
      ...PERSONAL,
      productId: a.productId,
    });
    expect(list.items.map(i => i.id)).toEqual([id]);
  });

  it("lehnt fremde, unpassende und aufgebrauchte Gebinde ab", async () => {
    const lagerId = await lagerFor(anna);
    const a = await spool(anna, lagerId);
    const b = await spool(anna, lagerId, { color: "Rot" });
    const berts = await spool(bert, await lagerFor(bert));
    const attempt = (materials: PrintJobInput["materials"]) =>
      callerFor(anna).print.create({ ...PERSONAL, ...job({ materials }) });
    await expect(
      attempt([{ productId: berts.productId, materialId: null, grams: 1 }])
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      attempt([{ productId: a.productId, materialId: berts.id, grams: 1 }])
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Gebinde gehört nicht zum genannten Material
    await expect(
      attempt([{ productId: a.productId, materialId: b.id, grams: 1 }])
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await callerFor(anna).material.setArchived({
      ...PERSONAL,
      id: a.id,
      archived: true,
    });
    await expect(
      attempt([{ productId: a.productId, materialId: a.id, grams: 5 }])
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Nichts davon hat eine Spur hinterlassen
    expect(await countRows("print_jobs")).toBe(0);
    expect(await countRows("consumptions")).toBe(0);
  });

  it("nimmt nur https-Links", async () => {
    await expect(
      callerFor(anna).print.create({
        ...PERSONAL,
        ...job({ links: [{ url: "javascript:alert(1)" }] }),
      })
    ).rejects.toThrow();
  });
});

describe("Suche, Filter und Seiten", () => {
  it("findet über Titel, Notizen, Tags, Links und Material", async () => {
    const lagerId = await lagerFor(anna);
    const a = await spool(anna, lagerId, { color: "Galaxy" });
    const make = (overrides: Partial<PrintJobInput>) =>
      callerFor(anna).print.create({ ...PERSONAL, ...job(overrides) });
    const byTitle = await make({ title: "Zahnrad" });
    const byNotes = await make({ title: "X", notes: "mit Brim gedruckt" });
    const byTag = await make({ title: "Y", tags: ["Geschenk"] });
    const byLink = await make({
      title: "Z",
      links: [{ url: "https://www.printables.com/model/123-benchy" }],
    });
    const byMaterial = await make({
      title: "W",
      materials: [{ productId: a.productId, materialId: null, grams: 1 }],
    });
    const search = async (query: string) =>
      (await callerFor(anna).print.list({ ...PERSONAL, query })).items.map(
        i => i.id
      );
    expect(await search("zahn")).toEqual([byTitle.id]);
    expect(await search("brim")).toEqual([byNotes.id]);
    expect(await search("geschenk")).toEqual([byTag.id]);
    expect(await search("benchy")).toEqual([byLink.id]);
    expect(await search("galaxy")).toEqual([byMaterial.id]);
    // Platzhalter werden maskiert
    expect(await search("%%")).toEqual([]);
    // Zu kurz: kein Filter
    expect(await search("z")).toHaveLength(5);
  });

  it("filtert nach Status, Tag, Drucker, Materialart und Zeitraum", async () => {
    const lagerId = await lagerFor(anna);
    const a = await spool(anna, lagerId);
    const make = (overrides: Partial<PrintJobInput>) =>
      callerFor(anna).print.create({ ...PERSONAL, ...job(overrides) });
    const failed = await make({ status: "failed", tags: ["test"] });
    const other = await make({
      printer: "Bambu X1",
      printedAt: new Date("2026-01-01T00:00:00Z"),
      materials: [{ productId: a.productId, materialId: null, grams: 3 }],
    });
    const ids = async (filters: Record<string, unknown>) =>
      (await callerFor(anna).print.list({ ...PERSONAL, ...filters })).items.map(
        i => i.id
      );
    expect(await ids({ status: "failed" })).toEqual([failed.id]);
    expect(await ids({ tag: "TEST" })).toEqual([failed.id]);
    expect(await ids({ printer: "Bambu X1" })).toEqual([other.id]);
    expect(await ids({ materialType: " pla " })).toEqual([other.id]);
    expect(await ids({ from: new Date("2026-06-01T00:00:00Z") })).toEqual([
      failed.id,
    ]);
    const facets = await callerFor(anna).print.facets(PERSONAL);
    expect(facets).toEqual({ printers: ["Bambu X1", "MK4"], tags: ["test"] });
  });

  it("liefert seitenweise, neueste zuerst", async () => {
    for (let i = 0; i < 35; i++) {
      await callerFor(anna).print.create({
        ...PERSONAL,
        // Gleicher Zeitpunkt für einige – der Cursor muss die ID mitnehmen
        ...job({
          title: `Druck ${i}`,
          printedAt: new Date(Date.UTC(2026, 0, 1, Math.floor(i / 2))),
        }),
      });
    }
    const first = await callerFor(anna).print.list({ ...PERSONAL });
    expect(first.items).toHaveLength(30);
    expect(first.nextCursor).not.toBeNull();
    const second = await callerFor(anna).print.list({
      ...PERSONAL,
      cursor: first.nextCursor,
    });
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    const all = [...first.items, ...second.items].map(i => i.title);
    expect(new Set(all).size).toBe(35);
    expect(all[0]).toBe("Druck 34");
  });

  it("zeigt nur den eigenen Bereich", async () => {
    await callerFor(anna).print.create({ ...PERSONAL, ...job() });
    expect((await callerFor(bert).print.list(PERSONAL)).items).toHaveLength(0);
    const [annas] = (await callerFor(anna).print.list(PERSONAL)).items;
    await expect(
      callerFor(bert).print.byId({ ...PERSONAL, id: annas.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("Stufen in einer Organisation", () => {
  it("lässt weigher erfassen und nur den eigenen gerade eben löschen", async () => {
    const org = await callerFor(anna).organization.create({ name: "Hub" });
    const inOrg = { organizationId: org.id };
    const lagerId = await lagerFor(anna, org.id);
    const a = await spool(anna, lagerId, { organizationId: org.id });
    await db()
      .insert(schema.organizationMembers)
      .values({ organizationId: org.id, userId: bert.id, role: "viewer" });
    await expect(
      callerFor(bert).print.create({ ...inOrg, ...job() })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db()
      .update(schema.organizationMembers)
      .set({ role: "weigher" })
      .where(eq(schema.organizationMembers.userId, bert.id));
    const older = await callerFor(anna).print.create({ ...inOrg, ...job() });
    const own = await callerFor(bert).print.create({
      ...inOrg,
      ...job({
        materials: [{ productId: a.productId, materialId: a.id, grams: 5 }],
      }),
    });
    // Ändern ist editor
    await expect(
      callerFor(bert).print.update({ ...inOrg, id: own.id, ...job() })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Ein älterer Druck: nicht der zuletzt erfasste
    await expect(
      callerFor(bert).print.delete({
        ...inOrg,
        id: older.id,
        revertConsumptions: false,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const detail = await callerFor(bert).print.byId({ ...inOrg, id: own.id });
    expect(detail.canDelete).toBe(true);
    await callerFor(bert).print.delete({
      ...inOrg,
      id: own.id,
      revertConsumptions: true,
    });
    expect(await countRows("consumptions")).toBe(0);
  });
});

describe("Kontolöschung", () => {
  it("nimmt die Druckhistorie mit", async () => {
    const lagerId = await lagerFor(anna);
    const a = await spool(anna, lagerId);
    await callerFor(anna).print.create({
      ...PERSONAL,
      ...job({
        links: [{ url: "https://example.org/x" }],
        materials: [{ productId: a.productId, materialId: a.id, grams: 5 }],
      }),
    });
    await deleteUserAccount(anna.id);
    expect(await countRows("print_jobs")).toBe(0);
    expect(await countRows("print_job_materials")).toBe(0);
    expect(await countRows("print_job_links")).toBe(0);
  });
});
