import { describe, expect, it } from "vitest";
import {
  LOW_STOCK_PERCENT,
  mergeCandidates,
  productKey,
  productStock,
  remainingAmount,
  type ProductIdentity,
} from "@contracts/materials";

/**
 * Material über den Gebinden, seit 4.0.0.
 *
 * Die wichtigste Zusicherung steht im ersten Block: Ein Material mit genau
 * einem Gebinde und ohne Schwelle am Lager warnt **exakt** so, wie bis 3.1.0
 * das Gebinde selbst gewarnt hat (`remainingPercent <= LOW_STOCK_PERCENT`).
 * Sonst änderte der Umbau still, wer eine Warnung sieht.
 */

/** Die Regel bis 3.1.0, wörtlich aus `Home.tsx` */
function lowUntil31(remainingWeight: number, nominalWeight: number): boolean {
  const { remainingPercent } = remainingAmount({
    nominalWeight,
    containerTareWeight: 0,
    grossWeight: remainingWeight,
    materialType: "PLA",
  });
  return remainingPercent != null && remainingPercent <= LOW_STOCK_PERCENT;
}

describe("productStock – Gleichheit mit 3.1.0 bei einem Gebinde", () => {
  const nominals = [1, 3, 250, 333, 500, 750, 1000, 1001, 2500, 5000];
  for (const nominalWeight of nominals) {
    it(`Nennmenge ${nominalWeight} g`, () => {
      for (let remaining = 0; remaining <= nominalWeight + 5; remaining++) {
        const stock = productStock([
          {
            remainingWeight: remaining,
            nominalWeight,
            lagerLowStockGrams: null,
          },
        ]);
        expect(stock.low, `${remaining} von ${nominalWeight}`).toBe(
          lowUntil31(remaining, nominalWeight)
        );
      }
    });
  }
});

describe("productStock", () => {
  it("summiert über alle Gebinde – die volle Rolle hält die leere", () => {
    const stock = productStock([
      { remainingWeight: 80, nominalWeight: 1000, lagerLowStockGrams: null },
      { remainingWeight: 1000, nominalWeight: 1000, lagerLowStockGrams: null },
    ]);
    expect(stock).toEqual({
      totalRemaining: 1080,
      count: 2,
      usedUp: false,
      threshold: 250,
      thresholdSource: "default",
      low: false,
    });
  });

  it("warnt, wenn auch die Summe knapp ist", () => {
    const stock = productStock([
      { remainingWeight: 80, nominalWeight: 1000, lagerLowStockGrams: null },
      { remainingWeight: 100, nominalWeight: 250, lagerLowStockGrams: null },
    ]);
    expect(stock.low).toBe(true);
    // Vorgabe aus der **größten** Nennmenge, nicht aus der Summe
    expect(stock.threshold).toBe(250);
  });

  it("nimmt die Schwelle des Lagers statt der Vorgabe", () => {
    const stock = productStock([
      { remainingWeight: 400, nominalWeight: 1000, lagerLowStockGrams: 500 },
    ]);
    expect(stock).toMatchObject({
      threshold: 500,
      thresholdSource: "lager",
      low: true,
    });
  });

  it("nimmt über mehrere Lager die höchste Schwelle", () => {
    const stock = productStock([
      { remainingWeight: 300, nominalWeight: 1000, lagerLowStockGrams: 200 },
      { remainingWeight: 300, nominalWeight: 1000, lagerLowStockGrams: 800 },
      { remainingWeight: 100, nominalWeight: 1000, lagerLowStockGrams: null },
    ]);
    expect(stock).toMatchObject({
      totalRemaining: 700,
      threshold: 800,
      thresholdSource: "lager",
      low: true,
    });
  });

  it("gleich der Schwelle ist knapp, darüber nicht", () => {
    const at = (remainingWeight: number) =>
      productStock([
        { remainingWeight, nominalWeight: 1000, lagerLowStockGrams: 300 },
      ]).low;
    expect(at(300)).toBe(true);
    expect(at(301)).toBe(false);
  });

  it("Schwelle 0 warnt erst bei leerem Bestand", () => {
    const at = (remainingWeight: number) =>
      productStock([
        { remainingWeight, nominalWeight: 1000, lagerLowStockGrams: 0 },
      ]).low;
    expect(at(0)).toBe(true);
    expect(at(1)).toBe(false);
  });

  it("ohne Gebinde keine Warnung und keine Schwelle", () => {
    expect(productStock([])).toEqual({
      totalRemaining: 0,
      count: 0,
      usedUp: false,
      threshold: null,
      thresholdSource: null,
      low: false,
    });
  });
});

describe("productStock – aufgebraucht (4.1.0)", () => {
  it("zählt aufgebrauchte Gebinde nicht mit", () => {
    const stock = productStock([
      { remainingWeight: 80, nominalWeight: 1000, lagerLowStockGrams: null },
      {
        remainingWeight: 900,
        nominalWeight: 1000,
        lagerLowStockGrams: null,
        archived: true,
      },
    ]);
    expect(stock).toMatchObject({
      totalRemaining: 80,
      count: 1,
      usedUp: false,
      low: true,
    });
  });

  it("ist knapp, wenn alle aufgebraucht sind – mit der Schwelle von vorher", () => {
    const stock = productStock([
      {
        remainingWeight: 300,
        nominalWeight: 1000,
        lagerLowStockGrams: 400,
        archived: true,
      },
    ]);
    expect(stock).toEqual({
      totalRemaining: 0,
      count: 0,
      usedUp: true,
      threshold: 400,
      thresholdSource: "lager",
      low: true,
    });
    expect(
      productStock([
        {
          remainingWeight: 0,
          nominalWeight: 1000,
          lagerLowStockGrams: null,
          archived: true,
        },
      ])
    ).toMatchObject({ usedUp: true, threshold: 250, low: true });
  });
});

const base: ProductIdentity = {
  kind: "filament",
  diameterUm: 1750,
  materialType: "PLA",
  manufacturer: "Polymaker",
  color: "Schwarz",
  texture: "Matt",
};

describe("productKey", () => {
  it("ist unempfindlich gegen Schreibweise und Leerraum", () => {
    expect(
      productKey({
        ...base,
        materialType: " pla ",
        manufacturer: "POLYMAKER ",
        color: "  schwarz",
        texture: "matt",
      })
    ).toBe(productKey(base));
  });

  it("unterscheidet Stärke, Materialart des Lagers und Oberfläche", () => {
    const key = productKey(base);
    expect(productKey({ ...base, diameterUm: 2850 })).not.toBe(key);
    expect(productKey({ ...base, kind: "resin", diameterUm: null })).not.toBe(
      key
    );
    expect(productKey({ ...base, texture: null })).not.toBe(key);
    expect(productKey({ ...base, materialType: "PETG" })).not.toBe(key);
  });

  it("gibt ohne Hersteller oder Farbe keinen Schlüssel", () => {
    expect(productKey({ ...base, manufacturer: null })).toBeNull();
    expect(productKey({ ...base, color: "  " })).toBeNull();
    expect(productKey({ ...base, kind: null })).toBeNull();
  });
});

describe("mergeCandidates", () => {
  it("gruppiert gleiche Produkte, die kleinste ID zuerst", () => {
    expect(
      mergeCandidates([
        { ...base, id: 7, name: "A" },
        { ...base, id: 3, name: "B", color: "SCHWARZ" },
        { ...base, id: 5, name: "C", color: "Weiß" },
      ])
    ).toEqual([[3, 7]]);
  });

  it("schlägt bei fehlendem Hersteller gleiche Namen vor", () => {
    expect(
      mergeCandidates([
        { ...base, manufacturer: null, id: 1, name: "PLA Grau" },
        { ...base, manufacturer: null, id: 2, name: "pla  grau" },
        { ...base, manufacturer: null, id: 3, name: "PLA Rot" },
      ])
    ).toEqual([[1, 2]]);
  });

  it("schlägt über verschiedene Stärken nichts vor", () => {
    expect(
      mergeCandidates([
        { ...base, id: 1, name: "A" },
        { ...base, id: 2, name: "A", diameterUm: 2850 },
      ])
    ).toEqual([]);
  });
});
