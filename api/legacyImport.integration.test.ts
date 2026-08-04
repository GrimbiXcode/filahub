/**
 * Der vollständige Übernahmelauf MySQL → Postgres.
 *
 * Braucht zwei Datenbanken: die Postgres-Zieldatenbank aus
 * `TEST_DATABASE_URL` und eine MySQL-Quelle aus `TEST_LEGACY_MYSQL_URL`.
 * Fehlt die zweite, wird die Datei übersprungen – so bleibt
 * `npm run test:integration` auch ohne MySQL-Container lauffähig.
 *
 * Die Quelle wird aus `db/legacy/mysql-baseline.sql` aufgebaut, dem
 * archivierten Schemastand der MySQL-Version. Damit prüft dieser Test
 * dieselbe Struktur, aus der bestehende Installationen tatsächlich kommen.
 */
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "./queries/connection";
import {
  canClaimRun,
  getLegacyImportState,
  legacyTableNames,
  retryLegacyImport,
  runLegacyImport,
} from "./queries/legacyImport";
import { seedSpoolPresets } from "./queries/presetSeed";
import * as schema from "@db/schema";
import { LEGACY_IMPORT_KEY, migrationState } from "@db/schema";
import { closeDb, countRows, resetSchema } from "./test/integration-db";

const legacyUrl = process.env.TEST_LEGACY_MYSQL_URL;
const db = () => getDb();

/** Alle Fachtabellen der Altdatenbank mit charakteristischen Werten. */
const FIXTURES = [
  `INSERT INTO users (id, unionId, name, telegramUsername, email, avatar, role, currency, locale, lastSeenReleaseVersion, createdAt, updatedAt, lastSignInAt) VALUES
     (7, '111', 'Alt-Admin', 'altadmin', 'a@example.org', NULL, 'admin', 'CHF', 'de-CH', '0.6.1', '2026-01-02 03:04:05', '2026-01-02 03:04:05', '2026-02-01 10:00:00'),
     (12, '222', 'Alt-Nutzer', NULL, NULL, NULL, 'user', 'EUR', NULL, NULL, '2026-01-03 00:00:00', '2026-01-03 00:00:00', '2026-01-03 00:00:00')`,
  `INSERT INTO login_codes (id, code, telegramId, telegramUsername, telegramName, expiresAt, usedAt, createdAt) VALUES
     (3, '123456', '111', 'altadmin', 'Alt Admin', '2026-01-02 04:04:05', NULL, '2026-01-02 03:04:05')`,
  `INSERT INTO spool_types (id, userId, name, manufacturer, tareWeight, sourceVariantId, notes, createdAt) VALUES
     (5, 7, 'Eigene Kartonrolle', 'Polymaker', 145, NULL, 'Umlaute: äöüß · Emoji: 🧵', '2026-01-04 12:00:00')`,
  `INSERT INTO storage_boxes (id, userId, name, location, tareWeight, notes, createdAt) VALUES
     (9, 7, 'Drybox 1', 'Werkstatt', 1320, NULL, '2026-01-04 12:30:00')`,
  `INSERT INTO preset_manufacturers (id, name, slug, website, source, seedRevision, active, notes, createdAt, updatedAt) VALUES
     (2, 'Polymaker', 'polymaker', 'https://polymaker.com', 'seed', 1, 1, NULL, '2026-01-01 00:00:00', '2026-01-01 00:00:00'),
     (4, 'Alt-Hersteller', 'alt-hersteller', NULL, 'admin', 0, 0, 'deaktiviert', '2026-01-01 00:00:00', '2026-01-01 00:00:00')`,
  `INSERT INTO preset_spool_series (id, manufacturerId, name, slug, source, seedRevision, active, notes, createdAt, updatedAt) VALUES
     (6, 2, 'PolyTerra PLA', 'polyterra-pla', 'seed', 1, 1, NULL, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`,
  `INSERT INTO preset_series_material_types (id, seriesId, materialType) VALUES (11, 6, 'PLA'), (12, 6, 'PLA+')`,
  `INSERT INTO preset_spool_versions (id, seriesId, name, slug, spoolMaterial, validFrom, validTo, source, seedRevision, active, notes, createdAt, updatedAt) VALUES
     (8, 6, 'Kartonspule (ab 2023)', 'karton-2023', 'karton', '2023-01-01', NULL, 'seed', 1, 1, NULL, '2026-01-01 00:00:00', '2026-01-01 00:00:00'),
     (9, 6, 'Kunststoff (bis 2022)', 'kunststoff-alt', 'kunststoff', '2019-06-01', '2022-12-31', 'community', 0, 0, NULL, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`,
  `INSERT INTO preset_spool_variants (id, versionId, nominalWeight, tareWeight, outerDiameterMm, widthMm, boreDiameterMm, displayName, source, seedRevision, active, notes, createdAt, updatedAt) VALUES
     (14, 8, 1000, 148, 200, 68, 55, 'Polymaker · PolyTerra PLA · Kartonspule (ab 2023) · 1 kg', 'seed', 1, 1, NULL, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`,
  `INSERT INTO materials (id, userId, name, identifier, materialType, manufacturer, color, priceCents, purchaseDate, nominalWeight, spoolTypeId, spoolPresetVariantId, storageBoxId, notes, createdAt, updatedAt) VALUES
     (21, 7, 'PolyTerra Grau', 'P01', 'PLA', 'Polymaker', 'grau', 2499, '2026-01-15', 1000, NULL, 14, 9, NULL, '2026-01-15 09:00:00', '2026-01-16 09:00:00'),
     (22, 7, 'PETG Schwarz', NULL, 'PETG', NULL, NULL, NULL, NULL, 1000, 5, NULL, NULL, 'ohne Preis', '2026-01-20 09:00:00', '2026-01-20 09:00:00')`,
  `INSERT INTO weighings (id, materialId, grossWeight, weighedAt, note, createdAt) VALUES
     (31, 21, 1148, '2026-01-16 08:30:00', 'erste Wägung', '2026-01-16 08:30:00'),
     (32, 21, 900, '2026-02-01 08:30:00', NULL, '2026-02-01 08:30:00')`,
  `INSERT INTO hidden_spool_presets (id, userId, scope, refId, createdAt) VALUES (41, 12, 'manufacturer', 4, '2026-01-05 00:00:00')`,
  `INSERT INTO preset_proposals (id, userId, kind, targetType, targetId, payload, sourceSpoolTypeId, comment, status, reviewedBy, reviewedAt, reviewNote, resultId, createdAt, updatedAt) VALUES
     (51, 12, 'new', 'variant', NULL, '{"kind":"new","manufacturer":{"name":"Testhersteller"},"series":{"name":"Testserie","materialTypes":["PLA"]},"version":{"name":"v1"},"variant":{"nominalWeight":1000,"tareWeight":180}}', 5, 'Bitte aufnehmen', 'pending', NULL, NULL, NULL, NULL, '2026-02-02 00:00:00', '2026-02-02 00:00:00'),
     (52, 7, 'change', 'manufacturer', 2, '{"kind":"change","fields":{"website":"https://neu.example"}}', NULL, NULL, 'rejected', 7, '2026-02-03 12:00:00', 'passt nicht', NULL, '2026-02-02 12:00:00', '2026-02-03 12:00:00')`,
];

/** Zeilen je Tabelle in den Fixtures oben. */
const EXPECTED_SOURCE_ROWS: Record<string, number> = {
  users: 2,
  login_codes: 1,
  spool_types: 1,
  storage_boxes: 1,
  preset_manufacturers: 2,
  preset_spool_series: 1,
  preset_series_material_types: 2,
  preset_spool_versions: 2,
  preset_spool_variants: 1,
  materials: 2,
  weighings: 2,
  hidden_spool_presets: 1,
  preset_proposals: 2,
};

const TOTAL_SOURCE_ROWS = Object.values(EXPECTED_SOURCE_ROWS).reduce(
  (sum, n) => sum + n,
  0
);

/** Baut die MySQL-Quelldatenbank aus dem archivierten Schemastand neu auf. */
async function buildLegacyDatabase(url: string) {
  const { createConnection } = await import("mysql2/promise");
  const connection = await createConnection({
    uri: url,
    multipleStatements: false,
  });

  const [tables] = (await connection.query(
    "SELECT TABLE_NAME AS name FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE()"
  )) as unknown as [{ name: string }[]];
  if (tables.length > 0) {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    await connection.query(
      `DROP TABLE IF EXISTS ${tables.map(t => `\`${t.name}\``).join(", ")}`
    );
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  }

  const baseline = await readFile("db/legacy/mysql-baseline.sql", "utf8");
  const statements = baseline
    .split("--> statement-breakpoint")
    // Kommentarzeilen fallen weg – der Dateikopf steht vor der ersten
    // Anweisung und käme sonst mit ihr zusammen bei MySQL an.
    .map(chunk =>
      chunk
        .split("\n")
        .filter(line => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter(statement => statement.length > 0);
  for (const statement of statements) {
    await connection.query(statement);
  }
  for (const fixture of FIXTURES) {
    await connection.query(fixture);
  }

  await connection.end();
}

describe.skipIf(!legacyUrl)("Datenübernahme aus MySQL", () => {
  beforeAll(async () => {
    await buildLegacyDatabase(legacyUrl!);
    await resetSchema();
    // `runLegacyImport` liest die Quelle aus `env`, das beim Import des
    // Moduls eingefroren wurde – für den Test wird sie hier nachgereicht.
    const { env } = await import("./lib/env");
    (env as { legacyMysqlUrl: string }).legacyMysqlUrl = legacyUrl!;
  }, 120_000);

  afterAll(async () => {
    const { env } = await import("./lib/env");
    (env as { legacyMysqlUrl: string }).legacyMysqlUrl = "";
    await closeDb();
  });

  it("übernimmt alle Tabellen vollständig", async () => {
    const result = await runLegacyImport();

    expect(result.status).toBe("completed");
    expect(result.rowsCopied).toBe(TOTAL_SOURCE_ROWS);
    expect(result.detail.map(d => d.table)).toEqual(legacyTableNames);

    for (const entry of result.detail) {
      const expected = EXPECTED_SOURCE_ROWS[entry.table];
      expect(entry.sourceRows, entry.table).toBe(expected);
      expect(entry.copied, entry.table).toBe(expected);
      expect(entry.skipped, entry.table).toBe(0);
      expect(entry.missing, entry.table).toBeUndefined();
    }

    for (const [table, rows] of Object.entries(EXPECTED_SOURCE_ROWS)) {
      expect(await countRows(table), table).toBe(rows);
    }
  }, 120_000);

  it("behält die IDs bei – Verweise bleiben gültig", async () => {
    // Ohne Fremdschlüssel in der Datenbank hängt die Datenintegrität allein
    // daran, dass die IDs unverändert bleiben.
    const material = await db().query.materials.findFirst({
      where: eq(schema.materials.id, 21),
    });
    expect(material?.userId).toBe(7);
    expect(material?.spoolPresetVariantId).toBe(14);
    expect(material?.storageBoxId).toBe(9);
    expect(material?.spoolTypeId).toBeNull();

    const weighings = await db().query.weighings.findMany();
    expect(weighings.map(w => w.id).sort()).toEqual([31, 32]);
    expect(weighings.every(w => w.materialId === 21)).toBe(true);
  });

  it("wandelt die Typen korrekt um", async () => {
    const manufacturers = await db().query.presetManufacturers.findMany({
      orderBy: (t, { asc }) => [asc(t.id)],
    });
    // tinyint(1) → boolean
    expect(manufacturers.map(m => m.active)).toEqual([true, false]);
    expect(manufacturers.map(m => m.source)).toEqual(["seed", "admin"]);

    const version = await db().query.presetSpoolVersions.findFirst({
      where: eq(schema.presetSpoolVersions.id, 9),
    });
    // date → "YYYY-MM-TT" als Zeichenkette
    expect(version?.validFrom).toBe("2019-06-01");
    expect(version?.validTo).toBe("2022-12-31");
    expect(version?.spoolMaterial).toBe("kunststoff");

    const material = await db().query.materials.findFirst({
      where: eq(schema.materials.id, 21),
    });
    expect(material?.purchaseDate).toBe("2026-01-15");
    expect(material?.priceCents).toBe(2499);

    const proposal = await db().query.presetProposals.findFirst({
      where: eq(schema.presetProposals.id, 51),
    });
    // json → jsonb, geparst und nicht als Zeichenkette
    const payload = proposal?.payload as { manufacturer: { name: string } };
    expect(typeof payload).toBe("object");
    expect(payload.manufacturer.name).toBe("Testhersteller");

    const spoolType = await db().query.spoolTypes.findFirst({
      where: eq(schema.spoolTypes.id, 5),
    });
    expect(spoolType?.notes).toBe("Umlaute: äöüß · Emoji: 🧵");
  });

  it("überträgt Zeitstempel als UTC", async () => {
    const user = await db().query.users.findFirst({
      where: eq(schema.users.id, 7),
    });
    expect(user?.createdAt.toISOString()).toBe("2026-01-02T03:04:05.000Z");
    expect(user?.lastSignInAt.toISOString()).toBe("2026-02-01T10:00:00.000Z");
  });

  it("setzt die Sequenzen nach, damit neue Datensätze nicht kollidieren", async () => {
    // Ohne setval() vergäbe Postgres die 1 und liefe sofort in einen Konflikt
    // mit den übernommenen IDs.
    const [box] = await db()
      .insert(schema.storageBoxes)
      .values({ userId: 7, name: "Neue Box", tareWeight: 500 })
      .returning({ id: schema.storageBoxes.id });
    expect(box.id).toBeGreaterThan(9);

    const [material] = await db()
      .insert(schema.materials)
      .values({
        userId: 7,
        name: "Neues Material",
        materialType: "PLA",
        nominalWeight: 1000,
      })
      .returning({ id: schema.materials.id });
    expect(material.id).toBeGreaterThan(22);
  });

  it("ist idempotent – ein zweiter Lauf kopiert nichts", async () => {
    const before = await Promise.all(legacyTableNames.map(t => countRows(t)));

    // Zustand wie nach einem Abbruch, damit der Lauf überhaupt startet.
    await db()
      .update(migrationState)
      .set({ status: "failed" })
      .where(eq(migrationState.key, LEGACY_IMPORT_KEY));

    const result = await runLegacyImport();
    expect(result.status).toBe("completed");
    expect(result.rowsCopied).toBe(0);
    expect(result.detail.every(d => d.copied === 0)).toBe(true);
    expect(
      result.detail.every(d => d.skipped === EXPECTED_SOURCE_ROWS[d.table])
    ).toBe(true);

    const after = await Promise.all(legacyTableNames.map(t => countRows(t)));
    expect(after).toEqual(before);
  }, 120_000);

  it("startet einen abgeschlossenen Lauf nicht von selbst neu", async () => {
    const result = await runLegacyImport();
    expect(result.status).toBe("completed");

    // Auch der Knopf in der Verwaltung fasst einen fertigen Lauf nicht an.
    const retried = await retryLegacyImport();
    expect(retried.status).toBe("completed");
  });

  it("hält den Zustand für die Verwaltungsseite fest", async () => {
    const state = await getLegacyImportState();
    expect(state?.status).toBe("completed");
    expect(state?.tablesDone).toBe(legacyTableNames.length);
    expect(state?.tablesTotal).toBe(legacyTableNames.length);
    expect(state?.startedAt).toBeInstanceOf(Date);
    expect(state?.finishedAt).toBeInstanceOf(Date);
    expect(state?.error).toBeNull();
    // Die Quelle darf keine Zugangsdaten enthalten.
    expect(state?.source).not.toContain("@");
    expect(state?.source).not.toContain(":" + "filahub@");
  });

  it("legt beim Seeding danach keine Dubletten an", async () => {
    // Der Startkatalog trifft auf bereits übernommene Einträge und muss sie
    // über ihren Slug wiederfinden – deshalb läuft er in api/boot.ts nach der
    // Übernahme.
    const stats = await seedSpoolPresets();
    expect(stats.skipped).toBeGreaterThan(0);

    const manufacturers = await db().query.presetManufacturers.findMany();
    const slugs = manufacturers.map(m => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.filter(s => s === "polymaker")).toHaveLength(1);
  });

  it("hält einen Fehler fest, statt ihn zu verschlucken", async () => {
    const { env } = await import("./lib/env");
    const original = env.legacyMysqlUrl;
    (env as { legacyMysqlUrl: string }).legacyMysqlUrl =
      "mysql://filahub:filahub@127.0.0.1:3999/gibtesnicht";

    await db()
      .update(migrationState)
      .set({ status: "failed" })
      .where(eq(migrationState.key, LEGACY_IMPORT_KEY));

    const result = await runLegacyImport();
    expect(result.status).toBe("failed");

    const state = await getLegacyImportState();
    expect(state?.status).toBe("failed");
    expect(state?.error).toBeTruthy();
    expect(state?.source).toBe("127.0.0.1:3999/gibtesnicht");

    (env as { legacyMysqlUrl: string }).legacyMysqlUrl = original;
  }, 60_000);

  // -------------------------------------------------------------------------
  // Zustandsübernahme
  //
  // Diese vier Fälle sind bei der Durchsicht als echte Fehler aufgefallen und
  // hier festgenagelt: Ohne sie bliebe die Übernahme entweder blockiert oder
  // sie liefe in eine befüllte Datenbank und verlöre still Altdaten.
  // -------------------------------------------------------------------------

  it("nimmt einen abgestürzten Lauf wieder auf", async () => {
    // Nach einem Absturz bleibt `running` stehen. Ohne Verfallszeit wäre die
    // Übernahme damit für immer blockiert – kein Neustart, kein Knopf.
    await db()
      .update(migrationState)
      .set({
        status: "running",
        updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      })
      .where(eq(migrationState.key, LEGACY_IMPORT_KEY));

    expect(await canClaimRun()).toBe(true);
    expect((await runLegacyImport()).status).toBe("completed");
  }, 120_000);

  it("fasst einen frisch laufenden Lauf nicht an", async () => {
    await db()
      .update(migrationState)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(migrationState.key, LEGACY_IMPORT_KEY));

    expect(await canClaimRun()).toBe(false);
    // Eine zweite Instanz darf nicht mitten hineinlaufen.
    expect((await runLegacyImport()).status).toBe("running");

    await db()
      .update(migrationState)
      .set({ status: "completed" })
      .where(eq(migrationState.key, LEGACY_IMPORT_KEY));
  });

  it("bietet einen abgeschlossenen Lauf nicht zur Wiederholung an", async () => {
    expect(await canClaimRun()).toBe(false);
  });
});

describe.skipIf(!legacyUrl)("Schutz der Zieldatenbank", () => {
  beforeAll(async () => {
    await buildLegacyDatabase(legacyUrl!);
    await resetSchema();
    const { env } = await import("./lib/env");
    (env as { legacyMysqlUrl: string }).legacyMysqlUrl = legacyUrl!;
  }, 120_000);

  afterAll(async () => {
    const { env } = await import("./lib/env");
    (env as { legacyMysqlUrl: string }).legacyMysqlUrl = "";
    await closeDb();
  });

  it("verweigert die Übernahme in eine bereits befüllte Datenbank", async () => {
    // Der wahrscheinlichste Fehlgriff: einmal ohne LEGACY_MYSQL_URL gestartet,
    // dabei den Startkatalog angelegt, danach die Variable gesetzt. Die
    // Preset-IDs 1..n sind dann vergeben – die Altzeilen fielen unter
    // `onConflictDoNothing` weg und Materialien zeigten über ihre unveränderte
    // `spoolPresetVariantId` auf eine fremde Spule mit anderem Leergewicht.
    const seeded = await seedSpoolPresets();
    expect(seeded.created).toBeGreaterThan(0);
    const vorher = await countRows("preset_manufacturers");

    const result = await runLegacyImport();
    expect(result.status).toBe("failed");
    expect(result.rowsCopied).toBe(0);

    const state = await getLegacyImportState();
    expect(state?.error).toContain("nicht leer");
    // Der vorhandene Bestand bleibt unangetastet.
    expect(await countRows("preset_manufacturers")).toBe(vorher);
    expect(await countRows("users")).toBe(0);
  }, 120_000);

  it("bleibt bei der Verweigerung, statt beim zweiten Versuch nachzugeben", async () => {
    const result = await retryLegacyImport();
    expect(result.status).toBe("failed");
    expect(result.rowsCopied).toBe(0);
  }, 120_000);

  it("läuft in eine leere Datenbank durch", async () => {
    await resetSchema();
    const result = await runLegacyImport();
    expect(result.status).toBe("completed");
    expect(result.rowsCopied).toBe(TOTAL_SOURCE_ROWS);
  }, 120_000);
});
