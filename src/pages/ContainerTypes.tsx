import { useState } from "react";
import { Calculator, Disc3, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import AuthLayout from "@/components/AuthLayout";
import { MyPresetProposals } from "@/components/MyPresetProposals";
import { PageHeader } from "@/components/PageHeader";
import { PresetCatalog } from "@/components/PresetCatalog";
import { ProposePresetDialog } from "@/components/ProposePresetDialog";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";
import type { ContainerTypeItem } from "@/types";

export default function ContainerTypes() {
  const utils = trpc.useUtils();
  const { formatGrams } = useFormat();
  const t = useT();
  const { data: containerTypes, isLoading } =
    trpc.containerType.list.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ContainerTypeItem | null>(null);
  const [deleting, setDeleting] = useState<ContainerTypeItem | null>(null);
  const [proposing, setProposing] = useState<ContainerTypeItem | null>(null);

  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [tareWeight, setTareWeight] = useState("");
  const [notes, setNotes] = useState("");
  // Leergewicht-Rechner: volles Gebinde wiegen
  const [calcGross, setCalcGross] = useState("");
  const [calcNominal, setCalcNominal] = useState("");

  /** Dialog öffnen und die Felder aus dem Eintrag befüllen (`null` = neu). */
  const openDialog = (containerType: ContainerTypeItem | null) => {
    setEditing(containerType);
    setName(containerType?.name ?? "");
    setManufacturer(containerType?.manufacturer ?? "");
    setTareWeight(containerType ? String(containerType.tareWeight) : "");
    setNotes(containerType?.notes ?? "");
    setCalcGross("");
    setCalcNominal("");
    setDialogOpen(true);
  };

  /**
   * Berechnetes Leergewicht: gemessenes Gewicht des vollen Gebindes minus
   * Nenn-Füllmenge des Materials (z. B. 1250 g - 1000 g = 250 g).
   */
  const computeTare = (grossValue: string, nominalValue: string) => {
    const gross = parseInt(grossValue, 10);
    const nominal = parseInt(nominalValue, 10);
    if (
      !Number.isFinite(gross) ||
      !Number.isFinite(nominal) ||
      gross <= 0 ||
      nominal <= 0
    )
      return null;
    return gross - nominal;
  };

  const calculatedTare = computeTare(calcGross, calcNominal);

  /** Ergebnis des Rechners direkt ins Tara-Feld übernehmen. */
  const applyCalculatedTare = (grossValue: string, nominalValue: string) => {
    const tare = computeTare(grossValue, nominalValue);
    if (tare != null && tare >= 0) setTareWeight(String(tare));
  };

  const invalidate = () => {
    utils.containerType.list.invalidate();
    utils.material.list.invalidate();
    utils.material.byId.invalidate();
  };

  const createMutation = trpc.containerType.create.useMutation({
    onSuccess: () => {
      toast.success(t.containerTypes.created);
      invalidate();
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const updateMutation = trpc.containerType.update.useMutation({
    onSuccess: () => {
      toast.success(t.containerTypes.saved);
      invalidate();
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const deleteMutation = trpc.containerType.delete.useMutation({
    onSuccess: () => {
      toast.success(t.containerTypes.deleted);
      invalidate();
      setDeleting(null);
    },
    onError: e => toast.error(e.message),
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tare = parseInt(tareWeight, 10);
    if (!name.trim()) return toast.error(t.common.nameRequired);
    if (!Number.isFinite(tare) || tare < 0)
      return toast.error(t.common.invalidTare);
    const payload = {
      name: name.trim(),
      manufacturer: manufacturer.trim() || undefined,
      tareWeight: tare,
      notes: notes.trim() || undefined,
    };
    if (editing) updateMutation.mutate({ id: editing.id, ...payload });
    else createMutation.mutate(payload);
  };

  const list = containerTypes ?? [];

  return (
    <AuthLayout>
      <div className="flex flex-col gap-4 sm:gap-6">
        <PageHeader
          title={t.containerTypes.title}
          description={t.containerTypes.description}
          actions={
            <Button
              className="w-full sm:w-auto"
              onClick={() => openDialog(null)}
            >
              <Plus className="mr-2 h-4 w-4" /> {t.containerTypes.newType}
            </Button>
          }
        />

        <Tabs defaultValue="eigene">
          {/* Auf schmalen Geräten scrollen die Reiter, statt die Beschriftung
              auf zwei Buchstaben zu kürzen. */}
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <TabsList className="w-max">
              <TabsTrigger value="eigene">
                {t.containerTypes.tabOwn}
              </TabsTrigger>
              <TabsTrigger value="katalog">
                {t.containerTypes.tabCatalog}
              </TabsTrigger>
              <TabsTrigger value="vorschlaege">
                {t.containerTypes.tabProposals}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="eigene">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton
                    key={i}
                    className="h-20 w-full rounded-xl sm:h-12"
                  />
                ))}
              </div>
            ) : list.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                  <Disc3 className="h-10 w-10 text-muted-foreground/50" />
                  <p className="font-medium">{t.containerTypes.emptyTitle}</p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    {t.containerTypes.emptyDescription}
                  </p>
                  <Button onClick={() => openDialog(null)}>
                    <Plus className="mr-2 h-4 w-4" />{" "}
                    {t.containerTypes.firstType}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Telefon: Karten statt Tabelle */}
                <div className="flex flex-col gap-3 sm:hidden">
                  {list.map(s => (
                    <div
                      key={s.id}
                      className="rounded-xl border bg-card p-3 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="wrap-break-word font-medium">
                            {s.name}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t.containerTypes.tareSuffix({
                              amount: formatGrams(s.tareWeight),
                            })}
                            {s.manufacturer ? ` · ${s.manufacturer}` : ""}
                          </p>
                        </div>
                        {s.sourceVariantId != null && (
                          <Badge
                            variant="secondary"
                            className="shrink-0 font-normal"
                          >
                            {t.containerTypes.fromCatalog}
                          </Badge>
                        )}
                      </div>
                      {s.notes && (
                        <p className="mt-2 wrap-break-word text-xs text-muted-foreground">
                          {s.notes}
                        </p>
                      )}
                      <div className="mt-3 flex gap-2 border-t pt-2">
                        <Button
                          variant="ghost"
                          className="h-10 flex-1"
                          onClick={() => openDialog(s)}
                        >
                          <Pencil className="mr-2 h-4 w-4" /> {t.common.edit}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10"
                          aria-label={t.containerTypes.proposeAsPreset}
                          onClick={() => setProposing(s)}
                        >
                          <Upload className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10"
                          aria-label={t.containerTypes.deleteType}
                          onClick={() => setDeleting(s)}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <Card className="hidden sm:block">
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.common.name}</TableHead>
                          <TableHead>{t.common.manufacturer}</TableHead>
                          <TableHead>{t.common.tare}</TableHead>
                          <TableHead className="hidden lg:table-cell">
                            {t.common.notes}
                          </TableHead>
                          <TableHead className="text-right">
                            {t.common.actions}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.map(s => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">
                              <div className="flex flex-wrap items-center gap-2">
                                {s.name}
                                {s.sourceVariantId != null && (
                                  <Badge
                                    variant="secondary"
                                    className="font-normal"
                                  >
                                    aus Katalog
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{s.manufacturer ?? "–"}</TableCell>
                            <TableCell>{formatGrams(s.tareWeight)}</TableCell>
                            <TableCell className="hidden max-w-[300px] truncate text-muted-foreground lg:table-cell">
                              {s.notes ?? "–"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={t.containerTypes.proposeAsPreset}
                                  title={t.containerTypes.proposeAsPreset}
                                  onClick={() => setProposing(s)}
                                >
                                  <Upload className="h-4 w-4 text-muted-foreground" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={t.common.edit}
                                  title={t.common.edit}
                                  onClick={() => openDialog(s)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={t.common.delete}
                                  title={t.common.delete}
                                  onClick={() => setDeleting(s)}
                                >
                                  <Trash2 className="h-4 w-4 text-muted-foreground" />
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
          </TabsContent>

          <TabsContent value="katalog">
            <Card>
              <CardContent className="p-4 sm:p-6">
                <PresetCatalog />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vorschlaege">
            <Card>
              <CardContent className="p-4 sm:p-6">
                <MyPresetProposals />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? t.containerTypes.editType : t.containerTypes.newType}
            </DialogTitle>
            <DialogDescription>
              Das Leergewicht der leeren Rolle bzw. Verpackung in Gramm.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="s-name">{t.common.nameRequiredLabel}</Label>
              <Input
                id="s-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t.containerTypes.namePlaceholder}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-manufacturer">{t.common.manufacturer}</Label>
              <Input
                id="s-manufacturer"
                value={manufacturer}
                onChange={e => setManufacturer(e.target.value)}
                placeholder={t.containerTypes.manufacturerPlaceholder}
              />
            </div>
            {/* Leergewicht-Rechner: volles Gebinde wiegen */}
            <div className="grid gap-3 rounded-lg border bg-muted/40 p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Calculator className="h-4 w-4 text-muted-foreground" />
                {t.containerTypes.calcTitle}
              </div>
              <p className="text-xs text-muted-foreground">
                {t.containerTypes.calcDescription}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="s-calc-gross" className="text-xs">
                    {t.containerTypes.calcGross}
                  </Label>
                  <Input
                    id="s-calc-gross"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={calcGross}
                    onChange={e => {
                      setCalcGross(e.target.value);
                      applyCalculatedTare(e.target.value, calcNominal);
                    }}
                    placeholder={t.containerTypes.calcGrossPlaceholder}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="s-calc-nominal" className="text-xs">
                    {t.containerTypes.calcNominal}
                  </Label>
                  <Input
                    id="s-calc-nominal"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={calcNominal}
                    onChange={e => {
                      setCalcNominal(e.target.value);
                      applyCalculatedTare(calcGross, e.target.value);
                    }}
                    placeholder={t.containerTypes.calcNominalPlaceholder}
                  />
                </div>
              </div>
              {calculatedTare != null &&
                (calculatedTare >= 0 ? (
                  <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium">
                    {t.containerTypes.calcResult({
                      amount: formatGrams(calculatedTare),
                    })}
                    <span className="ml-1 font-normal text-muted-foreground">
                      ({formatGrams(parseInt(calcGross, 10))} −{" "}
                      {formatGrams(parseInt(calcNominal, 10))})
                    </span>
                  </div>
                ) : (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {t.containerTypes.calcInvalid}
                  </div>
                ))}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-tare">{t.containerTypes.tareLabel}</Label>
              <Input
                id="s-tare"
                type="number"
                inputMode="numeric"
                min={0}
                value={tareWeight}
                onChange={e => setTareWeight(e.target.value)}
                placeholder={t.containerTypes.tarePlaceholder}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-notes">{t.common.notes}</Label>
              <Textarea
                id="s-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={saving}>
                {saving
                  ? t.common.saving
                  : editing
                    ? t.common.save
                    : t.common.create}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ProposePresetDialog
        key={proposing?.id ?? "none"}
        containerType={proposing}
        open={proposing != null}
        onOpenChange={o => !o && setProposing(null)}
      />

      <AlertDialog
        open={deleting != null}
        onOpenChange={o => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.containerTypes.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.containerTypes.deleteDescription({
                name: deleting?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleting && deleteMutation.mutate({ id: deleting.id })
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
