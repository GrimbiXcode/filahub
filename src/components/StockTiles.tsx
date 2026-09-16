import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import type { ResolvedAppearance } from "@contracts/appearance";
import { Spool } from "@/components/Spool";
import { fillLevelTextColor } from "@/lib/format";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import { cn } from "@/lib/utils";
import type { MaterialOverview } from "@/types";

/**
 * Die drei Kacheln über dem Regal: Restmenge mit Bestandsbalken, die knappen
 * Materialien als Mini-Spulen, Restwert und Drybox-Zähler.
 *
 * Der Bestandsbalken ist kein Diagramm mit Palette, sondern das Regal von der
 * Seite: jedes Material so breit wie seine Restmenge, in seiner **eigenen**
 * Farbe. Zwei schwarze Rollen nebeneinander trennt der Spalt, nicht der Ton.
 * Ohne Farbcode bleibt das Stück grau – geraten wird nicht (siehe
 * `AppearanceSwatch`).
 */

/** Ab wann ein Material als knapp gilt – dieselbe Grenze wie der Filter */
export const LOW_STOCK_PERCENT = 25;

export type StockStats = {
  count: number;
  totalRemaining: number;
  totalValue: number;
  lowStock: number;
  inBox: number;
};

export function StockTiles({
  materials,
  stats,
  appearanceFor,
  onlyLowStock,
  onToggleLowStock,
  onPick,
}: {
  /** Der ganze Bestand des Lagers, ungefiltert */
  materials: MaterialOverview[];
  stats: StockStats;
  appearanceFor: (
    m: MaterialOverview
  ) => ResolvedAppearance & { label: string };
  onlyLowStock: boolean;
  onToggleLowStock: () => void;
  /** Ein Material aus der Knapp-Kachel gewählt */
  onPick: (m: MaterialOverview) => void;
}) {
  const t = useT();
  const { formatGrams, formatMoney } = useFormat();

  const byWeight = [...materials].sort(
    (a, b) => b.remainingWeight - a.remainingWeight
  );
  const low = materials
    .filter(
      m => m.remainingPercent != null && m.remainingPercent <= LOW_STOCK_PERCENT
    )
    .sort((a, b) => (a.remainingPercent ?? 0) - (b.remainingPercent ?? 0))
    .slice(0, 3);

  return (
    <div className="grid gap-3 md:grid-cols-12 md:gap-4">
      <Tile className="gap-2 md:col-span-5">
        <TileLabel>
          {t.home.tileRemainingTitle} ·{" "}
          {t.home.groupCount({ count: stats.count })}
        </TileLabel>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-3xl font-semibold leading-none tabular-nums">
            {formatGrams(stats.totalRemaining)}
          </span>
          <span className="text-xs text-muted-foreground">
            {t.home.statRemainingHint}
          </span>
        </div>
        {byWeight.length > 0 && (
          <>
            <div
              className="mt-auto flex h-3 gap-0.5 overflow-hidden rounded"
              aria-hidden="true"
            >
              {byWeight.map(m => {
                const { hex } = appearanceFor(m);
                return (
                  <div
                    key={m.id}
                    title={`${m.identifier ?? m.name} · ${formatGrams(m.remainingWeight)}`}
                    className={cn(
                      "min-w-0.5 rounded-[2px] ring-1 ring-inset ring-foreground/10",
                      !hex && "bg-muted-foreground/40"
                    )}
                    style={{
                      flexGrow: Math.max(1, m.remainingWeight),
                      backgroundColor: hex ?? undefined,
                    }}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-muted-foreground">
              {byWeight.slice(0, 3).map(m => {
                const { hex } = appearanceFor(m);
                return (
                  <span key={m.id} className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-2.5 rounded-[2px] ring-1 ring-inset ring-foreground/15",
                        !hex && "bg-muted-foreground/40"
                      )}
                      style={{ backgroundColor: hex ?? undefined }}
                    />
                    <span className="font-mono">
                      {m.identifier ?? m.name} ·{" "}
                      {formatGrams(m.remainingWeight)}
                    </span>
                  </span>
                );
              })}
              {byWeight.length > 3 && (
                <span>
                  {t.home.moreMaterials({ count: byWeight.length - 3 })}
                </span>
              )}
            </div>
          </>
        )}
      </Tile>

      <Tile className="gap-2 md:col-span-4">
        <div className="flex items-center gap-2">
          <TileLabel>
            {t.home.tileLowTitle} ·{" "}
            {t.home.tileLowSub({ percent: LOW_STOCK_PERCENT })}
          </TileLabel>
          {/* Der Zähler ist zugleich der Schalter für „nur knappe“ – dieselbe
              Rolle, die bis 3.0 die Kennzahlkarte hatte. */}
          <button
            type="button"
            onClick={onToggleLowStock}
            disabled={stats.lowStock === 0}
            aria-pressed={onlyLowStock}
            className={cn(
              "ml-auto rounded-md px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors",
              "hover:bg-accent hover:text-foreground disabled:pointer-events-none",
              onlyLowStock &&
                "bg-foreground text-background hover:bg-foreground"
            )}
          >
            {t.home.tileLowOf({ count: stats.lowStock, total: stats.count })}
          </button>
        </div>
        {low.length === 0 ? (
          <p className="mt-auto text-sm text-muted-foreground">
            {t.home.statMaterialsOk}
          </p>
        ) : (
          <div className="mt-auto grid grid-cols-3 gap-2">
            {low.map(m => {
              const appearance = appearanceFor(m);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onPick(m)}
                  aria-label={t.home.selectNamed({ name: m.name })}
                  className="flex min-w-0 flex-col items-center gap-1 rounded-lg p-1 transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Spool
                    size={44}
                    hex={appearance.hex}
                    kind={appearance.kind}
                    percent={m.remainingPercent}
                    label={appearance.label}
                  />
                  <span className="rounded-md bg-foreground/8 px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                    {m.identifier ?? "–"}
                  </span>
                  <span className="flex items-center gap-1 font-mono text-[11px] font-semibold tabular-nums">
                    <TriangleAlert
                      aria-hidden="true"
                      className={cn(
                        "size-3",
                        fillLevelTextColor(m.remainingPercent)
                      )}
                    />
                    {formatGrams(m.remainingWeight)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Tile>

      <Tile className="justify-between gap-2 md:col-span-3">
        <div className="flex flex-col gap-1">
          <TileLabel>{t.home.tileValueTitle}</TileLabel>
          <span className="font-mono text-2xl font-semibold leading-none tabular-nums">
            {formatMoney(stats.totalValue)}
          </span>
          <span className="text-xs text-muted-foreground">
            {t.home.statValueHint}
          </span>
        </div>
        <div className="h-px bg-border" />
        <div className="flex items-baseline gap-2">
          <TileLabel>{t.home.tileInBoxTitle}</TileLabel>
          <span className="font-mono text-base font-semibold tabular-nums">
            {stats.inBox}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              / {stats.count}
            </span>
          </span>
        </div>
      </Tile>
    </div>
  );
}

function Tile({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-36 flex-col rounded-xl border bg-card p-4 shadow-xs md:p-[18px]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function TileLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </span>
  );
}
