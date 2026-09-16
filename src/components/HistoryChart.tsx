import { useMemo, useRef, useState } from "react";
import type { MaterialHistoryEntry } from "@contracts/materials";
import { useElementWidth } from "@/hooks/useElementWidth";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import { cn } from "@/lib/utils";

/**
 * Die Restmenge über die Zeit: eine Linie durch alle Einträge des Verlaufs,
 * Wägungen als Punkte, Verbräuche als Knicke dazwischen.
 *
 * Bewusst **eine** Reihe in **einer** Farbe (`--series`): Es gibt nichts zu
 * unterscheiden, also braucht es keine Legende – nur den Hinweis, welche
 * Punkte Wägungen sind. Die Hilfslinien liegen bei 0, der halben und der
 * ganzen Nennmenge, damit die Kurve an derselben Skala hängt wie jeder
 * Füllbalken.
 *
 * Gezeichnet wird in Pixeln (`useElementWidth`), nicht über eine skalierende
 * `viewBox`: Linie und Punkte sollen auf dem Telefon so dick sein wie auf dem
 * großen Schirm.
 */

const HEIGHT = 84;
const PAD_TOP = 8;
const PAD_BOTTOM = 8;
/** Platz rechts für die Beschriftung der Hilfslinien */
const PAD_RIGHT = 52;
const MARKER_RADIUS = 4;

export function HistoryChart({
  history,
  nominalWeight,
  className,
}: {
  /** Neueste zuerst, wie `materialHistory` sie liefert */
  history: readonly MaterialHistoryEntry[];
  nominalWeight: number;
  className?: string;
}) {
  const t = useT();
  const { formatDate, formatGrams } = useFormat();
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);
  const [hover, setHover] = useState<number | null>(null);

  const points = useMemo(() => {
    const entries = [...history].reverse();
    const plotWidth = Math.max(0, width - PAD_RIGHT);
    const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const top = Math.max(
      nominalWeight,
      ...entries.map(entry => entry.remainingAfter),
      1
    );
    const first = entries[0]?.at.getTime() ?? 0;
    const last = entries[entries.length - 1]?.at.getTime() ?? 0;
    const span = Math.max(1, last - first);
    return {
      top,
      plotWidth,
      list: entries.map(entry => ({
        entry,
        x:
          entries.length === 1
            ? plotWidth
            : ((entry.at.getTime() - first) / span) * plotWidth,
        y: PAD_TOP + (1 - entry.remainingAfter / top) * plotHeight,
      })),
      // Hilfslinien: 0, halbe und ganze Nennmenge
      grid: [0, 0.5, 1].map(fraction => ({
        grams: nominalWeight * fraction,
        y: PAD_TOP + (1 - (nominalWeight * fraction) / top) * plotHeight,
      })),
    };
  }, [history, nominalWeight, width]);

  if (history.length < 2) return null;

  const linePath = points.list
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${points.plotWidth.toFixed(1)} ${HEIGHT - PAD_BOTTOM} L0 ${HEIGHT - PAD_BOTTOM} Z`;
  const active = hover != null ? points.list[hover] : null;

  /** Der Punkt, dessen x der Zeigerposition am nächsten liegt */
  const pick = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clientX - rect.left;
    let best = 0;
    points.list.forEach((p, i) => {
      if (Math.abs(p.x - x) < Math.abs(points.list[best].x - x)) best = i;
    });
    setHover(best);
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono uppercase tracking-[0.14em]">
          {t.materialDetail.chartTitle}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2 rounded-full border-2 border-series"
          />
          {t.materialDetail.entryWeighing}
        </span>
      </div>
      <div
        ref={containerRef}
        className="relative w-full touch-none"
        style={{ height: HEIGHT }}
        onPointerMove={e => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            aria-hidden="true"
            className="block overflow-visible"
          >
            {points.grid.map(line => (
              <g key={line.grams}>
                <line
                  x1="0"
                  x2={points.plotWidth}
                  y1={line.y}
                  y2={line.y}
                  className="stroke-border"
                />
                <text
                  x={width}
                  y={line.y + 3}
                  textAnchor="end"
                  className="fill-muted-foreground font-mono text-[9.5px]"
                >
                  {formatGrams(line.grams)}
                </text>
              </g>
            ))}
            <path d={areaPath} className="fill-series/10" />
            <path
              d={linePath}
              fill="none"
              strokeWidth="2"
              strokeLinejoin="round"
              className="stroke-series"
            />
            {active && (
              <line
                x1={active.x}
                x2={active.x}
                y1={PAD_TOP - 4}
                y2={HEIGHT - PAD_BOTTOM}
                strokeDasharray="3 3"
                className="stroke-muted-foreground/60"
              />
            )}
            {points.list.map((p, i) =>
              p.entry.kind === "weighing" || i === hover ? (
                <circle
                  key={`${p.entry.kind}-${p.entry.id}`}
                  cx={p.x}
                  cy={p.y}
                  r={i === hover ? MARKER_RADIUS + 1 : MARKER_RADIUS}
                  strokeWidth="2"
                  className={cn(
                    i === hover
                      ? "fill-series stroke-card"
                      : "fill-card stroke-series"
                  )}
                />
              ) : null
            )}
          </svg>
        )}
        {active && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-md border bg-popover px-2 py-1 text-xs shadow-md"
            style={{
              // Links vom Punkt, sobald es rechts eng wird
              left: Math.min(active.x + 8, Math.max(0, width - 150)),
            }}
          >
            <div className="font-mono text-[10.5px] text-muted-foreground">
              {formatDate(active.entry.at)} ·{" "}
              {active.entry.kind === "weighing"
                ? t.materialDetail.entryWeighing
                : t.materialDetail.entryConsumption}
            </div>
            <div className="font-mono font-semibold tabular-nums">
              {formatGrams(active.entry.remainingAfter)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
