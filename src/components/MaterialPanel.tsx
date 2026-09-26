import { ArrowUpRight, History, Printer, Scale } from "lucide-react";
import { useNavigate } from "react-router";
import { gebindePath, printsForPath } from "@/const";
import type { ResolvedAppearance } from "@contracts/appearance";
import { consumptionTrend, materialHistory } from "@contracts/materials";
import { HistoryChart } from "@/components/HistoryChart";
import { ProductGebindeList } from "@/components/ProductGebindeList";
import { Spool } from "@/components/Spool";
import { TileLabel } from "@/components/StockTiles";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveScope } from "@/lib/activeScope";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import { describeTrend } from "@/lib/trend";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { MaterialOverview } from "@/types";

/**
 * Das Detail neben dem Regal: die gewählte Spule groß, Restmenge, Tendenz,
 * die drei Kennzahlen, die beiden Handgriffe und der Verlauf als Kurve.
 *
 * Die Zeile aus der Übersicht steht sofort; der Verlauf kommt mit
 * `material.byId` nach – dieselbe Abfrage wie die Detailseite, also warm, wenn
 * man dorthin weitergeht. Löschen und Bearbeiten bleiben der Seite vorbehalten:
 * Ein Panel, das nebenbei löscht, ist ein Panel, in dem nebenbei gelöscht wird.
 */

/** Wie viele Verlaufseinträge das Panel zeigt, bevor es auf die Seite verweist */
const HISTORY_PREVIEW = 4;

export function MaterialPanel({
  material,
  appearance,
  onWeigh,
  onConsume,
  onPickGebinde,
  className,
}: {
  material: MaterialOverview | null;
  appearance: (ResolvedAppearance & { label: string }) | null;
  /** Fehlen unterhalb der Stufe `weigher` – dann entfallen die Knöpfe. */
  onWeigh?: (m: MaterialOverview) => void;
  onConsume?: (m: MaterialOverview) => void;
  /** Ein anderes Gebinde desselben Materials gewählt */
  onPickGebinde?: (gebindeId: number) => void;
  className?: string;
}) {
  const t = useT();

  return (
    <aside
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs",
        className
      )}
      aria-live="polite"
    >
      {material && appearance ? (
        <PanelContent
          material={material}
          appearance={appearance}
          onWeigh={onWeigh}
          onConsume={onConsume}
          onPickGebinde={onPickGebinde}
        />
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {t.home.noSelection}
        </p>
      )}
    </aside>
  );
}

function PanelContent({
  material,
  appearance,
  onWeigh,
  onConsume,
  onPickGebinde,
}: {
  material: MaterialOverview;
  appearance: ResolvedAppearance & { label: string };
  onWeigh?: (m: MaterialOverview) => void;
  onConsume?: (m: MaterialOverview) => void;
  onPickGebinde?: (gebindeId: number) => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const scope = useActiveScope();
  const {
    formatDate,
    formatDateTime,
    formatGrams,
    formatMoney,
    formatSecondary,
  } = useFormat();
  const { data: detail } = trpc.material.byId.useQuery({
    ...scope,
    id: material.id,
  });

  const history = detail
    ? materialHistory({
        weighings: detail.weighings,
        consumptions: detail.consumptions,
        tareWeight: detail.tareWeight,
        nominalWeight: detail.nominalWeight,
      })
    : null;
  const trend = history ? consumptionTrend({ history }) : null;
  const consumed = Math.max(
    0,
    material.nominalWeight - material.remainingWeight
  );
  const remainingValue =
    material.priceCents != null && material.nominalWeight > 0
      ? formatMoney(
          Math.round(
            (material.priceCents * material.remainingWeight) /
              material.nominalWeight
          )
        )
      : t.common.none;

  return (
    <>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-foreground/8 px-1.5 py-0.5 font-mono text-[11px] font-semibold">
            {material.identifier ?? "–"}
          </span>
          <TileLabel>
            {material.materialType}
            {material.storageBox && ` · ${material.storageBox.name}`}
          </TileLabel>
        </div>
        <h2 className="text-xl font-extrabold leading-tight tracking-tight wrap-break-word">
          {material.name}
        </h2>
        <span className="text-xs text-muted-foreground">
          {[material.manufacturer, material.color, material.containerLabel]
            .filter(Boolean)
            .join(" · ") || t.common.none}
        </span>
        {(material.priceCents != null || material.purchaseDate) && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {[
              material.priceCents != null
                ? formatMoney(material.priceCents)
                : null,
              material.purchaseDate
                ? t.materialDetail.purchasedOn({
                    date: formatDate(material.purchaseDate),
                  })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </div>

      <div className="flex items-center justify-center gap-5">
        <Spool
          size={140}
          hex={appearance.hex}
          kind={appearance.kind}
          percent={material.remainingPercent}
          label={appearance.label}
          showPercent
        />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-mono text-3xl font-semibold leading-none tabular-nums">
            {formatGrams(material.remainingWeight)}
          </span>
          <span className="text-xs text-muted-foreground">
            {t.materialDetail.ofNominal({
              amount: formatGrams(material.nominalWeight),
            })}
            {material.secondary &&
              ` · ${t.lager.approx({ value: formatSecondary(material.secondary) })}`}
          </span>
        </div>
      </div>

      <div className="text-center text-xs text-muted-foreground">
        {history == null ? (
          <Skeleton className="mx-auto h-3 w-48" />
        ) : (
          describeTrend(trend, t, formatGrams)
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 border-y py-3">
        <Stat label={t.materialDetail.consumed} value={formatGrams(consumed)} />
        <Stat
          label={t.materialDetail.tareTotal}
          value={formatGrams(material.tareWeight)}
        />
        <Stat label={t.materialDetail.remainingValue} value={remainingValue} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {onWeigh && (
          <Button className="h-10" onClick={() => onWeigh(material)}>
            <Scale className="mr-2 h-4 w-4" /> {t.nav.weigh}
          </Button>
        )}
        {onConsume && (
          <Button
            variant="outline"
            className="h-10"
            onClick={() => onConsume(material)}
          >
            <Printer className="mr-2 h-4 w-4" /> {t.nav.consume}
          </Button>
        )}
        <Button
          variant="ghost"
          className="h-9 text-muted-foreground"
          onClick={() => navigate(gebindePath(material.id))}
        >
          {t.home.details} <ArrowUpRight className="ml-1 h-4 w-4" />
        </Button>
        {/* Nur ein Link und keine eigene Liste: Das Panel wechselt mit jedem
            Klick ins Regal, eine Abfrage je Auswahl wäre Last ohne Blick. */}
        <Button
          variant="ghost"
          className="h-9 text-muted-foreground"
          onClick={() =>
            navigate(printsForPath({ productId: material.productId }))
          }
        >
          <History className="mr-1 h-4 w-4" /> {t.prints.panelLink}
        </Button>
      </div>

      {history == null ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : (
        <div className="flex flex-col gap-3">
          <HistoryChart
            history={history}
            nominalWeight={material.nominalWeight}
          />
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t.materialDetail.noHistory}
            </p>
          ) : (
            <ul className="flex flex-col">
              {history.slice(0, HISTORY_PREVIEW).map(entry => (
                <li
                  key={`${entry.kind}-${entry.id}`}
                  className="grid grid-cols-[1fr_auto] gap-x-3 border-b py-1.5 text-xs last:border-b-0"
                >
                  <span className="min-w-0 truncate">
                    <b className="font-semibold">
                      {entry.kind === "weighing"
                        ? t.materialDetail.entryWeighing
                        : t.materialDetail.entryConsumption}
                    </b>
                    {" · "}
                    {entry.kind === "weighing"
                      ? t.materialDetail.lastWeighingGross({
                          amount: formatGrams(entry.grossWeight),
                        })
                      : `− ${formatGrams(entry.weight)}`}
                    {entry.note && ` · ${entry.note}`}
                  </span>
                  <span className="font-mono font-semibold tabular-nums">
                    {formatGrams(entry.remainingAfter)}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {formatDateTime(entry.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {history.length > HISTORY_PREVIEW && (
            <button
              type="button"
              className="self-start text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => navigate(gebindePath(material.id))}
            >
              {t.materialDetail.fullHistory}
            </button>
          )}
        </div>
      )}

      {/*
        Die übrigen Gebinde desselben Materials, über alle Lager – der Grund,
        warum die fast leere Rolle hier nicht warnt, wenn eine volle danebenliegt.
      */}
      <div className="border-t pt-3">
        <ProductGebindeList
          productId={material.productId}
          currentId={material.id}
          compact
          onPick={onPickGebinde}
        />
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate font-mono text-sm font-semibold tabular-nums">
        {value}
      </span>
      <span className="truncate text-[11px] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
