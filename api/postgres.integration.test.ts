/**
 * Integrationstests gegen eine echte PostgreSQL-Datenbank.
 *
 * Laufen nicht mit `npm run test`, sondern nur mit `npm run test:integration`
 * und gesetzter `TEST_DATABASE_URL` (siehe `api/test/setup-integration.ts`).
 *
 * Sinn: Die übrigen Tests sind reine Funktionstests ohne Datenbank. Alles,
 * was erst der Server entscheidet – Migrationen, Unique-Keys, Enum-Typen, die
 * jsonb-Spalte, `RETURNING`, Zeitstempel – fällt sonst niemandem auf, bis es
 * im Deployment kracht. Getestet wird gegen dieselbe Version wie in
 * `docker-compose.yml`.
 *
 * Die Tests bauen aufeinander auf und laufen in Deklarationsreihenfolge.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { seedContainerPresets } from "./queries/presetSeed";
import { upsertUser, findUserByUnionId } from "./queries/users";
import { createProposal, closeProposal, findProposal } from "./queries/presets";
import { createContainerType } from "./queries/filament";
import { countAllTables } from "./queries/systemStatus";
import * as schema from "@db/schema";
import { type User } from "@db/schema";
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
    const result = await db().execute<{ name: string }>(
      sql`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema()`
    );
    const names = result.rows.map(r => r.name);

    for (const table of [
      "users",
      "lager",
      "materials",
      "weighings",
      "container_types",
      "storage_boxes",
      "login_codes",
      "preset_manufacturers",
      "preset_container_series",
      "preset_container_versions",
      "preset_container_variants",
      "preset_series_material_types",
      "preset_proposals",
      "hidden_container_presets",
    ]) {
      expect(names).toContain(table);
    }
  });

  it("erzeugt die Payload-Spalte als jsonb", async () => {
    // `json` würde den Text unverändert speichern; erst `jsonb` normalisiert
    // und erlaubt später Indizes.
    const result = await db().execute<{ type: string }>(
      sql`SELECT data_type AS type FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'preset_proposals' AND column_name = 'payload'`
    );
    expect(result.rows[0].type).toBe("jsonb");
  });

  it("führt alle Zeitstempel als timestamptz", async () => {
    // `timestamp without time zone` würde je nach TimeZone der Verbindung
    // verschieben – die Anwendung rechnet durchgehend in UTC.
    const result = await db().execute<{ table: string; column: string }>(
      sql`SELECT table_name AS "table", column_name AS "column" FROM information_schema.columns
          WHERE table_schema = current_schema() AND data_type = 'timestamp without time zone'`
    );
    expect(result.rows).toEqual([]);
  });

  it("legt die Enum-Typen an", async () => {
    const result = await db().execute<{ name: string }>(
      sql`SELECT typname AS name FROM pg_type WHERE typtype = 'e'`
    );
    const names = result.rows.map(r => r.name);
    for (const type of [
      "user_role",
      "preset_source",
      "preset_scope",
      "preset_container_material",
      "preset_proposal_kind",
      "preset_proposal_status",
      "friend_visibility",
      "friendship_status",
      "loan_request_status",
      "material_kind",
      "container_form",
    ]) {
      expect(names).toContain(type);
    }
  });

  /**
   * Die Vorgabe `rolle` ist der Backfill für alles, was vor 2.3.0 angelegt
   * wurde – bis dahin konnte eine Gebindeart nichts anderes sein. Wäre die
   * Spalte ohne Vorgabe oder nullable, stünde bei jedem Altbestand „unbekannt“,
   * und die Gebindeauswahl könnte nicht sortieren.
   */
  it("gibt einer Gebindeart ohne Angabe die Form „rolle“", async () => {
    const [row] = await db()
      .insert(schema.containerTypes)
      .values({ userId: 1, name: "Ohne Formangabe", tareWeight: 140 })
      .returning();
    expect(row.form).toBe("rolle");

    /*
      Am Katalog ist es umgekehrt: Dort bleibt die Form leer, weil Einträge von
      Administratoren und aus der Community alles sein können und eine geratene
      Form später als gepflegt gelesen würde.
    */
    const [manufacturer] = await db()
      .insert(schema.presetManufacturers)
      .values({ slug: "formtest", name: "Formtest" })
      .returning();
    const [series] = await db()
      .insert(schema.presetContainerSeries)
      .values({ manufacturerId: manufacturer.id, name: "S", slug: "s" })
      .returning();
    const [version] = await db()
      .insert(schema.presetContainerVersions)
      .values({ seriesId: series.id, name: "V", slug: "v" })
      .returning();
    expect(version.form).toBeNull();
  });

  it("nutzt UTF-8 als Kodierung", async () => {
    const result = await db().execute<{ encoding: string }>(
      sql`SELECT pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = current_database()`
    );
    expect(result.rows[0].encoding).toBe("UTF8");
  });

  /**
   * Die Tabellenliste in `COUNTED_TABLES` (`api/queries/systemStatus.ts`) geht
   * als Bezeichner ins SQL. Ein veralteter Name ist deshalb **kein** Typfehler,
   * sondern ein 500 auf `/verwaltung/system` – und war bis 2.3.0 von keinem Test
   * abgedeckt. Genau so ist beim Umbenennen von `spool_*` auf `container_*` ein
   * Bruch möglich, den weder `tsc` noch die übrige Suite bemerkt.
   *
   * Der Aufruf selbst ist die Prüfung: Er scheitert an jedem Namen, den es nicht
   * gibt. Zusätzlich wird verlangt, dass die Tabellen mit Bestandsdaten dabei
   * sind – `lager` fehlte in 2.2.0 still.
   */
  it("zählt alle Fachtabellen, die es wirklich gibt", async () => {
    const counts = await countAllTables();
    const tables = counts.map(c => c.table);

    expect(tables).toContain("lager");
    expect(tables).toContain("container_types");
    expect(tables).toContain("materials");
    expect(tables).toContain("hidden_container_presets");
    // Keine Zeile darf fehlen: je Eintrag genau ein Ergebnis.
    expect(counts.every(c => Number.isInteger(c.rows))).toBe(true);
  });

  it("ist wiederholbar", async () => {
    await expect(resetSchema()).resolves.not.toThrow();
  });
});

describe("Seeding des Preset-Katalogs", () => {
  it("legt den Startkatalog an", async () => {
    const stats = await seedContainerPresets();
    expect(stats.created).toBeGreaterThan(0);
    expect(stats.updated).toBe(0);

    seedCounts = {
      manufacturers: await countRows("preset_manufacturers"),
      series: await countRows("preset_container_series"),
      versions: await countRows("preset_container_versions"),
      variants: await countRows("preset_container_variants"),
      materialTypes: await countRows("preset_series_material_types"),
    };
    expect(seedCounts.variants).toBeGreaterThan(0);
  });

  it("ist idempotent – wiederholtes Seeding ändert nichts", async () => {
    const second = await seedContainerPresets();
    const third = await seedContainerPresets();

    expect(second.created).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.skipped).toBeGreaterThan(0);
    expect(third).toEqual(second);

    // Der entscheidende Punkt: keine Duplikate durch mehrfache Deployments.
    expect({
      manufacturers: await countRows("preset_manufacturers"),
      series: await countRows("preset_container_series"),
      versions: await countRows("preset_container_versions"),
      variants: await countRows("preset_container_variants"),
      materialTypes: await countRows("preset_series_material_types"),
    }).toEqual(seedCounts);
  });
});

describe("Benutzer", () => {
  it("legt Benutzer per onConflictDoUpdate ohne Duplikate an", async () => {
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
    // Der Anzeigename steckt nicht mehr in der Variante, sondern entsteht in
    // der flachen Auswahlliste aus dem Katalogpfad.
    const options = await asUser.preset.options();
    expect(options).toHaveLength(seedCounts.variants);
    expect(options.every(o => o.displayName.length > 0)).toBe(true);
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

    expect(await countRows("hidden_container_presets")).toBe(1);
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
    expect(await countRows("hidden_container_presets")).toBe(0);
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
          containerMaterial: "kunststoff",
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

    // node-postgres liefert die jsonb-Spalte bereits geparst zurück.
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
    const variant = await db().query.presetContainerVariants.findFirst({
      where: eq(schema.presetContainerVariants.id, resultVariantId),
    });
    expect(variant?.source).toBe("community");
    const option = (await asUser.preset.options()).find(
      o => o.id === resultVariantId
    );
    expect(option?.displayName).toContain("IT Testhersteller");
  });

  it("lässt sich kein zweites Mal freigeben", async () => {
    // Prüft die optimistische Sperre in `closeProposal` (RETURNING).
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
      containerMaterial: "karton",
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

    // Früher musste die Umbenennung die vorberechneten Namen nachziehen; heute
    // entsteht der Name beim Lesen und kann gar nicht erst veralten.
    const option = (await asUser.preset.options()).find(
      o => o.id === variantId
    );
    expect(option?.displayName).toContain("IT CRUD AG");
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

    const lager = await asUser.lager.create({
      name: "IT Lager",
      materialKind: "filament",
      filamentDiameterUm: 1750,
    });
    const material = await asUser.material.create({
      lagerId: lager!.id,
      name: "IT Filament",
      materialType: "PLA",
      nominalWeight: 1000,
      storageBoxId: box!.id,
      containerPresetVariantId: option.id,
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
    expect(detail?.containerPresetVariantId).toBe(option.id);
  });

  it("trennt die Daten der Benutzer", async () => {
    expect(await asAdmin.material.list()).toHaveLength(0);
  });
});

describe("Postgres-Eigenheiten", () => {
  it("speichert Umlaute und Emoji verlustfrei", async () => {
    await upsertUser({
      unionId: "it-utf8",
      name: "Jörg Müller-Straße 🧵✨",
      role: "user",
    });
    const found = await findUserByUnionId("it-utf8");
    expect(found?.name).toBe("Jörg Müller-Straße 🧵✨");

    const containerType = await createContainerType({
      userId: found!.id,
      name: "Rolle „Grün“ – 1 kg · Ø200 mm",
      tareWeight: 200,
    });
    expect(containerType?.name).toBe("Rolle „Grün“ – 1 kg · Ø200 mm");
  });

  it("erzeugt ausschließlich ASCII-Slugs", async () => {
    // Postgres vergleicht Text je nach Kollation unterschiedlich. Weil
    // `slugify` transliteriert, hängt die Eindeutigkeit der Slugs nicht daran.
    const rows = await db()
      .select({ slug: schema.presetManufacturers.slug })
      .from(schema.presetManufacturers);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("weist zu lange Werte ab, statt sie zu kürzen", async () => {
    await expect(
      db()
        .insert(schema.containerTypes)
        .values({
          userId: admin.id,
          name: "x".repeat(300),
          tareWeight: 1,
        })
    ).rejects.toThrow();
  });

  it("weist ungültige Enum-Werte ab", async () => {
    // Spaltennamen in camelCase müssen in rohem SQL gequotet werden – Postgres
    // würde sie sonst auf Kleinschreibung normalisieren.
    await expect(
      db().execute(
        sql`INSERT INTO users ("unionId", role) VALUES ('it-bad-enum', 'superadmin')`
      )
    ).rejects.toThrow();
  });

  it("weist einen int-Überlauf ab, statt zu kappen", async () => {
    await expect(
      db().insert(schema.materials).values({
        userId: admin.id,
        // Beliebige ID – geprüft wird der int-Überlauf, nicht die Zuordnung.
        lagerId: 1,
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
    // timestamptz löst auf Mikrosekunden auf – die Grenzen dürfen eng sein.
    expect(reviewedAt).toBeGreaterThanOrEqual(before);
    expect(reviewedAt).toBeLessThanOrEqual(after);

    // DEFAULT now() muss dieselbe Zeitbasis haben wie die Anwendung. Läuft die
    // Datenbank in einer anderen Zeitzone, fiele das hier auf.
    const createdAt = (closed!.createdAt as Date).getTime();
    expect(Math.abs(createdAt - before)).toBeLessThan(60_000);
  });
});

describe("Systemzustand", () => {
  it("liefert den Systemzustand für die Verwaltungsseite", async () => {
    const status = await asAdmin.admin.system.status();

    expect(status.database.dialect).toBe("postgresql");
    expect(status.database.version).toMatch(/^\d+/);
    expect(status.schemaMigrations.length).toBeGreaterThan(0);
    expect(status.schemaMigrations.every(m => m.applied)).toBe(true);
    expect(status.schemaMigrations[0].generatedAt).toBeInstanceOf(Date);
    expect(status.seed.seededRows).toBeGreaterThan(0);

    const users = status.tableCounts.find(t => t.table === "users");
    expect(users?.rows).toBe(await countRows("users"));
  });

  it("bleibt Nicht-Admins verschlossen", async () => {
    await expect(asUser.admin.system.status()).rejects.toThrow();
  });
});
