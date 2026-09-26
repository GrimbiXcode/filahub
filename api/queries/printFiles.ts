import { and, desc, eq, inArray, or, sql, type SQLWrapper } from "drizzle-orm";
import { printJobFiles, printJobs } from "@db/schema";
import type { PrintFileKind } from "@contracts/printFiles";
import { getFileStorage } from "../lib/fileStorage";
import { scopeWhere, type Scope } from "../scope";
import { getDb } from "./connection";

/**
 * Dateien zu Drucken (seit 4.3.0) – Metadaten in `print_job_files`, die Bytes
 * in der Ablage (`api/lib/fileStorage.ts`).
 *
 * **Reihenfolge beim Schreiben:** erst die Datei, dann die Zeile. Scheitert
 * die Zeile, wird die Datei sofort wieder entfernt. **Beim Löschen umgekehrt:**
 * erst die Zeile (in der Transaktion), nach dem Commit die Datei. Bricht
 * dazwischen etwas ab, bleibt eine Datei ohne Zeile zurück – die findet der
 * Aufräumlauf (`sweepOrphanFiles`). Eine Zeile ohne Datei entsteht so nie.
 */

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Executor = Pick<ReturnType<typeof getDb>, "select" | "delete">;

export const PRINT_FILE_NOT_FOUND = "PRINT_FILE_NOT_FOUND";

/** Was die Oberfläche von einer Datei braucht – ohne Speicherschlüssel */
export type PrintFileView = {
  id: number;
  printJobId: number;
  kind: PrintFileKind;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  hasThumbnail: boolean;
  createdAt: Date;
};

function toView(row: typeof printJobFiles.$inferSelect): PrintFileView {
  return {
    id: row.id,
    printJobId: row.printJobId,
    kind: row.kind,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    hasThumbnail: row.thumbnailKey != null,
    createdAt: row.createdAt,
  };
}

/** Die Dateien eines Drucks, älteste zuerst */
export async function listPrintFiles(
  printJobId: number
): Promise<PrintFileView[]> {
  const rows = await getDb()
    .select()
    .from(printJobFiles)
    .where(eq(printJobFiles.printJobId, printJobId))
    .orderBy(printJobFiles.createdAt, printJobFiles.id);
  return rows.map(toView);
}

export async function countFilesOfPrintJob(printJobId: number) {
  const [row] = await getDb()
    .select({ value: sql<number>`count(*)::int` })
    .from(printJobFiles)
    .where(eq(printJobFiles.printJobId, printJobId));
  return row?.value ?? 0;
}

/** Belegter Speicher eines Bereichs in Bytes – Grundlage des Kontingents */
export async function usedStorageInScope(scope: Scope): Promise<number> {
  const [row] = await getDb()
    .select({
      value: sql<string>`coalesce(sum(${printJobFiles.sizeBytes} + ${printJobFiles.thumbnailBytes}), 0)`,
    })
    .from(printJobFiles)
    .innerJoin(printJobs, eq(printJobs.id, printJobFiles.printJobId))
    .where(scopeWhere(printJobs, scope));
  return Number(row?.value ?? 0);
}

/** Belegter Speicher der ganzen Instanz – für `/verwaltung/system` */
export async function usedStorageTotal(): Promise<number> {
  const [row] = await getDb()
    .select({
      value: sql<string>`coalesce(sum(${printJobFiles.sizeBytes} + ${printJobFiles.thumbnailBytes}), 0)`,
    })
    .from(printJobFiles);
  return Number(row?.value ?? 0);
}

export type NewPrintFile = {
  kind: PrintFileKind;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  thumbnailKey: string | null;
  thumbnailBytes: number;
  width: number | null;
  height: number | null;
};

/**
 * Trägt eine schon gespeicherte Datei ein. Unter Sperre des Drucks – er
 * könnte sonst im selben Moment gelöscht werden, und die Zeile hinge an einer
 * ID, die es nicht mehr gibt. Das erste Foto eines Drucks ohne Titelbild wird
 * Titelbild. `null`, wenn der Druck nicht (mehr) im Bereich liegt.
 */
export async function insertPrintFile(
  scope: Scope,
  printJobId: number,
  data: NewPrintFile
): Promise<PrintFileView | null> {
  return getDb().transaction(async tx => {
    const [job] = await tx
      .select({ id: printJobs.id, coverFileId: printJobs.coverFileId })
      .from(printJobs)
      .where(and(eq(printJobs.id, printJobId), scopeWhere(printJobs, scope)))
      .for("update");
    if (!job) return null;
    const [row] = await tx
      .insert(printJobFiles)
      .values({ printJobId, ...data })
      .returning();
    if (data.kind === "image" && job.coverFileId == null) {
      await tx
        .update(printJobs)
        .set({ coverFileId: row.id })
        .where(eq(printJobs.id, printJobId));
    }
    return toView(row);
  });
}

/**
 * Eine Datei samt Eigentümer des Drucks – für die Auslieferung. Der Aufrufer
 * prüft den Bereich (`resolveScope`) selbst; hier gibt es noch keinen, weil
 * die Adresse nur die Datei-ID nennt.
 */
export async function findPrintFileWithOwner(id: number) {
  const [row] = await getDb()
    .select({
      file: printJobFiles,
      userId: printJobs.userId,
      organizationId: printJobs.organizationId,
    })
    .from(printJobFiles)
    .innerJoin(printJobs, eq(printJobs.id, printJobFiles.printJobId))
    .where(eq(printJobFiles.id, id));
  return row ?? null;
}

/** Die Zeile einer Datei im Bereich – für Rechteprüfungen */
export async function findPrintFileInScope(scope: Scope, id: number) {
  const [row] = await getDb()
    .select({ file: printJobFiles })
    .from(printJobFiles)
    .innerJoin(printJobs, eq(printJobs.id, printJobFiles.printJobId))
    .where(and(eq(printJobFiles.id, id), scopeWhere(printJobs, scope)));
  return row?.file ?? null;
}

/** Die zuletzt hochgeladene Datei eines Drucks – für die Korrekturregel */
export async function findLatestFileIdOfJob(printJobId: number) {
  const [row] = await getDb()
    .select({ id: printJobFiles.id })
    .from(printJobFiles)
    .where(eq(printJobFiles.printJobId, printJobId))
    .orderBy(desc(printJobFiles.id))
    .limit(1);
  return row?.id ?? null;
}

/** Speicherschlüssel einer Menge von Dateizeilen */
function keysOf(
  rows: { storageKey: string; thumbnailKey: string | null }[]
): string[] {
  return rows.flatMap(r =>
    r.thumbnailKey ? [r.storageKey, r.thumbnailKey] : [r.storageKey]
  );
}

/**
 * Löscht die Dateizeilen der genannten Drucke und liefert ihre
 * Speicherschlüssel. Die Dateien selbst entfernt der Aufrufer **nach** dem
 * Commit (`removeStoredFiles`) – für Druck, Konto und Organisation.
 */
export async function deleteFileRowsOfJobs(
  tx: Executor,
  printJobIds: SQLWrapper | readonly number[]
): Promise<string[]> {
  if (Array.isArray(printJobIds) && printJobIds.length === 0) return [];
  const where = inArray(printJobFiles.printJobId, printJobIds);
  const rows = await tx
    .select({
      storageKey: printJobFiles.storageKey,
      thumbnailKey: printJobFiles.thumbnailKey,
    })
    .from(printJobFiles)
    .where(where);
  if (rows.length > 0) await tx.delete(printJobFiles).where(where);
  return keysOf(rows);
}

/**
 * Entfernt Dateien aus der Ablage – nach dem Commit, deshalb ohne Fehler nach
 * außen: Was hier scheitert, räumt `sweepOrphanFiles` später ab.
 */
export async function removeStoredFiles(keys: readonly string[]) {
  const storage = getFileStorage();
  for (const key of keys) {
    try {
      await storage.delete(key);
    } catch (error) {
      console.error(`Datei ${key} ließ sich nicht löschen`, error);
    }
  }
}

/**
 * Löscht eine Datei. War sie das Titelbild, wird das nächste Foto des Drucks
 * Titelbild (oder keines). `false`, wenn es die Datei im Bereich nicht gibt.
 */
export async function deletePrintFile(
  scope: Scope,
  id: number
): Promise<boolean> {
  const keys = await getDb().transaction(async tx => {
    const [row] = await tx
      .select({ file: printJobFiles, coverFileId: printJobs.coverFileId })
      .from(printJobFiles)
      .innerJoin(printJobs, eq(printJobs.id, printJobFiles.printJobId))
      .where(and(eq(printJobFiles.id, id), scopeWhere(printJobs, scope)))
      .for("update");
    if (!row) return null;
    await tx.delete(printJobFiles).where(eq(printJobFiles.id, id));
    if (row.coverFileId === id) await pickNewCover(tx, row.file.printJobId);
    return keysOf([row.file]);
  });
  if (!keys) return false;
  await removeStoredFiles(keys);
  return true;
}

async function pickNewCover(tx: Tx, printJobId: number) {
  const [next] = await tx
    .select({ id: printJobFiles.id })
    .from(printJobFiles)
    .where(
      and(
        eq(printJobFiles.printJobId, printJobId),
        eq(printJobFiles.kind, "image")
      )
    )
    .orderBy(printJobFiles.createdAt, printJobFiles.id)
    .limit(1);
  await tx
    .update(printJobs)
    .set({ coverFileId: next?.id ?? null })
    .where(eq(printJobs.id, printJobId));
}

/**
 * Setzt das Titelbild. Nur ein Foto **desselben** Drucks – sonst zeigte die
 * Liste ein Bild aus einem fremden Druck, womöglich eines fremden Bereichs.
 */
export async function setPrintJobCover(
  scope: Scope,
  printJobId: number,
  fileId: number
): Promise<boolean> {
  const [file] = await getDb()
    .select({ id: printJobFiles.id })
    .from(printJobFiles)
    .innerJoin(printJobs, eq(printJobs.id, printJobFiles.printJobId))
    .where(
      and(
        eq(printJobFiles.id, fileId),
        eq(printJobFiles.printJobId, printJobId),
        eq(printJobFiles.kind, "image"),
        scopeWhere(printJobs, scope)
      )
    );
  if (!file) return false;
  await getDb()
    .update(printJobs)
    .set({ coverFileId: fileId })
    .where(eq(printJobs.id, printJobId));
  return true;
}

/**
 * Aufräumlauf: Dateien in der Ablage, zu denen keine Zeile gehört, und halb
 * geschriebene Reste. Nur, was älter als eine Stunde ist – eine Datei, deren
 * Zeile gerade in einer offenen Transaktion entsteht, darf nicht verschwinden.
 */
export async function sweepOrphanFiles(now = new Date()) {
  const storage = getFileStorage();
  const before = new Date(now.getTime() - 60 * 60 * 1000);
  const stored = await storage.list();
  const candidates = stored.filter(entry => entry.modifiedAt < before);
  let removed = 0;
  // In Portionen – `IN (…)` mit Zehntausenden Werten wäre eine Zumutung
  for (let i = 0; i < candidates.length; i += 500) {
    const chunk = candidates.slice(i, i + 500).map(c => c.key);
    const known = await getDb()
      .select({
        storageKey: printJobFiles.storageKey,
        thumbnailKey: printJobFiles.thumbnailKey,
      })
      .from(printJobFiles)
      .where(
        or(
          inArray(printJobFiles.storageKey, chunk),
          inArray(printJobFiles.thumbnailKey, chunk)
        )
      );
    const referenced = new Set(keysOf(known));
    for (const key of chunk) {
      if (referenced.has(key)) continue;
      await storage.delete(key);
      removed++;
    }
  }
  removed += await storage.removeStaleTemp(before);
  return removed;
}
