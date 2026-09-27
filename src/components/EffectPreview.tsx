import { useState } from "react";
import {
  availableConditions,
  displayUnder,
  type EffectCondition,
  type ResolvedColorSpec,
  type TextureKind,
} from "@contracts/appearance";
import { Spool } from "@/components/Spool";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useT } from "@/lib/i18nContext";
import { cn } from "@/lib/utils";

/**
 * Die große Spule samt Umschalter „Normal · UV · Wärme · Dunkel ·
 * Schwarzlicht“ (seit 4.8.0) – auf Gebinde- und Material-Seite. Der
 * Umschalter erscheint nur, wenn das Farbbild eine Wirkung mit Zielfarbe hat;
 * sonst ist es die gewohnte Spule. Rein zum Ansehen, nichts wird gespeichert.
 */
export function EffectPreview({
  hex,
  kinds,
  spec,
  percent,
  label,
  size,
  showPercent,
  className,
}: {
  hex: string | null;
  kinds: readonly TextureKind[];
  spec?: ResolvedColorSpec | null;
  percent: number | null;
  label: string;
  size?: number;
  showPercent?: boolean;
  className?: string;
}) {
  const t = useT();
  const conditions = availableConditions(spec);
  const [condition, setCondition] = useState<EffectCondition>("normal");
  // Wechselt das Farbbild (anderes Material), gilt eine fehlende Ansicht als normal.
  const active = conditions.includes(condition) ? condition : "normal";
  const shown = displayUnder(hex, spec, active);

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <Spool
        hex={shown.hex}
        kinds={kinds}
        spec={shown.spec}
        glow={shown.glow}
        effectsFrom={spec}
        percent={percent}
        label={label}
        size={size}
        showPercent={showPercent}
      />
      {conditions.length > 1 && (
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={active}
          onValueChange={value =>
            value && setCondition(value as EffectCondition)
          }
          aria-label={t.appearance.conditionsAria}
          className="flex-wrap justify-center"
        >
          {conditions.map(value => (
            <ToggleGroupItem key={value} value={value} className="px-2.5">
              {t.appearance.conditions[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </div>
  );
}
