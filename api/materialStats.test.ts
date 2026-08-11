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
    containerTypeId: null,
    containerPresetVariantId: null,
    storageBoxId: null,
    notes: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    containerType: null,
    storageBox: null,
    containerPresetVariant: null,
    ...overrides,
  } as MaterialWithRelations;
}

const ownContainer = {
  id: 7,
  userId: 1,
  name: "Kunststoffspule 1 kg",
  manufacturer: "eSun",
  tareWeight: 220,
  sourceVariantId: null,
  notes: null,
  createdAt: new Date("2026-01-01"),
};

const meta = {
  source: "seed" as const,
  seedRevision: 1,
  active: true,
  notes: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

/**
 * Der Anzeigename wird nicht mehr gespeichert, sondern beim Lesen aus dem
 * Katalogpfad erzeugt – die Variante bringt ihn deshalb mit.
 */
const presetVariant = {
  id: 42,
  versionId: 5,
  nominalWeight: 1000,
  tareWeight: 130,
  outerDiameterMm: 200,
  widthMm: 68,
  boreDiameterMm: 55,
  ...meta,
  version: {
    id: 5,
    seriesId: 3,
    name: "Kartonspule (ab 2023)",
    nameI18n: { en: "Cardboard container (from 2023)" },
    containerMaterial: "karton" as const,
    validFrom: null,
    validTo: null,
    ...meta,
    series: {
      id: 3,
      manufacturerId: 2,
      name: "PolyTerra PLA",
      nameI18n: null,
      slug: "polyterra-pla",
      ...meta,
      manufacturer: {
        id: 2,
        name: "Polymaker",
        slug: "polymaker",
        website: null,
        ...meta,
      },
    },
    slug: "kartonspule-ab-2023",
  },
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
      material({ containerType: ownContainer, storageBox: box }),
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
    expect(stats.containerTareWeight).toBe(220);
    expect(stats.remainingWeight).toBe(780);
    expect(stats.containerLabel).toBe("Kunststoffspule 1 kg");
  });

  it("nutzt das Leergewicht der Preset-Variante", () => {
    const stats = computeMaterialStats(
      material({ containerPresetVariant: presetVariant }),
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
    expect(stats.containerTareWeight).toBe(130);
    expect(stats.tareWeight).toBe(130);
    expect(stats.remainingWeight).toBe(1000);
    expect(stats.remainingPercent).toBe(100);
    expect(stats.containerLabel).toBe(
      "Polymaker · PolyTerra PLA · Kartonspule (ab 2023) · 1 kg"
    );
  });

  it("bevorzugt die Preset-Variante, falls doch einmal beides gesetzt ist", () => {
    const stats = computeMaterialStats(
      material({
        containerType: ownContainer,
        containerPresetVariant: presetVariant,
      }),
      null,
      0
    );
    expect(stats.containerTareWeight).toBe(130);
    expect(stats.containerLabel).toBe(
      "Polymaker · PolyTerra PLA · Kartonspule (ab 2023) · 1 kg"
    );
  });

  it("baut das Etikett der Preset-Variante in der gewünschten Sprache", () => {
    const stats = computeMaterialStats(
      material({ containerPresetVariant: presetVariant }),
      null,
      0,
      "en"
    );
    // Der Hersteller bleibt gleich, die Ausführung ist übersetzt, die Serie
    // hat keine Übersetzung und fällt deshalb auf den Grundnamen zurück.
    expect(stats.containerLabel).toBe(
      "Polymaker · PolyTerra PLA · Cardboard container (from 2023) · 1 kg"
    );
  });

  it("liefert ohne Rolle Tara 0 und kein Etikett", () => {
    const stats = computeMaterialStats(material(), null, 0);
    expect(stats.tareWeight).toBe(0);
    expect(stats.containerLabel).toBeNull();
    // Ohne Wägung gilt die Nennmenge als Restmenge
    expect(stats.remainingWeight).toBe(1000);
  });

  it("begrenzt die Restmenge nach unten auf 0", () => {
    const stats = computeMaterialStats(
      material({ containerPresetVariant: presetVariant }),
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
