import { describe, expect, it } from "vitest";
import {
  OPEN_RANGE,
  REMAINING_PRESETS,
  SLIDER_STEPS,
  histogram,
  inRange,
  positionsToRange,
  rangeScale,
  rangeToPositions,
  remainingValueIn,
  roundToStep,
  shiftPositions,
  sliderScale,
  unitsForKind,
} from "@contracts/remainingFilter";

describe("rangeScale", () => {
  it("rundet Gramm auf zehn Schritte auf", () => {
    expect(rangeScale([812, 64, 1010], "grams")).toEqual({
      max: 1100,
      step: 10,
    });
  });

  it("nimmt Prozent immer 0–100", () => {
    expect(rangeScale([3, 40], "percent")).toEqual({ max: 100, step: 1 });
  });

  it("findet für Liter eine feine Schrittweite ohne Gleitkomma-Reste", () => {
    const { max, step } = rangeScale([0.95, 0.3], "secondary");
    expect(step).toBe(0.01);
    expect(max).toBe(1);
  });

  it("überlebt ein leeres Lager", () => {
    expect(rangeScale([], "grams").max).toBeGreaterThan(0);
    expect(rangeScale([null], "secondary").max).toBeGreaterThan(0);
  });
});

describe("Positionen und Bereich", () => {
  const scale = sliderScale(1000, 10, false);

  it("behandelt beide Ränder als offen", () => {
    expect(positionsToRange([0, SLIDER_STEPS], scale)).toEqual(OPEN_RANGE);
    expect(rangeToPositions(OPEN_RANGE, scale)).toEqual([0, SLIDER_STEPS]);
  });

  it("rundet auf die Schrittweite", () => {
    expect(positionsToRange([123, 456], scale)).toEqual({
      min: 120,
      max: 460,
    });
  });

  it("macht einen Griff offen, der beim Runden auf den Rand fällt", () => {
    expect(positionsToRange([4, 998], scale)).toEqual(OPEN_RANGE);
  });

  it("findet den Bereich wieder", () => {
    const range = { min: 200, max: 700 };
    expect(positionsToRange(rangeToPositions(range, scale), scale)).toEqual(
      range
    );
  });

  it("findet den Bereich auch auf der logarithmischen Skala wieder", () => {
    const log = sliderScale(5000, 10, true);
    const range = { min: 50, max: 800 };
    expect(positionsToRange(rangeToPositions(range, log), log)).toEqual(range);
    expect(log.toValue(0)).toBe(0);
    expect(log.toValue(1)).toBe(5000);
  });
});

describe("shiftPositions", () => {
  it("verschiebt beide Griffe gleich weit", () => {
    expect(shiftPositions([200, 500], 100)).toEqual([300, 600]);
    expect(shiftPositions([200, 500], -150)).toEqual([50, 350]);
  });

  it("hält die Breite an den Rändern", () => {
    expect(shiftPositions([200, 500], 900)).toEqual([700, SLIDER_STEPS]);
    expect(shiftPositions([200, 500], -900)).toEqual([0, 300]);
  });
});

describe("inRange", () => {
  it("lässt ohne Bereich alles durch, auch fehlende Werte", () => {
    expect(inRange(null, OPEN_RANGE)).toBe(true);
  });

  it("schließt fehlende Werte bei aktivem Bereich aus", () => {
    expect(inRange(null, { min: null, max: 100 })).toBe(false);
  });

  it("schließt beide Grenzen ein", () => {
    const r = { min: 100, max: 200 };
    expect(inRange(100, r)).toBe(true);
    expect(inRange(200, r)).toBe(true);
    expect(inRange(99, r)).toBe(false);
    expect(inRange(201, r)).toBe(false);
  });

  it("deckt mit der Schnellwahl jeden ganzzahligen Füllstand genau einmal", () => {
    for (let p = 0; p <= 100; p++) {
      const hits = REMAINING_PRESETS.filter(x => inRange(p, x.range));
      expect(hits).toHaveLength(1);
    }
  });
});

describe("Einheiten", () => {
  const m = {
    remainingWeight: 450,
    remainingPercent: 45,
    secondary: { unit: "m" as const, value: 151.2 },
  };

  it("liest den Wert in der gewählten Einheit", () => {
    expect(remainingValueIn("grams", m)).toBe(450);
    expect(remainingValueIn("percent", m)).toBe(45);
    expect(remainingValueIn("secondary", m)).toBe(151.2);
    expect(remainingValueIn("secondary", { ...m, secondary: null })).toBe(null);
  });

  it("bietet beim Pulver keine Zweiteinheit an", () => {
    expect(unitsForKind("powder")).toEqual(["grams", "percent"]);
    expect(unitsForKind("filament")).toContain("secondary");
  });
});

describe("histogram", () => {
  it("zählt in Positionen und legt das Maximum in den letzten Balken", () => {
    const scale = sliderScale(100, 1, false);
    expect(histogram([0, 10, 49, 50, 100, null], scale, 4)).toEqual([
      2, 1, 1, 1,
    ]);
  });
});

it("roundToStep", () => {
  expect(roundToStep(0.1 + 0.2, 0.1)).toBe(0.3);
  expect(roundToStep(123, 10)).toBe(120);
});
