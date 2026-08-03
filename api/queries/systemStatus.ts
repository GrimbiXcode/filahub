/**
 * Zustandsdaten für die Verwaltungsseite `/verwaltung/system`.
 *
 * Fasst zusammen, was beim Serverstart passiert ist: Datenbankverbindung,
 * angewandte Schema-Migrationen, Übernahme der Altdaten aus MySQL und der
 * Stand des Preset-Startkatalogs.
 */
import { readFile } from "node:fs/promises";
import { count, eq, sql } from "drizzle-orm";
import { PRESET_SEED_REVISION } from "@db/presets/catalog";
import {
  presetManufacturers,
  presetSpoolSeries,
  presetSpoolVariants,
  presetSpoolVersions,
} from "@db/schema";
import { env } from "../lib/env";
import { getDb, getPool } from "./connection";
import { redactUrl } from "./legacyImport";

export type DatabaseInfo = {
  dialect: "postgresql";
  version: string;
  database: string;
  /** Host und Datenbank ohne Zugangsdaten */
  source: string;
  pool: { total: number; idle: number; waiting: number };
};

export async function getDatabaseInfo(): Promise<DatabaseInfo> {
  const result = await getDb().execute<{
    version: string;
    database: string;
  }>(
    sql`SELECT current_setting('server_version') AS version, current_database() AS database`
  );
  const pool = getPool();
  return {
    dialect: "postgresql",
    version: result.rows[0]?.version ?? "unbekannt",
    database: result.rows[0]?.database ?? "unbekannt",
    source: redactUrl(env.databaseUrl),
    pool: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    },
  };
}

export type SchemaMigration = {
  tag: string;
  applied: boolean;
  /**
   * Zeitpunkt, zu dem die Migrationsdatei erzeugt wurde – **nicht** der
   * Zeitpunkt ihrer Anwendung. Den hält Drizzle nirgends fest: die Spalte
   * `created_at` in `drizzle.__drizzle_migrations` bekommt genau diesen Wert
   * aus dem Journal. Dient hier als Versionsangabe der Datei.
   */
  generatedAt: Date;
};

type Journal = { entries: { idx: number; tag: string; when: number }[] };

/**
 * Gleicht die Migrationsdateien gegen die Historie in der Datenbank ab.
 *
 * Drizzle spielt Migrationen streng in Journal-Reihenfolge ein und schreibt je
 * Lauf eine Zeile nach `drizzle.__drizzle_migrations`. Die Anzahl der Zeilen
 * sagt deshalb, wie weit das Journal abgearbeitet ist – ein Abgleich über den
 * Datei-Hash ist dafür nicht nötig.
 */
export async function getSchemaMigrations(): Promise<SchemaMigration[]> {
  const journal = JSON.parse(
    await readFile("db/migrations/meta/_journal.json", "utf8")
  ) as Journal;

  const applied = await getDb().execute(
    sql`SELECT id FROM drizzle.__drizzle_migrations`
  );

  return journal.entries.map((entry, index) => ({
    tag: entry.tag,
    applied: index < applied.rows.length,
    generatedAt: new Date(entry.when),
  }));
}

export type SeedInfo = {
  revision: number;
  /** Katalogeinträge, die noch aus dem Startkatalog stammen */
  seededRows: number;
};

export async function getSeedInfo(): Promise<SeedInfo> {
  const db = getDb();
  const tables = [
    presetManufacturers,
    presetSpoolSeries,
    presetSpoolVersions,
    presetSpoolVariants,
  ];
  const counts = await Promise.all(
    tables.map(table =>
      db
        .select({ n: count() })
        .from(table)
        .where(eq(table.source, "seed"))
        .then(rows => rows[0]?.n ?? 0)
    )
  );
  return {
    revision: PRESET_SEED_REVISION,
    seededRows: counts.reduce((sum, n) => sum + n, 0),
  };
}
