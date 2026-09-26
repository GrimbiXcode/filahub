import { useEffect, useMemo, useState } from "react";
import { skipToken } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import {
  Archive,
  ArrowDownUp,
  Boxes,
  ChevronDown,
  ChevronUp,
  Combine,
  Columns3,
  LayoutGrid,
  List,
  Package,
  Plus,
  Printer,
  Scale,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { FRIEND_SEARCH_MIN_LENGTH } from "@contracts/friends";
import {
  TOGGLEABLE_MATERIAL_COLUMNS,
  type MaterialColumn,
} from "@contracts/materialColumns";
import { roleAllows } from "@contracts/organizations";
import { mergeCandidates, normalizeMaterialType } from "@contracts/materials";
import AuthLayout from "@/components/AuthLayout";
import { AppearanceSwatch } from "@/components/AppearanceSwatch";
import { FriendMaterialList } from "@/components/FriendMaterialList";
import { IdentifierLookup } from "@/components/IdentifierLookup";
import { MaterialPanel } from "@/components/MaterialPanel";
import { MaterialShelf } from "@/components/MaterialShelf";
import { PageHeader } from "@/components/PageHeader";
import { Spool } from "@/components/Spool";
import { StockTiles } from "@/components/StockTiles";
import { LAGER_PATH, gebindePath, materialPath } from "@/const";
import { useQuickActions } from "@/lib/quickActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDebounced } from "@/hooks/useDebounced";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useActiveLagerId } from "@/lib/activeLager";
import { groupByProduct, groupByStorageBox } from "@/lib/shelf";
import { fillLevelColor, fillLevelTextColor } from "@/lib/format";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import {
  MATERIAL_COLUMN_LABELS,
  useHiddenMaterialColumns,
} from "@/lib/materialColumns";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { MaterialOverview } from "@/types";
import { useActiveScope, useScopeRole } from "@/lib/activeScope";
import { useAppearanceResolver, useSwatchLabel } from "@/lib/appearance";
import type { ResolvedAppearance } from "@contracts/appearance";

const ALL = "__all__";
const NO_BOX = "none";

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

/**
 * Regal oder Liste. Das Regal ist seit 3.0 die Übersicht; die Liste bleibt
 * für alles, was Spalten braucht – sortieren, vergleichen, Preise sehen.
 * Die Wahl liegt im Browser: Sie ist eine Frage des Geräts und der Gewohnheit,
 * nicht des Kontos (anders als die Spaltenauswahl).
 */
type View = "shelf" | "list";
const VIEW_KEY = "home-view";

/**
 * Wonach das Regal Bretter bildet: nach Drybox (bis 3.1.0 die einzige Art)
 * oder nach Material – dann stehen die Rollen eines Materials nebeneinander.
 * Wie die Ansicht eine Frage des Geräts, also im Browser gespeichert.
 */
type ShelfGrouping = "box" | "product";
const SHELF_GROUPING_KEY = "home-shelf-grouping";

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
  const utils = trpc.useUtils();
  const scope = useActiveScope();
  const role = useScopeRole();
  const { data: lagerList, isPending: lagerPending } =
    trpc.lager.list.useQuery(scope);
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
  const { data: materialsOfLager, isPending: materialsPending } =
    trpc.material.list.useQuery(
      activeLagerId != null ? { ...scope, lagerId: activeLagerId } : skipToken
    );
  /*
    Aufgebrauchte Gebinde (seit 4.1.0) stehen nicht im Regal und nicht in den
    Summen. Die Liste liefert sie trotzdem mit, weil Formular und Import ihre
    Kennungen kennen müssen; gefiltert wird deshalb hier.
  */
  const materials = useMemo(
    () => materialsOfLager?.filter(m => m.archivedAt == null),
    [materialsOfLager]
  );
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
  const { openMaterialForm, openWeighing, openConsumption } = useQuickActions();
  const t = useT();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [manufacturerFilter, setManufacturerFilter] = useState(ALL);
  const [textureFilter, setTextureFilter] = useState(ALL);
  const [boxFilter, setBoxFilter] = useState(ALL);
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("identifier");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "shelf";
    } catch {
      return "shelf";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* Ohne Speicher gilt die Wahl für diese Seite – das reicht. */
    }
  }, [view]);
  /*
    Die gewählte Spule fürs Detail daneben. Das Panel gibt es erst ab `xl`;
    darunter öffnet ein Tipp die Detailseite – dasselbe wie in der Liste.
  */
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const hasPanel = useMediaQuery("(min-width: 1280px)");
  const [shelfGrouping, setShelfGrouping] = useState<ShelfGrouping>(() => {
    try {
      return localStorage.getItem(SHELF_GROUPING_KEY) === "product"
        ? "product"
        : "box";
    } catch {
      return "box";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SHELF_GROUPING_KEY, shelfGrouping);
    } catch {
      /* Ohne Speicher gilt die Wahl für diese Seite – das reicht. */
    }
  }, [shelfGrouping]);

  /*
    Spaltenauswahl. Sie blendet **zusätzlich** aus: Was hier an bleibt, kann
    weiterhin an einer Breakpoint-Klasse hängen und auf schmalen Fenstern von
    selbst verschwinden. Wer nichts einstellt, sieht deshalb genau das, was er
    vorher sah.
  */
  const hiddenColumns = useHiddenMaterialColumns();
  const showsColumn = (column: MaterialColumn) =>
    !hiddenColumns.includes(column);

  /*
    Der Katalog wird **einmal** für die Seite geholt und hier aufgelöst, nicht
    je Zeile: Er ist für alle Zeilen derselbe, und ein Hook je Material wären
    fünfzig Abonnements auf dieselbe Abfrage.
  */
  const resolveAppearance = useAppearanceResolver();
  const swatchLabel = useSwatchLabel();
  const appearanceFor = (
    m: MaterialOverview
  ): ResolvedAppearance & { label: string } => {
    const { hex, kind } = resolveAppearance(m.color, m.texture);
    return { hex, kind, label: swatchLabel(m.color, m.texture, hex) };
  };

  const updateSettings = trpc.auth.updateSettings.useMutation({
    /*
      Optimistisch, anders als in den Einstellungen: Dort sitzt die Änderung in
      einem `Select`, da fällt eine Roundtrip-Verzögerung nicht auf. Ein Haken,
      der erst nach der Antwort des Servers umspringt, fühlt sich kaputt an –
      und wer drei Spalten hintereinander umstellt, klickt schneller als das
      Netz.
    */
    onMutate: async ({ hiddenMaterialColumns }) => {
      if (hiddenMaterialColumns === undefined) return;
      await utils.auth.me.cancel();
      const previous = utils.auth.me.getData();
      utils.auth.me.setData(undefined, old =>
        old ? { ...old, hiddenMaterialColumns } : old
      );
      return { previous };
    },
    onError: (e, _input, context) => {
      if (context?.previous) utils.auth.me.setData(undefined, context.previous);
      toast.error(e.message);
    },
    onSettled: () => utils.auth.me.invalidate(),
  });

  const setColumnVisible = (column: MaterialColumn, visible: boolean) => {
    const next = visible
      ? hiddenColumns.filter(c => c !== column)
      : [...hiddenColumns, column];
    updateSettings.mutate({ hiddenMaterialColumns: next });
  };

  /*
    Je Vergleichsform ein Eintrag (`normalizeMaterialType`): Der Bestand führt
    seit 2.9.1 je Bereich nur noch eine Schreibweise, aber der Filter fragt
    nach derselben Gleichheit wie der Rest der App – nicht nach der Zeichenkette.
  */
  const materialTypes = useMemo(() => {
    const byKey = new Map<string, string>();
    (materials ?? []).forEach(m => {
      const key = normalizeMaterialType(m.materialType);
      if (!byKey.has(key)) byKey.set(key, m.materialType);
    });
    return [...byKey.values()].sort();
  }, [materials]);
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
    const typeKey =
      typeFilter === ALL ? null : normalizeMaterialType(typeFilter);
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
      if (typeKey !== null && normalizeMaterialType(m.materialType) !== typeKey)
        return false;
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
      // Knapp ist das Material über alle Gebinde und Lager (`productStock`)
      if (onlyLowStock && !m.stock.low) return false;
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

  const groups = useMemo(
    () =>
      shelfGrouping === "product"
        ? groupByProduct(sorted)
        : groupByStorageBox(sorted, t.home.noBox),
    [sorted, t, shelfGrouping]
  );

  /*
    Die gewählte Spule, sonst die erste der Liste: Ein leeres Panel neben einem
    vollen Regal wäre eine Aufforderung, erst einmal zu klicken.
  */
  const selected = useMemo(
    () => sorted.find(m => m.id === selectedId) ?? sorted[0] ?? null,
    [sorted, selectedId]
  );
  const pick = (m: MaterialOverview) => {
    if (hasPanel && view === "shelf") setSelectedId(m.id);
    else navigate(gebindePath(m.id));
  };

  const stats = useMemo(() => {
    const list = materials ?? [];
    const totalRemaining = list.reduce((s, m) => s + m.remainingWeight, 0);
    const totalValue = list.reduce((s, m) => {
      if (m.priceCents == null || m.nominalWeight <= 0) return s;
      return (
        s + Math.round((m.priceCents * m.remainingWeight) / m.nominalWeight)
      );
    }, 0);
    /*
      Gezählt werden Materialien, nicht Gebinde: Zwei knappe Rollen desselben
      Materials sind **eine** Warnung.
    */
    const products = new Set(list.map(m => m.productId));
    const lowStock = new Set(
      list.filter(m => m.stock.low).map(m => m.productId)
    ).size;
    const inBox = list.filter(m => m.storageBoxId != null).length;
    return {
      count: list.length,
      products: products.size,
      totalRemaining,
      totalValue,
      lowStock,
      inBox,
    };
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
      label: t.home.filterLowStock,
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

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(dir => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filterFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor="f-type">{t.home.materialType}</Label>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger id="f-type" className="w-full min-w-0">
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
            <SelectTrigger id="f-texture" className="w-full min-w-0">
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
          <SelectTrigger id="f-manufacturer" className="w-full min-w-0">
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
          <SelectTrigger id="f-box" className="w-full min-w-0">
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
            <SelectTrigger id="f-sort" className="min-w-0 flex-1">
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
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
        <Label htmlFor="low-stock" className="font-normal">
          {t.home.onlyLowStock}
        </Label>
        <Switch
          id="low-stock"
          checked={onlyLowStock}
          onCheckedChange={setOnlyLowStock}
        />
      </div>
    </div>
  );

  const filterBadge = activeFilters.length > 0 && (
    <Badge className="ml-2 h-5 min-w-5 justify-center px-1">
      {activeFilters.length}
    </Badge>
  );

  const showsPanel = view === "shelf";

  return (
    <AuthLayout fullWidth>
      <div className="flex flex-col gap-4 md:gap-5">
        {/*
          Schnellzugriff auf dem Telefon: Kennung ablesen und sofort wiegen. Ab
          dem Tablet steht das Feld in der Kopfzeile (`TopBar`).
        */}
        <IdentifierLookup className="md:hidden" />

        <StockTiles
          materials={materials ?? []}
          stats={stats}
          appearanceFor={appearanceFor}
          onlyLowStock={onlyLowStock}
          onToggleLowStock={() => setOnlyLowStock(v => !v)}
          onPick={pick}
        />

        {roleAllows(role, "editor") && <MergeHint />}

        <div className="flex items-start gap-6">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <PageHeader
              title={t.home.title}
              description={t.home.summary({
                count: stats.count,
                remaining: formatGrams(stats.totalRemaining),
                low: stats.lowStock,
              })}
              actions={
                <>
                  {/* Ab dem Tablet trägt die Kopfzeile den Knopf. Ausgeblendet
                      statt deaktiviert – siehe `Lager.tsx`. */}
                  {roleAllows(role, "editor") && (
                    <Button
                      className="w-full md:hidden"
                      onClick={() => openMaterialForm()}
                    >
                      <Plus className="mr-2 h-4 w-4" /> {t.home.newMaterial}
                    </Button>
                  )}
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={view}
                    onValueChange={value => value && setView(value as View)}
                    aria-label={t.home.viewLabel}
                    className="hidden md:flex"
                  >
                    <ToggleGroupItem
                      value="shelf"
                      aria-label={t.home.shelfView}
                      className="px-3"
                    >
                      <LayoutGrid className="h-4 w-4" /> {t.home.shelfView}
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="list"
                      aria-label={t.home.listView}
                      className="px-3"
                    >
                      <List className="h-4 w-4" /> {t.home.listView}
                    </ToggleGroupItem>
                  </ToggleGroup>
                </>
              }
            />

            {/* Suche und Filter */}
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1 md:max-w-sm">
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
                {/* Ab dem Tablet liegen die Filter in einem Popover – die
                    Übersicht soll mit dem Regal beginnen, nicht mit vier
                    Auswahlfeldern. */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="hidden h-10 md:inline-flex"
                    >
                      <SlidersHorizontal className="mr-2 h-4 w-4" />
                      {t.home.filters}
                      {filterBadge}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-[min(92vw,600px)] p-4"
                  >
                    {filterFields}
                    <div className="mt-3 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={resetFilters}
                        disabled={activeFilters.length === 0}
                      >
                        {t.home.reset}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                {/* Nur in der Liste: Darunter gibt es keine Spalten – im Regal
                    wäre eine Spaltenauswahl eine Einstellung für etwas, das
                    man nicht sieht. */}
                {view === "list" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="hidden h-10 md:flex">
                        <Columns3 className="mr-2 h-4 w-4" />
                        {t.home.columns}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                      <DropdownMenuLabel>
                        {t.home.columnsTitle}
                      </DropdownMenuLabel>
                      {/* Anders als das Farbschema hängt die Auswahl am Konto –
                          das sagen wir, statt es die Leute auf dem zweiten
                          Gerät herausfinden zu lassen. */}
                      <p className="px-2 pb-1 text-xs text-muted-foreground">
                        {t.home.columnsHint}
                      </p>
                      <DropdownMenuSeparator />
                      {TOGGLEABLE_MATERIAL_COLUMNS.map(column => (
                        <DropdownMenuCheckboxItem
                          key={column}
                          checked={showsColumn(column)}
                          /* Ohne das schließt Radix das Menü nach jedem Haken –
                             wer drei Spalten umstellt, müsste es dreimal
                             öffnen. */
                          onSelect={e => e.preventDefault()}
                          onCheckedChange={checked =>
                            setColumnVisible(column, checked)
                          }
                        >
                          {t.home[MATERIAL_COLUMN_LABELS[column]]}
                        </DropdownMenuCheckboxItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={hiddenColumns.length === 0}
                        onSelect={() =>
                          updateSettings.mutate({ hiddenMaterialColumns: [] })
                        }
                      >
                        {t.home.columnsReset}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {/* Auf dem Telefon liegen die Filter in einer Schublade, sonst
                    bräuchte man vier Bildschirmhöhen bis zur Liste. */}
                <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" className="h-10 md:hidden">
                      <SlidersHorizontal className="mr-2 h-4 w-4" />
                      {t.home.filters}
                      {filterBadge}
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
                        aria-label={t.home.removeFilter({
                          label: filter.label,
                        })}
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

            {/* Regal, Liste oder Karten */}
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton
                    key={i}
                    className="h-20 w-full rounded-xl md:h-12"
                  />
                ))}
              </div>
            ) : hasNoLager ? (
              /*
                Ohne Lager gibt es nichts einzulagern, und „Erstes Material
                anlegen“ führte ins Leere: Das Formular öffnete sich mit leerer
                Lagerauswahl und konnte nur mit „Material braucht ein Lager“
                antworten. Ein neu angemeldetes Konto hat kein Lager – die
                Migration hat nur die damals bestehenden Konten versorgt –, also
                ist das der erste Bildschirm, den es sieht.
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
                    roleAllows(role, "editor") && (
                      <Button onClick={() => openMaterialForm()}>
                        <Plus className="mr-2 h-4 w-4" /> {t.home.emptyAction}
                      </Button>
                    )
                  ) : (
                    <Button variant="outline" onClick={resetFilters}>
                      {t.home.resetFilters}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Telefon: Karten statt Regal oder Tabelle */}
                <div className="flex flex-col gap-3 md:hidden">
                  <p className="text-xs text-muted-foreground">
                    {t.home.countOf({
                      shown: sorted.length,
                      total: stats.count,
                    })}
                  </p>
                  {sorted.map(material => (
                    <MaterialCard
                      key={material.id}
                      material={material}
                      appearance={appearanceFor(material)}
                      onOpen={() => navigate(gebindePath(material.id))}
                      onWeigh={
                        roleAllows(role, "weigher")
                          ? () => openWeighing(material)
                          : undefined
                      }
                      onConsume={
                        roleAllows(role, "weigher")
                          ? () => openConsumption(material)
                          : undefined
                      }
                    />
                  ))}
                </div>

                <div className="hidden md:block">
                  {view === "shelf" && (
                    <ToggleGroup
                      type="single"
                      size="sm"
                      variant="outline"
                      value={shelfGrouping}
                      onValueChange={value =>
                        value && setShelfGrouping(value as ShelfGrouping)
                      }
                      aria-label={t.home.shelfGroupingLabel}
                      className="mb-4"
                    >
                      <ToggleGroupItem value="box" className="px-3 text-xs">
                        {t.home.shelfGroupByBox}
                      </ToggleGroupItem>
                      <ToggleGroupItem value="product" className="px-3 text-xs">
                        {t.home.shelfGroupByProduct}
                      </ToggleGroupItem>
                    </ToggleGroup>
                  )}
                  {view === "shelf" ? (
                    <MaterialShelf
                      groups={groups}
                      appearanceFor={appearanceFor}
                      selectedId={hasPanel ? (selected?.id ?? null) : null}
                      onPick={pick}
                      onWeigh={
                        roleAllows(role, "weigher")
                          ? m => openWeighing(m)
                          : undefined
                      }
                    />
                  ) : (
                    /* Die Liste: Tabelle mit sortierbaren Spaltenköpfen */
                    <Card>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {showsColumn("identifier") && (
                                <SortableHead
                                  label={t.home.colIdentifier}
                                  sortKey="identifier"
                                  activeKey={sortKey}
                                  dir={sortDir}
                                  onSort={toggleSort}
                                />
                              )}
                              {showsColumn("appearance") && (
                                <TableHead className="w-10">
                                  {t.home.colAppearance}
                                </TableHead>
                              )}
                              <SortableHead
                                label={t.home.colMaterial}
                                sortKey="name"
                                activeKey={sortKey}
                                dir={sortDir}
                                onSort={toggleSort}
                              />
                              {showsColumn("type") && (
                                <TableHead>{t.home.colType}</TableHead>
                              )}
                              {/* Spalten fallen zuerst weg, die anderswo
                                  ohnehin stehen – sonst rutscht die
                                  Aktionsspalte aus dem Blick und „Wiegen“ ist
                                  nur noch scrollbar. */}
                              {showsColumn("manufacturer") && (
                                <TableHead className="hidden xl:table-cell">
                                  {t.home.colManufacturer}
                                </TableHead>
                              )}
                              {showsColumn("remaining") && (
                                <SortableHead
                                  label={t.home.colRemaining}
                                  sortKey="percent"
                                  activeKey={sortKey}
                                  dir={sortDir}
                                  onSort={toggleSort}
                                  className="min-w-[180px]"
                                />
                              )}
                              {showsColumn("containerBox") && (
                                <TableHead className="hidden 2xl:table-cell">
                                  {t.home.colContainerBox}
                                </TableHead>
                              )}
                              {showsColumn("price") && (
                                <TableHead className="hidden lg:table-cell">
                                  {t.home.colPrice}
                                </TableHead>
                              )}
                              {showsColumn("purchase") && (
                                <SortableHead
                                  label={t.home.colPurchase}
                                  sortKey="purchase"
                                  activeKey={sortKey}
                                  dir={sortDir}
                                  onSort={toggleSort}
                                  className="hidden lg:table-cell"
                                />
                              )}
                              <TableHead className="text-right">
                                {t.home.colActions}
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sorted.map(m => (
                              <TableRow
                                key={m.id}
                                className="cursor-pointer"
                                onClick={() => navigate(gebindePath(m.id))}
                              >
                                {showsColumn("identifier") && (
                                  <TableCell>
                                    {m.identifier ? (
                                      <Badge
                                        variant="outline"
                                        className="font-mono"
                                      >
                                        {m.identifier}
                                      </Badge>
                                    ) : (
                                      <span className="text-muted-foreground">
                                        –
                                      </span>
                                    )}
                                  </TableCell>
                                )}
                                {showsColumn("appearance") && (
                                  <TableCell>
                                    <AppearanceSwatch {...appearanceFor(m)} />
                                  </TableCell>
                                )}
                                <TableCell className="max-w-[260px]">
                                  <div className="truncate font-medium">
                                    {m.name}
                                  </div>
                                  {m.color && (
                                    <div className="truncate text-xs text-muted-foreground">
                                      {m.color}
                                    </div>
                                  )}
                                </TableCell>
                                {showsColumn("type") && (
                                  <TableCell>
                                    <Badge variant="secondary">
                                      {m.materialType}
                                    </Badge>
                                  </TableCell>
                                )}
                                {showsColumn("manufacturer") && (
                                  <TableCell className="hidden xl:table-cell">
                                    {m.manufacturer ?? "–"}
                                  </TableCell>
                                )}
                                {showsColumn("remaining") && (
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                                        <div
                                          className={`h-full ${fillLevelColor(m.remainingPercent)}`}
                                          style={{
                                            width: `${m.remainingPercent ?? 0}%`,
                                          }}
                                        />
                                      </div>
                                      <span
                                        className={`whitespace-nowrap font-mono text-sm font-medium tabular-nums ${fillLevelTextColor(m.remainingPercent)}`}
                                      >
                                        {formatGrams(m.remainingWeight)}
                                        {m.remainingPercent != null && (
                                          <span className="font-normal text-muted-foreground">
                                            {" "}
                                            ({formatPercent(m.remainingPercent)}
                                            )
                                          </span>
                                        )}
                                        {/* Meter beim Filament, Liter beim
                                            Harz */}
                                        {m.secondary && (
                                          <span className="font-normal text-muted-foreground">
                                            {" · "}
                                            {t.lager.approx({
                                              value: formatSecondary(
                                                m.secondary
                                              ),
                                            })}
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  </TableCell>
                                )}
                                {showsColumn("containerBox") && (
                                  <TableCell className="hidden text-sm text-muted-foreground 2xl:table-cell">
                                    <div>{m.containerLabel ?? "–"}</div>
                                    {m.storageBox && (
                                      <div className="flex items-center gap-1 text-xs">
                                        <Archive className="h-3 w-3" />{" "}
                                        {m.storageBox.name}
                                      </div>
                                    )}
                                  </TableCell>
                                )}
                                {showsColumn("price") && (
                                  <TableCell className="hidden font-mono tabular-nums lg:table-cell">
                                    {formatMoney(m.priceCents)}
                                  </TableCell>
                                )}
                                {showsColumn("purchase") && (
                                  <TableCell className="hidden font-mono tabular-nums lg:table-cell">
                                    {formatDate(m.purchaseDate)}
                                  </TableCell>
                                )}
                                <TableCell className="text-right">
                                  <div
                                    className="flex justify-end gap-1"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    {roleAllows(role, "weigher") && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => openConsumption(m)}
                                        >
                                          <Printer className="mr-1 h-3.5 w-3.5" />{" "}
                                          {t.nav.consume}
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => openWeighing(m)}
                                        >
                                          <Scale className="mr-1 h-3.5 w-3.5" />{" "}
                                          {t.nav.weigh}
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
            )}

            <FriendResults query={search} />
          </div>

          {/* Das Detail neben dem Regal – erst ab `xl`, darunter öffnet ein
              Tipp die Detailseite. */}
          {showsPanel && !hasNoLager && (
            <MaterialPanel
              className="sticky top-20 hidden w-[360px] shrink-0 xl:flex xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto"
              material={selected}
              appearance={selected ? appearanceFor(selected) : null}
              onWeigh={
                roleAllows(role, "weigher") ? m => openWeighing(m) : undefined
              }
              onConsume={
                roleAllows(role, "weigher")
                  ? m => openConsumption(m)
                  : undefined
              }
              /*
                Ein Gebinde desselben Materials: im Regal wählen, wenn es hier
                steht, sonst – anderes Lager, weggefiltert – zu seiner Seite.
              */
              onPickGebinde={gebindeId =>
                sorted.some(m => m.id === gebindeId)
                  ? setSelectedId(gebindeId)
                  : navigate(gebindePath(gebindeId))
              }
            />
          )}
        </div>
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

/**
 * Ein Material auf dem Telefon: die Spule klein links, die Zahlen daneben,
 * die beiden Handgriffe darunter.
 */
function MaterialCard({
  material,
  appearance,
  onOpen,
  onWeigh,
  onConsume,
}: {
  material: MaterialOverview;
  /** Fertig aufgelöst – der Katalog wird einmal je Seite geholt, nicht je Karte */
  appearance: ResolvedAppearance & { label: string };
  onOpen: () => void;
  /** Fehlt unterhalb der Stufe `weigher` – dann entfällt der Knopf. */
  onWeigh?: () => void;
  /** Verbrauch abbuchen – dieselbe Stufe wie Wiegen. */
  onConsume?: () => void;
}) {
  const { formatGrams, formatPercent, formatSecondary } = useFormat();
  const t = useT();

  return (
    <div className="rounded-xl border bg-card shadow-xs">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-t-xl p-3 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Spool
          size={56}
          hex={appearance.hex}
          kind={appearance.kind}
          percent={material.remainingPercent}
          label={appearance.label}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-bold">{material.name}</span>
            <span
              className={cn(
                "shrink-0 font-mono text-sm font-semibold tabular-nums",
                fillLevelTextColor(material.remainingPercent)
              )}
            >
              {material.remainingPercent != null
                ? formatPercent(material.remainingPercent)
                : "–"}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[material.materialType, material.manufacturer, material.color]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1.5">
              {material.identifier && (
                <span className="rounded-md bg-foreground/8 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
                  {material.identifier}
                </span>
              )}
              <span className="truncate font-mono tabular-nums">
                {formatGrams(material.remainingWeight)}
                {/* Meter beim Filament, Liter beim Harz – auf dem Telefon
                    knapp */}
                {material.secondary &&
                  ` · ${formatSecondary(material.secondary)}`}
              </span>
            </span>
            {material.storageBox && (
              <span className="flex min-w-0 items-center gap-1">
                <Archive className="h-3 w-3 shrink-0" />
                <span className="truncate">{material.storageBox.name}</span>
              </span>
            )}
          </div>
        </div>
      </button>
      {(onWeigh || onConsume) && (
        <div className="grid grid-cols-2 gap-1 border-t p-2">
          {onConsume && (
            <Button variant="ghost" className="h-10" onClick={onConsume}>
              <Printer className="mr-2 h-4 w-4" /> {t.nav.consume}
            </Button>
          )}
          {onWeigh && (
            <Button variant="ghost" className="h-10" onClick={onWeigh}>
              <Scale className="mr-2 h-4 w-4" /> {t.nav.weigh}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Hinweis auf Materialien, die wie dasselbe aussehen (`mergeCandidates`).
 *
 * Die Migration 0022 hat den Altbestand bewusst konservativ zusammengelegt;
 * was sie nicht zusammengelegt hat, soll ein Mensch entscheiden. Ohne diesen
 * Hinweis fände niemand die Zusammenführen-Karte auf der Material-Seite.
 * Wer ihn nicht will, führt zusammen – dann verschwindet er von selbst.
 */
function MergeHint() {
  const t = useT();
  const scope = useActiveScope();
  const { data: products } = trpc.product.list.useQuery(scope);
  const groups = useMemo(() => mergeCandidates(products ?? []), [products]);
  /*
    Ausblendbar, weil zwei gleich aussehende Materialien Absicht sein können
    (etwa zwei Chargen). Gemerkt wird, **welche** Gruppen ausgeblendet wurden:
    Kommt eine neue hinzu, erscheint der Hinweis wieder.
  */
  const signature = groups.map(ids => ids.join(",")).join(";");
  const storageKey = `merge-hint-dismissed:${scope.organizationId ?? "personal"}`;
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });
  const dismiss = () => {
    setDismissed(signature);
    try {
      localStorage.setItem(storageKey, signature);
    } catch {
      /* Ohne Speicher gilt das Ausblenden für diese Seite. */
    }
  };
  if (groups.length === 0 || dismissed === signature) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm">
      <Combine aria-hidden="true" className="size-4 text-muted-foreground" />
      <span className="min-w-0 flex-1 text-muted-foreground">
        {t.home.mergeHint({ count: groups.length })}
      </span>
      <Button asChild size="sm" variant="outline">
        <Link to={materialPath(groups[0][0])}>{t.home.mergeHintAction}</Link>
      </Button>
      <Button size="sm" variant="ghost" onClick={dismiss}>
        {t.home.mergeHintDismiss}
      </Button>
    </div>
  );
}
