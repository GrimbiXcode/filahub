import { useState } from "react";
import { useNavigate } from "react-router";
import { Cable, Check, Inbox, Printer, Scissors, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { roleAllows } from "@contracts/organizations";
import AuthLayout from "@/components/AuthLayout";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { CONNECTIONS_PATH, PRINTS_PATH, printImportPreviewUrl } from "@/const";
import { useActiveScope, useScopeRole } from "@/lib/activeScope";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import { quickActions } from "@/lib/quickActions";
import { trpc } from "@/lib/trpc";
import type { PrintImportEntry } from "@/types";

/**
 * Eingangsfach (seit 4.7.0): Was PrusaSlicer oder die Drucker-Brücke gemeldet
 * haben. „Übernehmen“ öffnet das gewöhnliche Druckformular, vorbelegt wie beim
 * G-Code-Import; erst das Speichern legt den Druck an und bucht ab.
 */
export default function PrintImports() {
  const t = useT();
  const scope = useActiveScope();
  const role = useScopeRole();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const canAct = roleAllows(role, "weigher");
  const { data: items, isLoading } = trpc.printImport.list.useQuery(scope, {
    refetchInterval: 30_000,
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const dismiss = trpc.printImport.dismiss.useMutation({
    onSuccess: ({ dismissed }) => {
      toast.success(t.printImports.dismissed({ count: dismissed }));
      setSelected(new Set());
      utils.printImport.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const list = items ?? [];
  const allSelected = list.length > 0 && list.every(i => selected.has(i.id));
  const toggle = (id: number) =>
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <AuthLayout>
      <div className="flex flex-col gap-4 sm:gap-6">
        <PageHeader
          title={t.printImports.title}
          description={t.printImports.description}
          backTo={PRINTS_PATH}
          actions={
            canAct &&
            selected.size > 0 && (
              <Button
                variant="outline"
                disabled={dismiss.isPending}
                onClick={() => dismiss.mutate({ ...scope, ids: [...selected] })}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                {t.printImports.dismissSelected({ count: selected.size })}
              </Button>
            )
          }
        />

        {isLoading ? (
          <div className="grid grid-cols-1 gap-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : list.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">{t.printImports.empty}</p>
              <p className="max-w-md text-sm text-muted-foreground">
                {t.printImports.emptyHint}
              </p>
              <Button
                variant="outline"
                onClick={() => navigate(CONNECTIONS_PATH)}
              >
                <Cable className="mr-1.5 h-4 w-4" />
                {t.printImports.toConnections}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {canAct && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={value =>
                    setSelected(
                      value === true ? new Set(list.map(i => i.id)) : new Set()
                    )
                  }
                />
                {t.printImports.selectAll}
              </label>
            )}
            {list.map(item => (
              <ImportCard
                key={item.id}
                item={item}
                canAct={canAct}
                selected={selected.has(item.id)}
                onToggle={() => toggle(item.id)}
                onTake={() =>
                  quickActions.openPrintJobForm({ importItem: item })
                }
                onDismiss={() => dismiss.mutate({ ...scope, ids: [item.id] })}
                dismissing={dismiss.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </AuthLayout>
  );
}

function ImportCard({
  item,
  canAct,
  selected,
  onToggle,
  onTake,
  onDismiss,
  dismissing,
}: {
  item: PrintImportEntry;
  canAct: boolean;
  selected: boolean;
  onToggle: () => void;
  onTake: () => void;
  onDismiss: () => void;
  dismissing: boolean;
}) {
  const t = useT();
  const { formatDateTime, formatGrams, formatPercent } = useFormat();
  const SourceIcon = item.source === "printer" ? Printer : Scissors;
  const meta = [
    formatDateTime(new Date(item.printedAt)),
    item.printer,
    item.durationMinutes != null
      ? `${Math.floor(item.durationMinutes / 60)} ${t.prints.form.hours} ${item.durationMinutes % 60} ${t.prints.form.minutes}`
      : null,
    item.tokenName ? t.printImports.via({ name: item.tokenName }) : null,
  ].filter(Boolean);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          {canAct && (
            <Checkbox
              className="mt-1"
              checked={selected}
              onCheckedChange={onToggle}
              aria-label={t.printImports.select({ title: item.title })}
            />
          )}
          {item.preview && (
            <img
              src={printImportPreviewUrl(item.id)}
              alt={t.printImports.previewAlt({ title: item.title })}
              title={t.printImports.previewHint}
              width={item.preview.width ?? undefined}
              height={item.preview.height ?? undefined}
              loading="lazy"
              onError={event => {
                event.currentTarget.hidden = true;
              }}
              className="h-16 w-16 shrink-0 rounded-md border bg-muted object-contain"
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium wrap-anywhere">{item.title}</span>
              <Badge
                variant="secondary"
                className="gap-1"
                title={t.printImports.sourceHint[item.source]}
              >
                <SourceIcon className="h-3 w-3" />
                {t.printImports.source[item.source]}
              </Badge>
              {item.status !== "success" && (
                <Badge variant="outline">{t.prints.status[item.status]}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground wrap-anywhere">
              {meta.join(" · ")}
            </p>
            {item.status !== "success" && item.progressPercent != null && (
              <p className="text-xs text-muted-foreground">
                {t.printImports.progress({
                  percent: formatPercent(item.progressPercent),
                })}
              </p>
            )}
          </div>
        </div>

        {item.filaments.length === 0 ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            {t.printImports.noGrams}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {item.filaments.map(filament => (
              <li
                key={filament.slot}
                className="flex max-w-full min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
              >
                {filament.colorHex && (
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border"
                    style={{ backgroundColor: filament.colorHex }}
                  />
                )}
                <span className="shrink-0 font-mono whitespace-nowrap">
                  {formatGrams(filament.grams)}
                </span>
                <span className="min-w-0 truncate text-muted-foreground">
                  {[
                    filament.filamentType,
                    filament.profileName ??
                      t.printImports.filament({ slot: filament.slot + 1 }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
            {item.gramsEstimated && (
              <li className="self-center text-xs text-muted-foreground">
                {t.printImports.estimated}
              </li>
            )}
          </ul>
        )}

        {canAct && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              disabled={dismissing}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t.printImports.dismiss}
            </Button>
            <Button size="sm" onClick={onTake}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              {t.printImports.take}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
