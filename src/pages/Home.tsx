import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Package, Plus, Scale, Search, Weight, Archive, Wallet } from "lucide-react";
import { toast } from "sonner";
import AuthLayout from "@/components/AuthLayout";
import { MaterialFormDialog } from "@/components/MaterialFormDialog";
import { WeighingDialog } from "@/components/WeighingDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fillLevelColor, fillLevelTextColor } from "@/lib/format";
import { useFormat } from "@/lib/formatContext";
import { trpc } from "@/lib/trpc";
import type { MaterialOverview } from "@/types";

const ALL = "__all__";

export default function Home() {
  const navigate = useNavigate();
  const { data: materials, isLoading } = trpc.material.list.useQuery();
  const { formatDate, formatGrams, formatMoney, formatPercent } = useFormat();

  const [search, setSearch] = useState("");
  const [identifierLookup, setIdentifierLookup] = useState("");
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [manufacturerFilter, setManufacturerFilter] = useState(ALL);
  const [boxFilter, setBoxFilter] = useState(ALL);
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialOverview | null>(null);
  const [weighingFor, setWeighingFor] = useState<MaterialOverview | null>(null);

  const materialTypes = useMemo(
    () => [...new Set((materials ?? []).map((m) => m.materialType))].sort(),
    [materials],
  );
  const manufacturers = useMemo(
    () =>
      [...new Set((materials ?? []).map((m) => m.manufacturer).filter((x): x is string => !!x))].sort(),
    [materials],
  );
  const boxes = useMemo(() => {
    const map = new Map<number, string>();
    (materials ?? []).forEach((m) => {
      if (m.storageBox) map.set(m.storageBox.id, m.storageBox.name);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [materials]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (materials ?? []).filter((m) => {
      if (q) {
        const haystack = [m.name, m.identifier, m.materialType, m.manufacturer, m.color, m.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (typeFilter !== ALL && m.materialType !== typeFilter) return false;
      if (manufacturerFilter !== ALL && m.manufacturer !== manufacturerFilter) return false;
      if (boxFilter === "none" && m.storageBoxId != null) return false;
      if (boxFilter !== ALL && boxFilter !== "none" && m.storageBoxId !== Number(boxFilter))
        return false;
      if (onlyLowStock && (m.remainingPercent == null || m.remainingPercent > 25)) return false;
      return true;
    });
  }, [materials, search, typeFilter, manufacturerFilter, boxFilter, onlyLowStock]);

  const stats = useMemo(() => {
    const list = materials ?? [];
    const totalRemaining = list.reduce((s, m) => s + m.remainingWeight, 0);
    const totalValue = list.reduce((s, m) => {
      if (m.priceCents == null || m.nominalWeight <= 0) return s;
      return s + Math.round((m.priceCents * m.remainingWeight) / m.nominalWeight);
    }, 0);
    const lowStock = list.filter((m) => m.remainingPercent != null && m.remainingPercent <= 25).length;
    return { count: list.length, totalRemaining, totalValue, lowStock };
  }, [materials]);

  const activeFilters =
    (typeFilter !== ALL ? 1 : 0) +
    (manufacturerFilter !== ALL ? 1 : 0) +
    (boxFilter !== ALL ? 1 : 0) +
    (onlyLowStock ? 1 : 0);

  return (
    <AuthLayout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Materialübersicht</h1>
            <p className="text-sm text-muted-foreground">
              Dein 3D-Druck-Materiallager auf einen Blick
            </p>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Neues Material
          </Button>
        </div>

        {/* Statistik-Karten */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Materialien</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.count}</div>
              <p className="text-xs text-muted-foreground">
                {stats.lowStock > 0 ? `${stats.lowStock} mit niedrigem Bestand` : "alle ausreichend befüllt"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Restmenge gesamt</CardTitle>
              <Weight className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatGrams(stats.totalRemaining)}</div>
              <p className="text-xs text-muted-foreground">effektiv verfügbar (ohne Tara)</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Restwert</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatMoney(stats.totalValue)}</div>
              <p className="text-xs text-muted-foreground">anteilig nach Restmenge</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Drybox</CardTitle>
              <Archive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(materials ?? []).filter((m) => m.storageBoxId != null).length}
              </div>
              <p className="text-xs text-muted-foreground">Materialien mit Lagerbox</p>
            </CardContent>
          </Card>
        </div>

        {/* Suche & Filter */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <div className="relative lg:col-span-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Suche nach Kennung, Name, Art, Hersteller, Farbe …"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Materialart" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Alle Materialarten</SelectItem>
                  {materialTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={manufacturerFilter} onValueChange={setManufacturerFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Hersteller" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Alle Hersteller</SelectItem>
                  {manufacturers.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={boxFilter} onValueChange={setBoxFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Lagerbox" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Alle Boxen</SelectItem>
                  <SelectItem value="none">Ohne Box</SelectItem>
                  {boxes.map(([id, name]) => (
                    <SelectItem key={id} value={String(id)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              {/* Schnellzugriff per Kennung: Material finden und direkt wiegen */}
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = identifierLookup.trim().toLowerCase();
                  if (!q) return;
                  const hit = (materials ?? []).find(
                    (m) => m.identifier?.toLowerCase() === q,
                  );
                  if (hit) setWeighingFor(hit);
                  else toast.error(`Kein Material mit Kennung „${identifierLookup.trim()}“ gefunden`);
                }}
              >
                <Label htmlFor="identifier-lookup" className="text-sm font-normal whitespace-nowrap">
                  Schnellzugriff:
                </Label>
                <Input
                  id="identifier-lookup"
                  className="w-32"
                  placeholder="Kennung"
                  value={identifierLookup}
                  onChange={(e) => setIdentifierLookup(e.target.value)}
                />
                <Button type="submit" size="sm" variant="secondary">
                  <Scale className="mr-1.5 h-3.5 w-3.5" /> Wiegen
                </Button>
              </form>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="low-stock"
                  checked={onlyLowStock}
                  onCheckedChange={(v) => setOnlyLowStock(v === true)}
                />
                <Label htmlFor="low-stock" className="text-sm font-normal">
                  Nur niedriger Bestand (≤ 25 %)
                </Label>
              </div>
              {activeFilters > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTypeFilter(ALL);
                    setManufacturerFilter(ALL);
                    setBoxFilter(ALL);
                    setOnlyLowStock(false);
                    setSearch("");
                  }}
                >
                  Filter zurücksetzen ({activeFilters})
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabelle */}
        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Package className="h-10 w-10 text-muted-foreground/50" />
                <p className="font-medium">
                  {(materials ?? []).length === 0
                    ? "Noch keine Materialien im Lager"
                    : "Keine Treffer für die aktuellen Filter"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {(materials ?? []).length === 0
                    ? "Lege dein erstes Filament an – mit Rolle, Gewicht und Preis."
                    : "Passe Suche oder Filter an."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kennung</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Art</TableHead>
                      <TableHead>Hersteller</TableHead>
                      <TableHead className="min-w-[180px]">Restmenge</TableHead>
                      <TableHead>Rolle / Box</TableHead>
                      <TableHead>Preis</TableHead>
                      <TableHead>Kaufdatum</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((m) => (
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
                        <TableCell>
                          <div className="font-medium">{m.name}</div>
                          {m.color && (
                            <div className="text-xs text-muted-foreground">{m.color}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{m.materialType}</Badge>
                        </TableCell>
                        <TableCell>{m.manufacturer ?? "–"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full ${fillLevelColor(m.remainingPercent)}`}
                                style={{ width: `${m.remainingPercent ?? 0}%` }}
                              />
                            </div>
                            <span
                              className={`text-sm font-medium whitespace-nowrap ${fillLevelTextColor(m.remainingPercent)}`}
                            >
                              {formatGrams(m.remainingWeight)}
                              {m.remainingPercent != null && (
                                <span className="text-muted-foreground font-normal">
                                  {" "}({formatPercent(m.remainingPercent)})
                                </span>
                              )}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <div>{m.spoolLabel ?? "–"}</div>
                          {m.storageBox && (
                            <div className="flex items-center gap-1 text-xs">
                              <Archive className="h-3 w-3" /> {m.storageBox.name}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{formatMoney(m.priceCents)}</TableCell>
                        <TableCell>{formatDate(m.purchaseDate)}</TableCell>
                        <TableCell className="text-right">
                          <div
                            className="flex justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setWeighingFor(m)}
                            >
                              <Scale className="mr-1 h-3.5 w-3.5" /> Wiegen
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => navigate(`/material/${m.id}`)}
                            >
                              Details
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <MaterialFormDialog open={formOpen} onOpenChange={setFormOpen} material={editing} />
      <WeighingDialog
        open={weighingFor != null}
        onOpenChange={(o) => !o && setWeighingFor(null)}
        material={weighingFor}
      />
    </AuthLayout>
  );
}
