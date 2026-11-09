import { useMemo, useRef, useState, type PointerEvent } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import type { MaterialKind } from "@contracts/materials";
import {
  REMAINING_PRESETS,
  SLIDER_STEPS,
  histogram,
  isRangeActive,
  positionsToRange,
  rangeScale,
  rangeToPositions,
  remainingValueIn,
  sameRange,
  shiftPositions,
  sliderScale,
  unitsForKind,
  type RemainingRange,
  type RemainingSource,
  type RemainingUnit,
} from "@contracts/remainingFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useT } from "@/lib/i18nContext";
import { secondaryUnitFor, useRemainingFormat } from "@/lib/remainingFilter";
import { cn } from "@/lib/utils";

const BINS = 24;
/**
 * Schrittweite des Radix-Sliders in Positionen: 200 Tastenschritte über die
 * Schiene, Bild auf/ab ein Zehntel. Mit 1 bewegte eine Pfeiltaste den Griff um
 * ein Tausendstel – nach dem Runden auf die Schrittweite meist gar nicht. Die
 * Strecke zieht weiter in ganzen Positionen.
 */
const KEY_STEP = 5;

/** Dieselben Griffe wie `ui/slider.tsx` – nur hier mit eigenem Beschriftungstext */
const THUMB_CLASS =
  "border-primary ring-ring/50 relative z-10 block size-4 shrink-0 rounded-full border bg-white shadow-xs transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden";

type Props = {
  kind: MaterialKind;
  unit: RemainingUnit;
  range: RemainingRange;
  /** Einheit und Bereich zusammen: Ein Einheitenwechsel leert den Bereich */
  onChange: (unit: RemainingUnit, range: RemainingRange) => void;
  log: boolean;
  onLogChange: (log: boolean) => void;
  /** Alle Gebinde des Lagers – bestimmen die Skala */
  materials: readonly RemainingSource[];
  /** Die Gebinde nach den übrigen Filtern – für die Verteilung */
  visible: readonly RemainingSource[];
};

/**
 * Restmengen-Filter der Übersicht (seit 4.5.0).
 *
 * Auf dem Radix-Slider gebaut, nicht auf `ui/slider.tsx`: Die Griffe brauchen
 * einen eigenen `aria-valuetext` („120 m“ statt „387“), und die Strecke
 * dazwischen lässt sich ziehen – beide Grenzen wandern dann zugleich. Radix
 * kennt das nicht; der Zeiger auf der Strecke wird deshalb hier behandelt und
 * erreicht den Slider nicht (`stopPropagation` in allen drei Ereignissen,
 * sonst bewegte Radix zusätzlich den nächsten Griff).
 */
export function RemainingRangeFilter({
  kind,
  unit,
  range,
  onChange,
  log,
  onLogChange,
  materials,
  visible,
}: Props) {
  const t = useT();
  const tr = t.home.remainingFilter;
  const { formatValue, rangeLabel } = useRemainingFormat();
  const secondaryUnit = secondaryUnitFor(kind);
  const units = unitsForKind(kind);
  const useLog = log && unit !== "percent";

  const scale = useMemo(() => {
    const { max, step } = rangeScale(
      materials.map(m => remainingValueIn(unit, m)),
      unit
    );
    return sliderScale(max, step, useLog);
  }, [materials, unit, useLog]);

  /*
    Die Griffe stehen, wo sie hingezogen wurden, nicht wo der gerundete Wert
    sie hinstellen würde. Sonst landete der Rückweg knapp neben dem Raster des
    Sliders (324 m → 953 statt 950), und Radix rastete beim nächsten Tastendruck
    wieder auf 950 ein – der Griff kam nicht weiter. Ändert sich der Bereich von
    außen (Zahlenfeld, Schnellwahl, Merkzettel) oder die Skala, gilt wieder die
    Umrechnung.
  */
  const scaleKey = `${unit}|${scale.max}|${scale.step}|${useLog}`;
  const [placed, setPlaced] = useState<{
    key: string;
    range: RemainingRange;
    positions: [number, number];
  } | null>(null);
  const positions =
    placed && placed.key === scaleKey && sameRange(placed.range, range)
      ? placed.positions
      : rangeToPositions(range, scale);
  const visibleValues = visible.map(m => remainingValueIn(unit, m));
  const bins = histogram(visibleValues, scale, BINS);
  const peak = Math.max(1, ...bins);
  const active = isRangeActive(range);
  const missing = active ? visibleValues.filter(v => v == null).length : 0;

  const setPositions = (next: readonly [number, number]) => {
    const nextRange = positionsToRange(next, scale);
    setPlaced({
      key: scaleKey,
      range: nextRange,
      positions: [next[0], next[1]],
    });
    onChange(unit, nextRange);
  };

  // Die Strecke ziehen: Ausgangslage merken, nicht fortschreiben – sonst
  // summierte sich das Runden auf die Schrittweite bei jeder Bewegung.
  const trackRef = useRef<HTMLSpanElement>(null);
  const drag = useRef<{
    x: number;
    width: number;
    from: [number, number];
  } | null>(null);
  const onRangePointerDown = (e: PointerEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    if (e.button !== 0 || !active) return;
    const width = trackRef.current?.getBoundingClientRect().width ?? 0;
    if (width <= 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, width, from: positions };
  };
  const onRangePointerMove = (e: PointerEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    const d = drag.current;
    if (!d) return;
    setPositions(
      shiftPositions(d.from, ((e.clientX - d.x) / d.width) * SLIDER_STEPS)
    );
  };
  const onRangePointerEnd = (e: PointerEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    drag.current = null;
  };

  const unitLabel = (u: RemainingUnit) =>
    u === "grams"
      ? tr.unitGrams
      : u === "percent"
        ? tr.unitPercent
        : secondaryUnit === "l"
          ? tr.unitLiters
          : tr.unitMeters;

  const missingText =
    unit === "percent"
      ? tr.missingPercent({ count: missing })
      : secondaryUnit === "l"
        ? tr.missingLiters({ count: missing })
        : tr.missingMeters({ count: missing });

  /** Eingabe → Grenze; leer, ≤ 0 bzw. ≥ Obergrenze heißt offen */
  const commitInput = (which: "min" | "max", input: HTMLInputElement) => {
    const raw = input.valueAsNumber;
    let value: number | null = Number.isFinite(raw) ? raw : null;
    if (value != null && value <= 0) value = which === "min" ? null : 0;
    if (value != null && value >= scale.max)
      value = which === "max" ? null : scale.max;
    const next = { ...range, [which]: value };
    if (next.min != null && next.max != null && next.min > next.max)
      onChange(unit, { min: next.max, max: next.min });
    else onChange(unit, next);
  };

  const ticks = useLog
    ? [0, scale.toValue(1 / 3), scale.toValue(2 / 3), scale.max]
    : [0, scale.max / 2, scale.max];

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="font-medium">{tr.label}</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={unit}
          onValueChange={value =>
            value && onChange(value as RemainingUnit, { min: null, max: null })
          }
          aria-label={tr.unitAria}
        >
          {units.map(u => (
            <ToggleGroupItem key={u} value={u} className="px-3 font-mono">
              {unitLabel(u)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={tr.presetsAria}
      >
        {REMAINING_PRESETS.map(preset => {
          const pressed = unit === "percent" && sameRange(range, preset.range);
          return (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant={pressed ? "default" : "outline"}
              aria-pressed={pressed}
              className="h-8 gap-1.5"
              onClick={() =>
                pressed
                  ? onChange(unit, { min: null, max: null })
                  : onChange("percent", preset.range)
              }
            >
              <span>{tr.presets[preset.id]}</span>
              <span
                className={cn(
                  "font-mono text-xs",
                  pressed
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground"
                )}
              >
                {rangeLabel("percent", null, preset.range)}
              </span>
            </Button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex h-10 items-end gap-px px-2" aria-hidden="true">
          {bins.map((count, i) => {
            const inside =
              ((i + 1) / BINS) * SLIDER_STEPS > positions[0] &&
              (i / BINS) * SLIDER_STEPS < positions[1];
            return (
              <div
                key={i}
                className={cn(
                  "flex-1 rounded-t-[2px] transition-colors",
                  count === 0
                    ? "bg-transparent"
                    : inside
                      ? "bg-primary/45"
                      : "bg-muted-foreground/20"
                )}
                style={{ height: `${(count / peak) * 100}%` }}
              />
            );
          })}
        </div>
        <SliderPrimitive.Root
          value={positions}
          min={0}
          max={SLIDER_STEPS}
          step={KEY_STEP}
          minStepsBetweenThumbs={0}
          onValueChange={value => setPositions([value[0], value[1]])}
          className="relative flex h-6 w-full touch-none items-center select-none"
        >
          <SliderPrimitive.Track
            ref={trackRef}
            className="relative h-1.5 grow rounded-full bg-muted"
          >
            <SliderPrimitive.Range
              title={active ? tr.dragRange : undefined}
              onPointerDown={onRangePointerDown}
              onPointerMove={onRangePointerMove}
              onPointerUp={onRangePointerEnd}
              onPointerCancel={onRangePointerEnd}
              className={cn(
                "absolute h-full rounded-full",
                active
                  ? "cursor-grab bg-primary active:cursor-grabbing"
                  : "bg-primary/30",
                // Größere Trefferfläche als die 6 px hohe Strecke
                "before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-['']"
              )}
            />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            aria-label={tr.lowerThumb}
            aria-valuetext={
              range.min == null
                ? tr.all
                : formatValue(unit, secondaryUnit, range.min)
            }
            className={THUMB_CLASS}
          />
          <SliderPrimitive.Thumb
            aria-label={tr.upperThumb}
            aria-valuetext={
              range.max == null
                ? tr.all
                : formatValue(unit, secondaryUnit, range.max)
            }
            className={THUMB_CLASS}
          />
        </SliderPrimitive.Root>
        <div className="flex justify-between font-mono text-xs text-muted-foreground">
          {ticks.map((v, i) => (
            <span key={i}>{formatValue(unit, secondaryUnit, v)}</span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="remaining-from" className="font-normal">
            {tr.from}
          </Label>
          <Input
            key={`${unit}-min-${range.min}`}
            id="remaining-from"
            type="number"
            inputMode="decimal"
            min={0}
            max={scale.max}
            step={scale.step}
            defaultValue={range.min ?? ""}
            onBlur={e => commitInput("min", e.currentTarget)}
            onKeyDown={e => {
              if (e.key === "Enter") commitInput("min", e.currentTarget);
            }}
            className="h-8 w-24 font-mono"
          />
          <Label htmlFor="remaining-to" className="font-normal">
            {tr.to}
          </Label>
          <Input
            key={`${unit}-max-${range.max}`}
            id="remaining-to"
            type="number"
            inputMode="decimal"
            min={0}
            max={scale.max}
            step={scale.step}
            defaultValue={range.max ?? ""}
            placeholder={String(scale.max)}
            onBlur={e => commitInput("max", e.currentTarget)}
            onKeyDown={e => {
              if (e.key === "Enter") commitInput("max", e.currentTarget);
            }}
            className="h-8 w-24 font-mono"
          />
          <span className="font-mono text-sm text-muted-foreground">
            {unitLabel(unit)}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Switch
            id="remaining-log"
            checked={useLog}
            disabled={unit === "percent"}
            onCheckedChange={onLogChange}
          />
          <Label htmlFor="remaining-log" className="font-normal">
            {tr.logScale}
          </Label>
        </div>
      </div>

      {missing > 0 && (
        <p className="text-sm text-muted-foreground">{missingText}</p>
      )}
    </div>
  );
}
