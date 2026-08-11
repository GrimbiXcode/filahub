import { useMemo, useState, type ReactNode } from "react";
import { skipToken } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  Archive,
  ArrowDownUp,
  Boxes,
  ChevronDown,
  ChevronUp,
  Package,
  Plus,
  Scale,
  Search,
  SlidersHorizontal,
  Wallet,
  Weight,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { FRIEND_SEARCH_MIN_LENGTH } from "@contracts/friends";
import AuthLayout from "@/components/AuthLayout";
import { FriendMaterialList } from "@/components/FriendMaterialList";
import { PageHeader } from "@/components/PageHeader";
import { LAGER_PATH } from "@/const";
import { useQuickActions } from "@/lib/quickActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebounced } from "@/hooks/useDebounced";
import { useActiveLagerId } from "@/lib/activeLager";
import { fillLevelColor, fillLevelTextColor } from "@/lib/format";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { MaterialOverview } from "@/types";

const ALL = "__all__";
const NO_BOX = "none";
/** Ab hier gilt ein Material als „niedriger Bestand“ */
const LOW_STOCK_PERCENT = 25;

/** `label` ist der Schlüssel in `t.home`, nicht der fertige Text */
const SORT_OPTIONS = [
  { value: "identifier", label: "sortIdentifier" },
  { value: "name", label: "sortName" },
  { value: "percent", label: "sortPercent" },
  { value: "remaining", label: "sortRemaining" },
  { value: "purchase", label: "sortPurchase" },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]["value"];
type SortDir = "asc" | "desc";

/** Vergleich für die gewählte Sortierspalte; leere Werte immer ans Ende. */
function compareBy(
  key: SortKey,
  a: MaterialOverview,
  b: MaterialOverview
): number {
  const text = (x: string | null | undefined, y: string | null | undefined) => {
    if (!x && !y) return 0;
    if (!x) return 1;
    if (!y) return -1;
    return x.localeCompare(y);
  };
  switch (key) {
    case "identifier":
      return text(a.identifier, b.identifier);
    case "name":
      return text(a.name, b.name);
    case "percent":
      return (a.remainingPercent ?? -1) - (b.remainingPercent ?? -1);
    case "remaining":
      return a.remainingWeight - b.remainingWeight;
    case "purchase":
      return text(a.purchaseDate, b.purchaseDate);
  }
}

export default function Home() {
  const navigate = useNavigate();
  const { data: lagerList, isPending: lagerPending } =
    trpc.lager.list.useQuery();
  const activeLagerId = useActiveLagerId(lagerList);
  /*
    Auf das gewählte Lager eingeschränkt. Ohne Einschränkung käme der gesamte
    Bestand, und die Übersicht zeigte kurz alles – ein Aufblitzen, das nach einem
    Fehler aussieht.

    `skipToken` statt `enabled`, und das ist kein Geschmack: `{ lagerId:
    undefined }` und `{}` ergeben denselben Cache-Schlüssel, weil
    `JSON.stringify` Schlüssel mit `undefined` fallen lässt. Solange kein Lager
    feststand, las diese Abfrage deshalb den Eintrag der bewusst ungefilterten
    Abfrage mit – und die Übersicht zeigte fremde Lager samt ihrer Summen.
    `enabled` verhindert das Holen, nicht das Lesen.
  */
  const { data: materials, isPending: materialsPending } =
    trpc.material.list.useQuery(
      activeLagerId != null ? { lagerId: activeLagerId } : skipToken
    );
  /*
    Über die Kennung wird über **alle** Lager gesucht: Wer eine Kennung von einem
    Gebinde in der Hand abliest, weiß nicht, welcher Lager-Reiter gerade offen
    ist – und „nicht gefunden“ für etwas, das man in der Hand hält, ist die
    schlechteste Antwort. Die Schnellsuche tut dasselbe.
  */
  const { data: allMaterials } = trpc.material.list.useQuery({});
  /*
    Solange die Lagerliste noch unterwegs ist, ist „kein Material“ nicht wahr,
    sondern unbekannt. Eine abgeschaltete Abfrage meldet `isLoading === false`
    (`isPending && isFetching`), weshalb hier `isPending` steht – sonst zeigte die
    Seite bei jedem Kaltstart erst „Noch keine Materialien“ und danach die Liste.
  */
  const isLoading = lagerPending || (activeLagerId != null && materialsPending);
  const hasNoLager = !lagerPending && (lagerList ?? []).length === 0;
  const {
    formatDate,
    formatGrams,
    formatMoney,
    formatPercent,
    formatSecondary,
  } = useFormat();
  const { openMaterialForm, openWeighing } = useQuickActions();
  const t = useT();

  const [search, setSearch] = useState("");
  const [identifierLookup, setIdentifierLookup] = useState("");
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [manufacturerFilter, setManufacturerFilter] = useState(ALL);
  const [textureFilter, setTextureFilter] = useState(ALL);
  const [boxFilter, setBoxFilter] = useState(ALL);
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("identifier");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const materialTypes = useMemo(
    () => [...new Set((materials ?? []).map(m => m.materialType))].sort(),
    [materials]
  );
  const manufacturers = useMemo(
    () =>
      [
        ...new Set(
          (materials ?? [])
            .map(m => m.manufacturer)
            .filter((x): x is string => !!x)
        ),
      ].sort(),
    [materials]
  );
  const textures = useMemo(
    () =>
      [
        ...new Set(
          (materials ?? []).map(m => m.texture).filter((x): x is string => !!x)
        ),
      ].sort(),
    [materials]
  );

  const boxes = useMemo(() => {
    const map = new Map<number, string>();
    (materials ?? []).forEach(m => {
      if (m.storageBox) map.set(m.storageBox.id, m.storageBox.name);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [materials]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (materials ?? []).filter(m => {
      if (q) {
        const haystack = [
          m.name,
          m.identifier,
          m.materialType,
          m.manufacturer,
          m.color,
          m.texture,
          m.notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (typeFilter !== ALL && m.materialType !== typeFilter) return false;
      if (textureFilter !== ALL && m.texture !== textureFilter) return false;
      if (manufacturerFilter !== ALL && m.manufacturer !== manufacturerFilter)
        return false;
      if (boxFilter === NO_BOX && m.storageBoxId != null) return false;
      if (
        boxFilter !== ALL &&
        boxFilter !== NO_BOX &&
        m.storageBoxId !== Number(boxFilter)
      )
        return false;
      if (
        onlyLowStock &&
        (m.remainingPercent == null || m.remainingPercent > LOW_STOCK_PERCENT)
      )
        return false;
      return true;
    });
  }, [
    materials,
    search,
    typeFilter,
    textureFilter,
    manufacturerFilter,
    boxFilter,
    onlyLowStock,
  ]);

  const sorted = useMemo(() => {
    const factor = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => compareBy(sortKey, a, b) * factor);
  }, [filtered, sortKey, sortDir]);

  const stats = useMemo(() => {
    const list = materials ?? [];
    const totalRemaining = list.reduce((s, m) => s + m.remainingWeight, 0);
    const totalValue = list.reduce((s, m) => {
      if (m.priceCents == null || m.nominalWeight <= 0) return s;
      return (
        s + Math.round((m.priceCents * m.remainingWeight) / m.nominalWeight)
      );
    }, 0);
    const lowStock = list.filter(
      m => m.remainingPercent != null && m.remainingPercent <= LOW_STOCK_PERCENT
    ).length;
    const inBox = list.filter(m => m.storageBoxId != null).length;
    return { count: list.length, totalRemaining, totalValue, lowStock, inBox };
  }, [materials]);

  /** Aktive Filter als entfernbare Merkzettel über der Liste */
  const activeFilters: { key: string; label: string; clear: () => void }[] = [];
  if (search.trim())
    activeFilters.push({
      key: "search",
      label: t.home.filterSearch({ query: search.trim() }),
      clear: () => setSearch(""),
    });
  if (typeFilter !== ALL)
    activeFilters.push({
      key: "type",
      label: typeFilter,
      clear: () => setTypeFilter(ALL),
    });
  if (textureFilter !== ALL)
    activeFilters.push({
      key: "texture",
      label: textureFilter,
      clear: () => setTextureFilter(ALL),
    });
  if (manufacturerFilter !== ALL)
    activeFilters.push({
      key: "manufacturer",
      label: manufacturerFilter,
      clear: () => setManufacturerFilter(ALL),
    });
  if (boxFilter !== ALL)
    activeFilters.push({
      key: "box",
      label:
        boxFilter === NO_BOX
          ? t.home.noBox
          : (boxes.find(([id]) => String(id) === boxFilter)?.[1] ??
            t.home.storageBox),
      clear: () => setBoxFilter(ALL),
    });
  if (onlyLowStock)
    activeFilters.push({
      key: "low",
      label: t.home.filterLowStock({ percent: LOW_STOCK_PERCENT }),
      clear: () => setOnlyLowStock(false),
    });

  const resetFilters = () => {
    setSearch("");
    setTypeFilter(ALL);
    setTextureFilter(ALL);
    setManufacturerFilter(ALL);
    setBoxFilter(ALL);
    setOnlyLowStock(false);
  };

  /**
   * Schnellzugriff: Kennung eintippen und sofort wiegen. Erst exakt suchen,
   * danach als Teiltreffer – aber nur, wenn genau ein Material passt.
   */
  const quickWeigh = (event: React.FormEvent) => {
    event.preventDefault();
    const q = identifierLookup.trim().toLowerCase();
    if (!q) return;
    // Über alle Lager – siehe die Begründung an `allMaterials`.
    const list = allMaterials ?? [];
    const exact = list.find(m => m.identifier?.toLowerCase() === q);
    const candidates = exact
      ? [exact]
      : list.filter(
          m =>
            m.identifier?.toLowerCase().includes(q) ||
            m.name.toLowerCase().includes(q)
        );
    if (candidates.length === 1) {
      setIdentifierLookup("");
      openWeighing(candidates[0]);
      return;
    }
    toast.error(
      candidates.length === 0
        ? t.home.lookupNotFound({ query: identifierLookup.trim() })
        : t.home.lookupAmbiguous({ query: identifierLookup.trim() })
    );
  };

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(dir => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filterFields = (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
      <div className="grid gap-2">
        <Label htmlFor="f-type">{t.home.materialType}</Label>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger id="f-type">
            <SelectValue placeholder={t.home.materialType} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t.home.allMaterialTypes}</SelectItem>
            {materialTypes.map(t => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/*
        Nur zeigen, wenn im Bestand überhaupt Oberflächen erfasst sind – sonst
        wäre es ein Auswahlfeld mit einem einzigen Eintrag „Alle".
      */}
      {textures.length > 0 && (
        <div className="grid gap-2">
          <Label htmlFor="f-texture">{t.home.texture}</Label>
          <Select value={textureFilter} onValueChange={setTextureFilter}>
            <SelectTrigger id="f-texture">
              <SelectValue placeholder={t.home.texture} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t.home.allTextures}</SelectItem>
              {textures.map(value => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="f-manufacturer">{t.common.manufacturer}</Label>
        <Select
          value={manufacturerFilter}
          onValueChange={setManufacturerFilter}
        >
          <SelectTrigger id="f-manufacturer">
            <SelectValue placeholder={t.common.manufacturer} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t.home.allManufacturers}</SelectItem>
            {manufacturers.map(m => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="f-box">{t.home.storageBox}</Label>
        <Select value={boxFilter} onValueChange={setBoxFilter}>
          <SelectTrigger id="f-box">
            <SelectValue placeholder={t.home.storageBox} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t.home.allBoxes}</SelectItem>
            <SelectItem value={NO_BOX}>{t.home.noBox}</SelectItem>
            {boxes.map(([id, name]) => (
              <SelectItem key={id} value={String(id)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="f-sort">{t.home.sorting}</Label>
        <div className="flex gap-2">
          <Select
            value={sortKey}
            onValueChange={value => setSortKey(value as SortKey)}
          >
            <SelectTrigger id="f-sort" className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {t.home[option.label]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={sortDir === "asc" ? t.home.sortAsc : t.home.sortDesc}
            onClick={() => setSortDir(dir => (dir === "asc" ? "desc" : "asc"))}
          >
            {sortDir === "asc" ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2 md:col-span-4">
        <Label htmlFor="low-stock" className="font-normal">
          {t.home.onlyLowStock({ percent: LOW_STOCK_PERCENT })}
        </Label>
        <Switch
          id="low-stock"
          checked={onlyLowStock}
          onCheckedChange={setOnlyLowStock}
        />
      </div>
    </div>
  );

  return (
    <AuthLayout>
      <div className="flex flex-col gap-4 sm:gap-6">
        <PageHeader
          title={t.home.title}
          description={t.home.description}
          actions={
            <Button
              className="w-full sm:w-auto"
              onClick={() => openMaterialForm()}
            >
              <Plus className="mr-2 h-4 w-4" /> {t.home.newMaterial}
            </Button>
          }
        />

        {/* Schnellzugriff: Kennung vom Gebinde ablesen und sofort wiegen */}
        <Card>
          <CardContent className="p-3 sm:p-4">
            <form className="flex gap-2" onSubmit={quickWeigh}>
              <div className="relative min-w-0 flex-1">
                <Scale className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="identifier-lookup"
                  className="h-11 pl-9"
                  placeholder={t.home.lookupPlaceholder}
                  autoComplete="off"
                  value={identifierLookup}
                  onChange={e => setIdentifierLookup(e.target.value)}
                  aria-label={t.home.lookupAria}
                />
              </div>
              <Button type="submit" className="h-11 shrink-0">
                <Scale className="mr-2 h-4 w-4" /> {t.nav.weigh}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Kennzahlen – zwei Spalten auf dem Telefon, vier ab dem Laptop */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={<Package className="h-4 w-4" />}
            label={t.home.statMaterials}
            value={String(stats.count)}
            hint={
              stats.lowStock > 0
                ? t.home.statMaterialsLow({ count: stats.lowStock })
                : t.home.statMaterialsOk
            }
            highlight={stats.lowStock > 0}
            onClick={
              stats.lowStock > 0 ? () => setOnlyLowStock(v => !v) : undefined
            }
            active={onlyLowStock}
          />
          <StatCard
            icon={<Weight className="h-4 w-4" />}
            label={t.home.statRemaining}
            value={formatGrams(stats.totalRemaining)}
            hint={t.home.statRemainingHint}
          />
          <StatCard
            icon={<Wallet className="h-4 w-4" />}
            label={t.home.statValue}
            value={formatMoney(stats.totalValue)}
            hint={t.home.statValueHint}
          />
          <StatCard
            icon={<Archive className="h-4 w-4" />}
            label={t.home.statInBox}
            value={String(stats.inBox)}
            hint={t.home.statInBoxHint}
          />
        </div>

        {/* Suche und Filter */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 pl-9"
                placeholder={t.common.search}
                value={search}
                onChange={e => setSearch(e.target.value)}
                aria-label={t.home.searchAria}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label={t.home.clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {/* Auf dem Telefon liegen die Filter in einer Schublade, sonst
                bräuchte man vier Bildschirmhöhen bis zur Liste. */}
            <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="h-10 md:hidden">
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Filter
                  {activeFilters.length > 0 && (
                    <Badge className="ml-2 h-5 min-w-5 justify-center px-1">
                      {activeFilters.length}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="max-h-[85vh] overflow-y-auto rounded-t-xl p-4"
              >
                <SheetHeader className="p-0">
                  <SheetTitle>{t.home.filterSheetTitle}</SheetTitle>
                </SheetHeader>
                {filterFields}
                <div className="flex gap-2 pb-safe">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={resetFilters}
                    disabled={activeFilters.length === 0}
                  >
                    {t.home.reset}
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => setFilterSheetOpen(false)}
                  >
                    {t.home.showCount({ count: sorted.length })}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <div className="hidden md:block">
            <Card>
              <CardContent className="p-4">{filterFields}</CardContent>
            </Card>
          </div>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilters.map(filter => (
                <Badge
                  key={filter.key}
                  variant="secondary"
                  className="gap-1 py-1 pl-2.5 pr-1 font-normal"
                >
                  {filter.label}
                  <button
                    type="button"
                    onClick={filter.clear}
                    aria-label={t.home.removeFilter({ label: filter.label })}
                    className="rounded-full p-0.5 hover:bg-background/60"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                {t.home.resetAll}
              </Button>
            </div>
          )}
        </div>

        {/* Liste */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl md:h-12" />
            ))}
          </div>
        ) : hasNoLager ? (
          /*
            Ohne Lager gibt es nichts einzulagern, und „Erstes Material anlegen“
            führte ins Leere: Das Formular öffnete sich mit leerer Lagerauswahl
            und konnte nur mit „Material braucht ein Lager“ antworten. Ein neu
            angemeldetes Konto hat kein Lager – die Migration hat nur die damals
            bestehenden Konten versorgt –, also ist das der erste Bildschirm, den
            es sieht. `t.lager.noLagerTitle` gab es schon; verdrahtet war es nicht.
          */
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Boxes className="h-10 w-10 text-muted-foreground/50" />
              <p className="font-medium">{t.lager.noLagerTitle}</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {t.lager.noLagerDescription}
              </p>
              <Button onClick={() => navigate(LAGER_PATH)}>
                <Plus className="mr-2 h-4 w-4" />
                {t.lager.firstLager}
              </Button>
            </CardContent>
          </Card>
        ) : sorted.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Package className="h-10 w-10 text-muted-foreground/50" />
              <p className="font-medium">
                {(materials ?? []).length === 0
                  ? t.home.emptyTitle
                  : t.home.emptyFiltered}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {(materials ?? []).length === 0
                  ? t.home.emptyHint
                  : t.home.emptyFilteredHint}
              </p>
              {(materials ?? []).length === 0 ? (
                <Button onClick={() => openMaterialForm()}>
                  <Plus className="mr-2 h-4 w-4" /> Erstes Material anlegen
                </Button>
              ) : (
                <Button variant="outline" onClick={resetFilters}>
                  Filter zurücksetzen
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Telefon: Karten statt einer neunspaltigen Tabelle */}
            <div className="flex flex-col gap-3 md:hidden">
              <p className="text-xs text-muted-foreground">
                {sorted.length} von {stats.count} Materialien
              </p>
              {sorted.map(material => (
                <MaterialCard
                  key={material.id}
                  material={material}
                  onOpen={() => navigate(`/material/${material.id}`)}
                  onWeigh={() => openWeighing(material)}
                />
              ))}
            </div>

            {/* Ab dem Tablet: Tabelle mit sortierbaren Spaltenköpfen */}
            <Card className="hidden md:block">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead
                        label={t.home.colIdentifier}
                        sortKey="identifier"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={toggleSort}
                      />
                      <SortableHead
                        label={t.home.colMaterial}
                        sortKey="name"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={toggleSort}
                      />
                      <TableHead>{t.home.colType}</TableHead>
                      {/* Spalten fallen zuerst weg, die anderswo ohnehin
                          stehen – sonst rutscht die Aktionsspalte aus dem
                          Blick und „Wiegen“ ist nur noch scrollbar. */}
                      <TableHead className="hidden xl:table-cell">
                        {t.common.manufacturer}
                      </TableHead>
                      <SortableHead
                        label={t.home.colRemaining}
                        sortKey="percent"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={toggleSort}
                        className="min-w-[180px]"
                      />
                      <TableHead className="hidden 2xl:table-cell">
                        {t.home.colContainerBox}
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">
                        {t.common.price}
                      </TableHead>
                      <SortableHead
                        label={t.home.colPurchase}
                        sortKey="purchase"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={toggleSort}
                        className="hidden lg:table-cell"
                      />
                      <TableHead className="text-right">
                        {t.common.actions}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map(m => (
                      <TableRow
                        key={m.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/material/${m.id}`)}
                      >
                        <TableCell>
                          {m.identifier ? (
                            <Badge variant="outline" className="font-mono">
                              {m.identifier}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">–</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[260px]">
                          <div className="truncate font-medium">{m.name}</div>
                          {m.color && (
                            <div className="truncate text-xs text-muted-foreground">
                              {m.color}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{m.materialType}</Badge>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          {m.manufacturer ?? "–"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full ${fillLevelColor(m.remainingPercent)}`}
                                style={{ width: `${m.remainingPercent ?? 0}%` }}
                              />
                            </div>
                            <span
                              className={`whitespace-nowrap text-sm font-medium ${fillLevelTextColor(m.remainingPercent)}`}
                            >
                              {formatGrams(m.remainingWeight)}
                              {m.remainingPercent != null && (
                                <span className="font-normal text-muted-foreground">
                                  {" "}
                                  ({formatPercent(m.remainingPercent)})
                                </span>
                              )}
                              {/* Meter beim Filament, Liter beim Harz */}
                              {m.secondary && (
                                <span className="font-normal text-muted-foreground">
                                  {" · "}
                                  {t.lager.approx({
                                    value: formatSecondary(m.secondary),
                                  })}
                                </span>
                              )}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground 2xl:table-cell">
                          <div>{m.containerLabel ?? "–"}</div>
                          {m.storageBox && (
                            <div className="flex items-center gap-1 text-xs">
                              <Archive className="h-3 w-3" />{" "}
                              {m.storageBox.name}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {formatMoney(m.priceCents)}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {formatDate(m.purchaseDate)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div
                            className="flex justify-end gap-1"
                            onClick={e => e.stopPropagation()}
                          >
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openWeighing(m)}
                            >
                              <Scale className="mr-1 h-3.5 w-3.5" />{" "}
                              {t.nav.weigh}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        <FriendResults query={search} />
      </div>
    </AuthLayout>
  );
}

/**
 * Treffer im Lager der Freunde – ein eigener Abschnitt unter dem eigenen
 * Bestand.
 *
 * Die Suche läuft hier **serverseitig**, anders als beim eigenen Lager oben.
 * Das ist keine Inkonsequenz, sondern der Kern der Sichtbarkeitsstufe „nur in
 * der Suche“: Läge die Liste vollständig im Browser, wäre die Stufe mit einem
 * Blick in die Entwicklerwerkzeuge ausgehebelt. Deshalb wandert nur der
 * Suchbegriff hin und nur die Treffer zurück.
 *
 * Getrennt vom eigenen Bestand dargestellt, weil die Zeilen weniger Felder
 * haben (kein Preis, kein Kaufdatum, keine Box) und eine andere Aktion tragen.
 */
function FriendResults({ query }: { query: string }) {
  const t = useT();
  /*
    Der Anfragedialog hängt am Modul-Store und wird im Layout gerendert
    (`QuickActions`), nicht hier. Lokal gehalten verschwand er mitten im Tippen:
    Dieser Abschnitt gibt bei null Treffern `null` zurück, und ein Nachladen nach
    30 Sekunden Frische – etwa weil das Fenster wieder den Fokus bekam oder der
    Freund die Freigabe zurückgenommen hat – nahm den offenen Dialog samt der
    begonnenen Nachricht mit. `src/lib/quickActions.ts` hat `loanFor` genau
    deswegen aus einer Komponente herausgezogen.
  */
  const { openLoanRequest } = useQuickActions();
  const term = query.trim();
  const debounced = useDebounced(term, 300);
  const ready = debounced.length >= FRIEND_SEARCH_MIN_LENGTH;

  const { data, isFetching } = trpc.friend.searchMaterials.useQuery(
    { query: debounced },
    {
      enabled: ready,
      // Der Bestand eines Freundes ändert sich nicht im Sekundentakt.
      staleTime: 1000 * 30,
    }
  );

  /*
    Ohne Suchbegriff gibt es hier nichts zu zeigen, und wer keine Freunde hat
    (oder keine Treffer), soll keinen leeren Abschnitt vor sich haben. Der
    Abschnitt erscheint deshalb nur, wenn er etwas enthält.
  */
  const results = data ?? [];
  if (!ready) return null;
  if (!isFetching && results.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">{t.friends.searchTitle}</h2>
        {results.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {t.friends.searchCount({ count: results.length })}
          </span>
        )}
      </div>

      {results.length > 0 && (
        <FriendMaterialList
          materials={results}
          onAsk={openLoanRequest}
          showOwner
        />
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  highlight,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  highlight?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground sm:text-sm">
          {label}
        </span>
        <span
          className={cn(
            "text-muted-foreground",
            highlight && "text-orange-600 dark:text-orange-400"
          )}
        >
          {icon}
        </span>
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">
        {value}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          "rounded-xl border bg-card p-3 text-left shadow-xs transition-colors sm:p-4",
          "hover:bg-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
          active && "border-primary bg-accent"
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-3 shadow-xs sm:p-4">
      {content}
    </div>
  );
}

function SortableHead({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const t = useT();
  const isActive = sortKey === activeKey;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="-mx-1 flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t.home.sortBy({ label })}
      >
        {label}
        {isActive ? (
          dir === "asc" ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowDownUp className="h-3 w-3 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

function MaterialCard({
  material,
  onOpen,
  onWeigh,
}: {
  material: MaterialOverview;
  onOpen: () => void;
  onWeigh: () => void;
}) {
  const { formatGrams, formatPercent, formatSecondary } = useFormat();
  const t = useT();

  return (
    <div className="rounded-xl border bg-card shadow-xs">
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded-t-xl p-3 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {material.identifier && (
                <Badge variant="outline" className="font-mono text-xs">
                  {material.identifier}
                </Badge>
              )}
              <span className="truncate font-medium">{material.name}</span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {[material.materialType, material.manufacturer, material.color]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <span
            className={`shrink-0 text-sm font-semibold tabular-nums ${fillLevelTextColor(material.remainingPercent)}`}
          >
            {material.remainingPercent != null
              ? formatPercent(material.remainingPercent)
              : "–"}
          </span>
        </div>

        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full ${fillLevelColor(material.remainingPercent)}`}
            style={{ width: `${material.remainingPercent ?? 0}%` }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {t.home.remaining({
              amount: formatGrams(material.remainingWeight),
            })}
            {/* Meter beim Filament, Liter beim Harz – auf dem Telefon knapp */}
            {material.secondary && (
              <span className="font-normal text-muted-foreground">
                {" · "}
                {formatSecondary(material.secondary)}
              </span>
            )}
          </span>
          {material.storageBox && (
            <span className="flex min-w-0 items-center gap-1">
              <Archive className="h-3 w-3 shrink-0" />
              <span className="truncate">{material.storageBox.name}</span>
            </span>
          )}
        </div>
      </button>
      <div className="border-t p-2">
        <Button variant="ghost" className="h-10 w-full" onClick={onWeigh}>
          <Scale className="mr-2 h-4 w-4" /> {t.nav.weigh}
        </Button>
      </div>
    </div>
  );
}
