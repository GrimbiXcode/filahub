/**
 * Integrationstests gegen eine echte MySQL-Datenbank.
 *
 * Laufen nicht mit `npm run test`, sondern nur mit `npm run test:integration`
 * und gesetzter `TEST_DATABASE_URL` (siehe `api/test/setup-integration.ts`).
 *
 * Sinn: Die übrigen Tests sind reine Funktionstests ohne Datenbank. Alles,
 * was erst der Server entscheidet – Migrationen, Unique-Keys, Enums, die
 * JSON-Spalte, `$returningId`, `affectedRows`, Zeitstempel – fällt sonst
 * niemandem auf, bis es im Deployment kracht. Getestet wird gegen die
 * Version aus `docker-compose.yml` (MySQL 8.4); MariaDB weicht in mehreren
 * dieser Punkte ab.
 *
 * Die Tests bauen aufeinander auf und laufen in Deklarationsreihenfolge.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { seedSpoolPresets } from "./queries/presetSeed";
import { upsertUser, findUserByUnionId } from "./queries/users";
import { createProposal, closeProposal, findProposal } from "./queries/presets";
import { createSpoolType } from "./queries/filament";
import * as schema from "@db/schema";
import type { User } from "@db/schema";
import {
  callerFor,
  closeDb,
  countRows,
  resetSchema,
} from "./test/integration-db";

const db = () => getDb();

let admin: User;
let user: User;
let asAdmin: ReturnType<typeof callerFor>;
let asUser: ReturnType<typeof callerFor>;

/** Katalogstand nach dem Seeding – Bezugsgröße für spätere Prüfungen. */
let seedCounts: Record<string, number>;

beforeAll(async () => {
  await resetSchema();
}, 60_000);

afterAll(async () => {
  await closeDb();
});

describe("Migrationen", () => {
  it("legt alle Tabellen an", async () => {
    const [rows] = (await db().execute(
      sql`SELECT TABLE_NAME AS name FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE()`
    )) as unknown as [{ name: string }[]];
    const names = rows.map(r => r.name);

    for (const table of [
      "users",
      "materials",
      "weighings",
      "spool_types",
      "storage_boxes",
      "login_codes",
      "preset_manufacturers",
      "preset_spool_series",
      "preset_spool_versions",
      "preset_spool_variants",
      "preset_series_material_types",
      "preset_proposals",
      "hidden_spool_presets",
    ]) {
      expect(names).toContain(table);
    }
  });

  it("erzeugt die JSON-Spalte als echten JSON-Typ", async () => {
    const [rows] = (await db().execute(
      sql`SELECT DATA_TYPE AS type FROM information_schema.columns
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'preset_proposals' AND COLUMN_NAME = 'payload'`
    )) as unknown as [{ type: string }[]];
    // MariaDB kennt nur ein longtext-Alias; dort verhält sich das Auslesen anders.
    expect(rows[0].type).toBe("json");
  });

  it("legt alle Tabellen mit utf8mb4 an", async () => {
    const [rows] = (await db().execute(
      sql`SELECT TABLE_NAME AS name, TABLE_COLLATION AS collation FROM information_schema.tables
          WHERE TABLE_SCHEMA = DATABASE()`
    )) as unknown as [{ name: string; collation: string }[]];
    for (const row of rows) {
      expect(row.collation, row.name).toMatch(/^utf8mb4_/);
    }
  });

  it("ist wiederholbar", async () => {
    await expect(resetSchema()).resolves.not.toThrow();
  });
});

describe("Seeding des Preset-Katalogs", () => {
  it("legt den Startkatalog an", async () => {
    const stats = await seedSpoolPresets();
    expect(stats.created).toBeGreaterThan(0);
    expect(stats.updated).toBe(0);

    seedCounts = {
      manufacturers: await countRows("preset_manufacturers"),
      series: await countRows("preset_spool_series"),
      versions: await countRows("preset_spool_versions"),
      variants: await countRows("preset_spool_variants"),
      materialTypes: await countRows("preset_series_material_types"),
    };
    expect(seedCounts.variants).toBeGreaterThan(0);
  });

  it("ist idempotent – wiederholtes Seeding ändert nichts", async () => {
    const second = await seedSpoolPresets();
    const third = await seedSpoolPresets();

    expect(second.created).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.skipped).toBeGreaterThan(0);
    expect(third).toEqual(second);

    // Der entscheidende Punkt: keine Duplikate durch mehrfache Deployments.
    expect({
      manufacturers: await countRows("preset_manufacturers"),
      series: await countRows("preset_spool_series"),
      versions: await countRows("preset_spool_versions"),
      variants: await countRows("preset_spool_variants"),
      materialTypes: await countRows("preset_series_material_types"),
    }).toEqual(seedCounts);
  });
});

describe("Benutzer", () => {
  it("legt Benutzer per onDuplicateKeyUpdate ohne Duplikate an", async () => {
    await upsertUser({ unionId: "it-admin", name: "IT Admin", role: "admin" });
    await upsertUser({
      unionId: "it-admin",
      name: "IT Admin (neu)",
      role: "admin",
    });
    await upsertUser({ unionId: "it-user", name: "IT User", role: "user" });

    admin = (await findUserByUnionId("it-admin"))!;
    user = (await findUserByUnionId("it-user"))!;
    asAdmin = callerFor(admin);
    asUser = callerFor(user);

    expect(await countRows("users")).toBe(2);
    expect(admin.name).toBe("IT Admin (neu)");
  });

  it("liefert Enum, Zeitstempel und ID mit den erwarteten Typen", () => {
    expect(admin.role).toBe("admin");
    expect(user.role).toBe("user");
    expect(admin.createdAt).toBeInstanceOf(Date);
    expect(typeof admin.id).toBe("number");
  });

  it("weist Nicht-Admins die Verwaltung ab", async () => {
    await expect(asUser.admin.preset.tree()).rejects.toThrow();
  });
});

describe("Katalog lesen", () => {
  it("liefert den vollständigen Baum", async () => {
    const tree = await asUser.preset.tree();
    expect(tree).toHaveLength(seedCounts.manufacturers);

    const variants = tree.flatMap(m =>
      m.series.flatMap(s => s.versions.flatMap(v => v.variants))
    );
    expect(variants).toHaveLength(seedCounts.variants);
    expect(variants.every(v => v.displayName.length > 0)).toBe(true);
  });

  it("gibt boolean, date und die Materialarten korrekt zurück", async () => {
    const tree = await asUser.preset.tree();
    const versions = tree.flatMap(m => m.series.flatMap(s => s.versions));

    expect(tree.every(m => m.active === true)).toBe(true);
    expect(versions.some(v => v.isCurrent)).toBe(true);
    for (const version of versions) {
      if (version.validFrom != null)
        expect(version.validFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (version.validTo != null)
        expect(version.validTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(
      tree.flatMap(m => m.series).some(s => s.materialTypes.length > 0)
    ).toBe(true);
  });

  it("liefert die flache Auswahlliste passend zum Baum", async () => {
    const options = await asUser.preset.options();
    expect(options).toHaveLength(seedCounts.variants);
  });
});

describe("Presets ausblenden", () => {
  it("blendet nur für den eigenen Benutzer aus", async () => {
    const [target] = await asUser.preset.tree();
    const before = await asUser.preset.options();

    await asUser.preset.setHidden({
      scope: "manufacturer",
      refId: target.id,
      hidden: true,
    });
    // Zweiter Aufruf darf keine zweite Zeile erzeugen (Unique-Key + Vorabprüfung).
    await asUser.preset.setHidden({
      scope: "manufacturer",
      refId: target.id,
      hidden: true,
    });

    expect(await countRows("hidden_spool_presets")).toBe(1);
    expect(
      (await asUser.preset.tree()).find(m => m.id === target.id)?.hidden
    ).toBe(true);
    expect((await asUser.preset.options()).length).toBeLessThan(before.length);
    expect(await asAdmin.preset.options()).toHaveLength(before.length);

    await asUser.preset.setHidden({
      scope: "manufacturer",
      refId: target.id,
      hidden: false,
    });
    expect(await asUser.preset.options()).toHaveLength(before.length);
    expect(await countRows("hidden_spool_presets")).toBe(0);
  });
});

describe("Preset als eigenen Rollentyp übernehmen", () => {
  it("übernimmt Leergewicht und Herkunft", async () => {
    const [option] = await asUser.preset.options();
    const created = await asUser.preset.copyToOwn({ variantId: option.id });

    expect(created?.id).toBeTypeOf("number");
    expect(created?.tareWeight).toBe(option.tareWeight);
    expect(created?.sourceVariantId).toBe(option.id);
    expect(created?.name).toBe(option.displayName);
  });
});

describe("Vorschläge", () => {
  let proposalId: number;
  let resultVariantId: number;

  it("speichert den JSON-Payload verlustfrei", async () => {
    const proposal = await asUser.preset.proposals.submitNew({
      payload: {
        kind: "new",
        manufacturer: {
          name: "IT Testhersteller",
          website: "https://example.org",
        },
        series: { name: "IT Serie", materialTypes: ["PLA", "PETG"] },
        version: {
          name: "v1",
          spoolMaterial: "kunststoff",
          validFrom: "2024-01-01",
        },
        variant: {
          nominalWeight: 1000,
          tareWeight: 215,
          notes: "aus dem Integrationstest",
        },
      },
      comment: "Integrationstest",
    });

    proposalId = proposal!.id;
    expect(proposal?.status).toBe("pending");

    // Auf MySQL liefert mysql2 die JSON-Spalte bereits geparst zurück.
    const payload = proposal!.payload as {
      manufacturer: { name: string };
      series: { materialTypes: string[] };
    };
    expect(typeof payload).toBe("object");
    expect(payload.manufacturer.name).toBe("IT Testhersteller");
    expect(payload.series.materialTypes).toEqual(["PLA", "PETG"]);
  });

  it("zeigt den Vorschlag beim Einreicher und in der Moderation", async () => {
    expect(await asUser.preset.proposals.mine()).toHaveLength(1);

    const review = await asAdmin.admin.proposal.list({ status: "pending" });
    expect(review).toHaveLength(1);
    expect(review[0].submittedBy?.name).toBe("IT User");
  });

  it("überträgt einen freigegebenen Vorschlag in den Katalog", async () => {
    const result = await asAdmin.admin.proposal.approve({ id: proposalId });
    expect(result.ok).toBe(true);

    const closed = await findProposal(proposalId);
    expect(closed?.status).toBe("approved");
    expect(closed?.reviewedBy).toBe(admin.id);
    expect(closed?.reviewedAt).toBeInstanceOf(Date);
    expect(closed?.resultId).toBeTypeOf("number");

    resultVariantId = closed!.resultId!;
    const variant = await db().query.presetSpoolVariants.findFirst({
      where: eq(schema.presetSpoolVariants.id, resultVariantId),
    });
    expect(variant?.source).toBe("community");
    expect(variant?.displayName).toContain("IT Testhersteller");
  });

  it("lässt sich kein zweites Mal freigeben", async () => {
    // Prüft die optimistische Sperre in `closeProposal` (affectedRows).
    await expect(
      asAdmin.admin.proposal.approve({ id: proposalId })
    ).rejects.toThrow();
  });

  it("lässt sich nur einmal zurückziehen", async () => {
    const proposal = await asUser.preset.proposals.submitChange({
      targetType: "variant",
      targetId: resultVariantId,
      payload: { kind: "change", scope: "variant", patch: { tareWeight: 222 } },
    });

    await asUser.preset.proposals.withdraw({ id: proposal!.id });
    await expect(
      asUser.preset.proposals.withdraw({ id: proposal!.id })
    ).rejects.toThrow();
  });

  it("weist Vorschläge auf nicht existierende Einträge ab", async () => {
    await expect(
      asUser.preset.proposals.submitChange({
        targetType: "manufacturer",
        targetId: 999_999,
        payload: {
          kind: "change",
          scope: "manufacturer",
          patch: { name: "Nicht da" },
        },
      })
    ).rejects.toThrow();
  });
});

describe("Katalogpflege durch Administratoren", () => {
  let manufacturerId: number;
  let seriesId: number;
  let versionId: number;
  let variantId: number;

  it("ist beim Anlegen idempotent (natürlicher Schlüssel)", async () => {
    const first = await asAdmin.admin.preset.createManufacturer({
      name: "IT CRUD GmbH",
    });
    const again = await asAdmin.admin.preset.createManufacturer({
      name: "IT CRUD GmbH",
    });
    expect(again.id).toBe(first.id);
    manufacturerId = first.id;

    const series = await asAdmin.admin.preset.createSeries({
      manufacturerId,
      name: "Serie A",
      materialTypes: ["PLA"],
    });
    seriesId = series.id;

    const version = await asAdmin.admin.preset.createVersion({
      seriesId,
      name: "2024",
      spoolMaterial: "karton",
    });
    versionId = version.id;

    const variant = await asAdmin.admin.preset.createVariant({
      versionId,
      nominalWeight: 750,
      tareWeight: 140,
    });
    variantId = variant.id;
  });

  it("verhindert eine zweite Variante mit demselben Nenngewicht", async () => {
    await expect(
      asAdmin.admin.preset.createVariant({
        versionId,
        nominalWeight: 750,
        tareWeight: 141,
      })
    ).rejects.toThrow();
  });

  it("zieht die Anzeigenamen beim Umbenennen nach", async () => {
    await asAdmin.admin.preset.updateManufacturer({
      id: manufacturerId,
      name: "IT CRUD AG",
    });

    const variant = await db().query.presetSpoolVariants.findFirst({
      where: eq(schema.presetSpoolVariants.id, variantId),
    });
    expect(variant?.displayName).toContain("IT CRUD AG");
  });

  it("blendet deaktivierte Einträge nur für Benutzer aus", async () => {
    await asAdmin.admin.preset.updateManufacturer({
      id: manufacturerId,
      active: false,
    });

    expect(
      (await asUser.preset.tree()).some(m => m.id === manufacturerId)
    ).toBe(false);
    const adminEntry = (await asAdmin.admin.preset.tree()).find(
      m => m.id === manufacturerId
    );
    expect(adminEntry?.active).toBe(false);

    await asAdmin.admin.preset.updateManufacturer({
      id: manufacturerId,
      active: true,
    });
  });

  it("schützt Einträge mit Kindern vor dem Löschen", async () => {
    await expect(
      asAdmin.admin.preset.deleteManufacturer({ id: manufacturerId })
    ).rejects.toThrow();
  });

  it("löscht von unten nach oben", async () => {
    await asAdmin.admin.preset.deleteVariant({ id: variantId });
    await asAdmin.admin.preset.deleteVersion({ id: versionId });
    await asAdmin.admin.preset.deleteSeries({ id: seriesId });
    await asAdmin.admin.preset.deleteManufacturer({ id: manufacturerId });

    const found = await db().query.presetManufacturers.findFirst({
      where: eq(schema.presetManufacturers.id, manufacturerId),
    });
    expect(found).toBeUndefined();
  });
});

describe("Materialien und Wiegungen", () => {
  it("legt Material mit Preset-Bezug an und berechnet die Restmenge", async () => {
    const [option] = await asUser.preset.options();
    const box = await asUser.storageBox.create({
      name: "IT Box",
      tareWeight: 50,
    });
    expect(box?.id).toBeTypeOf("number");

    const material = await asUser.material.create({
      name: "IT Filament",
      materialType: "PLA",
      nominalWeight: 1000,
      storageBoxId: box!.id,
      spoolPresetVariantId: option.id,
    });

    await asUser.material.addWeighing({
      materialId: material.id,
      grossWeight: 1180,
    });
    await asUser.material.addWeighing({
      materialId: material.id,
      grossWeight: 1100,
    });

    const listed = (await asUser.material.list()).find(
      m => m.id === material.id
    );
    expect(listed?.remainingWeight).toBeTypeOf("number");

    const detail = await asUser.material.byId({ id: material.id });
    expect(detail?.weighings).toHaveLength(2);
    expect(detail?.spoolPresetVariantId).toBe(option.id);
  });

  it("trennt die Daten der Benutzer", async () => {
    expect(await asAdmin.material.list()).toHaveLength(0);
  });
});

describe("MySQL-Eigenheiten", () => {
  it("speichert Umlaute und Emoji verlustfrei (utf8mb4)", async () => {
    await upsertUser({
      unionId: "it-utf8",
      name: "Jörg Müller-Straße 🧵✨",
      role: "user",
    });
    const found = await findUserByUnionId("it-utf8");
    expect(found?.name).toBe("Jörg Müller-Straße 🧵✨");

    const spoolType = await createSpoolType({
      userId: found!.id,
      name: "Rolle „Grün“ – 1 kg · Ø200 mm",
      tareWeight: 200,
    });
    expect(spoolType?.name).toBe("Rolle „Grün“ – 1 kg · Ø200 mm");
  });

  it("erzeugt ausschließlich ASCII-Slugs", async () => {
    // MySQL 8 vergleicht mit utf8mb4_0900_ai_ci akzentunempfindlich
    // ('müller' = 'muller'), MariaDB nicht. Weil `slugify` transliteriert,
    // hängt die Eindeutigkeit der Slugs nicht an der Kollation.
    const rows = await db()
      .select({ slug: schema.presetManufacturers.slug })
      .from(schema.presetManufacturers);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("weist zu lange Werte ab, statt sie zu kürzen (Strict Mode)", async () => {
    await expect(
      db()
        .insert(schema.spoolTypes)
        .values({
          userId: admin.id,
          name: "x".repeat(300),
          tareWeight: 1,
        })
    ).rejects.toThrow();
  });

  it("weist ungültige Enum-Werte ab", async () => {
    await expect(
      db().execute(
        sql`INSERT INTO users (unionId, role) VALUES ('it-bad-enum', 'superadmin')`
      )
    ).rejects.toThrow();
  });

  it("weist einen int-Überlauf ab, statt zu kappen", async () => {
    await expect(
      db().insert(schema.materials).values({
        userId: admin.id,
        name: "Überlauf",
        materialType: "PLA",
        nominalWeight: 2_147_483_648,
      })
    ).rejects.toThrow();
  });

  it("schreibt und liest Zeitstempel ohne Zeitzonenversatz", async () => {
    const proposal = await createProposal({
      userId: admin.id,
      kind: "change",
      targetType: "manufacturer",
      targetId: 1,
      payload: {
        kind: "change",
        scope: "manufacturer",
        patch: { name: "Zeitzonentest" },
      },
    });

    const before = Date.now();
    await closeProposal(proposal!.id, {
      status: "rejected",
      reviewedBy: admin.id,
    });
    const after = Date.now();

    const closed = await findProposal(proposal!.id);
    const reviewedAt = (closed!.reviewedAt as Date).getTime();
    // Sekundengenaue Spalte: Toleranz nach unten, harte Grenze nach oben.
    expect(reviewedAt).toBeGreaterThan(before - 1500);
    expect(reviewedAt).toBeLessThan(after + 1500);

    // DEFAULT now() muss dieselbe Zeitbasis haben wie die Anwendung.
    const createdAt = (closed!.createdAt as Date).getTime();
    expect(Math.abs(createdAt - before)).toBeLessThan(60_000);
  });
});
