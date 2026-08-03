/**
 * Einmalige Übernahme der Altdaten aus der MySQL-Datenbank.
 *
 * Läuft beim Serverstart, sobald `LEGACY_MYSQL_URL` gesetzt ist (siehe
 * `api/boot.ts`). Der Lauf ist idempotent: geschrieben wird mit
 * `onConflictDoNothing`, IDs werden 1:1 übernommen. Ein zweiter Lauf kopiert
 * deshalb nichts doppelt, und ein abgebrochener Lauf kann einfach wiederholt
 * werden.
 *
 * Gedacht ist das für eine leere Zieldatenbank. Kollidiert eine Zeile mit
 * einer vorhandenen ID oder einem vorhandenen Unique-Key, gewinnt das Ziel –
 * die übersprungene Zeile taucht im `detail` unter `skipped` auf und wird auf
 * `/verwaltung/system` angezeigt.
 *
 * IDs können unverändert bleiben, weil die Datenbank bewusst keine
 * Fremdschlüssel führt (siehe AGENTS.md) – es gibt nichts umzuschreiben.
 *
 * Der Fortschritt landet in `migration_state`; die Verwaltungsseite
 * `/verwaltung/system` liest ihn aus.
 */
import { eq, sql, getTableColumns } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import {
  LEGACY_IMPORT_KEY,
  hiddenSpoolPresets,
  loginCodes,
  materials,
  migrationState,
  presetManufacturers,
  presetProposals,
  presetSeriesMaterialTypes,
  presetSpoolSeries,
  presetSpoolVariants,
  presetSpoolVersions,
  spoolTypes,
  storageBoxes,
  users,
  weighings,
  type MigrationState,
} from "@db/schema";
import { env } from "../lib/env";
import { getDb } from "./connection";

/** Zeilen je Schreib- und Lesevorgang. */
const BATCH_SIZE = 500;

/**
 * Übernahmereihenfolge: Eltern vor Kindern. Fachlich erzwingt das nichts (es
 * gibt keine Fremdschlüssel), aber bei einem Abbruch mittendrin ist der
 * Zwischenstand so leichter zu lesen.
 */
const LEGACY_TABLES: { name: string; table: PgTable }[] = [
  { name: "users", table: users },
  { name: "login_codes", table: loginCodes },
  { name: "spool_types", table: spoolTypes },
  { name: "storage_boxes", table: storageBoxes },
  { name: "preset_manufacturers", table: presetManufacturers },
  { name: "preset_spool_series", table: presetSpoolSeries },
  { name: "preset_series_material_types", table: presetSeriesMaterialTypes },
  { name: "preset_spool_versions", table: presetSpoolVersions },
  { name: "preset_spool_variants", table: presetSpoolVariants },
  { name: "materials", table: materials },
  { name: "weighings", table: weighings },
  { name: "hidden_spool_presets", table: hiddenSpoolPresets },
  { name: "preset_proposals", table: presetProposals },
];

export type LegacyImportDetail = {
  table: string;
  /** Zeilen in der Quelle */
  sourceRows: number;
  /** Tatsächlich eingefügte Zeilen */
  copied: number;
  /** Zeilen, die es im Ziel schon gab (gleiche ID / gleicher Unique-Key) */
  skipped: number;
  ms: number;
  /** Gesetzt, wenn die Tabelle in der Quelle gar nicht existierte */
  missing?: boolean;
};

// ---------------------------------------------------------------------------
// Werteumwandlung
//
// Reine Funktionen ohne Datenbankzugriff – sie sind der fehleranfällige Teil
// der Übernahme und werden in api/legacyImport.test.ts einzeln geprüft.
// ---------------------------------------------------------------------------

/** Datum ohne Uhrzeit als `YYYY-MM-TT`, wie es die `date`-Spalten erwarten. */
function toDateString(value: Date): string {
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Bringt einen Wert aus MySQL in die Form, die die Postgres-Spalte erwartet.
 * Gesteuert wird das über Drizzles `dataType`, nicht über eine gepflegte
 * Spaltenliste – so bleibt die Übernahme bei Schemaänderungen korrekt.
 */
export function convertValue(value: unknown, dataType: string): unknown {
  if (value === null || value === undefined) return null;

  switch (dataType) {
    case "boolean":
      // MySQL führt `boolean` als tinyint(1).
      return value === true || value === 1 || value === "1";

    case "number":
      return typeof value === "number" ? value : Number(value);

    case "json":
      // mysql2 liefert JSON-Spalten bereits geparst; MariaDB kennt nur einen
      // longtext-Alias und gibt eine Zeichenkette zurück.
      if (typeof value !== "string") return value;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }

    case "date":
      return value instanceof Date ? value : new Date(String(value));

    case "string":
      // Die `date`-Spalten laufen im Modus "string". Je nach Treiberoption
      // kommt dort ein Date an – dann darf nicht `String(date)` daraus werden.
      if (value instanceof Date) return toDateString(value);
      return typeof value === "string" ? value : String(value);

    default:
      return value;
  }
}

/**
 * Bildet eine Quellzeile auf die Zielspalten ab.
 *
 * Spalten, die die Quelle nicht kennt, bleiben weg (die Zielspalte behält
 * ihren Default); Spalten, die nur die Quelle kennt, werden ignoriert.
 */
export function mapRow(
  row: Record<string, unknown>,
  columns: Record<string, { name: string; dataType: string }>
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columns)) {
    if (!(column.name in row)) continue;
    mapped[key] = convertValue(row[column.name], column.dataType);
  }
  return mapped;
}

/** Verbindungsangabe ohne Zugangsdaten, z. B. „db:3306/filahub“. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const port = parsed.port ? `:${parsed.port}` : "";
    return `${parsed.hostname}${port}${parsed.pathname}`;
  } catch {
    return "unbekannte Quelle";
  }
}

// ---------------------------------------------------------------------------
// Zustand in migration_state
// ---------------------------------------------------------------------------

/** Legt die Zustandszeile an, falls sie noch fehlt, und gibt sie zurück. */
async function ensureState(): Promise<MigrationState> {
  const db = getDb();
  await db
    .insert(migrationState)
    .values({ key: LEGACY_IMPORT_KEY, status: "pending" })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(migrationState)
    .where(eq(migrationState.key, LEGACY_IMPORT_KEY))
    .limit(1);
  return row;
}

export function getLegacyImportState() {
  return getDb().query.migrationState.findFirst({
    where: eq(migrationState.key, LEGACY_IMPORT_KEY),
  });
}

/**
 * Beansprucht den Lauf. Der Statuswechsel wirkt als optimistische Sperre –
 * dasselbe Muster wie in `closeProposal`: Starten zwei Instanzen gleichzeitig,
 * bekommt genau eine die Zeile und die andere `false`.
 */
async function claimRun(source: string): Promise<boolean> {
  const claimed = await getDb()
    .update(migrationState)
    .set({
      status: "running",
      source,
      startedAt: new Date(),
      finishedAt: null,
      error: null,
      tablesTotal: LEGACY_TABLES.length,
      tablesDone: 0,
      rowsCopied: 0,
      detail: null,
    })
    .where(
      sql`${migrationState.key} = ${LEGACY_IMPORT_KEY} AND ${migrationState.status} IN ('pending', 'failed')`
    )
    .returning({ id: migrationState.id });
  return claimed.length > 0;
}

async function updateState(data: Partial<MigrationState>) {
  await getDb()
    .update(migrationState)
    .set(data)
    .where(eq(migrationState.key, LEGACY_IMPORT_KEY));
}

// ---------------------------------------------------------------------------
// Übernahme
// ---------------------------------------------------------------------------

/**
 * Setzt die Sequenz einer Tabelle auf den höchsten vergebenen Wert.
 * Ohne diesen Schritt vergäbe Postgres beim nächsten INSERT die 1 und liefe
 * sofort in einen Konflikt mit den übernommenen IDs.
 */
async function resyncSequence(tableName: string) {
  await getDb().execute(
    sql`SELECT setval(
          pg_get_serial_sequence(${tableName}, 'id'),
          COALESCE((SELECT MAX(id) FROM ${sql.identifier(tableName)}), 1),
          (SELECT MAX(id) FROM ${sql.identifier(tableName)}) IS NOT NULL
        )`
  );
}

/** MySQL-Fehlercode für „Tabelle existiert nicht“. */
function isMissingTableError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "ER_NO_SUCH_TABLE"
  );
}

type LegacyConnection = {
  query: (sql: string, values?: unknown[]) => Promise<[unknown, unknown]>;
  end: () => Promise<void>;
};

async function copyTable(
  connection: LegacyConnection,
  entry: { name: string; table: PgTable }
): Promise<LegacyImportDetail> {
  const startedAt = Date.now();
  const db = getDb();
  const columns = getTableColumns(entry.table) as unknown as Record<
    string,
    { name: string; dataType: string }
  >;

  let sourceRows = 0;
  let copied = 0;
  // Keyset-Paginierung über die ID: bei großen Tabellen bleibt der
  // Speicherbedarf beschränkt, ohne dass OFFSET immer teurer wird.
  let cursor = 0;

  for (;;) {
    let rows: Record<string, unknown>[];
    try {
      const [result] = await connection.query(
        `SELECT * FROM \`${entry.name}\` WHERE id > ? ORDER BY id LIMIT ${BATCH_SIZE}`,
        [cursor]
      );
      rows = result as Record<string, unknown>[];
    } catch (error) {
      if (isMissingTableError(error)) {
        return {
          table: entry.name,
          sourceRows: 0,
          copied: 0,
          skipped: 0,
          ms: Date.now() - startedAt,
          missing: true,
        };
      }
      throw error;
    }

    if (rows.length === 0) break;

    sourceRows += rows.length;
    cursor = Number(rows[rows.length - 1].id);

    const values = rows.map(row => mapRow(row, columns));
    const inserted = await db
      .insert(entry.table)
      .values(values)
      .onConflictDoNothing()
      .returning({ n: sql<number>`1` });
    copied += inserted.length;

    if (rows.length < BATCH_SIZE) break;
  }

  await resyncSequence(entry.name);

  return {
    table: entry.name,
    sourceRows,
    copied,
    skipped: sourceRows - copied,
    ms: Date.now() - startedAt,
  };
}

export type LegacyImportResult = {
  status: MigrationState["status"];
  detail: LegacyImportDetail[];
  rowsCopied: number;
};

/**
 * Übernimmt die Altdaten, sofern `LEGACY_MYSQL_URL` gesetzt ist.
 *
 * Wirft nicht: Der Serverstart darf daran nicht scheitern, sonst käme man
 * nicht mehr an die Verwaltungsseite, auf der der Fehler steht.
 */
export async function runLegacyImport(): Promise<LegacyImportResult> {
  const state = await ensureState();

  if (!env.legacyMysqlUrl) {
    // Ein bereits gelaufener Import bleibt unangetastet – „skipped“ heißt
    // hier nur „für diesen Start war nichts zu tun“.
    if (state.status === "pending") {
      await updateState({ status: "skipped", finishedAt: new Date() });
      return { status: "skipped", detail: [], rowsCopied: 0 };
    }
    return {
      status: state.status,
      detail: (state.detail as LegacyImportDetail[] | null) ?? [],
      rowsCopied: state.rowsCopied,
    };
  }

  const source = redactUrl(env.legacyMysqlUrl);
  if (!(await claimRun(source))) {
    // Bereits erledigt oder eine andere Instanz ist gerade dran.
    const current = await getLegacyImportState();
    return {
      status: current?.status ?? state.status,
      detail: (current?.detail as LegacyImportDetail[] | null) ?? [],
      rowsCopied: current?.rowsCopied ?? 0,
    };
  }

  const { createConnection } = await import("mysql2/promise");
  let connection: LegacyConnection | undefined;
  const detail: LegacyImportDetail[] = [];
  let rowsCopied = 0;

  try {
    connection = (await createConnection({
      uri: env.legacyMysqlUrl,
      // DATE als Zeichenkette: sonst käme ein Date an, dessen Umwandlung in
      // `YYYY-MM-TT` von der Zeitzone des Prozesses abhinge.
      dateStrings: ["DATE"],
      // MySQL-`timestamp` ist UTC; beide Angaben zusammen sorgen dafür, dass
      // mysql2 die Werte auch als UTC interpretiert.
      timezone: "Z",
    })) as unknown as LegacyConnection;
    await connection.query("SET time_zone = '+00:00'");

    for (const entry of LEGACY_TABLES) {
      const result = await copyTable(connection, entry);
      detail.push(result);
      rowsCopied += result.copied;
      await updateState({
        tablesDone: detail.length,
        rowsCopied,
        detail,
      });
    }

    await updateState({
      status: "completed",
      finishedAt: new Date(),
      tablesDone: detail.length,
      rowsCopied,
      detail,
      error: null,
    });
    return { status: "completed", detail, rowsCopied };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateState({
      status: "failed",
      finishedAt: new Date(),
      error: message,
      detail,
      rowsCopied,
    });
    return { status: "failed", detail, rowsCopied };
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

/**
 * Setzt einen fehlgeschlagenen Lauf zurück und startet ihn erneut.
 * Aufgerufen vom Knopf „Erneut versuchen“ auf `/verwaltung/system`.
 */
export async function retryLegacyImport(): Promise<LegacyImportResult> {
  await getDb()
    .update(migrationState)
    .set({ status: "pending" })
    .where(
      sql`${migrationState.key} = ${LEGACY_IMPORT_KEY} AND ${migrationState.status} IN ('failed', 'skipped')`
    );
  return runLegacyImport();
}

/** Zeilenzahlen aller Fachtabellen für die Verwaltungsseite. */
export async function countAllTables(): Promise<
  { table: string; rows: number }[]
> {
  const db = getDb();
  const counts = await Promise.all(
    LEGACY_TABLES.map(async entry => {
      const result = await db.execute<{ count: string }>(
        sql`SELECT COUNT(*)::text AS count FROM ${sql.identifier(entry.name)}`
      );
      return { table: entry.name, rows: Number(result.rows[0].count) };
    })
  );
  return counts;
}

/** Reihenfolge der übernommenen Tabellen (Tests, Verwaltungsseite). */
export const legacyTableNames = LEGACY_TABLES.map(t => t.name);
