/**
 * Materialarten gegen eine echte PostgreSQL-Datenbank: welche Schreibweise der
 * Router speichert, und was die Migration `0019_material_type_case.sql` aus
 * einem Altbestand mit Dubletten macht.
 *
 * Läuft nur mit `npm run test:integration` und gesetzter `TEST_DATABASE_URL`.
 */
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { upsertUser, findUserByUnionId } from "./queries/users";
import * as schema from "@db/schema";
import type { User } from "@db/schema";
import { callerFor, closeDb, resetSchema } from "./test/integration-db";

const db = () => getDb();

/** Der persönliche Bereich – ausgeschrieben, siehe `lager.integration.test.ts`. */
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
});

/** Ein Filament-Lager im angegebenen Bereich; liefert seine ID. */
async function lagerFor(user: User, organizationId: number | null = null) {
  const lager = await callerFor(user).lager.create({
    organizationId,
    name: "Filament",
    materialKind: "filament",
    filamentDiameterUm: 1750,
  });
  return lager!.id;
}

/** Ein Material mit dieser Materialart, sonst Vorgaben; liefert seine ID. */
async function createWithType(
  user: User,
  lagerId: number,
  materialType: string,
  organizationId: number | null = null
) {
  const { id } = await callerFor(user).material.create({
    organizationId,
    lagerId,
    name: "Rolle",
    materialType,
    nominalWeight: 1000,
  });
  return id;
}

/** Die Materialarten eines Bereichs, wie der Router sie liefert, sortiert. */
async function typesOf(user: User, organizationId: number | null = null) {
  const list = await callerFor(user).material.list({ organizationId });
  return list.map(m => m.materialType).sort();
}

describe("Schreibweise beim Anlegen und Ändern", () => {
  it("nimmt die Schreibweise der Vorschlagsliste", async () => {
    const lagerId = await lagerFor(anna);
    await createWithType(anna, lagerId, "pla");
    await createWithType(anna, lagerId, " Petg ");
    await createWithType(anna, lagerId, "pa  (nylon)");
    expect(await typesOf(anna)).toEqual(["PA (Nylon)", "PETG", "PLA"]);
  });

  it("nimmt sonst die Schreibweise, die im Bereich schon steht", async () => {
    const lagerId = await lagerFor(anna);
    await createWithType(anna, lagerId, "Nylon");
    await createWithType(anna, lagerId, "nylon");
    await createWithType(anna, lagerId, "NYLON");
    expect(await typesOf(anna)).toEqual(["Nylon", "Nylon", "Nylon"]);
  });

  it("lässt den Bereich eines anderen unberührt", async () => {
    // „Nylon“ ist nicht in der Vorschlagsliste – Berts Schreibweise ist seine.
    await createWithType(anna, await lagerFor(anna), "Nylon");
    await createWithType(bert, await lagerFor(bert), "nylon");
    expect(await typesOf(bert)).toEqual(["nylon"]);
  });

  it("hält den Bestand einer Organisation von dem der Person getrennt", async () => {
    const org = await callerFor(anna).organization.create({
      name: "Werkstatt",
    });
    await createWithType(anna, await lagerFor(anna), "Nylon");
    const orgLager = await lagerFor(anna, org.id);
    await createWithType(anna, orgLager, "nylon", org.id);
    // Die Vorschlagsliste gilt dagegen überall.
    await createWithType(anna, orgLager, "pla", org.id);
    expect(await typesOf(anna, org.id)).toEqual(["PLA", "nylon"]);
    expect(await typesOf(anna)).toEqual(["Nylon"]);
  });

  it("zieht die Schreibweise auch beim Ändern nach", async () => {
    const lagerId = await lagerFor(anna);
    const id = await createWithType(anna, lagerId, "PLA");
    await createWithType(anna, lagerId, "Wood");
    const caller = callerFor(anna);

    await caller.material.update({ ...PERSONAL, id, materialType: "petg" });
    expect((await caller.material.byId({ ...PERSONAL, id })).materialType).toBe(
      "PETG"
    );

    await caller.material.update({ ...PERSONAL, id, materialType: "WOOD" });
    expect((await caller.material.byId({ ...PERSONAL, id })).materialType).toBe(
      "Wood"
    );

    // Ohne das Feld bleibt die Materialart, wie sie ist.
    await caller.material.update({ ...PERSONAL, id, name: "Umbenannt" });
    const after = await caller.material.byId({ ...PERSONAL, id });
    expect(after.name).toBe("Umbenannt");
    expect(after.materialType).toBe("Wood");
  });

  it("verwirft eine Materialart aus Leerraum", async () => {
    const lagerId = await lagerFor(anna);
    await expect(createWithType(anna, lagerId, "   ")).rejects.toThrow(
      /Materialart/
    );
  });

  it("gilt im Massenimport auch innerhalb des Stapels", async () => {
    const lagerId = await lagerFor(anna);
    const caller = callerFor(anna);
    const { created } = await caller.material.importMany({
      ...PERSONAL,
      lagerId,
      items: [
        {
          typ: "Pla",
          hersteller: "Prusament",
          farbe: "Rot",
          nenngewicht: 1000,
        },
        { typ: "Wood", nenngewicht: 500 },
        // Dieselbe Tabelle, andere Schreibweise: Die erste gilt.
        { typ: "wood", nenngewicht: 500 },
        { typ: "pla", nenngewicht: 1000, anzahl: 2 },
      ],
    });
    expect(created).toBe(5);
    expect(await typesOf(anna)).toEqual(["PLA", "PLA", "PLA", "Wood", "Wood"]);
    // Die Bezeichnung entsteht aus der gespeicherten Schreibweise.
    const list = await caller.material.list(PERSONAL);
    expect(list.map(m => m.name)).toContain("Prusament PLA Rot");
  });
});

describe("Migration 0019 – Backfill", () => {
  /**
   * Der Backfill läuft in Produktion **einmal** und ist danach nicht mehr
   * beobachtbar. `resetSchema()` spielt ihn auf eine leere Datenbank ein, wo
   * es nichts zusammenzuführen gibt. Deshalb entsteht der Altbestand hier von
   * Hand – am Router vorbei, der die Dubletten seit 2.9.1 gar nicht mehr
   * zuließe –, und die Datei wird ein zweites Mal angewendet. Sie ist darauf
   * ausgelegt (ein zweiter Lauf findet nichts mehr), und genau das prüft der
   * letzte Test.
   */
  const MIGRATION = new URL(
    "../db/migrations/0019_material_type_case.sql",
    import.meta.url
  );

  async function applyMigration() {
    const content = await readFile(MIGRATION, "utf8");
    const result = await db().execute(sql.raw(content));
    return result.rowCount ?? 0;
  }

  /** Materialien in der Reihenfolge ihrer Anlage – die älteste zuerst. */
  async function insertLegacy(
    owner: { userId: number } | { organizationId: number },
    lagerId: number,
    materialTypes: string[]
  ) {
    for (const materialType of materialTypes) {
      await db()
        .insert(schema.materials)
        .values({
          ...owner,
          lagerId,
          name: "Altbestand",
          materialType,
          nominalWeight: 1000,
        });
    }
  }

  async function storedTypes(lagerId: number) {
    const rows = await db()
      .select({ materialType: schema.materials.materialType })
      .from(schema.materials)
      .where(eq(schema.materials.lagerId, lagerId))
      .orderBy(schema.materials.id);
    return rows.map(row => row.materialType);
  }

  it("führt auf die Schreibweise der Vorschlagsliste zusammen", async () => {
    const lagerId = await lagerFor(anna);
    // „Pla“ ist die häufigste und die älteste – die Liste gewinnt trotzdem.
    await insertLegacy({ userId: anna.id }, lagerId, [
      "Pla",
      "pla",
      "Pla",
      "PLA",
      " petg",
    ]);
    await applyMigration();
    expect(await storedTypes(lagerId)).toEqual([
      "PLA",
      "PLA",
      "PLA",
      "PLA",
      "PETG",
    ]);
  });

  it("nimmt sonst die häufigste Schreibweise", async () => {
    const lagerId = await lagerFor(anna);
    await insertLegacy({ userId: anna.id }, lagerId, [
      "nylon",
      "Nylon",
      "NYLON",
      "Nylon",
    ]);
    await applyMigration();
    expect(await storedTypes(lagerId)).toEqual([
      "Nylon",
      "Nylon",
      "Nylon",
      "Nylon",
    ]);
  });

  it("nimmt bei Gleichstand die des ältesten Materials", async () => {
    const lagerId = await lagerFor(anna);
    await insertLegacy({ userId: anna.id }, lagerId, ["Wood", "wood"]);
    await applyMigration();
    expect(await storedTypes(lagerId)).toEqual(["Wood", "Wood"]);
  });

  it("bereinigt Leerraum auch ohne Dublette", async () => {
    const lagerId = await lagerFor(anna);
    await insertLegacy({ userId: anna.id }, lagerId, [" Wood  Fill "]);
    await applyMigration();
    expect(await storedTypes(lagerId)).toEqual(["Wood Fill"]);
  });

  it("führt nur innerhalb eines Bereichs zusammen", async () => {
    const annaLager = await lagerFor(anna);
    const bertLager = await lagerFor(bert);
    const org = await callerFor(anna).organization.create({
      name: "Werkstatt",
    });
    const orgLager = await lagerFor(anna, org.id);
    await insertLegacy({ userId: anna.id }, annaLager, ["Wood", "Wood"]);
    await insertLegacy({ userId: bert.id }, bertLager, ["wood"]);
    await insertLegacy({ organizationId: org.id }, orgLager, ["WOOD"]);
    await applyMigration();
    expect(await storedTypes(annaLager)).toEqual(["Wood", "Wood"]);
    expect(await storedTypes(bertLager)).toEqual(["wood"]);
    expect(await storedTypes(orgLager)).toEqual(["WOOD"]);
  });

  it("ändert beim zweiten Lauf nichts mehr", async () => {
    const lagerId = await lagerFor(anna);
    await insertLegacy({ userId: anna.id }, lagerId, ["pla", "Nylon", "nylon"]);
    expect(await applyMigration()).toBe(2);
    expect(await applyMigration()).toBe(0);
    expect(await storedTypes(lagerId)).toEqual(["PLA", "Nylon", "Nylon"]);
  });

  it("hinterlässt je Bereich und Vergleichsform eine Schreibweise", async () => {
    const lagerId = await lagerFor(anna);
    await insertLegacy({ userId: anna.id }, lagerId, [
      "PLA",
      "pla",
      "Wood",
      "wood",
      "PETG",
    ]);
    await applyMigration();
    // Die Zusicherung, die der Backfill herstellen muss – und die der Router
    // seither aufrechterhält.
    const result = await db().execute<{ count: string }>(sql`
      SELECT COUNT(*) AS count FROM (
        SELECT "userId", "organizationId", upper("materialType") AS key
          FROM materials
         GROUP BY "userId", "organizationId", upper("materialType")
        HAVING COUNT(DISTINCT "materialType") > 1
      ) duplicates
    `);
    expect(Number(result.rows[0].count)).toBe(0);
  });
});
