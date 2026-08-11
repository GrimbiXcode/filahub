import { describe, expect, it } from "vitest";
import {
  formatDiameter,
  lagerConfigIsValid,
  resolveDensity,
  secondaryAmount,
} from "@contracts/materials";

/**
 * Die Zweitanzeige ist die einzige Zahl in der App, die aus mehreren Angaben
 * abgeleitet wird – Masse, Dichte und beim Filament der Durchmesser. Sie geht
 * nicht in die Restmengenrechnung ein, wird aber geglaubt. Deshalb sind die
 * Erwartungen hier gegen Handrechnungen gesetzt und nicht gegen den Code.
 */

describe("secondaryAmount – Filament", () => {
  /*
    1 kg PLA, Dichte 1240 g/L:
      Volumen = 1000 g / 1240 g/L = 0,80645 L = 806 451 mm³
      Fläche  = π · (1,75/2 mm)²  = 2,4053 mm²
      Länge   = 806 451 / 2,4053  = 335 300 mm ≈ 335,3 m
  */
  it("rechnet 1 kg PLA bei 1,75 mm auf rund 335 m", () => {
    const result = secondaryAmount({
      kind: "filament",
      grams: 1000,
      density: 1240,
      diameterUm: 1750,
    });
    expect(result?.unit).toBe("m");
    expect(result?.value).toBeCloseTo(335.3, 0);
  });

  /*
    Derselbe Kilo bei 2,85 mm:
      Fläche = π · (2,85/2)² = 6,3794 mm²  (2,65× so groß)
      Länge  = 806 451 / 6,3794 = 126 400 mm ≈ 126,4 m
  */
  it("rechnet 1 kg PLA bei 2,85 mm auf rund 126 m", () => {
    const result = secondaryAmount({
      kind: "filament",
      grams: 1000,
      density: 1240,
      diameterUm: 2850,
    });
    expect(result?.value).toBeCloseTo(126.4, 0);
  });

  /**
   * Der Durchmesser ist kein Beiwerk – er entscheidet über mehr als den Faktor
   * zwei. Genau dieses Verhältnis ist der Grund, warum die Rechnung ihn
   * zwingend braucht und ohne ihn nichts liefert.
   */
  it("macht dieselbe Masse bei dickerem Filament deutlich kürzer", () => {
    const thin = secondaryAmount({
      kind: "filament",
      grams: 1000,
      density: 1240,
      diameterUm: 1750,
    })!;
    const thick = secondaryAmount({
      kind: "filament",
      grams: 1000,
      density: 1240,
      diameterUm: 2850,
    })!;
    expect(thin.value / thick.value).toBeCloseTo(2.653, 2);
  });

  it("skaliert linear mit der Masse", () => {
    const half = secondaryAmount({
      kind: "filament",
      grams: 500,
      density: 1240,
      diameterUm: 1750,
    })!;
    expect(half.value).toBeCloseTo(167.6, 0);
  });

  /*
    Ohne Durchmesser gibt es keine Länge. Eine falsche Längenangabe wäre
    schlimmer als keine, weil sie geglaubt wird.
  */
  it("liefert ohne Durchmesser nichts statt einer geratenen Länge", () => {
    for (const diameterUm of [null, undefined, 0, -1, NaN]) {
      expect(
        secondaryAmount({
          kind: "filament",
          grams: 1000,
          density: 1240,
          diameterUm,
        })
      ).toBeNull();
    }
  });
});

describe("secondaryAmount – Harz", () => {
  it("rechnet 1 kg Harz auf rund 0,91 l", () => {
    const result = secondaryAmount({
      kind: "resin",
      grams: 1000,
      density: 1100,
    });
    expect(result?.unit).toBe("l");
    expect(result?.value).toBeCloseTo(0.909, 3);
  });

  it("braucht keinen Durchmesser", () => {
    const result = secondaryAmount({
      kind: "resin",
      grams: 500,
      density: 1100,
    });
    expect(result?.value).toBeCloseTo(0.4545, 3);
  });
});

describe("secondaryAmount – Pulver", () => {
  /*
    Schüttdichte hängt von Korngröße und Verdichtung ab; ein Literwert wäre
    geraten. Also gibt es bei Pulver bewusst gar keine zweite Zahl.
  */
  it("liefert nie eine Zweitanzeige", () => {
    expect(
      secondaryAmount({ kind: "powder", grams: 5000, density: 1100 })
    ).toBeNull();
  });
});

describe("secondaryAmount – fehlende Angaben", () => {
  it("liefert ohne Dichte nichts", () => {
    for (const density of [null, undefined, 0, -5]) {
      expect(
        secondaryAmount({
          kind: "filament",
          grams: 1000,
          density,
          diameterUm: 1750,
        })
      ).toBeNull();
    }
  });

  it("liefert ohne Masse nichts", () => {
    for (const grams of [null, undefined, -1, NaN]) {
      expect(
        secondaryAmount({
          kind: "resin",
          grams,
          density: 1100,
        })
      ).toBeNull();
    }
  });

  it("verkraftet eine leere Rolle", () => {
    const result = secondaryAmount({
      kind: "filament",
      grams: 0,
      density: 1240,
      diameterUm: 1750,
    });
    expect(result?.value).toBe(0);
  });
});

describe("resolveDensity", () => {
  it("nimmt zuerst den Wert am Material", () => {
    expect(
      resolveDensity({
        kind: "filament",
        materialType: "PLA",
        densityGramsPerLiter: 1300,
      })
    ).toBe(1300);
  });

  it("fällt auf die Materialart-Bezeichnung zurück", () => {
    expect(resolveDensity({ kind: "filament", materialType: "PETG" })).toBe(
      1270
    );
    expect(resolveDensity({ kind: "filament", materialType: "ABS" })).toBe(
      1040
    );
  });

  /*
    Derselbe Grundtyp trotz Zusatz – „PLA Silk" und „PLA+" sind PLA. Sonst
    fiele jede Textur- und Varianten-Schreibweise auf die Art-Vorgabe zurück.
  */
  it("erkennt den Grundtyp trotz Zusätzen", () => {
    for (const type of ["PLA+", "PLA Silk", "pla silk", " PLA+ ", "PLA-CF"]) {
      expect(resolveDensity({ kind: "filament", materialType: type })).toBe(
        1240
      );
    }
    expect(resolveDensity({ kind: "filament", materialType: "PA-CF" })).toBe(
      1140
    );
  });

  it("fällt zuletzt auf die Materialart des Lagers zurück", () => {
    expect(
      resolveDensity({ kind: "resin", materialType: "Irgendwas Neues" })
    ).toBe(1100);
    expect(resolveDensity({ kind: "filament", materialType: null })).toBe(1240);
  });

  it("hat für Pulver keinen Wert", () => {
    expect(resolveDensity({ kind: "powder", materialType: "PA12" })).toBeNull();
  });

  it("ignoriert unbrauchbare eigene Werte", () => {
    expect(
      resolveDensity({
        kind: "resin",
        materialType: null,
        densityGramsPerLiter: 0,
      })
    ).toBe(1100);
  });
});

describe("lagerConfigIsValid", () => {
  it("verlangt beim Filament einen gängigen Durchmesser", () => {
    expect(
      lagerConfigIsValid({ materialKind: "filament", filamentDiameterUm: 1750 })
    ).toBe(true);
    expect(
      lagerConfigIsValid({ materialKind: "filament", filamentDiameterUm: 2850 })
    ).toBe(true);
    expect(
      lagerConfigIsValid({ materialKind: "filament", filamentDiameterUm: 3000 })
    ).toBe(false);
    expect(
      lagerConfigIsValid({ materialKind: "filament", filamentDiameterUm: null })
    ).toBe(false);
  });

  /*
    Ein Durchmesser an einem Pulver- oder Harzlager wäre eine Angabe, die nichts
    bedeutet – und irgendwann als Wahrheit gelesen wird.
  */
  it("lässt bei anderen Arten keinen Durchmesser zu", () => {
    for (const kind of ["powder", "resin"] as const) {
      expect(
        lagerConfigIsValid({ materialKind: kind, filamentDiameterUm: null })
      ).toBe(true);
      expect(
        lagerConfigIsValid({ materialKind: kind, filamentDiameterUm: 1750 })
      ).toBe(false);
    }
  });
});

describe("formatDiameter", () => {
  it("schreibt Mikrometer als Millimeter mit Komma", () => {
    expect(formatDiameter(1750)).toBe("1,75 mm");
    expect(formatDiameter(2850)).toBe("2,85 mm");
  });
});
