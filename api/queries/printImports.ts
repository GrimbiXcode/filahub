import { and, count, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { apiTokens, printImports } from "@db/schema";
import {
  PRINT_IMPORT_RESOLVED_RETENTION_DAYS,
  normalizeImportedFilaments,
  parseStoredFilaments,
  type PrintImportInput,
  type PrintImportItem,
} from "@contracts/printImports";
import { scopeOwner, scopeWhere, type Scope } from "../scope";
import { getDb, type DbTransaction } from "./connection";

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
    createdAt: row.createdAt,
  };
}

/** Verwirft offene Einträge; gibt zurück, wie viele es waren */
export async function dismissImports(
  scope: Scope,
  ids: number[]
): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await getDb()
    .update(printImports)
    .set({ resolvedAt: new Date() })
    .where(
      and(
        inArray(printImports.id, ids),
        scopeWhere(printImports, scope),
        isNull(printImports.resolvedAt)
      )
    )
    .returning({ id: printImports.id });
  return rows.length;
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
    after: async (tx: DbTransaction, printJobId: number) => {
      await tx
        .update(printImports)
        .set({ printJobId, resolvedAt: new Date() })
        .where(eq(printImports.id, importId));
    },
  };
}

/** Aufbewahrungslauf: erledigte Einträge nach 30 Tagen */
export async function purgeResolvedImports(): Promise<number> {
  const cutoff = new Date(
    Date.now() - PRINT_IMPORT_RESOLVED_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  const rows = await getDb()
    .delete(printImports)
    .where(lt(printImports.resolvedAt, cutoff))
    .returning({ id: printImports.id });
  return rows.length;
}
