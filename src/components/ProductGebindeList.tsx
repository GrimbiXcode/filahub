import { ArrowUpRight, Plus, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { roleAllows } from "@contracts/organizations";
import { PrintSettingsSummary } from "@/components/PrintSettings";
import { Spool } from "@/components/Spool";
import { TileLabel } from "@/components/StockTiles";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { gebindePath, materialPath } from "@/const";
import { useActiveScope, useScopeRole } from "@/lib/activeScope";
import { useAppearanceResolver, useSwatchLabel } from "@/lib/appearance";
import { fillLevelTextColor } from "@/lib/format";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import { useQuickActions } from "@/lib/quickActions";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

/**
 * Die Gebinde eines Materials – „Weitere Rollen von diesem Material“ – samt
 * Bestand und geltender Warnschwelle.
 *
 * Steht im Panel neben dem Regal, auf der Seite eines Gebindes und auf der
 * Seite des Materials. Die Liste kommt aus `product.byId` und umfasst **alle**
 * Gebinde über alle Lager: Die Übersicht zeigt nur das gewählte Lager, und
 * gerade die Rolle im anderen Lager ist die, nach der man hier sucht.
 */
export function ProductGebindeList({
  productId,
  currentId,
  compact = false,
  showMaterialLink = true,
  showPrintSummary = true,
  onPick,
}: {
  productId: number;
  /** Das Gebinde, von dem aus man schaut – markiert statt verlinkt */
  currentId?: number;
  /** Im Panel: kleinere Spulen, nur die Liste */
  compact?: boolean;
  /** Der Verweis auf die Seite des Materials – dort selbst überflüssig */
  showMaterialLink?: boolean;
  /** Die kompakte Zeile der Druckeinstellungen – auf der Material-Seite steht die volle Karte */
  showPrintSummary?: boolean;
  /** Statt zur Seite des Gebindes zu springen, z. B. im Regal auswählen */
  onPick?: (gebindeId: number) => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const scope = useActiveScope();
  const role = useScopeRole();
  const { openAddGebinde } = useQuickActions();
  const { formatGrams } = useFormat();
  const [showArchived, setShowArchived] = useState(false);
  const resolveAppearance = useAppearanceResolver();
  const swatchLabel = useSwatchLabel();
  const { data: product } = trpc.product.byId.useQuery({
    ...scope,
    id: productId,
  });

  if (!product) return <Skeleton className="h-24 w-full rounded-lg" />;

  const appearance = resolveAppearance(product.color, product.texture);
  const label = swatchLabel(product.color, product.texture, appearance.hex);
  const { stock } = product;
  const isFilament = product.kind === "filament";
  const active = product.gebinde.filter(g => g.archivedAt == null);
  const archived = product.gebinde.filter(g => g.archivedAt != null);
  // Wer von einem aufgebrauchten Gebinde aus schaut, sieht die Liste offen
  const archivedOpen = showArchived || archived.some(g => g.id === currentId);

  const renderGebinde = (g: (typeof product.gebinde)[number]) => {
    const current = g.id === currentId;
    const content = (
      <>
        <Spool
          size={compact ? 28 : 36}
          hex={appearance.hex}
          kind={appearance.kind}
          percent={g.remainingPercent}
          label={label}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="rounded-md bg-foreground/8 px-1.5 py-0.5 font-mono text-[11px] font-semibold">
              {g.identifier ?? "–"}
            </span>
            {current && (
              <span className="text-[11px] text-muted-foreground">
                {t.product.thisOne}
              </span>
            )}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {[g.lager?.name, g.storageBox?.name].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span
          className={cn(
            "whitespace-nowrap font-mono text-xs font-semibold tabular-nums",
            fillLevelTextColor(g.remainingPercent)
          )}
        >
          {formatGrams(g.remainingWeight)}
        </span>
      </>
    );
    return (
      <li key={g.id}>
        {current ? (
          <div className="flex items-center gap-2.5 rounded-lg bg-foreground/5 px-2 py-1.5">
            {content}
          </div>
        ) : (
          <button
            type="button"
            onClick={() =>
              onPick ? onPick(g.id) : navigate(gebindePath(g.id))
            }
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            {content}
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <TileLabel>
          {isFilament
            ? t.product.otherSpools({ count: stock.count })
            : t.product.otherGebinde({ count: stock.count })}
        </TileLabel>
        {showMaterialLink && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-xs text-muted-foreground"
            onClick={() => navigate(materialPath(productId))}
          >
            {t.product.toMaterial} <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Bestand des Materials und die Schwelle, gegen die er geprüft wird */}
      <div
        className={cn(
          "flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-xs",
          stock.low && "border-destructive/40 bg-destructive/5"
        )}
      >
        {stock.low && (
          <TriangleAlert
            aria-hidden="true"
            className="size-3.5 self-center text-destructive"
          />
        )}
        <span className="font-mono text-sm font-semibold tabular-nums">
          {formatGrams(stock.totalRemaining)}
        </span>
        <span className="text-muted-foreground">
          {stock.low ? t.product.stockLow : t.product.stockOk}
        </span>
        {stock.threshold != null && (
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {stock.thresholdSource === "lager"
              ? t.product.thresholdLager({
                  amount: formatGrams(stock.threshold),
                })
              : t.product.thresholdDefault({
                  amount: formatGrams(stock.threshold),
                })}
          </span>
        )}
      </div>

      {showPrintSummary && (
        <PrintSettingsSummary stored={product.printSettings} />
      )}

      <ul className="flex flex-col gap-1">{active.map(renderGebinde)}</ul>

      {/*
        Aufgebrauchte Gebinde (seit 4.1.0) zählen nicht zum Bestand, bleiben
        aber erreichbar – ihr Verlauf ist nicht weg.
      */}
      {archived.length > 0 && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setShowArchived(v => !v)}
            aria-expanded={archivedOpen}
            className="self-start text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t.product.archivedToggle({ count: archived.length })}
          </button>
          {archivedOpen && (
            <ul className="flex flex-col gap-1 opacity-70">
              {archived.map(renderGebinde)}
            </ul>
          )}
        </div>
      )}

      {roleAllows(role, "editor") && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => openAddGebinde(productId)}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {isFilament ? t.product.addSpool : t.product.addGebinde}
        </Button>
      )}
    </div>
  );
}
