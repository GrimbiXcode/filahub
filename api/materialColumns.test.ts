import { describe, expect, it } from "vitest";
import {
  LOCKED_MATERIAL_COLUMNS,
  MATERIAL_COLUMNS,
  TOGGLEABLE_MATERIAL_COLUMNS,
  hiddenMaterialColumnsSchema,
  normalizeHiddenColumns,
} from "@contracts/materialColumns";

/**
 * Die Spaltenauswahl kommt aus der Datenbank und damit aus einer Zeile, die
 * eine andere Fassung der App geschrieben haben kann. `normalizeHiddenColumns`
 * ist die einzige Stelle, an der dieser Stand mit der Wirklichkeit abgeglichen
 * wird – rutscht dort etwas durch, fehlt in der Übersicht eine Spalte, und
 * niemand käme darauf, warum.
 */

describe("normalizeHiddenColumns", () => {
  it("behält bekannte, abschaltbare Spalten", () => {
    expect(normalizeHiddenColumns(["price", "manufacturer"])).toEqual([
      "manufacturer",
      "price",
    ]);
  });

  it("liefert die Reihenfolge der Tabelle, nicht die des Speicherstands", () => {
    expect(normalizeHiddenColumns(["purchase", "identifier", "price"])).toEqual(
      ["identifier", "price", "purchase"]
    );
  });

  it("wirft unbekannte Kennungen weg", () => {
    // So sähe es aus, wenn eine neuere Fassung eine Spalte kennt, die es hier
    // (noch) nicht gibt – oder eine alte eine inzwischen entfernte.
    expect(normalizeHiddenColumns(["price", "gewicht", "texture"])).toEqual([
      "price",
    ]);
  });

  it("wirft gesperrte Spalten weg", () => {
    expect(normalizeHiddenColumns(["name", "actions", "price"])).toEqual([
      "price",
    ]);
  });

  it("entfernt Dubletten", () => {
    expect(normalizeHiddenColumns(["price", "price", "price"])).toEqual([
      "price",
    ]);
  });

  it("behandelt „nichts gespeichert“ wie „nichts ausgeblendet“", () => {
    expect(normalizeHiddenColumns(null)).toEqual([]);
    expect(normalizeHiddenColumns(undefined)).toEqual([]);
    expect(normalizeHiddenColumns([])).toEqual([]);
  });

  it("gibt bei allem, was keine Liste ist, nichts zurück", () => {
    expect(normalizeHiddenColumns("price")).toEqual([]);
    expect(normalizeHiddenColumns(42)).toEqual([]);
    expect(normalizeHiddenColumns({ price: true })).toEqual([]);
  });

  it("lässt zu, dass alle abschaltbaren Spalten ausgeblendet sind", () => {
    expect(normalizeHiddenColumns([...TOGGLEABLE_MATERIAL_COLUMNS])).toEqual([
      ...TOGGLEABLE_MATERIAL_COLUMNS,
    ]);
  });
});

describe("Spaltenlisten", () => {
  it("teilt die Spalten überschneidungsfrei in gesperrt und abschaltbar", () => {
    expect([
      ...TOGGLEABLE_MATERIAL_COLUMNS,
      ...LOCKED_MATERIAL_COLUMNS,
    ]).toHaveLength(MATERIAL_COLUMNS.length);
    for (const locked of LOCKED_MATERIAL_COLUMNS) {
      expect(TOGGLEABLE_MATERIAL_COLUMNS).not.toContain(locked);
    }
  });

  /*
    Der Riegel dagegen, dass eine später ergänzte Spalte still unabschaltbar
    bleibt: Wer `MATERIAL_COLUMNS` erweitert, muss sich entscheiden, und diese
    Zusicherung erinnert daran.
  */
  it("führt jede Spalte in genau einer der beiden Listen", () => {
    const locked: readonly string[] = LOCKED_MATERIAL_COLUMNS;
    const toggleable: readonly string[] = TOGGLEABLE_MATERIAL_COLUMNS;
    for (const column of MATERIAL_COLUMNS) {
      expect(locked.includes(column) !== toggleable.includes(column)).toBe(
        true
      );
    }
  });
});

describe("hiddenMaterialColumnsSchema", () => {
  it("nimmt eine Liste bekannter Kennungen und `null` an", () => {
    expect(hiddenMaterialColumnsSchema.parse(["price"])).toEqual(["price"]);
    expect(hiddenMaterialColumnsSchema.parse([])).toEqual([]);
    expect(hiddenMaterialColumnsSchema.parse(null)).toBeNull();
  });

  it("lehnt unbekannte Kennungen ab", () => {
    // Beim Schreiben wird streng geprüft: Wer Unsinn schickt, soll das erfahren.
    // Tolerant ist nur das Lesen (`normalizeHiddenColumns`).
    expect(() => hiddenMaterialColumnsSchema.parse(["gewicht"])).toThrow();
    expect(() => hiddenMaterialColumnsSchema.parse("price")).toThrow();
  });
});
