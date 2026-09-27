import { useState } from "react";
import {
  consumptionTrend,
  materialHistory,
  type MaterialHistoryEntry,
} from "@contracts/materials";
import {
  mayDeleteConsumption,
  mayDeleteWeighing,
  roleAllows,
} from "@contracts/organizations";
import { useNavigate, useParams } from "react-router";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  PackageCheck,
  Disc3,
  Pencil,
  Printer,
  Scale,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import AuthLayout from "@/components/AuthLayout";
import { PageHeader } from "@/components/PageHeader";
import { useQuickActions } from "@/lib/quickActions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fillLevelTextColor } from "@/lib/format";
import { HistoryChart } from "@/components/HistoryChart";
import { ProductGebindeList } from "@/components/ProductGebindeList";
import { RecentPrints } from "@/components/RecentPrints";
import { describeTrend } from "@/lib/trend";
import { Spool } from "@/components/Spool";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";
import type { MaterialOverview } from "@/types";
import { useActiveScope, useScopeRole } from "@/lib/activeScope";
import { AppearanceSwatch } from "@/components/AppearanceSwatch";
import { useAppearanceResolver, useSwatchLabel } from "@/lib/appearance";

export default function MaterialDetail() {
  const { id } = useParams<{ id: string }>();
  const materialId = Number(id);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { openMaterialForm, openWeighing, openConsumption } = useQuickActions();
  const {
    formatDate,
    formatDateTime,
    formatGrams,
    formatMoney,
    formatSecondary,
  } = useFormat();
  const t = useT();
  const scope = useActiveScope();
  const role = useScopeRole();

  const { data: material, isLoading } = trpc.material.byId.useQuery(
    { ...scope, id: materialId },
    { enabled: Number.isFinite(materialId) }
  );

  const resolveAppearance = useAppearanceResolver();
  const swatchLabel = useSwatchLabel();
  const resolved = resolveAppearance(material?.color, material?.texture);
  const swatch = {
    ...resolved,
    label: swatchLabel(material?.color, material?.texture, resolved.hex),
    size: "md" as const,
  };

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingWeighing, setDeletingWeighing] = useState<number | null>(null);
  const [deletingConsumption, setDeletingConsumption] = useState<number | null>(
    null
  );

  const deleteMutation = trpc.material.delete.useMutation({
    onSuccess: () => {
      toast.success(t.materialDetail.materialDeleted);
      utils.material.list.invalidate();
      utils.product.invalidate();
      // Drucke nennen Gebinde, Kennung und Buchungsstand (seit 4.2.0)
      utils.print.invalidate();
      navigate("/");
    },
    onError: e => toast.error(e.message),
  });
  /*
    Aufgebraucht markieren (seit 4.1.0) – der Weg statt Löschen für eine leere
    Rolle: Verlauf und Material bleiben, das Regal wird frei.
  */
  const setArchived = trpc.material.setArchived.useMutation({
    onSuccess: (_, input) => {
      toast.success(
        input.archived
          ? t.materialDetail.archivedDone
          : t.materialDetail.unarchivedDone
      );
      utils.material.list.invalidate();
      utils.material.byId.invalidate();
      utils.product.invalidate();
      // Drucke nennen Gebinde, Kennung und Buchungsstand (seit 4.2.0)
      utils.print.invalidate();
      setDeleteOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const deleteWeighing = trpc.material.deleteWeighing.useMutation({
    onSuccess: () => {
      toast.success(t.materialDetail.weighingDeleted);
      utils.material.byId.invalidate();
      utils.material.list.invalidate();
      utils.product.invalidate();
      setDeletingWeighing(null);
    },
    onError: e => toast.error(e.message),
  });
  const deleteConsumption = trpc.material.deleteConsumption.useMutation({
    onSuccess: () => {
      toast.success(t.materialDetail.consumptionDeleted);
      utils.material.byId.invalidate();
      utils.material.list.invalidate();
      utils.product.invalidate();
      // Drucke nennen Gebinde, Kennung und Buchungsstand (seit 4.2.0)
      utils.print.invalidate();
      setDeletingConsumption(null);
    },
    onError: e => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <AuthLayout>
        <div className="space-y-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </AuthLayout>
    );
  }

  if (!material) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <p className="text-lg font-medium">{t.materialDetail.notFound}</p>
          <Button variant="outline" onClick={() => navigate("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> {t.materialDetail.toOverview}
          </Button>
        </div>
      </AuthLayout>
    );
  }

  const consumed = Math.max(
    0,
    material.nominalWeight - material.remainingWeight
  );
  // Für die Dialoge (erwarten MaterialOverview ohne die beiden Verläufe)
  const { weighings, consumptions, ...overview } = material;
  const asOverview = overview as MaterialOverview;

  /*
    Die zuletzt **erfasste** Wägung – höchste `id`, nicht die erste der Liste:
    Die ist nach `weighedAt` sortiert, und eine nachgetragene Wägung mit altem
    Datum stünde dort weiter unten. Entschieden wird ohnehin serverseitig
    (`material.deleteWeighing`); hier geht es nur darum, keinen Knopf zu zeigen,
    der `FORBIDDEN` liefert.
  */
  const latestWeighingId = weighings.reduce((max, w) => Math.max(max, w.id), 0);
  const latestConsumptionId = consumptions.reduce(
    (max, c) => Math.max(max, c.id),
    0
  );
  /*
    Ein Verlauf aus beiden Listen, mit der Restmenge nach jedem Eintrag – die
    Rechnung steht in `contracts/materials.ts`, nicht hier (siehe dort, warum).
  */
  const history = materialHistory({
    weighings,
    consumptions,
    tareWeight: material.tareWeight,
    nominalWeight: material.nominalWeight,
  });

  const trend = consumptionTrend({ history });

  /** Löschknopf je Eintragsart – die Regel kommt für beide aus `contracts/`. */
  const deleteButton = (entry: MaterialHistoryEntry) => {
    const allowed =
      entry.kind === "weighing"
        ? mayDeleteWeighing(role, entry, latestWeighingId)
        : mayDeleteConsumption(role, entry, latestConsumptionId);
    if (!allowed) return null;
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label={
          entry.kind === "weighing"
            ? t.materialDetail.deleteWeighing
            : t.materialDetail.deleteConsumption
        }
        onClick={() =>
          entry.kind === "weighing"
            ? setDeletingWeighing(entry.id)
            : setDeletingConsumption(entry.id)
        }
      >
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    );
  };
  const entryLabel = (entry: MaterialHistoryEntry) => (
    <Badge
      variant={entry.kind === "weighing" ? "secondary" : "outline"}
      className="font-normal"
    >
      {entry.kind === "weighing"
        ? t.materialDetail.entryWeighing
        : t.materialDetail.entryConsumption}
    </Badge>
  );

  return (
    <AuthLayout>
      <div className="flex flex-col gap-4 sm:gap-6">
        <PageHeader
          backTo="/"
          title={
            <span className="flex flex-wrap items-center gap-2">
              {material.identifier && (
                <Badge variant="outline" className="font-mono text-base">
                  {material.identifier}
                </Badge>
              )}
              <span className="wrap-break-word">{material.name}</span>
              <Badge variant="secondary">{material.materialType}</Badge>
              {material.archivedAt && (
                <Badge variant="outline">
                  {t.materialDetail.archivedBadge}
                </Badge>
              )}
            </span>
          }
          description={
            [material.manufacturer, material.color]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          actions={
            <>
              {/* Wiegen und Abbuchen sind `weigher`, Bearbeiten und Löschen `editor`.
                  Ein aufgebrauchtes Gebinde wiegt niemand mehr. */}
              {roleAllows(role, "weigher") && !material.archivedAt && (
                <>
                  <Button
                    className="flex-1 sm:flex-none"
                    onClick={() => openWeighing(asOverview)}
                  >
                    <Scale className="mr-2 h-4 w-4" /> {t.nav.weigh}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 sm:flex-none"
                    onClick={() => openConsumption(asOverview)}
                  >
                    <Printer className="mr-2 h-4 w-4" /> {t.nav.consume}
                  </Button>
                </>
              )}
              {roleAllows(role, "editor") && (
                <>
                  <Button
                    variant="outline"
                    className="flex-1 sm:flex-none"
                    onClick={() => openMaterialForm(asOverview)}
                  >
                    <Pencil className="mr-2 h-4 w-4" /> {t.common.edit}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 sm:flex-none"
                    disabled={setArchived.isPending}
                    onClick={() =>
                      setArchived.mutate({
                        ...scope,
                        id: material.id,
                        archived: !material.archivedAt,
                      })
                    }
                  >
                    {material.archivedAt ? (
                      <>
                        <ArchiveRestore className="mr-2 h-4 w-4" />{" "}
                        {t.materialDetail.unarchive}
                      </>
                    ) : (
                      <>
                        <PackageCheck className="mr-2 h-4 w-4" />{" "}
                        {t.materialDetail.archive}
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t.materialDetail.deleteMaterial}
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </>
          }
        />

        {/* Füllstand */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {t.materialDetail.fillLevel}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
              <Spool
                size={140}
                hex={swatch.hex}
                kind={swatch.kind}
                percent={material.remainingPercent}
                label={swatch.label}
                showPercent
                className="mx-auto sm:mx-0"
              />
              <div className="min-w-0 flex-1">
                <div
                  className={`font-mono text-3xl font-semibold tabular-nums ${fillLevelTextColor(material.remainingPercent)}`}
                >
                  {formatGrams(material.remainingWeight)}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t.materialDetail.ofNominal({
                    amount: formatGrams(material.nominalWeight),
                  })}
                </p>
                {/*
                  Zweitanzeige: Meter beim Filament, Liter beim Harz, beim
                  Pulver nichts. Das „ca." ist Absicht – der Wert hängt an einer
                  Dichte, die meist eine Vorgabe ist; der Titel nennt sie.
                */}
                {material.secondary && (
                  <p
                    className="mt-0.5 text-sm text-muted-foreground"
                    title={
                      material.densityUsed != null
                        ? t.lager.secondaryHint({
                            density: `${material.densityUsed} g/l`,
                          })
                        : undefined
                    }
                  >
                    {t.lager.approx({
                      value: formatSecondary(material.secondary),
                    })}
                  </p>
                )}
                {/* Tendenz: zwei Punkte aus dem Verlauf, siehe `consumptionTrend` */}
                <p className="mt-2 text-sm text-muted-foreground">
                  {describeTrend(trend, t, formatGrams)}
                </p>
              </div>
              <div className="w-full sm:max-w-md sm:flex-1">
                <HistoryChart
                  history={history}
                  nominalWeight={material.nominalWeight}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">
                  {t.materialDetail.consumed}
                </div>
                <div className="font-medium">{formatGrams(consumed)}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">
                  {t.materialDetail.tareTotal}
                </div>
                <div className="font-medium">
                  {formatGrams(material.tareWeight)}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">
                  {t.materialDetail.lastWeighing}
                </div>
                <div className="font-medium">
                  {material.lastWeighing
                    ? t.materialDetail.lastWeighingGross({
                        amount: formatGrams(material.lastWeighing.grossWeight),
                      })
                    : t.materialDetail.noWeighingYet}
                </div>
                {material.consumedSinceWeighing > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {t.materialDetail.consumedSince({
                      amount: formatGrams(material.consumedSinceWeighing),
                    })}
                  </div>
                )}
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">
                  {t.materialDetail.remainingValue}
                </div>
                <div className="font-medium">
                  {material.priceCents != null && material.nominalWeight > 0
                    ? formatMoney(
                        Math.round(
                          (material.priceCents * material.remainingWeight) /
                            material.nominalWeight
                        )
                      )
                    : "–"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Die übrigen Gebinde desselben Materials, samt Bestand und Schwelle */}
        <Card>
          <CardContent>
            <ProductGebindeList
              productId={material.productId}
              currentId={material.id}
            />
          </CardContent>
        </Card>

        <RecentPrints
          productId={material.productId}
          materialId={material.id}
          canLog={!material.archivedAt}
        />

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          {/* Stammdaten */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t.materialDetail.masterData}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-4 gap-y-3 text-sm">
                <dt className="text-muted-foreground">
                  {t.materialDetail.identifier}
                </dt>
                <dd className="font-mono">{material.identifier ?? "–"}</dd>
                <dt className="text-muted-foreground">
                  {t.materialDetail.materialType}
                </dt>
                <dd>{material.materialType}</dd>
                <dt className="text-muted-foreground">
                  {t.common.manufacturer}
                </dt>
                <dd>{material.manufacturer ?? "–"}</dd>
                <dt className="text-muted-foreground">{t.common.color}</dt>
                <dd className="flex items-center gap-2">
                  <AppearanceSwatch {...swatch} />
                  <span>{material.color ?? "–"}</span>
                </dd>
                {/* Die Oberfläche stand hier bis 2.7.0 gar nicht – sie gehört
                    zur Identität wie die Farbe. */}
                <dt className="text-muted-foreground">
                  {t.materialDetail.texture}
                </dt>
                <dd>{material.texture ?? "–"}</dd>
                <dt className="text-muted-foreground">{t.common.price}</dt>
                <dd>{formatMoney(material.priceCents)}</dd>
                <dt className="text-muted-foreground">
                  {t.materialDetail.purchaseDate}
                </dt>
                <dd>{formatDate(material.purchaseDate)}</dd>
                <dt className="text-muted-foreground">
                  {t.materialDetail.container}
                </dt>
                <dd className="flex flex-wrap items-center gap-1.5">
                  {material.containerLabel ? (
                    <>
                      <Disc3 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="wrap-break-word">
                        {material.containerLabel}{" "}
                        {t.materialDetail.tareSuffix({
                          amount: formatGrams(material.containerTareWeight),
                        })}
                      </span>
                      {material.containerPresetVariant && (
                        <Badge variant="secondary" className="font-normal">
                          {t.materialDetail.fromCatalog}
                        </Badge>
                      )}
                    </>
                  ) : (
                    "–"
                  )}
                </dd>
                <dt className="text-muted-foreground">
                  {t.materialDetail.storageBox}
                </dt>
                <dd className="flex flex-wrap items-center gap-1.5">
                  {material.storageBox ? (
                    <>
                      <Archive className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="wrap-break-word">
                        {material.storageBox.name}{" "}
                        {t.materialDetail.tareSuffix({
                          amount: formatGrams(material.storageBox.tareWeight),
                        })}
                      </span>
                    </>
                  ) : (
                    "–"
                  )}
                </dd>
                {material.notes && (
                  <>
                    <dt className="text-muted-foreground">{t.common.notes}</dt>
                    <dd className="whitespace-pre-wrap wrap-break-word">
                      {material.notes}
                    </dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>

          {/* Verlauf: Wägungen und Verbräuche in einer Liste, neueste zuerst */}
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-2">
              <CardTitle className="text-base">
                {t.materialDetail.history}
              </CardTitle>
              {/* Ausgeblendet statt deaktiviert – siehe `Lager.tsx`. */}
              {roleAllows(role, "weigher") && !material.archivedAt && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openConsumption(asOverview)}
                  >
                    <Printer className="mr-2 h-3.5 w-3.5" />{" "}
                    {t.materialDetail.newConsumption}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openWeighing(asOverview)}
                  >
                    <Scale className="mr-2 h-3.5 w-3.5" />{" "}
                    {t.materialDetail.newWeighing}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t.materialDetail.noHistory}
                </p>
              ) : (
                <>
                  {/* Telefon: Liste statt Tabelle */}
                  <ul className="flex flex-col gap-2 sm:hidden">
                    {history.map(entry => (
                      <li
                        key={`${entry.kind}-${entry.id}`}
                        className="flex items-start justify-between gap-2 rounded-lg border p-3"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium tabular-nums">
                              {entry.kind === "weighing"
                                ? formatGrams(entry.netWeight)
                                : `− ${formatGrams(entry.weight)}`}
                            </span>
                            {entry.kind === "weighing" && (
                              <span className="text-xs text-muted-foreground">
                                {t.materialDetail.net}
                              </span>
                            )}
                            {entryLabel(entry)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {entry.kind === "weighing"
                              ? t.materialDetail.grossAt({
                                  when: formatDateTime(entry.at),
                                  amount: formatGrams(entry.grossWeight),
                                })
                              : formatDateTime(entry.at)}
                          </div>
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {t.materialDetail.remainingAfter({
                              amount: formatGrams(entry.remainingAfter),
                            })}
                          </div>
                          {entry.note && (
                            <div className="mt-1 wrap-break-word text-xs text-muted-foreground">
                              {entry.note}
                            </div>
                          )}
                        </div>
                        {deleteButton(entry)}
                      </li>
                    ))}
                  </ul>

                  <div className="hidden sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.common.date}</TableHead>
                          <TableHead>{t.materialDetail.colEntry}</TableHead>
                          <TableHead>
                            {t.materialDetail.colRemainingAfter}
                          </TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.map(entry => (
                          <TableRow key={`${entry.kind}-${entry.id}`}>
                            {/* Nur das Datum – die Karte teilt sich die Breite
                                mit den Stammdaten; die Uhrzeit steht im Titel
                                und in der Telefon-Liste. */}
                            <TableCell
                              className="whitespace-nowrap"
                              title={formatDateTime(entry.at)}
                            >
                              {formatDate(entry.at)}
                            </TableCell>
                            {/* Art, Menge und Notiz in einer Zelle – sechs
                                Spalten passen nicht neben die Stammdaten. */}
                            <TableCell>
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                {entryLabel(entry)}
                                <span className="tabular-nums">
                                  {entry.kind === "weighing"
                                    ? t.materialDetail.lastWeighingGross({
                                        amount: formatGrams(entry.grossWeight),
                                      })
                                    : `− ${formatGrams(entry.weight)}`}
                                </span>
                              </div>
                              {entry.note && (
                                <div className="mt-1 wrap-break-word text-xs text-muted-foreground">
                                  {entry.note}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="font-medium tabular-nums">
                              {formatGrams(entry.remainingAfter)}
                            </TableCell>
                            <TableCell className="text-right">
                              {deleteButton(entry)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.materialDetail.deleteMaterialTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.materialDetail.deleteMaterialDescription({
                name: material.name,
              })}
              {!material.archivedAt && ` ${t.materialDetail.deleteArchiveHint}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            {!material.archivedAt && (
              <Button
                variant="outline"
                disabled={setArchived.isPending}
                onClick={() =>
                  setArchived.mutate({
                    ...scope,
                    id: material.id,
                    archived: true,
                  })
                }
              >
                {t.materialDetail.archiveInstead}
              </Button>
            )}
            <AlertDialogAction
              onClick={() =>
                deleteMutation.mutate({ ...scope, id: material.id })
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Wägungen sind die Datengrundlage der Restmenge – vor dem Löschen
          deshalb nachfragen statt sofort zu verwerfen. */}
      <AlertDialog
        open={deletingWeighing != null}
        onOpenChange={open => !open && setDeletingWeighing(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.materialDetail.deleteWeighingTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.materialDetail.deleteWeighingDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteWeighing.isPending}
              onClick={() =>
                deletingWeighing != null &&
                deleteWeighing.mutate({
                  ...scope,
                  id: deletingWeighing,
                })
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deletingConsumption != null}
        onOpenChange={open => !open && setDeletingConsumption(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.materialDetail.deleteConsumptionTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.materialDetail.deleteConsumptionDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteConsumption.isPending}
              onClick={() =>
                deletingConsumption != null &&
                deleteConsumption.mutate({
                  ...scope,
                  id: deletingConsumption,
                })
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AuthLayout>
  );
}
