import { describe, expect, it } from "vitest";
import {
  PRINT_SETTING_FIELDS,
  hasPrintSettings,
  parseStoredPrintSettings,
  printSettingsSchema,
} from "@contracts/printSettings";

/** Druckeinstellungen je Material (seit 4.1.0). */
describe("printSettingsSchema", () => {
  it("nimmt je Materialart ihre Felder", () => {
    expect(
      printSettingsSchema.parse({
        kind: "filament",
        nozzleMinC: 205,
        nozzleMaxC: 225,
        bedMinC: 55,
        dryingC: 50,
        dryingMinutes: 480,
        enclosureRequired: false,
      })
    ).toMatchObject({ kind: "filament", nozzleMaxC: 225 });
    expect(
      printSettingsSchema.parse({ kind: "resin", exposureMs: 2500 })
    ).toMatchObject({ kind: "resin" });
    expect(
      printSettingsSchema.parse({ kind: "powder", refreshPercent: 30 })
    ).toMatchObject({ kind: "powder" });
  });

  it("lehnt Nachkommastellen und unplausible Werte ab", () => {
    expect(() =>
      printSettingsSchema.parse({ kind: "filament", nozzleMinC: 210.5 })
    ).toThrow();
    expect(() =>
      printSettingsSchema.parse({ kind: "filament", nozzleMaxC: 900 })
    ).toThrow();
    expect(() =>
      printSettingsSchema.parse({ kind: "resin", layerHeightUm: 5 })
    ).toThrow();
  });

  it("verlangt „bis“ nicht unter „von“", () => {
    expect(() =>
      printSettingsSchema.parse({
        kind: "filament",
        nozzleMinC: 230,
        nozzleMaxC: 210,
      })
    ).toThrow(/Düsentemperatur/);
    expect(() =>
      printSettingsSchema.parse({ kind: "filament", bedMinC: 80, bedMaxC: 60 })
    ).toThrow(/Betttemperatur/);
  });

  it("verwirft Felder einer anderen Art", () => {
    const parsed = printSettingsSchema.parse({
      kind: "resin",
      exposureMs: 2000,
      nozzleMinC: 210,
    });
    expect(parsed).not.toHaveProperty("nozzleMinC");
  });

  it("führt jedes Feld des Schemas in der Anzeigeliste", () => {
    const shapes = {
      filament: printSettingsSchema.options[0],
      resin: printSettingsSchema.options[1],
      powder: printSettingsSchema.options[2],
    };
    for (const [kind, schema] of Object.entries(shapes)) {
      // `innerType` bei refine-umhüllten Schemas, sonst das Schema selbst
      const inner =
        "shape" in schema
          ? schema
          : (schema as unknown as { _def: { schema: typeof schema } })._def
              .schema;
      const keys = Object.keys((inner as { shape: object }).shape).filter(
        k => k !== "kind" && k !== "enclosureRequired"
      );
      expect(
        [...PRINT_SETTING_FIELDS[kind as keyof typeof shapes]].sort()
      ).toEqual(keys.sort());
    }
  });
});

describe("hasPrintSettings", () => {
  it("ist leer ohne Werte und ohne Notizen", () => {
    expect(hasPrintSettings(null)).toBe(false);
    expect(hasPrintSettings({ kind: "filament" })).toBe(false);
    expect(
      hasPrintSettings({ kind: "filament", enclosureRequired: false })
    ).toBe(false);
    expect(hasPrintSettings({ kind: "filament" }, "  ")).toBe(false);
  });

  it("zählt Werte, den Bauraum-Haken und Notizen", () => {
    expect(hasPrintSettings({ kind: "filament", fanPercent: 0 })).toBe(true);
    expect(
      hasPrintSettings({ kind: "filament", enclosureRequired: true })
    ).toBe(true);
    expect(hasPrintSettings(null, "langsam drucken")).toBe(true);
  });
});

describe("parseStoredPrintSettings", () => {
  it("macht aus Unlesbarem null statt eines Fehlers", () => {
    expect(parseStoredPrintSettings({ kind: "unbekannt" })).toBeNull();
    expect(parseStoredPrintSettings("kaputt")).toBeNull();
    expect(parseStoredPrintSettings({ kind: "powder" })).toEqual({
      kind: "powder",
    });
  });
});
