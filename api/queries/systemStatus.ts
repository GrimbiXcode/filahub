/**
 * Zustandsdaten für die Verwaltungsseite `/verwaltung/system`.
 *
 * Fasst zusammen, was beim Serverstart passiert ist: Datenbankverbindung,
 * angewandte Schema-Migrationen, Füllstand der Fachtabellen und der Stand des
 * Preset-Startkatalogs.
 */
import { readFile } from "node:fs/promises";
import { count, eq, sql } from "drizzle-orm";
import { PRESET_SEED_REVISION } from "@db/presets/catalog";
import {
  presetManufacturers,
  presetContainerSeries,
  presetContainerVariants,
  presetContainerVersions,
} from "@db/schema";
import { env } from "../lib/env";
import { getDb, getPool } from "./connection";

/** Verbindungsangabe ohne Zugangsdaten, z. B. „db:5432/filahub“. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const port = parsed.port ? `:${parsed.port}` : "";
    return `${parsed.hostname}${port}${parsed.pathname}`;
  } catch {
    return "unbekannte Quelle";
  }
}

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

/**
 * Fachtabellen in der Reihenfolge, in der sie auf der Verwaltungsseite
 * erscheinen: erst Konten, dann Katalog, dann Bestand. Bewusst eine eigene
 * Liste statt „alles aus dem Schema“ – Protokoll- und Sitzungstabellen sagen
 * über den Füllstand des Lagers nichts aus.
 *
 * **Diese Namen gehen als Bezeichner ins SQL** (`sql.identifier` unten). Ein
 * veralteter Eintrag ist deshalb kein Typfehler, sondern ein Fehler zur
 * Laufzeit – die Verwaltungsseite antwortet dann mit 500. Beim Umbenennen einer
 * Tabelle ist das die Stelle, die weder der Compiler noch ein Typ findet;
 * `api/postgres.integration.test.ts` ruft `countAllTables()` deshalb einmal auf.
 */
const COUNTED_TABLES = [
  "users",
  "login_codes",
  "container_types",
  "storage_boxes",
  // Seit 2.7.0: die eigenen Farben und Oberflächen der Darstellung.
  "custom_colors",
  "custom_textures",
  "preset_manufacturers",
  "preset_container_series",
  "preset_series_material_types",
  "preset_container_versions",
  "preset_container_variants",
  // Seit 2.2.0. Fehlte in der Auslieferung von 2.2.0 – nachgetragen in 2.3.0.
  "lager",
  "materials",
  "weighings",
  "hidden_container_presets",
  "preset_proposals",
  /*
    Die Gemeinschaftstabellen. `friendships` und `loan_requests` fehlten seit
    2.1.0 – dieselbe Auslassung wie bei `lager`, nur ein Release früher.
    `lager_shares` kommt mit 2.4.0 dazu. Seit dem Vollständigkeitstest in
    `api/postgres.integration.test.ts` kann das nicht mehr still passieren: Eine
    neue Tabelle, die hier fehlt, macht ihn rot.
  */
  "friendships",
  "lager_shares",
  "loan_requests",
  // Seit 2.5.0. Der Bestand einer Organisation steckt in den Zeilen oben – hier
  // stehen nur die Organisationen selbst und wer zu ihnen gehört.
  "organizations",
  "organization_members",
  "organization_invitations",
  "audit_log",
] as const;

/** Zeilenzahlen aller Fachtabellen für die Verwaltungsseite. */
export async function countAllTables(): Promise<
  { table: string; rows: number }[]
> {
  const db = getDb();
  return Promise.all(
    COUNTED_TABLES.map(async name => {
      const result = await db.execute<{ count: string }>(
        sql`SELECT COUNT(*)::text AS count FROM ${sql.identifier(name)}`
      );
      return { table: name, rows: Number(result.rows[0].count) };
    })
  );
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
    presetContainerSeries,
    presetContainerVersions,
    presetContainerVariants,
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
