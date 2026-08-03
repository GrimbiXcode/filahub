import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Archive, ArrowLeft, Disc3, Pencil, Scale, Trash2 } from "lucide-react";
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
import { fillLevelColor, fillLevelTextColor } from "@/lib/format";
import { useFormat } from "@/lib/formatContext";
import { trpc } from "@/lib/trpc";
import type { MaterialOverview } from "@/types";

export default function MaterialDetail() {
  const { id } = useParams<{ id: string }>();
  const materialId = Number(id);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { openMaterialForm, openWeighing } = useQuickActions();
  const {
    formatDate,
    formatDateTime,
    formatGrams,
    formatMoney,
    formatPercent,
  } = useFormat();

  const { data: material, isLoading } = trpc.material.byId.useQuery(
    { id: materialId },
    { enabled: Number.isFinite(materialId) }
  );

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingWeighing, setDeletingWeighing] = useState<number | null>(null);

  const deleteMutation = trpc.material.delete.useMutation({
    onSuccess: () => {
      toast.success("Material gelöscht");
      utils.material.list.invalidate();
      navigate("/");
    },
    onError: e => toast.error(e.message),
  });
  const deleteWeighing = trpc.material.deleteWeighing.useMutation({
    onSuccess: () => {
      toast.success("Wägung gelöscht");
      utils.material.byId.invalidate();
      utils.material.list.invalidate();
      setDeletingWeighing(null);
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
          <p className="text-lg font-medium">Material nicht gefunden</p>
          <Button variant="outline" onClick={() => navigate("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Zur Übersicht
          </Button>
        </div>
      </AuthLayout>
    );
  }

  const consumed = Math.max(
    0,
    material.nominalWeight - material.remainingWeight
  );
  // Für die Dialoge (erwarten MaterialOverview ohne weighings-Liste)
  const { weighings, ...overview } = material;
  const asOverview = overview as MaterialOverview;

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
              <span className="break-words">{material.name}</span>
              <Badge variant="secondary">{material.materialType}</Badge>
            </span>
          }
          description={
            [material.manufacturer, material.color]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          actions={
            <>
              <Button
                className="flex-1 sm:flex-none"
                onClick={() => openWeighing(asOverview)}
              >
                <Scale className="mr-2 h-4 w-4" /> Wiegen
              </Button>
              <Button
                variant="outline"
                className="flex-1 sm:flex-none"
                onClick={() => openMaterialForm(asOverview)}
              >
                <Pencil className="mr-2 h-4 w-4" /> Bearbeiten
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Material löschen"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          }
        />

        {/* Füllstand */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Füllstand</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div
                  className={`text-3xl font-bold tabular-nums ${fillLevelTextColor(material.remainingPercent)}`}
                >
                  {formatGrams(material.remainingWeight)}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  von {formatGrams(material.nominalWeight)} Nennmenge
                </p>
              </div>
              {material.remainingPercent != null && (
                <span className="shrink-0 text-2xl font-semibold tabular-nums text-muted-foreground">
                  {formatPercent(material.remainingPercent)}
                </span>
              )}
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all ${fillLevelColor(material.remainingPercent)}`}
                style={{ width: `${material.remainingPercent ?? 0}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Verbraucht</div>
                <div className="font-medium">{formatGrams(consumed)}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Tara gesamt</div>
                <div className="font-medium">
                  {formatGrams(material.tareWeight)}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">
                  Letzte Wägung
                </div>
                <div className="font-medium">
                  {material.lastWeighing
                    ? `${formatGrams(material.lastWeighing.grossWeight)} brutto`
                    : "noch keine"}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Restwert</div>
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

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          {/* Stammdaten */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Stammdaten</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-4 gap-y-3 text-sm">
                <dt className="text-muted-foreground">Kennung</dt>
                <dd className="font-mono">{material.identifier ?? "–"}</dd>
                <dt className="text-muted-foreground">Materialart</dt>
                <dd>{material.materialType}</dd>
                <dt className="text-muted-foreground">Hersteller</dt>
                <dd>{material.manufacturer ?? "–"}</dd>
                <dt className="text-muted-foreground">Farbe</dt>
                <dd>{material.color ?? "–"}</dd>
                <dt className="text-muted-foreground">Preis</dt>
                <dd>{formatMoney(material.priceCents)}</dd>
                <dt className="text-muted-foreground">Kaufdatum</dt>
                <dd>{formatDate(material.purchaseDate)}</dd>
                <dt className="text-muted-foreground">Rolle / Verpackung</dt>
                <dd className="flex flex-wrap items-center gap-1.5">
                  {material.spoolLabel ? (
                    <>
                      <Disc3 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="break-words">
                        {material.spoolLabel} (
                        {formatGrams(material.spoolTareWeight)} Tara)
                      </span>
                      {material.spoolPresetVariant && (
                        <Badge variant="secondary" className="font-normal">
                          Katalog
                        </Badge>
                      )}
                    </>
                  ) : (
                    "–"
                  )}
                </dd>
                <dt className="text-muted-foreground">Lagerbox / Drybox</dt>
                <dd className="flex flex-wrap items-center gap-1.5">
                  {material.storageBox ? (
                    <>
                      <Archive className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="break-words">
                        {material.storageBox.name} (
                        {formatGrams(material.storageBox.tareWeight)} Tara)
                      </span>
                    </>
                  ) : (
                    "–"
                  )}
                </dd>
                {material.notes && (
                  <>
                    <dt className="text-muted-foreground">Notizen</dt>
                    <dd className="whitespace-pre-wrap break-words">
                      {material.notes}
                    </dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>

          {/* Wägungsverlauf */}
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Wägungsverlauf</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openWeighing(asOverview)}
              >
                <Scale className="mr-2 h-3.5 w-3.5" /> Neue Wägung
              </Button>
            </CardHeader>
            <CardContent>
              {weighings.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Noch keine Wägungen. Die Restmenge entspricht aktuell der
                  Nennmenge.
                </p>
              ) : (
                <>
                  {/* Telefon: Liste statt Tabelle */}
                  <ul className="flex flex-col gap-2 sm:hidden">
                    {weighings.map(w => (
                      <li
                        key={w.id}
                        className="flex items-start justify-between gap-2 rounded-lg border p-3"
                      >
                        <div className="min-w-0">
                          <div className="font-medium tabular-nums">
                            {formatGrams(
                              Math.max(0, w.grossWeight - material.tareWeight)
                            )}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              netto
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDateTime(w.weighedAt)} ·{" "}
                            {formatGrams(w.grossWeight)} brutto
                          </div>
                          {w.note && (
                            <div className="mt-1 break-words text-xs text-muted-foreground">
                              {w.note}
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Wägung löschen"
                          onClick={() => setDeletingWeighing(w.id)}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </li>
                    ))}
                  </ul>

                  <div className="hidden sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Datum</TableHead>
                          <TableHead>Brutto</TableHead>
                          <TableHead>Netto</TableHead>
                          <TableHead>Notiz</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {weighings.map(w => (
                          <TableRow key={w.id}>
                            <TableCell className="whitespace-nowrap">
                              {formatDateTime(w.weighedAt)}
                            </TableCell>
                            <TableCell>{formatGrams(w.grossWeight)}</TableCell>
                            <TableCell className="font-medium">
                              {formatGrams(
                                Math.max(0, w.grossWeight - material.tareWeight)
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {w.note ?? "–"}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Wägung löschen"
                                onClick={() => setDeletingWeighing(w.id)}
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
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
            <AlertDialogTitle>Material löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{material.name}“ und alle zugehörigen Wägungen werden endgültig
              gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate({ id: material.id })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
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
            <AlertDialogTitle>Wägung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Restmenge wird danach aus der nächstälteren Wägung berechnet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteWeighing.isPending}
              onClick={() =>
                deletingWeighing != null &&
                deleteWeighing.mutate({ id: deletingWeighing })
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AuthLayout>
  );
}
