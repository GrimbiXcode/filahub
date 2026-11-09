import type { MaterialKind, SecondaryUnit } from "@contracts/materials";
import type { RemainingRange, RemainingUnit } from "@contracts/remainingFilter";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";

/** Meter beim Filament, Liter beim Harz, beim Pulver keine */
export function secondaryUnitFor(kind: MaterialKind): SecondaryUnit | null {
  if (kind === "filament") return "m";
  if (kind === "resin") return "l";
  return null;
}

/**
 * Werte und Bereiche des Restmengen-Filters als Text – für den Filter selbst
 * und für den Merkzettel über der Liste. Eine Stelle, damit beide dieselbe
 * Schreibweise zeigen.
 */
export function useRemainingFormat() {
  const { formatGrams, formatPercent, formatSecondary } = useFormat();
  const t = useT();

  const formatValue = (
    unit: RemainingUnit,
    secondaryUnit: SecondaryUnit | null,
    value: number
  ): string => {
    if (unit === "grams") return formatGrams(value);
    if (unit === "percent") return formatPercent(value);
    return secondaryUnit
      ? formatSecondary({ unit: secondaryUnit, value })
      : formatGrams(value);
  };

  /** `null`, solange beide Enden offen sind – dann filtert der Bereich nicht */
  const rangeLabel = (
    unit: RemainingUnit,
    secondaryUnit: SecondaryUnit | null,
    range: RemainingRange
  ): string | null => {
    const f = (v: number) => formatValue(unit, secondaryUnit, v);
    if (range.min != null && range.max != null)
      return t.home.remainingFilter.between({
        from: f(range.min),
        to: f(range.max),
      });
    if (range.max != null)
      return t.home.remainingFilter.atMost({ to: f(range.max) });
    if (range.min != null)
      return t.home.remainingFilter.atLeast({ from: f(range.min) });
    return null;
  };

  return { formatValue, rangeLabel };
}
