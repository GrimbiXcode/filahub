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
 * Ab wann ein Lauf im Zustand `running` als abgestürzt gilt.
 *
 * Ein laufender Import schreibt nach jeder Tabelle seinen Fortschritt und
 * frischt dabei `updatedAt` auf. Bleibt das aus, lebt der Prozess nicht mehr –
 * ohne diese Schwelle bliebe die Übernahme nach einem Absturz für immer
 * blockiert, weil `claimRun` einen `running`-Zustand nie wieder übernimmt.
 */
const STALE_RUN_MS = 30 * 60 * 1000;

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
 * Bedingung, unter der ein Lauf übernommen werden darf.
 *
 * `completed` fehlt bewusst: Eine abgeschlossene Übernahme wird nie von selbst
 * wiederholt. `skipped` ist dabei, weil sonst jede Installation, die einmal
 * ohne `LEGACY_MYSQL_URL` gestartet wurde, die Übernahme nie mehr anstoßen
 * könnte. Ein `running`-Zustand ohne Lebenszeichen gilt als abgestürzt.
 */
const claimable = sql`(
  ${migrationState.status} IN ('pending', 'failed', 'skipped')
  OR (
    ${migrationState.status} = 'running'
    AND ${migrationState.updatedAt} < now() - ${sql.raw(`interval '${STALE_RUN_MS} milliseconds'`)}
  )
)`;

/** Gilt der Lauf gerade als übernehmbar? Steuert den Knopf in der Verwaltung. */
export async function canClaimRun(): Promise<boolean> {
  const rows = await getDb()
    .select({ id: migrationState.id })
    .from(migrationState)
    .where(sql`${migrationState.key} = ${LEGACY_IMPORT_KEY} AND ${claimable}`);
  return rows.length > 0;
}

/**
 * Beansprucht den Lauf. Der Statuswechsel wirkt als optimistische Sperre –
 * dasselbe Muster wie in `closeProposal`: Starten zwei Instanzen gleichzeitig,
 * bekommt genau eine die Zeile und die andere `false`.
 *
 * `rowsCopied` und `detail` bleiben stehen: Bei einer Wiederaufnahme nach
 * Absturz ist die bisherige Bilanz die einzige Auskunft darüber, ob schon
 * Zeilen geschrieben wurden – davon hängt die Prüfung in `ensureSafeTarget` ab.
 */
async function claimRun(source: string): Promise<boolean> {
  const claimed = await getDb()
    .update(migrationState)
    .set({
      status: "running",
      source,
      startedAt: new Date(),
      updatedAt: new Date(),
      finishedAt: null,
      error: null,
      tablesTotal: LEGACY_TABLES.length,
      tablesDone: 0,
    })
    .where(sql`${migrationState.key} = ${LEGACY_IMPORT_KEY} AND ${claimable}`)
    .returning({ id: migrationState.id });
  return claimed.length > 0;
}

/**
 * Schreibt den Fortschritt. `updatedAt` wird ausdrücklich mitgesetzt – es ist
 * das Lebenszeichen, an dem `claimable` einen abgestürzten Lauf erkennt.
 */
async function updateState(data: Partial<MigrationState>) {
  await getDb()
    .update(migrationState)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(migrationState.key, LEGACY_IMPORT_KEY));
}

/**
 * Prüft, ob die Übernahme in eine bereits befüllte Datenbank liefe, und gibt
 * in dem Fall die Begründung zurück (sonst null).
 *
 * Geschrieben wird mit `onConflictDoNothing`, damit ein abgebrochener Lauf
 * wiederholbar bleibt. Die Kehrseite: Trifft eine Altzeile auf eine vorhandene
 * ID, gewinnt das Ziel und die Altzeile fällt still weg. Bei Preset-Einträgen
 * wäre das besonders tückisch – Materialien zeigten dann über ihre
 * unveränderte `spoolPresetVariantId` auf eine fremde Spule mit anderem
 * Leergewicht.
 *
 * Geprüft wird, solange noch nie ein Lauf begonnen hat. Deshalb läuft die
 * Prüfung **vor** `claimRun`: Würde erst beansprucht und dann geprüft, setzte
 * schon der abgewiesene Versuch `startedAt` und schaltete die Prüfung für
 * alle weiteren Versuche ab. Sobald ein Lauf begonnen hat, können vorhandene
 * Zeilen von ihm stammen und eine Wiederaufnahme muss möglich bleiben.
 */
async function findBlockingRows(state: MigrationState): Promise<string | null> {
  if (state.startedAt !== null) return null;

  const belegt = (await countAllTables()).filter(c => c.rows > 0);
  if (belegt.length === 0) return null;

  const summe = belegt.reduce((n, c) => n + c.rows, 0);
  return (
    `Die Zieldatenbank ist nicht leer (${summe} Zeilen in: ` +
    `${belegt.map(c => `${c.table}=${c.rows}`).join(", ")}). ` +
    "Die Übernahme schreibt die alten IDs unverändert weiter und würde " +
    "vorhandene Einträge stillschweigend überspringen. Bitte eine leere " +
    "Datenbank verwenden: LEGACY_MYSQL_URL vor dem ersten Start setzen " +
    "oder die Zieldatenbank neu anlegen."
  );
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
  entry: { name: string; table: PgTable },
  /**
   * Wird nach jedem geschriebenen Stapel aufgerufen und schreibt den Zähler
   * fort. Zwei Aufgaben: Lebenszeichen gegen die Absturzerkennung (eine sehr
   * große Tabelle gälte sonst nach `STALE_RUN_MS` als tot) und Beleg dafür,
   * dass bereits Zeilen im Ziel stehen – daran hängt `ensureSafeTarget`.
   */
  onBatch: (copied: number) => Promise<void>
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
    await onBatch(inserted.length);

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
 * nicht mehr an die Verwaltungsseite, auf der der Fehler steht. Die Zusicherung
 * gilt auch für die Vorbereitung (Zustandszeile lesen, Ziel prüfen, Lauf
 * beanspruchen) – sie liegt vor dem eigentlichen `try` und würde sonst
 * durchschlagen.
 */
export async function runLegacyImport(): Promise<LegacyImportResult> {
  try {
    return await importLegacyData();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Datenübernahme aus MySQL fehlgeschlagen:", error);
    // Bestmöglich festhalten; ist die Datenbank selbst das Problem, geht auch
    // das nicht mehr – dann bleibt nur das Protokoll.
    await updateState({
      status: "failed",
      error: message,
      finishedAt: new Date(),
    }).catch(() => undefined);
    return { status: "failed", detail: [], rowsCopied: 0 };
  }
}

async function importLegacyData(): Promise<LegacyImportResult> {
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

  // Vor dem Beanspruchen: Ein abgewiesener Versuch darf `startedAt` nicht
  // setzen, sonst gälte die Datenbank beim nächsten Mal als „schon angefasst“.
  const blockade = await findBlockingRows(state);
  if (blockade) {
    await updateState({
      status: "failed",
      source,
      error: blockade,
      finishedAt: new Date(),
    });
    return { status: "failed", detail: [], rowsCopied: 0 };
  }

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
      const result = await copyTable(connection, entry, async copied => {
        rowsCopied += copied;
        await updateState({ rowsCopied });
      });
      detail.push(result);
      await updateState({ tablesDone: detail.length, rowsCopied, detail });
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
 * Startet einen nicht abgeschlossenen Lauf erneut – der Knopf „Erneut
 * versuchen“ auf `/verwaltung/system`.
 *
 * Braucht keine eigene Vorbereitung mehr: `claimable` entscheidet, ob der
 * Zustand übernommen werden darf. Eine abgeschlossene Übernahme bleibt damit
 * auch hier unangetastet.
 */
export function retryLegacyImport(): Promise<LegacyImportResult> {
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
