import { useState } from "react";
import { Calculator, Disc3, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import AuthLayout from "@/components/AuthLayout";
import { MyPresetProposals } from "@/components/MyPresetProposals";
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
import { trpc } from "@/lib/trpc";
import type { SpoolTypeItem } from "@/types";

export default function SpoolTypes() {
  const utils = trpc.useUtils();
  const { formatGrams } = useFormat();
  const { data: spoolTypes, isLoading } = trpc.spoolType.list.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SpoolTypeItem | null>(null);
  const [deleting, setDeleting] = useState<SpoolTypeItem | null>(null);
  const [proposing, setProposing] = useState<SpoolTypeItem | null>(null);

  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [tareWeight, setTareWeight] = useState("");
  const [notes, setNotes] = useState("");
  // Leergewicht-Rechner: neue (volle) Rolle wiegen
  const [calcGross, setCalcGross] = useState("");
  const [calcNominal, setCalcNominal] = useState("");

  /** Dialog öffnen und die Felder aus dem Eintrag befüllen (`null` = neu). */
  const openDialog = (spoolType: SpoolTypeItem | null) => {
    setEditing(spoolType);
    setName(spoolType?.name ?? "");
    setManufacturer(spoolType?.manufacturer ?? "");
    setTareWeight(spoolType ? String(spoolType.tareWeight) : "");
    setNotes(spoolType?.notes ?? "");
    setCalcGross("");
    setCalcNominal("");
    setDialogOpen(true);
  };

  /**
   * Berechnetes Leergewicht: gemessenes Gewicht der neuen Rolle minus
   * Nenn-Füllmenge des Materials (z. B. 1250 g - 1000 g = 250 g).
   */
  const computeTare = (grossValue: string, nominalValue: string) => {
    const gross = parseInt(grossValue, 10);
    const nominal = parseInt(nominalValue, 10);
    if (!Number.isFinite(gross) || !Number.isFinite(nominal) || gross <= 0 || nominal <= 0)
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
    utils.spoolType.list.invalidate();
    utils.material.list.invalidate();
    utils.material.byId.invalidate();
  };

  const createMutation = trpc.spoolType.create.useMutation({
    onSuccess: () => {
      toast.success("Rollentyp angelegt");
      invalidate();
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.spoolType.update.useMutation({
    onSuccess: () => {
      toast.success("Rollentyp gespeichert");
      invalidate();
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.spoolType.delete.useMutation({
    onSuccess: () => {
      toast.success("Rollentyp gelöscht");
      invalidate();
      setDeleting(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tare = parseInt(tareWeight, 10);
    if (!name.trim()) return toast.error("Bitte einen Namen angeben");
    if (!Number.isFinite(tare) || tare < 0)
      return toast.error("Bitte ein gültiges Leergewicht in Gramm angeben");
    const payload = {
      name: name.trim(),
      manufacturer: manufacturer.trim() || undefined,
      tareWeight: tare,
      notes: notes.trim() || undefined,
    };
    if (editing) updateMutation.mutate({ id: editing.id, ...payload });
    else createMutation.mutate(payload);
  };

  return (
    <AuthLayout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Rollentypen</h1>
            <p className="text-sm text-muted-foreground">
              Verpackungen und Spulen mit hinterlegtem Leergewicht (Tara)
            </p>
          </div>
          <Button
            onClick={() => openDialog(null)}
          >
            <Plus className="mr-2 h-4 w-4" /> Neuer Rollentyp
          </Button>
        </div>

        <Tabs defaultValue="eigene">
          <TabsList>
            <TabsTrigger value="eigene">Meine Rollentypen</TabsTrigger>
            <TabsTrigger value="katalog">Preset-Katalog</TabsTrigger>
            <TabsTrigger value="vorschlaege">Meine Vorschläge</TabsTrigger>
          </TabsList>

          <TabsContent value="eigene">
            <Card>
              <CardContent className="pt-6">
                {isLoading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (spoolTypes ?? []).length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-12 text-center">
                    <Disc3 className="h-10 w-10 text-muted-foreground/50" />
                    <p className="font-medium">Noch keine Rollentypen angelegt</p>
                    <p className="text-sm text-muted-foreground">
                      Lege z. B. „Kunststoffspule 1 kg (140 g)“ oder „Pappspule (55 g)“ an –
                      das Leergewicht wird bei jeder Wägung automatisch abgezogen.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Hersteller</TableHead>
                        <TableHead>Leergewicht</TableHead>
                        <TableHead>Notizen</TableHead>
                        <TableHead className="text-right">Aktionen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(spoolTypes ?? []).map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">
                            <div className="flex flex-wrap items-center gap-2">
                              {s.name}
                              {s.sourceVariantId != null && (
                                <Badge variant="secondary" className="font-normal">
                                  aus Katalog
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{s.manufacturer ?? "–"}</TableCell>
                          <TableCell>{formatGrams(s.tareWeight)}</TableCell>
                          <TableCell className="max-w-[300px] truncate text-muted-foreground">
                            {s.notes ?? "–"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Als Preset vorschlagen"
                                onClick={() => setProposing(s)}
                              >
                                <Upload className="h-4 w-4 text-muted-foreground" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Bearbeiten"
                                onClick={() => openDialog(s)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Löschen"
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
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="katalog">
            <Card>
              <CardContent className="pt-6">
                <PresetCatalog />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vorschlaege">
            <Card>
              <CardContent className="pt-6">
                <MyPresetProposals />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Rollentyp bearbeiten" : "Neuer Rollentyp"}</DialogTitle>
            <DialogDescription>
              Das Leergewicht der leeren Rolle bzw. Verpackung in Gramm.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="s-name">Name *</Label>
              <Input
                id="s-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. Kunststoffspule 1 kg"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-manufacturer">Hersteller</Label>
              <Input
                id="s-manufacturer"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="z. B. eSun, Prusament"
              />
            </div>
            {/* Leergewicht-Rechner: neue Rolle wiegen */}
            <div className="grid gap-3 rounded-lg border bg-muted/40 p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Calculator className="h-4 w-4 text-muted-foreground" />
                Leergewicht aus Wägung berechnen
              </div>
              <p className="text-xs text-muted-foreground">
                Neue (volle) Rolle auf die Waage legen, Gesamtgewicht und
                Nenn-Füllmenge eintragen – das Leergewicht wird automatisch
                berechnet und unten übernommen.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="s-calc-gross" className="text-xs">
                    Gewicht neue Rolle (g)
                  </Label>
                  <Input
                    id="s-calc-gross"
                    type="number"
                    min={1}
                    value={calcGross}
                    onChange={(e) => {
                      setCalcGross(e.target.value);
                      applyCalculatedTare(e.target.value, calcNominal);
                    }}
                    placeholder="z. B. 1250"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="s-calc-nominal" className="text-xs">
                    Nenn-Füllmenge (g)
                  </Label>
                  <Input
                    id="s-calc-nominal"
                    type="number"
                    min={1}
                    value={calcNominal}
                    onChange={(e) => {
                      setCalcNominal(e.target.value);
                      applyCalculatedTare(calcGross, e.target.value);
                    }}
                    placeholder="z. B. 1000"
                  />
                </div>
              </div>
              {calculatedTare != null &&
                (calculatedTare >= 0 ? (
                  <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium">
                    Leergewicht: {formatGrams(calculatedTare)}
                    <span className="ml-1 font-normal text-muted-foreground">
                      ({formatGrams(parseInt(calcGross, 10))} −{" "}
                      {formatGrams(parseInt(calcNominal, 10))})
                    </span>
                  </div>
                ) : (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    Das Gesamtgewicht muss größer als die Nenn-Füllmenge sein.
                  </div>
                ))}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-tare">Leergewicht (g) *</Label>
              <Input
                id="s-tare"
                type="number"
                min={0}
                value={tareWeight}
                onChange={(e) => setTareWeight(e.target.value)}
                placeholder="z. B. 140"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="s-notes">Notizen</Label>
              <Textarea
                id="s-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
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
                {saving ? "Speichern …" : editing ? "Speichern" : "Anlegen"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ProposePresetDialog
        key={proposing?.id ?? "none"}
        spoolType={proposing}
        open={proposing != null}
        onOpenChange={(o) => !o && setProposing(null)}
      />

      <AlertDialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rollentyp löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{deleting?.name}“ wird gelöscht. Materialien, die diesen Typ verwenden,
              müssen vorher umgehängt werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMutation.mutate({ id: deleting.id })}
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
