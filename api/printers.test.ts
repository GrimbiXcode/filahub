import { describe, expect, it } from "vitest";
import {
  MAX_PRINTER_SLOTS,
  findPrinterByName,
  loadedMaterialId,
  loadedSpools,
  normalizePrinterName,
  printerSlotCountSchema,
} from "@contracts/printers";

const mk4 = {
  id: 1,
  name: "Prusa MK4S",
  slotCount: 1,
  slots: [{ slot: 0, materialId: 10 }],
};
const coreOne = {
  id: 2,
  name: "Core One MMU",
  slotCount: 5,
  slots: [
    { slot: 3, materialId: 23 },
    { slot: 0, materialId: 20 },
    // Übrig nach dem Verkleinern – zählt nicht
    { slot: 7, materialId: 27 },
  ],
};

describe("Druckername", () => {
  it("vergleicht ohne Rücksicht auf Groß-/Kleinschreibung und Leerraum", () => {
    expect(normalizePrinterName("  Prusa   MK4S ")).toBe("prusa mk4s");
    expect(findPrinterByName([mk4, coreOne], "prusa mk4s")).toBe(mk4);
    expect(findPrinterByName([mk4, coreOne], "CORE  one mmu")).toBe(coreOne);
  });

  it("findet nichts zu leeren oder unbekannten Namen", () => {
    expect(findPrinterByName([mk4], null)).toBeNull();
    expect(findPrinterByName([mk4], "   ")).toBeNull();
    expect(findPrinterByName([mk4], "MK4")).toBeNull();
  });
});

describe("Geladener Platz", () => {
  it("liefert das Gebinde im Platz des Filaments", () => {
    expect(loadedMaterialId(mk4, 0)).toBe(10);
    expect(loadedMaterialId(coreOne, 3)).toBe(23);
    expect(loadedMaterialId(coreOne, 1)).toBeNull();
  });

  it("schlägt jenseits der Plätze nichts vor", () => {
    expect(loadedMaterialId(mk4, 1)).toBeNull();
    expect(loadedMaterialId(coreOne, 7)).toBeNull();
    expect(loadedMaterialId(null, 0)).toBeNull();
  });

  it("übergeht ein Gebinde, das nicht zur Wahl steht", () => {
    expect(loadedMaterialId(mk4, 0, id => id !== 10)).toBeNull();
  });
});

describe("Reihenfolge der Vorschläge", () => {
  it("nennt den Drucker des Drucks zuerst, sonst nach Name, je nach Platz", () => {
    expect(
      loadedSpools([mk4, coreOne]).map(e => [e.printer.id, e.slot])
    ).toEqual([
      [2, 0],
      [2, 3],
      [1, 0],
    ]);
    expect(
      loadedSpools([mk4, coreOne], mk4).map(e => [e.printer.id, e.slot])
    ).toEqual([
      [1, 0],
      [2, 0],
      [2, 3],
    ]);
  });
});

describe("Plätze je Drucker", () => {
  it("lässt 1 bis MAX_PRINTER_SLOTS zu", () => {
    expect(printerSlotCountSchema.safeParse(1).success).toBe(true);
    expect(printerSlotCountSchema.safeParse(MAX_PRINTER_SLOTS).success).toBe(
      true
    );
    expect(printerSlotCountSchema.safeParse(0).success).toBe(false);
    expect(
      printerSlotCountSchema.safeParse(MAX_PRINTER_SLOTS + 1).success
    ).toBe(false);
  });
});
