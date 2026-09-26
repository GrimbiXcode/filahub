/**
 * Material und Gebinde gegen eine echte PostgreSQL-Datenbank (seit 4.0.0):
 * die Router-Pfade (Zuordnen, Bestand über Lager, die Konsistenzregel
 * Material ↔ Lager, Zusammenführen, Import, Stufen) und der Backfill der
 * Migration `0022_material_products.sql` an einem von Hand angelegten
 * Altbestand.
 *
 * Läuft nur mit `npm run test:integration` und gesetzter `TEST_DATABASE_URL`.
 */
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { findUserByUnionId, upsertUser } from "./queries/users";
import * as schema from "@db/schema";
import type { User } from "@db/schema";
import {
  callerFor,
  closeDb,
  migrateUntil,
  resetSchema,
} from "./test/integration-db";

const db = () => getDb();

beforeAll(async () => {
  await resetSchema();
}, 60_000);

afterAll(async () => {
  await closeDb();
  // Die übrigen Tests erwarten den vollständigen Stand.
});

describe("Migration 0022 – Backfill", () => {
  /**
   * Die Migration löscht die Spalten, aus denen sie liest; ein zweiter Lauf
   * auf dem fertigen Stand ist deshalb nicht möglich (anders als bei `0019`).
   * Stattdessen wird die Datenbank nur **bis 0021** aufgebaut – über eine Kopie
   * des Migrationsordners mit gekürztem Journal –, der Altbestand in der alten
   * Form angelegt und `0022` darauf angewendet.
   */
  const MIGRATION = new URL(
    "../db/migrations/0022_material_products.sql",
    import.meta.url
  );

  async function apply0022() {
    await db().execute(sql.raw(await readFile(MIGRATION, "utf8")));
  }

  async function insertUser(name: string): Promise<number> {
    const result = await db().execute<{ id: string }>(sql`
      INSERT INTO "users" ("unionId", "name") VALUES (${name}, ${name})
      RETURNING "id"`);
    return Number(result.rows[0].id);
  }

  async function insertLager(
    userId: number,
    name: string,
    kind: "filament" | "resin" = "filament",
    diameterUm: number | null = 1750
  ): Promise<number> {
    const result = await db().execute<{ id: string }>(sql`
      INSERT INTO "lager" ("userId", "name", "materialKind", "filamentDiameterUm")
      VALUES (${userId}, ${name}, ${kind}, ${diameterUm})
      RETURNING "id"`);
    return Number(result.rows[0].id);
  }

  type Legacy = {
    name: string;
    materialType?: string;
    manufacturer?: string | null;
    color?: string | null;
    texture?: string | null;
    density?: number | null;
    createdAt?: string;
  };

  /** Ein Material in der Form bis 3.1.0; liefert seine ID. */
  async function insertLegacy(
    userId: number,
    lagerId: number,
    m: Legacy
  ): Promise<number> {
    const result = await db().execute<{ id: string }>(sql`
      INSERT INTO "materials" (
        "userId", "lagerId", "name", "materialType", "manufacturer", "color",
        "texture", "densityGramsPerLiter", "nominalWeight", "createdAt"
      ) VALUES (
        ${userId}, ${lagerId}, ${m.name}, ${m.materialType ?? "PLA"},
        ${m.manufacturer ?? null}, ${m.color ?? null}, ${m.texture ?? null},
        ${m.density ?? null}, 1000,
        ${m.createdAt ?? "2026-01-01T00:00:00Z"}
      )
      RETURNING "id"`);
    return Number(result.rows[0].id);
  }

  async function productOf(materialId: number) {
    const result = await db().execute<{
      productId: string;
      name: string;
      materialType: string;
      manufacturer: string | null;
      color: string | null;
      texture: string | null;
      densityGramsPerLiter: number | null;
      userId: string | null;
    }>(sql`
      SELECT m."productId", p."name", p."materialType", p."manufacturer",
             p."color", p."texture", p."densityGramsPerLiter", p."userId"
      FROM "materials" m JOIN "material_products" p ON p."id" = m."productId"
      WHERE m."id" = ${materialId}`);
    return result.rows[0];
  }

  beforeEach(async () => {
    await migrateUntil(22);
  }, 60_000);

  afterAll(async () => {
    await resetSchema();
  }, 60_000);

  it("legt gleiche Rollen zu einem Material zusammen", async () => {
    const anna = await insertUser("anna");
    const lagerId = await insertLager(anna, "Filament");
    const first = await insertLegacy(anna, lagerId, {
      name: "Polymaker Schwarz",
      manufacturer: "Polymaker",
      color: "Schwarz",
      texture: "Matt",
      density: 1240,
      createdAt: "2025-01-01T00:00:00Z",
    });
    const second = await insertLegacy(anna, lagerId, {
      name: "zweite Rolle",
      materialType: " pla ",
      manufacturer: "POLYMAKER ",
      color: "schwarz",
      texture: "matt",
      createdAt: "2026-01-01T00:00:00Z",
    });
    await apply0022();
    const a = await productOf(first);
    const b = await productOf(second);
    expect(a.productId).toBe(b.productId);
    // Die Angaben des **ältesten** Gebindes
    expect(a).toMatchObject({
      name: "Polymaker Schwarz",
      materialType: "PLA",
      manufacturer: "Polymaker",
      color: "Schwarz",
      texture: "Matt",
      densityGramsPerLiter: 1240,
      userId: String(anna),
    });
  });

  it("legt über zwei Lager gleicher Art und Stärke zusammen", async () => {
    const anna = await insertUser("anna");
    const oben = await insertLager(anna, "Oben");
    const keller = await insertLager(anna, "Keller");
    const a = await insertLegacy(anna, oben, {
      name: "A",
      manufacturer: "Prusament",
      color: "Galaxy Black",
    });
    const b = await insertLegacy(anna, keller, {
      name: "B",
      manufacturer: "Prusament",
      color: "Galaxy Black",
    });
    await apply0022();
    expect((await productOf(a)).productId).toBe((await productOf(b)).productId);
  });

  it("trennt, was sich unterscheidet oder zu vage ist", async () => {
    const anna = await insertUser("anna");
    const bert = await insertUser("bert");
    const duenn = await insertLager(anna, "1,75");
    const dick = await insertLager(anna, "2,85", "filament", 2850);
    const bertsLager = await insertLager(bert, "Filament");
    const same = {
      name: "X",
      manufacturer: "Polymaker",
      color: "Rot",
    };
    const ids = [
      await insertLegacy(anna, duenn, same),
      // andere Stärke
      await insertLegacy(anna, dick, same),
      // anderer Besitzer
      await insertLegacy(bert, bertsLager, same),
      // andere Oberfläche
      await insertLegacy(anna, duenn, { ...same, texture: "Silk" }),
      // andere Materialart
      await insertLegacy(anna, duenn, { ...same, materialType: "PETG" }),
      // ohne Hersteller: zu vage, auch bei gleichem Namen
      await insertLegacy(anna, duenn, { name: "PLA Grau", color: "Grau" }),
      await insertLegacy(anna, duenn, { name: "PLA Grau", color: "Grau" }),
      // ohne Farbe
      await insertLegacy(anna, duenn, { name: "Y", manufacturer: "Sunlu" }),
      await insertLegacy(anna, duenn, { name: "Y", manufacturer: "Sunlu" }),
    ];
    await apply0022();
    const products = new Set<string>();
    for (const id of ids) products.add((await productOf(id)).productId);
    expect(products.size).toBe(ids.length);
  });

  it("ordnet jedes Gebinde zu und räumt auf", async () => {
    const anna = await insertUser("anna");
    const lagerId = await insertLager(anna, "Filament");
    for (let i = 0; i < 5; i++) {
      await insertLegacy(anna, lagerId, {
        name: `M${i}`,
        manufacturer: i < 3 ? "Bambu Lab" : null,
        color: "Weiß",
      });
    }
    await apply0022();
    const counts = await db().execute<{
      materials: string;
      products: string;
      orphans: string;
      temp: string;
    }>(sql`
      SELECT
        (SELECT count(*) FROM "materials") AS "materials",
        (SELECT count(*) FROM "material_products") AS "products",
        (SELECT count(*) FROM "material_products" p
          WHERE NOT EXISTS (
            SELECT 1 FROM "materials" m WHERE m."productId" = p."id")
        ) AS "orphans",
        (SELECT count(*) FROM pg_class
          WHERE relname LIKE '\\_material\\_product\\_%') AS "temp"`);
    expect(counts.rows[0]).toEqual({
      materials: "5",
      products: "3",
      orphans: "0",
      temp: "0",
    });
    // Neue Materialien bekommen danach eine freie ID
    const next = await db().execute<{ id: string }>(sql`
      INSERT INTO "material_products" ("userId", "name", "materialType")
      VALUES (${anna}, 'Neu', 'PLA') RETURNING "id"`);
    const max = await db().execute<{ max: string }>(
      sql`SELECT max("id") AS "max" FROM "material_products"`
    );
    expect(next.rows[0].id).toBe(max.rows[0].max);
  });

  it("läuft auf einer leeren Datenbank durch", async () => {
    await apply0022();
    const result = await db().execute<{ c: string }>(
      sql`SELECT count(*) AS c FROM "material_products"`
    );
    expect(result.rows[0].c).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const PERSONAL = { organizationId: null } as const;

describe("Material und Gebinde über den Router", () => {
  let anna: User;
  let bert: User;

  beforeEach(async () => {
    await resetSchema();
    await upsertUser({ unionId: "anna-1", name: "Anna" });
    await upsertUser({ unionId: "bert-1", name: "Bert" });
    anna = (await findUserByUnionId("anna-1"))!;
    bert = (await findUserByUnionId("bert-1"))!;
  }, 60_000);

  async function lagerFor(
    user: User,
    name = "Filament",
    config: {
      materialKind?: "filament" | "resin";
      filamentDiameterUm?: 1750 | 2850 | null;
      lowStockGrams?: number | null;
      organizationId?: number | null;
    } = {}
  ) {
    const kind = config.materialKind ?? "filament";
    const lager = await callerFor(user).lager.create({
      organizationId: config.organizationId ?? null,
      name,
      materialKind: kind,
      filamentDiameterUm:
        kind === "filament" ? (config.filamentDiameterUm ?? 1750) : null,
      lowStockGrams: config.lowStockGrams ?? null,
    });
    return lager!.id;
  }

  /** Ein neues Material mit einem Gebinde; liefert beide IDs. */
  async function newMaterial(
    user: User,
    lagerId: number,
    extra: {
      manufacturer?: string;
      color?: string;
      organizationId?: number | null;
    } = {}
  ) {
    return callerFor(user).material.create({
      organizationId: extra.organizationId ?? null,
      lagerId,
      name: "PolyTerra Schwarz",
      materialType: "PLA",
      manufacturer: extra.manufacturer ?? "Polymaker",
      color: extra.color ?? "Schwarz",
      nominalWeight: 1000,
    });
  }

  async function weigh(user: User, materialId: number, grossWeight: number) {
    await callerFor(user).material.addWeighing({
      ...PERSONAL,
      materialId,
      grossWeight,
    });
  }

  async function productCount() {
    const rows = await db().select().from(schema.materialProducts);
    return rows.length;
  }

  it("legt ein weiteres Gebinde zu einem bestehenden Material an", async () => {
    const lagerId = await lagerFor(anna);
    const first = await newMaterial(anna, lagerId);
    const second = await callerFor(anna).material.create({
      ...PERSONAL,
      lagerId,
      productId: first.productId,
      nominalWeight: 250,
    });
    expect(second.productId).toBe(first.productId);
    const list = await callerFor(anna).material.list(PERSONAL);
    expect(list.map(m => m.name)).toEqual([
      "PolyTerra Schwarz",
      "PolyTerra Schwarz",
    ]);
    expect(list[0].stock).toMatchObject({ count: 2, totalRemaining: 1250 });
    expect(await productCount()).toBe(1);
  });

  it("warnt erst, wenn der Bestand über alle Lager knapp ist", async () => {
    const oben = await lagerFor(anna, "Oben");
    const keller = await lagerFor(anna, "Keller");
    const first = await newMaterial(anna, oben);
    // Die Rolle oben ist fast leer …
    await weigh(anna, first.id, 80);
    let list = await callerFor(anna).material.list({
      ...PERSONAL,
      lagerId: oben,
    });
    expect(list[0].remainingPercent).toBe(8);
    expect(list[0].stock.low).toBe(true);
    // … bis im Keller eine volle liegt – auch in der Übersicht nur des oberen Lagers.
    await callerFor(anna).material.create({
      ...PERSONAL,
      lagerId: keller,
      productId: first.productId,
      nominalWeight: 1000,
    });
    list = await callerFor(anna).material.list({ ...PERSONAL, lagerId: oben });
    expect(list).toHaveLength(1);
    expect(list[0].stock).toMatchObject({
      count: 2,
      totalRemaining: 1080,
      thresholdSource: "default",
      low: false,
    });
  });

  it("nimmt die höchste Schwelle der beteiligten Lager", async () => {
    const oben = await lagerFor(anna, "Oben", { lowStockGrams: 300 });
    const keller = await lagerFor(anna, "Keller", { lowStockGrams: 1500 });
    const first = await newMaterial(anna, oben);
    let detail = await callerFor(anna).product.byId({
      ...PERSONAL,
      id: first.productId,
    });
    expect(detail.stock).toMatchObject({ threshold: 300, low: false });
    await callerFor(anna).material.create({
      ...PERSONAL,
      lagerId: keller,
      productId: first.productId,
      nominalWeight: 250,
    });
    detail = await callerFor(anna).product.byId({
      ...PERSONAL,
      id: first.productId,
    });
    expect(detail.gebinde).toHaveLength(2);
    expect(detail.stock).toMatchObject({
      totalRemaining: 1250,
      threshold: 1500,
      thresholdSource: "lager",
      low: true,
    });
  });

  it("lehnt fremde Materialien und Doppelangaben ab", async () => {
    const annasLager = await lagerFor(anna);
    const bertsLager = await lagerFor(bert);
    const berts = await newMaterial(bert, bertsLager);
    await expect(
      callerFor(anna).material.create({
        ...PERSONAL,
        lagerId: annasLager,
        productId: berts.productId,
        nominalWeight: 1000,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const own = await newMaterial(anna, annasLager);
    await expect(
      callerFor(anna).material.create({
        ...PERSONAL,
        lagerId: annasLager,
        productId: own.productId,
        name: "Anders",
        nominalWeight: 1000,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      callerFor(anna).product.byId({ ...PERSONAL, id: berts.productId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("hält die Gebinde eines Materials in Lagern gleicher Art und Stärke", async () => {
    const duenn = await lagerFor(anna, "1,75");
    const dick = await lagerFor(anna, "2,85", { filamentDiameterUm: 2850 });
    const harz = await lagerFor(anna, "Harz", { materialKind: "resin" });
    const first = await newMaterial(anna, duenn);
    const second = await callerFor(anna).material.create({
      ...PERSONAL,
      lagerId: duenn,
      productId: first.productId,
      nominalWeight: 1000,
    });
    // Anlegen in einem Lager anderer Stärke
    await expect(
      callerFor(anna).material.create({
        ...PERSONAL,
        lagerId: dick,
        productId: first.productId,
        nominalWeight: 1000,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Verschieben, solange ein zweites Gebinde bleibt
    await expect(
      callerFor(anna).material.update({
        ...PERSONAL,
        id: second.id,
        lagerId: harz,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Das Lager selbst darf die Stärke dann auch nicht wechseln …
    const keller = await lagerFor(anna, "Keller");
    await callerFor(anna).material.update({
      ...PERSONAL,
      id: second.id,
      lagerId: keller,
    });
    await expect(
      callerFor(anna).lager.update({
        ...PERSONAL,
        id: keller,
        filamentDiameterUm: 2850,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // … das letzte Gebinde eines Materials darf überallhin.
    await callerFor(anna).material.delete({ ...PERSONAL, id: first.id });
    await callerFor(anna).material.update({
      ...PERSONAL,
      id: second.id,
      lagerId: dick,
    });
    await callerFor(anna).lager.update({
      ...PERSONAL,
      id: keller,
      filamentDiameterUm: 2850,
    });
  });

  it("löscht ein Material mit seinem letzten Gebinde", async () => {
    const lagerId = await lagerFor(anna);
    const first = await newMaterial(anna, lagerId);
    const second = await callerFor(anna).material.create({
      ...PERSONAL,
      lagerId,
      productId: first.productId,
      nominalWeight: 1000,
    });
    await callerFor(anna).material.delete({ ...PERSONAL, id: first.id });
    expect(await productCount()).toBe(1);
    await callerFor(anna).material.delete({ ...PERSONAL, id: second.id });
    expect(await productCount()).toBe(0);
  });

  it("ordnet ein Gebinde neu zu und räumt das leere Material weg", async () => {
    const lagerId = await lagerFor(anna);
    const a = await newMaterial(anna, lagerId);
    const b = await newMaterial(anna, lagerId, { color: "Weiß" });
    await callerFor(anna).material.update({
      ...PERSONAL,
      id: b.id,
      productId: a.productId,
    });
    const rows = await db().select().from(schema.materialProducts);
    expect(rows.map(r => r.id)).toEqual([a.productId]);
    // Zuordnen und zugleich Materialfelder ändern ist mehrdeutig
    await expect(
      callerFor(anna).material.update({
        ...PERSONAL,
        id: b.id,
        productId: a.productId + 1000,
        color: "Rot",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("ändert über ein Gebinde das Material für alle Gebinde", async () => {
    const lagerId = await lagerFor(anna);
    const first = await newMaterial(anna, lagerId);
    await callerFor(anna).material.create({
      ...PERSONAL,
      lagerId,
      productId: first.productId,
      nominalWeight: 1000,
    });
    await callerFor(anna).material.update({
      ...PERSONAL,
      id: first.id,
      color: "Galaxy Black",
      materialType: "pla",
    });
    const list = await callerFor(anna).material.list(PERSONAL);
    expect(list.map(m => [m.color, m.materialType])).toEqual([
      ["Galaxy Black", "PLA"],
      ["Galaxy Black", "PLA"],
    ]);
  });

  it("führt zwei Materialien zusammen", async () => {
    const lagerId = await lagerFor(anna);
    const a = await newMaterial(anna, lagerId);
    const b = await newMaterial(anna, lagerId);
    const { moved } = await callerFor(anna).product.merge({
      ...PERSONAL,
      sourceId: b.productId,
      targetId: a.productId,
    });
    expect(moved).toBe(1);
    const detail = await callerFor(anna).product.byId({
      ...PERSONAL,
      id: a.productId,
    });
    expect(detail.gebinde.map(g => g.id).sort()).toEqual([a.id, b.id].sort());
    expect(await productCount()).toBe(1);
  });

  it("führt nicht über verschiedene Stärken oder Bereiche zusammen", async () => {
    const duenn = await lagerFor(anna, "1,75");
    const dick = await lagerFor(anna, "2,85", { filamentDiameterUm: 2850 });
    const a = await newMaterial(anna, duenn);
    const b = await newMaterial(anna, dick);
    await expect(
      callerFor(anna).product.merge({
        ...PERSONAL,
        sourceId: b.productId,
        targetId: a.productId,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const berts = await newMaterial(bert, await lagerFor(bert));
    await expect(
      callerFor(anna).product.merge({
        ...PERSONAL,
        sourceId: berts.productId,
        targetId: a.productId,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await productCount()).toBe(3);
  });

  it("importiert je Position ein Material und findet bestehende wieder", async () => {
    const lagerId = await lagerFor(anna);
    const existing = await newMaterial(anna, lagerId, {
      manufacturer: "Prusament",
      color: "Rot",
    });
    const { created } = await callerFor(anna).material.importMany({
      ...PERSONAL,
      lagerId,
      items: [
        // gleicher Schlüssel wie das bestehende
        {
          hersteller: "prusament",
          typ: "pla",
          farbe: "rot",
          nenngewicht: 1000,
          anzahl: 2,
        },
        // neu, drei Stück – ein Material
        {
          hersteller: "Sunlu",
          typ: "PETG",
          farbe: "Blau",
          nenngewicht: 1000,
          anzahl: 3,
        },
        // ohne Hersteller: je Position ein eigenes Material
        { typ: "PLA", farbe: "Grau", nenngewicht: 1000, anzahl: 1 },
        { typ: "PLA", farbe: "Grau", nenngewicht: 1000, anzahl: 1 },
      ],
    });
    expect(created).toBe(7);
    const list = await callerFor(anna).material.list(PERSONAL);
    const byProduct = new Map<number, number>();
    for (const m of list) {
      byProduct.set(m.productId, (byProduct.get(m.productId) ?? 0) + 1);
    }
    expect(byProduct.get(existing.productId)).toBe(3);
    expect([...byProduct.values()].sort()).toEqual([1, 1, 3, 3]);
  });

  it("verlangt für Materialien dieselben Stufen wie für Gebinde", async () => {
    const orgId = (await callerFor(anna).organization.create({ name: "Hub" }))
      .id;
    const lagerId = await lagerFor(anna, "Hub", { organizationId: orgId });
    const created = await newMaterial(anna, lagerId, { organizationId: orgId });
    const inOrg = { organizationId: orgId };
    // Nicht-Mitglied: die Organisation gibt es nicht
    await expect(callerFor(bert).product.list(inOrg)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await db()
      .insert(schema.organizationMembers)
      .values({ organizationId: orgId, userId: bert.id, role: "viewer" });
    expect(await callerFor(bert).product.list(inOrg)).toHaveLength(1);
    await expect(
      callerFor(bert).product.update({
        ...inOrg,
        id: created.productId,
        name: "X",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db()
      .update(schema.organizationMembers)
      .set({ role: "editor" })
      .where(eq(schema.organizationMembers.userId, bert.id));
    await callerFor(bert).product.update({
      ...inOrg,
      id: created.productId,
      name: "X",
    });
    // Org-Materialien tauchen im persönlichen Bereich nicht auf
    expect(await callerFor(anna).product.list(PERSONAL)).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Phase 2 (4.1.0): aufgebraucht und Druckeinstellungen
  // -------------------------------------------------------------------------

  it("zählt aufgebrauchte Gebinde nicht zum Bestand", async () => {
    const lagerId = await lagerFor(anna);
    const first = await newMaterial(anna, lagerId);
    const second = await callerFor(anna).material.create({
      ...PERSONAL,
      lagerId,
      productId: first.productId,
      nominalWeight: 1000,
    });
    await weigh(anna, first.id, 50);
    await callerFor(anna).material.setArchived({
      ...PERSONAL,
      id: second.id,
      archived: true,
    });
    const list = await callerFor(anna).material.list(PERSONAL);
    // Das aufgebrauchte bleibt in der Liste (Kennungen!), zählt aber nicht mit
    expect(list).toHaveLength(2);
    expect(list.find(m => m.id === second.id)?.archivedAt).not.toBeNull();
    expect(list[0].stock).toMatchObject({
      count: 1,
      totalRemaining: 50,
      low: true,
    });
    const products = await callerFor(anna).product.list(PERSONAL);
    expect(products[0]).toMatchObject({ gebindeCount: 2, activeCount: 1 });
    await callerFor(anna).material.setArchived({
      ...PERSONAL,
      id: second.id,
      archived: false,
    });
    const again = await callerFor(anna).material.list(PERSONAL);
    expect(again[0].stock.count).toBe(2);
  });

  it("verlangt für „aufgebraucht“ die Stufe editor und den eigenen Bereich", async () => {
    const lagerId = await lagerFor(anna);
    const created = await newMaterial(anna, lagerId);
    await expect(
      callerFor(bert).material.setArchived({
        ...PERSONAL,
        id: created.id,
        archived: true,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("speichert Druckeinstellungen je Material und löscht sie leer", async () => {
    const lagerId = await lagerFor(anna);
    const created = await newMaterial(anna, lagerId);
    const id = created.productId;
    await callerFor(anna).product.setPrintSettings({
      ...PERSONAL,
      id,
      settings: { kind: "filament", nozzleMinC: 205, nozzleMaxC: 220 },
      notes: "  Erste Schicht langsam  ",
    });
    let detail = await callerFor(anna).product.byId({ ...PERSONAL, id });
    expect(detail.printSettings).toMatchObject({
      settings: { kind: "filament", nozzleMinC: 205, nozzleMaxC: 220 },
      notes: "Erste Schicht langsam",
    });
    // Überschreiben, nicht anhängen
    await callerFor(anna).product.setPrintSettings({
      ...PERSONAL,
      id,
      settings: { kind: "filament", bedMinC: 60 },
      notes: null,
    });
    detail = await callerFor(anna).product.byId({ ...PERSONAL, id });
    expect(detail.printSettings?.settings).toEqual({
      kind: "filament",
      bedMinC: 60,
    });
    // Leer heißt: keine Zeile mehr
    await callerFor(anna).product.setPrintSettings({
      ...PERSONAL,
      id,
      settings: { kind: "filament" },
      notes: " ",
    });
    detail = await callerFor(anna).product.byId({ ...PERSONAL, id });
    expect(detail.printSettings).toBeNull();
    expect(await db().select().from(schema.materialPrintSettings)).toHaveLength(
      0
    );
  });

  it("lehnt Druckeinstellungen einer anderen Materialart ab", async () => {
    const lagerId = await lagerFor(anna);
    const created = await newMaterial(anna, lagerId);
    await expect(
      callerFor(anna).product.setPrintSettings({
        ...PERSONAL,
        id: created.productId,
        settings: { kind: "resin", exposureMs: 2000 },
        notes: null,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      callerFor(bert).product.setPrintSettings({
        ...PERSONAL,
        id: created.productId,
        settings: { kind: "filament", fanPercent: 50 },
        notes: null,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("nimmt die Druckeinstellungen mit dem Material weg", async () => {
    const lagerId = await lagerFor(anna);
    const created = await newMaterial(anna, lagerId);
    await callerFor(anna).product.setPrintSettings({
      ...PERSONAL,
      id: created.productId,
      settings: { kind: "filament", fanPercent: 100 },
      notes: null,
    });
    await callerFor(anna).material.delete({ ...PERSONAL, id: created.id });
    expect(await db().select().from(schema.materialPrintSettings)).toHaveLength(
      0
    );
  });

  it("behält beim Zusammenführen die Einstellungen des Ziels, sonst die der Quelle", async () => {
    const lagerId = await lagerFor(anna);
    const a = await newMaterial(anna, lagerId);
    const b = await newMaterial(anna, lagerId);
    const c = await newMaterial(anna, lagerId);
    const set = (productId: number, fanPercent: number) =>
      callerFor(anna).product.setPrintSettings({
        ...PERSONAL,
        id: productId,
        settings: { kind: "filament", fanPercent },
        notes: null,
      });
    await set(a.productId, 10);
    await set(b.productId, 20);
    // Ziel a hat eigene – die von b verschwinden mit b
    await callerFor(anna).product.merge({
      ...PERSONAL,
      sourceId: b.productId,
      targetId: a.productId,
    });
    let detail = await callerFor(anna).product.byId({
      ...PERSONAL,
      id: a.productId,
    });
    expect(detail.printSettings?.settings).toMatchObject({ fanPercent: 10 });
    // Ziel c hat keine – die von a wandern mit
    await callerFor(anna).product.merge({
      ...PERSONAL,
      sourceId: a.productId,
      targetId: c.productId,
    });
    detail = await callerFor(anna).product.byId({
      ...PERSONAL,
      id: c.productId,
    });
    expect(detail.printSettings?.settings).toMatchObject({ fanPercent: 10 });
    expect(await db().select().from(schema.materialPrintSettings)).toHaveLength(
      1
    );
  });

  it("zeigt Freunden keine aufgebrauchten Gebinde", async () => {
    const lagerId = await lagerFor(anna);
    const created = await newMaterial(anna, lagerId);
    await db()
      .insert(schema.friendships)
      .values({ userId: anna.id, friendUserId: bert.id, status: "accepted" });
    await db()
      .insert(schema.lagerShares)
      .values({ lagerId, sharedWithUserId: bert.id, visibility: "full" });
    const before = await callerFor(bert).friend.inventory({
      friendId: anna.id,
    });
    expect(before.materials).toHaveLength(1);
    await callerFor(anna).material.setArchived({
      ...PERSONAL,
      id: created.id,
      archived: true,
    });
    const after = await callerFor(bert).friend.inventory({ friendId: anna.id });
    expect(after.materials).toHaveLength(0);
  });
});
