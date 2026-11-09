/**
 * Restmengen-Filter der Übersicht (seit 4.5.0): ein Bereich mit zwei Griffen,
 * wahlweise in Gramm, in der Zweiteinheit des Lagers (Meter, Liter) oder in
 * Prozent der Nennmenge.
 *
 * Reine Rechnung ohne React, damit sie ohne Browser testbar ist
 * (`api/remainingFilter.test.ts`). Gefiltert wird je **Gebinde**, nicht je
 * Material – den Bestand des Materials deckt „nur knapp“ schon ab.
 *
 * Der Slider arbeitet in **Positionen** (0 bis `SLIDER_STEPS`), nicht in
 * Werten. So bleibt die Strecke beim Verschieben gleich breit, auch auf der
 * logarithmischen Skala, und erst die Umrechnung rundet auf die Schrittweite.
 */
import type { MaterialKind, SecondaryAmount } from "./materials";

export const REMAINING_UNITS = ["grams", "secondary", "percent"] as const;
export type RemainingUnit = (typeof REMAINING_UNITS)[number];

/**
 * `null` heißt „offen“: Ein Griff am Rand schneidet nichts ab. Darum ändert
 * sich ein Filter „≥ 500 g“ nicht, wenn die größte Rolle im Lager wechselt.
 */
export type RemainingRange = { min: number | null; max: number | null };
export const OPEN_RANGE: RemainingRange = { min: null, max: null };

export const SLIDER_STEPS = 1000;

/** Was ein Gebinde für den Filter mitbringen muss – `MaterialOverview` passt */
export type RemainingSource = {
  remainingWeight: number;
  remainingPercent: number | null;
  secondary: SecondaryAmount | null;
};

export function isRangeActive(range: RemainingRange): boolean {
  return range.min != null || range.max != null;
}

/** Pulver hat keine Zweiteinheit, also nur Gramm und Prozent */
export function unitsForKind(kind: MaterialKind): RemainingUnit[] {
  return kind === "powder" ? ["grams", "percent"] : [...REMAINING_UNITS];
}

/** Vorgabe: die Zweiteinheit, wo es eine gibt – „noch 40 m“ ist die Frage */
export function defaultUnitForKind(kind: MaterialKind): RemainingUnit {
  return kind === "powder" ? "grams" : "secondary";
}

export function remainingValueIn(
  unit: RemainingUnit,
  m: RemainingSource
): number | null {
  switch (unit) {
    case "grams":
      return m.remainingWeight;
    case "percent":
      return m.remainingPercent;
    case "secondary":
      return m.secondary?.value ?? null;
  }
}

/**
 * Liegt der Wert im Bereich? Ohne aktiven Bereich immer ja; ein Gebinde ohne
 * Wert in der Einheit (Meter ohne Dichte) bei aktivem Bereich nie – die
 * Übersicht sagt dazu, wie viele das sind.
 */
export function inRange(value: number | null, range: RemainingRange): boolean {
  if (!isRangeActive(range)) return true;
  if (value == null) return false;
  if (range.min != null && value < range.min) return false;
  if (range.max != null && value > range.max) return false;
  return true;
}

function decimalsOf(step: number): number {
  return step >= 1 ? 0 : Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
}

/** Auf die Schrittweite runden, ohne Gleitkomma-Reste wie 0,30000000000000004 */
export function roundToStep(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(decimalsOf(step)));
}

/**
 * Obergrenze und Schrittweite der Skala aus den Werten des Lagers. Etwa 200
 * Schritte über die ganze Breite, Schrittweite 1, 2 oder 5 mal einer
 * Zehnerpotenz, die Obergrenze auf zehn Schritte aufgerundet. Gramm in ganzen
 * Gramm, Zweiteinheit höchstens auf 0,01 genau, Prozent immer 0–100 in ganzen
 * Prozent.
 */
export function rangeScale(
  values: readonly (number | null)[],
  unit: RemainingUnit
): { max: number; step: number } {
  if (unit === "percent") return { max: 100, step: 1 };
  let top = 0;
  for (const v of values)
    if (v != null && Number.isFinite(v) && v > top) top = v;
  if (top <= 0) top = unit === "grams" ? 100 : 1;
  const raw = top / 200;
  const pow = 10 ** Math.floor(Math.log10(raw));
  let step = ([1, 2, 5, 10].find(f => f * pow >= raw) ?? 10) * pow;
  // Gramm ganz; Meter und Liter nicht feiner, als `formatSecondary` zeigt
  if (unit === "grams") step = Math.max(1, Math.round(step));
  else step = Math.max(0.01, step);
  step = roundToStep(step, step);
  const block = step * 10;
  return {
    max: roundToStep(Math.ceil(top / block - 1e-9) * block, step),
    step,
  };
}

export type SliderScale = {
  max: number;
  step: number;
  /** Anteil 0–1 der Schiene → Wert, auf die Schrittweite gerundet */
  toValue: (t: number) => number;
  /** Wert → Anteil 0–1 der Schiene */
  toPos: (value: number) => number;
};

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/**
 * Lineare oder logarithmische Skala. Logarithmisch hilft, wenn 250-g-Proben
 * neben 5-kg-Eimern liegen: Linear wären die kleinen Werte ein paar Pixel.
 * `log1p`/`expm1`, damit die Null am linken Rand bleibt.
 */
export function sliderScale(
  max: number,
  step: number,
  log: boolean
): SliderScale {
  if (log) {
    const span = Math.log1p(max);
    return {
      max,
      step,
      toValue: t =>
        Math.min(max, roundToStep(Math.expm1(clamp01(t) * span), step)),
      toPos: v => clamp01(Math.log1p(Math.max(0, v)) / span),
    };
  }
  return {
    max,
    step,
    toValue: t => Math.min(max, roundToStep(clamp01(t) * max, step)),
    toPos: v => clamp01(v / max),
  };
}

/**
 * Positionen der beiden Griffe → Bereich. Ein Griff am Rand – oder einer, der
 * nach dem Runden auf 0 bzw. die Obergrenze fällt – ist offen.
 */
export function positionsToRange(
  positions: readonly [number, number],
  scale: SliderScale
): RemainingRange {
  const [lo, hi] = positions;
  const min = lo <= 0 ? 0 : scale.toValue(lo / SLIDER_STEPS);
  const max = hi >= SLIDER_STEPS ? scale.max : scale.toValue(hi / SLIDER_STEPS);
  return { min: min <= 0 ? null : min, max: max >= scale.max ? null : max };
}

export function rangeToPositions(
  range: RemainingRange,
  scale: SliderScale
): [number, number] {
  const lo =
    range.min == null ? 0 : Math.round(scale.toPos(range.min) * SLIDER_STEPS);
  const hi =
    range.max == null
      ? SLIDER_STEPS
      : Math.round(scale.toPos(range.max) * SLIDER_STEPS);
  return [Math.min(lo, hi), Math.max(lo, hi)];
}

/**
 * Die ganze Strecke verschieben: beide Griffe um dasselbe Stück, an den
 * Rändern so weit, dass die Breite erhalten bleibt.
 */
export function shiftPositions(
  positions: readonly [number, number],
  delta: number
): [number, number] {
  const [lo, hi] = positions;
  const d = Math.min(SLIDER_STEPS - hi, Math.max(-lo, Math.round(delta)));
  return [lo + d, hi + d];
}

/** Verteilung hinter der Schiene, in Positionen – Balken und Griffe fluchten */
export function histogram(
  values: readonly (number | null)[],
  scale: SliderScale,
  bins: number
): number[] {
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    counts[Math.min(bins - 1, Math.floor(scale.toPos(v) * bins))]++;
  }
  return counts;
}

/**
 * Schnellwahl in Prozent. „Fast leer“ deckt sich mit dem roten Ring der Spule
 * (`fillLevelStroke`, bis 10 %). Der Füllstand ist ganzzahlig (`fillPercent`),
 * die Lücken zwischen den Bereichen verlieren also nichts.
 */
export const REMAINING_PRESETS = [
  { id: "almostEmpty", range: { min: null, max: 10 } },
  { id: "opened", range: { min: 11, max: 89 } },
  { id: "full", range: { min: 90, max: null } },
] as const satisfies readonly { id: string; range: RemainingRange }[];

export type RemainingPresetId = (typeof REMAINING_PRESETS)[number]["id"];

export function sameRange(a: RemainingRange, b: RemainingRange): boolean {
  return a.min === b.min && a.max === b.max;
}
