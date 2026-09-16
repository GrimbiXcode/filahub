import { Scale, TriangleAlert } from "lucide-react";
import type { ResolvedAppearance } from "@contracts/appearance";
import { Spool } from "@/components/Spool";
import { LOW_STOCK_PERCENT } from "@/components/StockTiles";
import { Button } from "@/components/ui/button";
import { fillLevelTextColor } from "@/lib/format";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import { cn } from "@/lib/utils";
import { type ShelfGroup } from "@/lib/shelf";
import type { MaterialOverview } from "@/types";

/**
 * Das Regal: die Materialien als Spulen, ein Brett je Drybox, „Ohne Box“
 * zuletzt.
 *
 * Die Gruppierung folgt dem, was im Raum steht – wer eine Rolle sucht, geht zur
 * Box. Sortierung und Filter der Seite gelten innerhalb der Bretter weiter;
 * ein Box-Filter lässt genau ein Brett übrig.
 */

export function MaterialShelf({
  groups,
  appearanceFor,
  selectedId,
  onPick,
  onWeigh,
}: {
  groups: ShelfGroup[];
  appearanceFor: (
    m: MaterialOverview
  ) => ResolvedAppearance & { label: string };
  selectedId: number | null;
  onPick: (m: MaterialOverview) => void;
  /** Fehlt unterhalb der Stufe `weigher` – dann entfällt der Knopf. */
  onWeigh?: (m: MaterialOverview) => void;
}) {
  const t = useT();
  const { formatGrams } = useFormat();

  return (
    <div className="flex flex-col gap-5">
      {groups.map(group => (
        <section key={group.key} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {group.name}
            </h2>
            <span className="text-xs text-muted-foreground/80">
              {t.home.groupCount({ count: group.items.length })}
              {group.tareWeight != null &&
                ` · ${t.home.groupTare({ amount: formatGrams(group.tareWeight) })}`}
            </span>
          </div>
          <div className="flex flex-wrap gap-3.5 px-1">
            {group.items.map(m => (
              <SpoolCard
                key={m.id}
                material={m}
                appearance={appearanceFor(m)}
                selected={m.id === selectedId}
                onPick={() => onPick(m)}
                onWeigh={onWeigh ? () => onWeigh(m) : undefined}
              />
            ))}
          </div>
          {/* Das Brett: ein flacher Steg mit Schatten darunter */}
          <div
            aria-hidden="true"
            className="h-1.5 rounded-full bg-gradient-to-b from-muted to-border shadow-md"
          />
        </section>
      ))}
    </div>
  );
}

/**
 * Eine Spule im Regal. Die Karte trägt einen Hauch ihrer eigenen Farbe – aus
 * dem Farbcode gemischt, nicht aus einer zweiten Palette. Ohne Farbcode bleibt
 * sie eine gewöhnliche Karte.
 */
function SpoolCard({
  material,
  appearance,
  selected,
  onPick,
  onWeigh,
}: {
  material: MaterialOverview;
  appearance: ResolvedAppearance & { label: string };
  selected: boolean;
  onPick: () => void;
  onWeigh?: () => void;
}) {
  const t = useT();
  const { formatGrams, formatPercent } = useFormat();
  const low =
    material.remainingPercent != null &&
    material.remainingPercent <= LOW_STOCK_PERCENT;
  const tint = appearance.hex
    ? `linear-gradient(180deg, color-mix(in oklch, ${appearance.hex} 28%, hsl(var(--card))), hsl(var(--card)) 75%)`
    : undefined;

  return (
    <div
      className={cn(
        "relative w-[150px] rounded-xl border bg-card shadow-xs transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:shadow-md",
        selected && "border-foreground ring-[3px] ring-foreground/10"
      )}
      style={{ background: tint }}
    >
      <button
        type="button"
        onClick={onPick}
        aria-pressed={selected}
        aria-label={t.home.selectNamed({ name: material.name })}
        className="flex w-full flex-col items-center gap-1 rounded-xl px-2 pb-3 pt-3 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Spool
          size={72}
          hex={appearance.hex}
          kind={appearance.kind}
          percent={material.remainingPercent}
          label={appearance.label}
        />
        <span className="max-w-[130px] truncate text-[12.5px] font-bold">
          {material.name}
        </span>
        <span
          className={cn(
            "flex items-center gap-1 font-mono text-[11px] tabular-nums",
            low ? "font-semibold text-foreground" : "text-muted-foreground"
          )}
        >
          {low && (
            <TriangleAlert
              aria-hidden="true"
              className={cn(
                "size-3",
                fillLevelTextColor(material.remainingPercent)
              )}
            />
          )}
          {formatGrams(material.remainingWeight)}
          {material.remainingPercent != null &&
            ` · ${formatPercent(material.remainingPercent)}`}
        </span>
        <span className="rounded-md bg-foreground/8 px-1.5 py-0.5 font-mono text-[11px] font-semibold">
          {material.identifier ?? "–"}
        </span>
      </button>
      {onWeigh && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1 size-8 rounded-lg text-muted-foreground hover:text-foreground"
          aria-label={t.home.weighNamed({ name: material.name })}
          onClick={onWeigh}
        >
          <Scale className="size-4" />
        </Button>
      )}
    </div>
  );
}
