import { z } from "zod";

/**
 * Drucker und ihre geladenen Gebinde (seit 4.9.0).
 *
 * Ein Drucker ist ein Name und eine Zahl von Plätzen (Slots): einer für einen
 * Drucker mit einer Rolle, fünf für eine MMU3, bis zu 16 für mehrere
 * Wechsler. Je Platz kann ein Gebinde „geladen“ sein. Daraus schlägt die App
 * beim Abbuchen vor, **welche** Rolle gemeint ist: Filament 2 aus dem G-Code
 * ist die Rolle in Platz 2 – nicht die mit der ähnlichsten Farbe.
 *
 * Plätze zählen intern ab 0, wie die Slots im G-Code
 * (`SlicerFilament.slot`); die Oberfläche zeigt ab 1.
 *
 * Der Drucker hängt am Druck nur über den Namen (`print_jobs.printer` ist
 * Freitext, die Einlieferungen von Slicer und Brücke ebenso). Zugeordnet wird
 * über die Vergleichsform `normalizePrinterName` – an genau einer Stelle,
 * `findPrinterByName`.
 */

/** Plätze je Drucker – so viele Materialzeilen kennt auch ein Druck */
export const MAX_PRINTER_SLOTS = 16;

/** Drucker je Bereich. Mehr steht in keiner Werkstatt, die filahub nutzt. */
export const MAX_PRINTERS_PER_SCOPE = 50;

export const printerNameSchema = z
  .string()
  .trim()
  .min(1, "Name ist erforderlich")
  .max(100, "Höchstens 100 Zeichen");

export const printerSlotCountSchema = z
  .number()
  .int()
  .min(1, "Mindestens ein Platz")
  .max(MAX_PRINTER_SLOTS, `Höchstens ${MAX_PRINTER_SLOTS} Plätze`);

export const printerSlotSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_PRINTER_SLOTS - 1);

/** Ein geladener Platz, wie ihn die Oberfläche bekommt */
export type PrinterSlotLoad = { slot: number; materialId: number };

/** Ein Drucker samt geladener Plätze */
export type PrinterWithSlots = {
  id: number;
  name: string;
  slotCount: number;
  slots: PrinterSlotLoad[];
};

/**
 * Vergleichsform eines Druckernamens: Leerraum bereinigt, klein. „Prusa
 * MK4S“ und „prusa  mk4s “ sind derselbe Drucker – derselbe Gedanke wie bei
 * der Materialart (`normalizeMaterialType`).
 */
export function normalizePrinterName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
}

/** Der Drucker zu einem Namen aus Druck, Slicer oder Brücke – oder keiner */
export function findPrinterByName<T extends { name: string }>(
  printers: readonly T[],
  name: string | null | undefined
): T | null {
  if (!name) return null;
  const key = normalizePrinterName(name);
  if (!key) return null;
  return printers.find(p => normalizePrinterName(p.name) === key) ?? null;
}

/**
 * Das Gebinde in einem Platz – nur, wenn der Platz zum Drucker gehört und das
 * Gebinde zur Wahl steht (`isAvailable`: im Bereich und nicht aufgebraucht).
 * Ein Platz jenseits von `slotCount` (der Drucker wurde verkleinert, der
 * G-Code kennt mehr Filamente) hat keinen Vorschlag.
 */
export function loadedMaterialId(
  printer: Pick<PrinterWithSlots, "slotCount" | "slots"> | null,
  slot: number,
  isAvailable: (materialId: number) => boolean = () => true
): number | null {
  if (!printer || slot < 0 || slot >= printer.slotCount) return null;
  const load = printer.slots.find(s => s.slot === slot);
  return load && isAvailable(load.materialId) ? load.materialId : null;
}

/**
 * Alle geladenen Gebinde, der genannte Drucker zuerst, sonst nach Name und
 * Platz – die Reihenfolge der Vorschläge in Druckformular und Schnellsuche.
 */
export function loadedSpools<T extends PrinterWithSlots>(
  printers: readonly T[],
  preferred: T | null = null
): { printer: T; slot: number; materialId: number }[] {
  const ordered = [...printers].sort((a, b) => {
    if (preferred) {
      if (a.id === preferred.id) return -1;
      if (b.id === preferred.id) return 1;
    }
    return a.name.localeCompare(b.name, "de");
  });
  return ordered.flatMap(printer =>
    [...printer.slots]
      .filter(s => s.slot < printer.slotCount)
      .sort((a, b) => a.slot - b.slot)
      .map(s => ({ printer, slot: s.slot, materialId: s.materialId }))
  );
}
