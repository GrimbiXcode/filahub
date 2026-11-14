import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  type SQL,
} from "drizzle-orm";
import { apiTokens, printImports, printJobFiles, printJobs } from "@db/schema";
import {
  PRINT_IMPORT_RESOLVED_RETENTION_DAYS,
  normalizeImportedFilaments,
  parseStoredFilaments,
  type PrintImportInput,
  type PrintImportItem,
} from "@contracts/printImports";
import { scopeOwner, scopeWhere, type Scope } from "../scope";
import { getDb, type DbTransaction } from "./connection";
import { removeStoredFiles, usedStorageInScope } from "./printFiles";

/**
 * Eingangsfach (seit 4.7.0): eingelieferte Drucke, die noch niemand
 * übernommen hat. Regeln ohne Datenbank in `contracts/printImports.ts`.
 */

/** Höchstens so viele Einträge liefert die Liste – mehr fasst das Fach ohnehin nicht */
const LIST_LIMIT = 500;

/**
 * Trägt einen Eintrag ein. Kennt der Bereich die `externalKey` schon – auch
 * von einem erledigten Eintrag –, bleibt alles, wie es ist, und die
 * bestehende ID kommt zurück: Eine Brücke, die nach einem Netzfehler
 * wiederholt, erzeugt keinen zweiten Eintrag.
 */
export async function insertPrintImport(
  scope: Scope,
  apiTokenId: number,
  input: PrintImportInput
): Promise<{ id: number; duplicate: boolean }> {
  const db = getDb();
  const [row] = await db
    .insert(printImports)
    .values({
      ...scopeOwner(scope),
      source: input.source,
      externalKey: input.externalKey,
      title: input.title,
      printedAt: input.printedAt,
      status: input.status,
      progressPercent: input.progressPercent ?? null,
      durationMinutes: input.durationMinutes ?? null,
      printer: input.printer || null,
      filaments: normalizeImportedFilaments(input.filaments),
      gramsEstimated: input.gramsEstimated,
      apiTokenId,
    })
    .onConflictDoNothing()
    .returning({ id: printImports.id });
  if (row) return { id: row.id, duplicate: false };

  const [existing] = await db
    .select({ id: printImports.id })
    .from(printImports)
    .where(
      and(
        scopeWhere(printImports, scope),
        eq(printImports.externalKey, input.externalKey)
      )
    );
  if (!existing) throw new Error("Eintrag weder angelegt noch gefunden");
  return { id: existing.id, duplicate: true };
}

export async function countOpenImportsInScope(scope: Scope): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(printImports)
    .where(
      and(scopeWhere(printImports, scope), isNull(printImports.resolvedAt))
    );
  return Number(rows.at(0)?.value ?? 0);
}

/** Offene Einträge, neueste zuerst, samt Namen des einliefernden Schlüssels */
export async function listOpenImports(
  scope: Scope
): Promise<PrintImportItem[]> {
  const rows = await getDb()
    .select({ row: printImports, tokenName: apiTokens.name })
    .from(printImports)
    .leftJoin(apiTokens, eq(apiTokens.id, printImports.apiTokenId))
    .where(
      and(scopeWhere(printImports, scope), isNull(printImports.resolvedAt))
    )
    .orderBy(desc(printImports.printedAt), desc(printImports.id))
    .limit(LIST_LIMIT);
  return rows.map(({ row, tokenName }) => toItem(row, tokenName));
}

export async function findOpenImportInScope(
  scope: Scope,
  id: number
): Promise<PrintImportItem | null> {
  const [found] = await getDb()
    .select({ row: printImports, tokenName: apiTokens.name })
    .from(printImports)
    .leftJoin(apiTokens, eq(apiTokens.id, printImports.apiTokenId))
    .where(
      and(
        eq(printImports.id, id),
        scopeWhere(printImports, scope),
        isNull(printImports.resolvedAt)
      )
    );
  return found ? toItem(found.row, found.tokenName) : null;
}

function toItem(
  row: typeof printImports.$inferSelect,
  tokenName: string | null
): PrintImportItem {
  return {
    id: row.id,
    source: row.source,
    title: row.title,
    printedAt: row.printedAt,
    status: row.status,
    progressPercent: row.progressPercent,
    durationMinutes: row.durationMinutes,
    printer: row.printer,
    filaments: parseStoredFilaments(row.filaments),
    gramsEstimated: row.gramsEstimated,
    tokenName,
    preview: row.previewKey
      ? { width: row.previewWidth, height: row.previewHeight }
      : null,
    createdAt: row.createdAt,
  };
}

/** Die Spalten einer Vorschau, geleert – nach Übernehmen und Verwerfen */
const NO_PREVIEW = {
  previewKey: null,
  previewMimeType: null,
  previewBytes: 0,
  previewSha256: null,
  previewWidth: null,
  previewHeight: null,
} as const;

/**
 * Verwirft offene Einträge; gibt zurück, wie viele es waren. Ihre Vorschauen
 * gehen mit – die Zeile in der Transaktion, die Datei nach dem Commit.
 */
export async function dismissImports(
  scope: Scope,
  ids: number[]
): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await getDb().transaction(async tx => {
    const where = and(
      inArray(printImports.id, ids),
      scopeWhere(printImports, scope),
      isNull(printImports.resolvedAt)
    );
    // Gesperrt: Eine Vorschau, die gerade eintrifft, wartet und findet dann
    // einen erledigten Eintrag vor
    const found = await tx
      .select({ id: printImports.id, previewKey: printImports.previewKey })
      .from(printImports)
      .where(where)
      .for("update");
    if (found.length === 0) return [];
    await tx
      .update(printImports)
      .set({ resolvedAt: new Date(), ...NO_PREVIEW })
      .where(
        inArray(
          printImports.id,
          found.map(row => row.id)
        )
      );
    return found;
  });
  await removeStoredFiles(previewKeysOf(rows));
  return rows.length;
}

function previewKeysOf(rows: { previewKey: string | null }[]): string[] {
  return rows.flatMap(row => (row.previewKey ? [row.previewKey] : []));
}

/**
 * Speicherschlüssel der Vorschauen, die mit den Einträgen unter `where`
 * gehen – für die Kaskaden von Konto und Organisation, vor dem `DELETE`. Die
 * Dateien entfernt der Aufrufer nach dem Commit (`removeStoredFiles`).
 */
export async function previewKeysWhere(
  tx: DbTransaction,
  where: SQL | undefined
): Promise<string[]> {
  const rows = await tx
    .select({ previewKey: printImports.previewKey })
    .from(printImports)
    .where(and(where, isNotNull(printImports.previewKey)));
  return previewKeysOf(rows);
}

/** Eine Vorschau, die schon in der Ablage liegt und eingetragen werden soll */
export type NewImportPreview = {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  width: number;
  height: number;
};

/**
 * Trägt die Vorschau eines offenen Eintrags ein, unter Sperre des Eintrags –
 * dieselbe, die Übernehmen und Verwerfen halten. Ergebnis:
 *
 * - `"saved"` – eingetragen.
 * - `"exists"` – der Eintrag hat schon eine (Wiederholung der Brücke).
 * - `"gone"` – nicht im Bereich, schon erledigt oder es gibt ihn nicht.
 *
 * `recheck` prüft das Kontingent mit dem Stand dieser Transaktion und wirft,
 * wenn es überschritten ist. In den Fällen außer `"saved"` entfernt der
 * Aufrufer die schon geschriebene Datei.
 */
export async function attachImportPreview(
  scope: Scope,
  importId: number,
  preview: NewImportPreview,
  recheck?: (usedBytes: number) => void
): Promise<"saved" | "exists" | "gone"> {
  return getDb().transaction(async tx => {
    const [row] = await tx
      .select({ previewKey: printImports.previewKey })
      .from(printImports)
      .where(
        and(
          eq(printImports.id, importId),
          scopeWhere(printImports, scope),
          isNull(printImports.resolvedAt)
        )
      )
      .for("update");
    if (!row) return "gone";
    if (row.previewKey) return "exists";
    recheck?.(await usedStorageInScope(scope, tx));
    await tx
      .update(printImports)
      .set({
        previewKey: preview.storageKey,
        previewMimeType: preview.mimeType,
        previewBytes: preview.sizeBytes,
        previewSha256: preview.sha256,
        previewWidth: preview.width,
        previewHeight: preview.height,
      })
      .where(eq(printImports.id, importId));
    return "saved";
  });
}

/** Ob ein offener Eintrag im Bereich liegt und ob er schon eine Vorschau hat */
export async function findOpenImportPreviewState(
  scope: Scope,
  importId: number
): Promise<{ hasPreview: boolean } | null> {
  const [row] = await getDb()
    .select({ previewKey: printImports.previewKey })
    .from(printImports)
    .where(
      and(
        eq(printImports.id, importId),
        scopeWhere(printImports, scope),
        isNull(printImports.resolvedAt)
      )
    );
  return row ? { hasPreview: row.previewKey != null } : null;
}

/**
 * Die Vorschau eines offenen Eintrags samt Eigentümer – für die Auslieferung.
 * Den Bereich prüft der Aufrufer (`resolveScope`), wie bei
 * `findPrintFileWithOwner`.
 */
export async function findImportPreviewWithOwner(importId: number) {
  const [row] = await getDb()
    .select({
      userId: printImports.userId,
      organizationId: printImports.organizationId,
      previewKey: printImports.previewKey,
      previewMimeType: printImports.previewMimeType,
      previewSha256: printImports.previewSha256,
    })
    .from(printImports)
    .where(
      and(
        eq(printImports.id, importId),
        isNull(printImports.resolvedAt),
        isNotNull(printImports.previewKey)
      )
    );
  if (!row?.previewKey || !row.previewMimeType || !row.previewSha256)
    return null;
  return {
    userId: row.userId,
    organizationId: row.organizationId,
    storageKey: row.previewKey,
    mimeType: row.previewMimeType,
    sha256: row.previewSha256,
  };
}

/** Wird geworfen, wenn ein Eintrag beim Übernehmen nicht mehr offen ist */
export class ImportGoneError extends Error {
  constructor() {
    super("Dieser Eintrag ist schon übernommen oder verworfen.");
    this.name = "ImportGoneError";
  }
}

/**
 * Die beiden Haken für `createPrintJob`: vorher den Eintrag sperren (zwei
 * Klicks erzeugen sonst zwei Drucke), danach als übernommen markieren – alles
 * in der Transaktion des Drucks.
 */
export function claimImportHooks(scope: Scope, importId: number) {
  return {
    before: async (tx: DbTransaction) => {
      const [row] = await tx
        .select({ id: printImports.id })
        .from(printImports)
        .where(
          and(
            eq(printImports.id, importId),
            scopeWhere(printImports, scope),
            isNull(printImports.resolvedAt)
          )
        )
        .for("update");
      if (!row) throw new ImportGoneError();
    },
    /*
      Die Vorschau wird zum ersten Foto und Titelbild des neuen Drucks. Die
      Datei bleibt, wo sie ist – die Dateizeile übernimmt ihren Schlüssel, der
      Eintrag gibt ihn ab. Ohne eigene Vorschaudatei: Die Auslieferung nimmt
      dann das Bild selbst, und das ist ohnehin klein.
    */
    after: async (tx: DbTransaction, printJobId: number) => {
      const [row] = await tx
        .select()
        .from(printImports)
        .where(eq(printImports.id, importId));
      if (
        row?.previewKey &&
        row.previewMimeType &&
        row.previewSha256 &&
        row.previewBytes > 0
      ) {
        const [file] = await tx
          .insert(printJobFiles)
          .values({
            printJobId,
            kind: "image",
            originalName: previewFileName(row.previewMimeType),
            mimeType: row.previewMimeType,
            sizeBytes: row.previewBytes,
            sha256: row.previewSha256,
            storageKey: row.previewKey,
            thumbnailKey: null,
            thumbnailBytes: 0,
            width: row.previewWidth,
            height: row.previewHeight,
          })
          .returning({ id: printJobFiles.id });
        await tx
          .update(printJobs)
          .set({ coverFileId: file.id })
          .where(eq(printJobs.id, printJobId));
      }
      await tx
        .update(printImports)
        .set({ printJobId, resolvedAt: new Date(), ...NO_PREVIEW })
        .where(eq(printImports.id, importId));
    },
  };
}

/** Der Dateiname, unter dem eine übernommene Vorschau beim Druck steht */
function previewFileName(mimeType: string): string {
  const extension =
    mimeType === "image/jpeg"
      ? "jpg"
      : mimeType === "image/webp"
        ? "webp"
        : "png";
  return `vorschau.${extension}`;
}

/**
 * Aufbewahrungslauf: erledigte Einträge nach 30 Tagen. Ihre Vorschau ist beim
 * Erledigen schon gegangen; was trotzdem noch daran hängt, geht mit.
 */
export async function purgeResolvedImports(): Promise<number> {
  const cutoff = new Date(
    Date.now() - PRINT_IMPORT_RESOLVED_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  const rows = await getDb()
    .delete(printImports)
    .where(lt(printImports.resolvedAt, cutoff))
    .returning({ id: printImports.id, previewKey: printImports.previewKey });
  await removeStoredFiles(previewKeysOf(rows));
  return rows.length;
}
