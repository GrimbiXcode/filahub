import { describe, expect, it } from "vitest";
import {
  computeMaterialStats,
  type MaterialWithRelations,
} from "./queries/filament";

function material(
  overrides: Partial<MaterialWithRelations> = {}
): MaterialWithRelations {
  return {
    id: 1,
    userId: 1,
    name: "Testfilament",
    identifier: null,
    materialType: "PLA",
    manufacturer: null,
    color: null,
    priceCents: null,
    purchaseDate: null,
    nominalWeight: 1000,
    spoolTypeId: null,
    spoolPresetVariantId: null,
    storageBoxId: null,
    notes: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    spoolType: null,
    storageBox: null,
    spoolPresetVariant: null,
    ...overrides,
  } as MaterialWithRelations;
}

const ownSpool = {
  id: 7,
  userId: 1,
  name: "Kunststoffspule 1 kg",
  manufacturer: "eSun",
  tareWeight: 220,
  sourceVariantId: null,
  notes: null,
  createdAt: new Date("2026-01-01"),
};

const presetVariant = {
  id: 42,
  versionId: 5,
  nominalWeight: 1000,
  tareWeight: 130,
  outerDiameterMm: 200,
  widthMm: 68,
  boreDiameterMm: 55,
  displayName: "Polymaker · PolyTerra PLA · Kartonspule (ab 2023) · 1 kg",
  source: "seed" as const,
  seedRevision: 1,
  active: true,
  notes: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const box = {
  id: 3,
  userId: 1,
  name: "Drybox A",
  location: null,
  tareWeight: 500,
  notes: null,
  createdAt: new Date("2026-01-01"),
};

describe("computeMaterialStats", () => {
  it("verhält sich ohne Preset-Variante exakt wie bisher", () => {
    const stats = computeMaterialStats(
      material({ spoolType: ownSpool, storageBox: box }),
      {
        id: 1,
        materialId: 1,
        grossWeight: 1500,
        weighedAt: new Date(),
        note: null,
        createdAt: new Date(),
      },
      1
    );
    expect(stats.tareWeight).toBe(720);
    expect(stats.spoolTareWeight).toBe(220);
    expect(stats.remainingWeight).toBe(780);
    expect(stats.spoolLabel).toBe("Kunststoffspule 1 kg");
  });

  it("nutzt das Leergewicht der Preset-Variante", () => {
    const stats = computeMaterialStats(
      material({ spoolPresetVariant: presetVariant }),
      {
        id: 1,
        materialId: 1,
        grossWeight: 1130,
        weighedAt: new Date(),
        note: null,
        createdAt: new Date(),
      },
      1
    );
    expect(stats.spoolTareWeight).toBe(130);
    expect(stats.tareWeight).toBe(130);
    expect(stats.remainingWeight).toBe(1000);
    expect(stats.remainingPercent).toBe(100);
    expect(stats.spoolLabel).toBe(presetVariant.displayName);
  });

  it("bevorzugt die Preset-Variante, falls doch einmal beides gesetzt ist", () => {
    const stats = computeMaterialStats(
      material({ spoolType: ownSpool, spoolPresetVariant: presetVariant }),
      null,
      0
    );
    expect(stats.spoolTareWeight).toBe(130);
    expect(stats.spoolLabel).toBe(presetVariant.displayName);
  });

  it("liefert ohne Rolle Tara 0 und kein Etikett", () => {
    const stats = computeMaterialStats(material(), null, 0);
    expect(stats.tareWeight).toBe(0);
    expect(stats.spoolLabel).toBeNull();
    // Ohne Wägung gilt die Nennmenge als Restmenge
    expect(stats.remainingWeight).toBe(1000);
  });

  it("begrenzt die Restmenge nach unten auf 0", () => {
    const stats = computeMaterialStats(
      material({ spoolPresetVariant: presetVariant }),
      {
        id: 1,
        materialId: 1,
        grossWeight: 100,
        weighedAt: new Date(),
        note: null,
        createdAt: new Date(),
      },
      1
    );
    expect(stats.remainingWeight).toBe(0);
    expect(stats.remainingPercent).toBe(0);
  });
});
