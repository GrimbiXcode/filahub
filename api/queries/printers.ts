import {
  and,
  asc,
  count,
  eq,
  gte,
  inArray,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";
import type { PrinterWithSlots } from "@contracts/printers";
import { materials, printerSlots, printers } from "@db/schema";
import { scopeOwner, scopeWhere, type Scope } from "../scope";
import { getDb } from "./connection";

/**
 * Drucker und ihre geladenen Gebinde (seit 4.9.0), Regeln in
 * `contracts/printers.ts`.
 */

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Db = ReturnType<typeof getDb> | Tx;

/** Der Name ist im Bereich schon vergeben – am Index erkannt, wie beim Lager */
export const PRINTER_NAME_TAKEN = "PRINTER_NAME_TAKEN";

const PRINTER_NAME_INDEXES = [
  "printers_user_name_unique",
  "printers_organization_name_unique",
];

function isConstraint(error: unknown, names: readonly string[]): boolean {
  const constraint = (error as { cause?: { constraint?: string } })?.cause
    ?.constraint;
  if (constraint && names.includes(constraint)) return true;
  return (
    error instanceof Error && names.some(name => error.message.includes(name))
  );
}

function rethrowNameTaken(error: unknown): never {
  if (isConstraint(error, PRINTER_NAME_INDEXES))
    throw new Error(PRINTER_NAME_TAKEN, { cause: error });
  throw error;
}

/** Alle Drucker des Bereichs samt geladener Plätze, nach Name */
export async function findPrintersInScope(
  scope: Scope
): Promise<PrinterWithSlots[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: printers.id,
      name: printers.name,
      slotCount: printers.slotCount,
    })
    .from(printers)
    .where(scopeWhere(printers, scope))
    .orderBy(asc(printers.name), asc(printers.id));
  if (rows.length === 0) return [];
  /*
    Nur Plätze mit einem Gebinde **im Bereich**: Die Kaskaden halten das
    ohnehin sauber, aber Fremdschlüssel gibt es keine – eine übrig gebliebene
    `materialId` soll nicht auf ein fremdes Gebinde zeigen können.
  */
  const slots = await db
    .select({
      printerId: printerSlots.printerId,
      slot: printerSlots.slot,
      materialId: printerSlots.materialId,
    })
    .from(printerSlots)
    .innerJoin(materials, eq(materials.id, printerSlots.materialId))
    .where(
      and(
        inArray(
          printerSlots.printerId,
          rows.map(r => r.id)
        ),
        scopeWhere(materials, scope)
      )
    )
    .orderBy(asc(printerSlots.slot));
  return rows.map(row => ({
    ...row,
    slots: slots
      .filter(s => s.printerId === row.id && s.slot < row.slotCount)
      .map(s => ({ slot: s.slot, materialId: s.materialId })),
  }));
}

export async function countPrintersInScope(scope: Scope): Promise<number> {
  const [row] = await getDb()
    .select({ value: count() })
    .from(printers)
    .where(scopeWhere(printers, scope));
  return Number(row?.value ?? 0);
}

export async function createPrinter(
  scope: Scope,
  data: { name: string; slotCount: number }
): Promise<{ id: number }> {
  try {
    const [row] = await getDb()
      .insert(printers)
      .values({ ...data, ...scopeOwner(scope) })
      .returning({ id: printers.id });
    return row;
  } catch (error) {
    rethrowNameTaken(error);
  }
}

/**
 * Ändert Name oder Plätze. Weniger Plätze entladen, was darüber lag – in
 * derselben Transaktion. `false`, wenn es den Drucker im Bereich nicht gibt.
 */
export async function updatePrinter(
  scope: Scope,
  id: number,
  data: { name?: string; slotCount?: number }
): Promise<boolean> {
  try {
    return await getDb().transaction(async tx => {
      const found = await tx
        .select({ id: printers.id })
        .from(printers)
        .where(and(eq(printers.id, id), scopeWhere(printers, scope)))
        .for("update");
      if (found.length === 0) return false;
      const set: { name?: string; slotCount?: number } = {};
      if (data.name !== undefined) set.name = data.name;
      if (data.slotCount !== undefined) set.slotCount = data.slotCount;
      if (Object.keys(set).length > 0)
        await tx
          .update(printers)
          .set(set)
          .where(and(eq(printers.id, id), scopeWhere(printers, scope)));
      if (data.slotCount !== undefined)
        await tx
          .delete(printerSlots)
          .where(
            and(
              eq(printerSlots.printerId, id),
              gte(printerSlots.slot, data.slotCount)
            )
          );
      return true;
    });
  } catch (error) {
    rethrowNameTaken(error);
  }
}

/** Löscht den Drucker samt Plätzen. Drucke nennen ihn weiter beim Namen. */
export async function deletePrinter(scope: Scope, id: number) {
  return getDb().transaction(async tx => {
    const scoped = tx
      .select({ id: printers.id })
      .from(printers)
      .where(and(eq(printers.id, id), scopeWhere(printers, scope)));
    await tx
      .delete(printerSlots)
      .where(inArray(printerSlots.printerId, scoped));
    const deleted = await tx
      .delete(printers)
      .where(and(eq(printers.id, id), scopeWhere(printers, scope)))
      .returning({ id: printers.id });
    return deleted.length > 0;
  });
}

export type LoadSlotResult =
  | "ok"
  | "printer_not_found"
  | "slot_out_of_range"
  | "gebinde_not_found"
  | "gebinde_used_up"
  | "conflict";

/**
 * Lädt ein Gebinde in einen Platz – oder leert ihn (`materialId: null`).
 *
 * Steckt das Gebinde schon anderswo, wandert es: Eine Rolle hängt in genau
 * einem Drucker. Das Gebinde wird mit `FOR SHARE` gehalten wie beim Wiegen,
 * damit kein Platz auf ein im selben Moment gelöschtes Gebinde zeigt
 * (`deleteMaterial` sperrt es mit `FOR UPDATE` und entlädt es).
 */
export async function loadPrinterSlot(
  scope: Scope,
  input: { printerId: number; slot: number; materialId: number | null }
): Promise<LoadSlotResult> {
  try {
    return await getDb().transaction(async tx => {
      const [printer] = await tx
        .select({ id: printers.id, slotCount: printers.slotCount })
        .from(printers)
        .where(
          and(eq(printers.id, input.printerId), scopeWhere(printers, scope))
        )
        .for("update");
      if (!printer) return "printer_not_found";
      if (input.slot >= printer.slotCount) return "slot_out_of_range";

      if (input.materialId == null) {
        await tx
          .delete(printerSlots)
          .where(
            and(
              eq(printerSlots.printerId, printer.id),
              eq(printerSlots.slot, input.slot)
            )
          );
        return "ok";
      }

      const [gebinde] = await tx
        .select({ id: materials.id, archivedAt: materials.archivedAt })
        .from(materials)
        .where(
          and(eq(materials.id, input.materialId), scopeWhere(materials, scope))
        )
        .for("share");
      if (!gebinde) return "gebinde_not_found";
      if (gebinde.archivedAt != null) return "gebinde_used_up";

      // Aus dem bisherigen Platz nehmen – auch aus diesem Drucker
      await tx
        .delete(printerSlots)
        .where(eq(printerSlots.materialId, gebinde.id));
      await tx
        .insert(printerSlots)
        .values({
          printerId: printer.id,
          slot: input.slot,
          materialId: gebinde.id,
        })
        .onConflictDoUpdate({
          target: [printerSlots.printerId, printerSlots.slot],
          set: { materialId: gebinde.id, loadedAt: new Date() },
        });
      return "ok";
    });
  } catch (error) {
    // Zwei Sitzungen laden dieselbe Rolle im selben Moment in zwei Plätze
    if (isConstraint(error, ["printer_slots_material_unique"]))
      return "conflict";
    throw error;
  }
}

/**
 * Entlädt Gebinde – beim Löschen und beim Aufbrauchen. `materialIds` ist eine
 * schon bereichsgeprüfte Liste oder Unterabfrage.
 */
export async function unloadGebinde(
  db: Db,
  materialIds: number[] | SQLWrapper
) {
  if (Array.isArray(materialIds) && materialIds.length === 0) return;
  await db
    .delete(printerSlots)
    .where(inArray(printerSlots.materialId, materialIds));
}

/**
 * Löscht alle Drucker eines Eigentümers samt Plätzen – für die Kaskaden von
 * Konto und Organisation. `owner` ist die Bedingung auf `printers`.
 */
export async function deletePrintersWhere(tx: Tx, owner: SQL) {
  await tx
    .delete(printerSlots)
    .where(
      inArray(
        printerSlots.printerId,
        tx.select({ id: printers.id }).from(printers).where(owner)
      )
    );
  await tx.delete(printers).where(owner);
}
