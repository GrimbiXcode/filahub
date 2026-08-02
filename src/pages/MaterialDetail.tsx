import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  Archive,
  ArrowLeft,
  Disc3,
  Pencil,
  Scale,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import AuthLayout from "@/components/AuthLayout";
import { MaterialFormDialog } from "@/components/MaterialFormDialog";
import { WeighingDialog } from "@/components/WeighingDialog";
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
import {
  fillLevelColor,
  fillLevelTextColor,
  formatDate,
  formatDateTime,
  formatEuro,
  formatGrams,
} from "@/lib/format";
import { trpc } from "@/providers/trpc";
import type { MaterialOverview } from "@/types";

export default function MaterialDetail() {
  const { id } = useParams<{ id: string }>();
  const materialId = Number(id);
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const { data: material, isLoading } = trpc.material.byId.useQuery(
    { id: materialId },
    { enabled: Number.isFinite(materialId) },
  );

  const [editOpen, setEditOpen] = useState(false);
  const [weighOpen, setWeighOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const deleteMutation = trpc.material.delete.useMutation({
    onSuccess: () => {
      toast.success("Material gelöscht");
      utils.material.list.invalidate();
      navigate("/");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteWeighing = trpc.material.deleteWeighing.useMutation({
    onSuccess: () => {
      toast.success("Wägung gelöscht");
      utils.material.byId.invalidate();
      utils.material.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <AuthLayout>
        <div className="space-y-4 p-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AuthLayout>
    );
  }

  if (!material) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center gap-4 p-12">
          <p className="text-lg font-medium">Material nicht gefunden</p>
          <Button variant="outline" onClick={() => navigate("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Zur Übersicht
          </Button>
        </div>
      </AuthLayout>
    );
  }

  const consumed = Math.max(0, material.nominalWeight - material.remainingWeight);
  // Für die Dialoge (erwarten MaterialOverview ohne weighings-Liste)
  const { weighings, ...overview } = material;
  const asOverview = overview as MaterialOverview;

  return (
    <AuthLayout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                {material.identifier && (
                  <Badge variant="outline" className="font-mono text-base">
                    {material.identifier}
                  </Badge>
                )}
                {material.name}
                <Badge variant="secondary">{material.materialType}</Badge>
              </h1>
              <p className="text-sm text-muted-foreground">
                {[material.manufacturer, material.color].filter(Boolean).join(" · ") || " "}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setWeighOpen(true)}>
              <Scale className="mr-2 h-4 w-4" /> Wiegen
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" /> Bearbeiten
            </Button>
            <Button variant="destructive" size="icon" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Füllstand */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Füllstand</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <span
                  className={`text-3xl font-bold ${fillLevelTextColor(material.remainingPercent)}`}
                >
                  {formatGrams(material.remainingWeight)}
                </span>
                <span className="ml-2 text-muted-foreground">
                  von {formatGrams(material.nominalWeight)} Nennmenge
                </span>
              </div>
              {material.remainingPercent != null && (
                <span className="text-2xl font-semibold text-muted-foreground">
                  {material.remainingPercent} %
                </span>
              )}
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all ${fillLevelColor(material.remainingPercent)}`}
                style={{ width: `${material.remainingPercent ?? 0}%` }}
              />
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground">Verbraucht</div>
                <div className="font-medium">{formatGrams(consumed)}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground">Tara gesamt</div>
                <div className="font-medium">{formatGrams(material.tareWeight)}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground">Letzte Wägung</div>
                <div className="font-medium">
                  {material.lastWeighing
                    ? `${formatGrams(material.lastWeighing.grossWeight)} (brutto)`
                    : "noch keine"}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground">Restwert</div>
                <div className="font-medium">
                  {material.priceCents != null && material.nominalWeight > 0
                    ? formatEuro(
                        Math.round(
                          (material.priceCents * material.remainingWeight) /
                            material.nominalWeight,
                        ),
                      )
                    : "–"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Stammdaten */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stammdaten</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <dt className="text-muted-foreground">Kennung</dt>
                <dd className="font-mono">{material.identifier ?? "–"}</dd>
                <dt className="text-muted-foreground">Materialart</dt>
                <dd>{material.materialType}</dd>
                <dt className="text-muted-foreground">Hersteller</dt>
                <dd>{material.manufacturer ?? "–"}</dd>
                <dt className="text-muted-foreground">Farbe</dt>
                <dd>{material.color ?? "–"}</dd>
                <dt className="text-muted-foreground">Preis</dt>
                <dd>{formatEuro(material.priceCents)}</dd>
                <dt className="text-muted-foreground">Kaufdatum</dt>
                <dd>{formatDate(material.purchaseDate)}</dd>
                <dt className="text-muted-foreground">Rolle / Verpackung</dt>
                <dd className="flex flex-wrap items-center gap-1.5">
                  {material.spoolLabel ? (
                    <>
                      <Disc3 className="h-4 w-4 text-muted-foreground" />
                      {material.spoolLabel} ({formatGrams(material.spoolTareWeight)} Tara)
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
                <dd className="flex items-center gap-1.5">
                  {material.storageBox ? (
                    <>
                      <Archive className="h-4 w-4 text-muted-foreground" />
                      {material.storageBox.name} (
                      {formatGrams(material.storageBox.tareWeight)} Tara)
                    </>
                  ) : (
                    "–"
                  )}
                </dd>
                {material.notes && (
                  <>
                    <dt className="text-muted-foreground">Notizen</dt>
                    <dd className="whitespace-pre-wrap">{material.notes}</dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>

          {/* Wägungsverlauf */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Wägungsverlauf</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setWeighOpen(true)}>
                <Scale className="mr-2 h-3.5 w-3.5" /> Neue Wägung
              </Button>
            </CardHeader>
            <CardContent>
              {weighings.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Noch keine Wägungen. Die Restmenge entspricht aktuell der Nennmenge.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Brutto</TableHead>
                      <TableHead>Netto (nach Tara)</TableHead>
                      <TableHead>Notiz</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weighings.map((w) => (
                      <TableRow key={w.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTime(w.weighedAt)}
                        </TableCell>
                        <TableCell>{formatGrams(w.grossWeight)}</TableCell>
                        <TableCell className="font-medium">
                          {formatGrams(Math.max(0, w.grossWeight - material.tareWeight))}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{w.note ?? "–"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteWeighing.mutate({ id: w.id })}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <MaterialFormDialog open={editOpen} onOpenChange={setEditOpen} material={asOverview} />
      <WeighingDialog open={weighOpen} onOpenChange={setWeighOpen} material={asOverview} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Material löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{material.name}“ und alle zugehörigen Wägungen werden endgültig gelöscht.
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
    </AuthLayout>
  );
}
