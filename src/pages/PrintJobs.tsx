import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { History, Plus, Search, X } from "lucide-react";
import {
  PRINT_JOB_SEARCH_MIN_LENGTH,
  PRINT_JOB_STATUSES,
  type PrintJobStatus,
} from "@contracts/printJobs";
import { roleAllows } from "@contracts/organizations";
import AuthLayout from "@/components/AuthLayout";
import { PageHeader } from "@/components/PageHeader";
import { PrintJobCard } from "@/components/PrintJobCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounced } from "@/hooks/useDebounced";
import { useActiveScope, useScopeRole } from "@/lib/activeScope";
import { useT } from "@/lib/i18nContext";
import { quickActions } from "@/lib/quickActions";
import { trpc } from "@/lib/trpc";

/** „Alle“ im Select – Radix erlaubt keinen leeren Wert */
const ANY = "__any";

/** `YYYY-MM-DD` aus einem Datumsfeld → Anfang bzw. Ende des Tages, Ortszeit */
function dayBound(value: string | null, end: boolean): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00"}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function positiveInt(value: string | null): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * Druckhistorie (seit 4.2.0). Anders als die Gebindeliste wächst sie ohne
 * Grenze – gesucht und gefiltert wird deshalb auf dem Server, geladen
 * seitenweise. Die Filter stehen in der Adresse: So ist „alle Drucke mit
 * diesem Material“ ein gewöhnlicher Link von der Material-Seite.
 */
export default function PrintJobs() {
  const t = useT();
  const scope = useActiveScope();
  const role = useScopeRole();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const debounced = useDebounced(search.trim(), 300);

  const productId = positiveInt(params.get("material"));
  const materialId = positiveInt(params.get("gebinde"));
  const statusParam = params.get("status");
  const status = PRINT_JOB_STATUSES.includes(statusParam as PrintJobStatus)
    ? (statusParam as PrintJobStatus)
    : undefined;
  const printer = params.get("drucker") ?? undefined;
  const tag = params.get("tag") ?? undefined;
  const from = params.get("von");
  const to = params.get("bis");

  const setParam = (key: string, value: string | null) => {
    setParams(
      current => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true }
    );
  };

  const query =
    debounced.length >= PRINT_JOB_SEARCH_MIN_LENGTH ? debounced : undefined;
  const filters = {
    ...scope,
    query,
    productId,
    materialId,
    status,
    printer,
    tag,
    from: dayBound(from, false),
    to: dayBound(to, true),
  };

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.print.list.useInfiniteQuery(filters, {
      getNextPageParam: last => last.nextCursor ?? undefined,
    });
  const items = useMemo(
    () => data?.pages.flatMap(page => page.items) ?? [],
    [data]
  );

  const { data: facets } = trpc.print.facets.useQuery(scope);
  const { data: products } = trpc.product.list.useQuery(scope);
  const { data: allMaterials } = trpc.material.list.useQuery(scope, {
    enabled: materialId != null,
  });
  const gebinde = allMaterials?.find(m => m.id === materialId);

  const activeCount = [
    productId,
    materialId,
    status,
    printer,
    tag,
    from,
    to,
  ].filter(value => value != null && value !== "").length;
  const reset = () => {
    setSearch("");
    setParams(new URLSearchParams(), { replace: true });
  };

  const tooShort =
    debounced.length > 0 && debounced.length < PRINT_JOB_SEARCH_MIN_LENGTH;

  return (
    <AuthLayout>
      <div className="flex flex-col gap-4 sm:gap-6">
        <PageHeader
          title={t.prints.title}
          description={t.prints.description}
          actions={
            roleAllows(role, "weigher") && (
              <Button
                className="flex-1 sm:flex-none"
                onClick={() =>
                  quickActions.openPrintJobForm(
                    productId != null || gebinde
                      ? {
                          productId: gebinde?.productId ?? productId!,
                          // Von einem aufgebrauchten Gebinde bucht niemand ab
                          materialId:
                            gebinde && !gebinde.archivedAt ? gebinde.id : null,
                        }
                      : null
                  )
                }
              >
                <Plus className="mr-2 h-4 w-4" /> {t.prints.add}
              </Button>
            )
          }
        />

        <div className="flex flex-col gap-3">
          <div className="relative md:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 pl-9"
              placeholder={t.prints.searchPlaceholder}
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setParam("q", e.target.value.trim() || null);
              }}
              aria-label={t.prints.searchPlaceholder}
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setParam("q", null);
                }}
                aria-label={t.home.clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {tooShort && (
            <p className="text-xs text-muted-foreground">
              {t.prints.searchTooShort}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <FilterSelect
              label={t.prints.form.statusLabel}
              value={status}
              anyLabel={t.prints.filterAllStatus}
              options={PRINT_JOB_STATUSES.map(value => ({
                value,
                label: t.prints.status[value],
              }))}
              onChange={value => setParam("status", value)}
            />
            <FilterSelect
              label={t.prints.materialsTitle}
              value={productId != null ? String(productId) : undefined}
              anyLabel={t.prints.filterAllMaterials}
              options={(products ?? []).map(p => ({
                value: String(p.id),
                label: p.name,
              }))}
              onChange={value => setParam("material", value)}
            />
            <FilterSelect
              label={t.prints.printer}
              value={printer}
              anyLabel={t.prints.filterAllPrinters}
              options={(facets?.printers ?? []).map(value => ({
                value,
                label: value,
              }))}
              onChange={value => setParam("drucker", value)}
            />
            <FilterSelect
              label={t.prints.tags}
              value={tag}
              anyLabel={t.prints.filterAllTags}
              options={(facets?.tags ?? []).map(value => ({
                value,
                label: `#${value}`,
              }))}
              onChange={value => setParam("tag", value)}
            />
            <div className="grid gap-1">
              <Label htmlFor="pj-from" className="text-xs">
                {t.prints.filterFrom}
              </Label>
              <Input
                id="pj-from"
                type="date"
                value={from ?? ""}
                onChange={e => setParam("von", e.target.value || null)}
                className="h-9"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="pj-to" className="text-xs">
                {t.prints.filterTo}
              </Label>
              <Input
                id="pj-to"
                type="date"
                value={to ?? ""}
                onChange={e => setParam("bis", e.target.value || null)}
                className="h-9"
              />
            </div>
          </div>

          {(materialId != null || activeCount > 0 || search) && (
            <div className="flex flex-wrap items-center gap-2">
              {materialId != null && (
                <Badge variant="secondary" className="gap-1">
                  {t.prints.filterGebinde({
                    name:
                      gebinde?.identifier ?? gebinde?.name ?? `#${materialId}`,
                  })}
                  <button
                    type="button"
                    onClick={() => setParam("gebinde", null)}
                    aria-label={t.prints.resetFilters}
                    className="rounded-full hover:bg-accent"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              <Button variant="ghost" size="sm" onClick={reset}>
                {t.prints.resetFilters}
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map(i => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
            <History className="h-8 w-8 text-muted-foreground" />
            {activeCount > 0 || query ? (
              <p className="font-medium">{t.prints.emptyFiltered}</p>
            ) : (
              <>
                <p className="font-medium">{t.prints.empty}</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  {t.prints.emptyHint}
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map(job => (
                <PrintJobCard key={job.id} job={job} />
              ))}
            </div>
            {hasNextPage && (
              <Button
                variant="outline"
                className="self-center"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? t.common.loading : t.prints.loadMore}
              </Button>
            )}
          </>
        )}
      </div>
    </AuthLayout>
  );
}

function FilterSelect({
  label,
  value,
  anyLabel,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  anyLabel: string;
  options: { value: string; label: string }[];
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <Label className="text-xs">{label}</Label>
      <Select
        value={value ?? ANY}
        onValueChange={next => onChange(next === ANY ? null : next)}
      >
        <SelectTrigger className="h-9 w-full min-w-0" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{anyLabel}</SelectItem>
          {/* Ein Wert aus der Adresse, den die Liste (noch) nicht kennt,
              bleibt wählbar – sonst zeigte das Feld leer, obwohl gefiltert
              wird. */}
          {value != null && !options.some(o => o.value === value) && (
            <SelectItem value={value}>{value}</SelectItem>
          )}
          {options.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
