import { useState } from "react";
import {
  Boxes,
  Droplet,
  Grip,
  Package,
  Pencil,
  Plus,
  Trash2,
  Users2,
} from "lucide-react";
import { toast } from "sonner";
import {
  FILAMENT_DIAMETERS_UM,
  MATERIAL_KINDS,
  MAX_LAGER_PER_USER,
  formatDiameter,
  type FilamentDiameterUm,
  type MaterialKind,
} from "@contracts/materials";
import AuthLayout from "@/components/AuthLayout";
import { PageHeader } from "@/components/PageHeader";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18nContext";
import { kindHint, kindLabel } from "@/lib/materialKind";
import { trpc } from "@/lib/trpc";
import type { LagerItem } from "@/types";

/** Symbol je Materialart – rein zur Wiedererkennung in der Liste. */
const KIND_ICONS: Record<MaterialKind, typeof Package> = {
  filament: Package,
  powder: Grip,
  resin: Droplet,
};

/**
 * Lager anlegen und verwalten.
 *
 * Muster: `src/pages/StorageBoxes.tsx` – Liste mit Dialog zum Anlegen und
 * Bearbeiten, Löschen über einen Bestätigungsdialog.
 */
export default function LagerPage() {
  const utils = trpc.useUtils();
  const t = useT();
  const { data: lagerList, isLoading } = trpc.lager.list.useQuery();
  // Für die Belegung je Lager. Ohne `lagerId` kommt der gesamte Bestand.
  const { data: materials } = trpc.material.list.useQuery({});

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LagerItem | null>(null);
  const [deleting, setDeleting] = useState<LagerItem | null>(null);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<MaterialKind>("filament");
  /*
    Der Typ ist die Literal-Union, nicht `number`: So kann hier gar keine
    Stärke landen, die der Server ablehnen würde.
  */
  const [diameter, setDiameter] = useState<FilamentDiameterUm>(1750);
  const [notes, setNotes] = useState("");

  const openDialog = (item: LagerItem | null) => {
    setEditing(item);
    setName(item?.name ?? "");
    setKind(item?.materialKind ?? "filament");
    // Bestehende Werte kommen aus der Datenbank als `number`; alles außer den
    // beiden gängigen Stärken kann dort nicht stehen (siehe Migration/Prüfung).
    setDiameter(item?.filamentDiameterUm === 2850 ? 2850 : 1750);
    setNotes(item?.notes ?? "");
    setDialogOpen(true);
  };

  const materialCount = (lagerId: number) =>
    (materials ?? []).filter(m => m.lagerId === lagerId).length;

  const invalidate = () => {
    utils.lager.list.invalidate();
    utils.material.list.invalidate();
  };

  const createMutation = trpc.lager.create.useMutation({
    onSuccess: () => {
      toast.success(t.lager.created);
      invalidate();
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const updateMutation = trpc.lager.update.useMutation({
    onSuccess: () => {
      toast.success(t.lager.saved);
      invalidate();
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const deleteMutation = trpc.lager.delete.useMutation({
    onSuccess: () => {
      toast.success(t.lager.deleted);
      invalidate();
      setDeleting(null);
    },
    onError: e => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t.common.nameRequired);
      return;
    }
    /*
      Die Stärke gehört nur zu Filament. Andernfalls `null` – der Server prüft
      dasselbe noch einmal (`lagerConfigIsValid`), aber das Formular soll gar
      keinen unmöglichen Zustand schicken.
    */
    const payload = {
      name: trimmed,
      materialKind: kind,
      filamentDiameterUm: kind === "filament" ? diameter : null,
      notes: notes.trim() || null,
    };
    if (editing) updateMutation.mutate({ id: editing.id, ...payload });
    else createMutation.mutate(payload);
  };

  const list = lagerList ?? [];
  const limitReached = list.length >= MAX_LAGER_PER_USER;
  const pending = createMutation.isPending || updateMutation.isPending;

  return (
    <AuthLayout>
      <div className="flex flex-col gap-4 sm:gap-6">
        <PageHeader
          title={t.lager.title}
          description={t.lager.description}
          actions={
            <Button
              onClick={() => openDialog(null)}
              disabled={limitReached}
              title={
                limitReached
                  ? t.lager.limitReached({ max: MAX_LAGER_PER_USER })
                  : undefined
              }
              className="w-full sm:w-auto"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t.lager.newLager}
            </Button>
          }
        />

        {limitReached && (
          <p className="text-xs text-muted-foreground">
            {t.lager.limitReached({ max: MAX_LAGER_PER_USER })}
          </p>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Boxes className="h-10 w-10 text-muted-foreground/50" />
              <p className="font-medium">{t.lager.emptyTitle}</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {t.lager.emptyDescription}
              </p>
              <Button onClick={() => openDialog(null)}>
                <Plus className="mr-2 h-4 w-4" />
                {t.lager.firstLager}
              </Button>
            </CardContent>
          </Card>
        ) : (
          /*
            Karten statt einer Tabelle, auf jeder Breite: Es sind höchstens fünf
            Einträge mit vier Angaben – eine Tabelle brächte hier nichts und auf
            dem Telefon eine Querscroll-Leiste.
          */
          <div className="flex flex-col gap-3">
            {list.map(item => {
              const Icon = KIND_ICONS[item.materialKind];
              const count = materialCount(item.id);
              return (
                <Card key={item.id}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="truncate font-medium">
                          {item.name}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary">
                            {kindLabel(t, item.materialKind)}
                          </Badge>
                          {item.filamentDiameterUm != null && (
                            <Badge variant="outline">
                              {formatDiameter(item.filamentDiameterUm)}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {t.lager.materialCount({ count })}
                          </span>
                          {/*
                            Die Gegenprobe zur Voreinstellung „nichts
                            freigegeben“: Wird ein Lager geteilt, muss man das
                            hier sehen, ohne jede Freundeskarte durchzuklicken.
                            Bei null Freunden steht bewusst nichts – eine
                            Auszeichnung „mit 0 Freunden geteilt“ wäre Lärm.
                          */}
                          {item.sharedWith > 0 && (
                            <Badge variant="outline">
                              <Users2 className="mr-1 h-3 w-3" />
                              {t.lager.sharedWith({ count: item.sharedWith })}
                            </Badge>
                          )}
                        </div>
                        {item.notes && (
                          <p className="truncate text-xs text-muted-foreground">
                            {item.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t.lager.editLager}
                        onClick={() => openDialog(item)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t.lager.deleteLager}
                        onClick={() => setDeleting(item)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>
                {editing ? t.lager.editLager : t.lager.newLager}
              </DialogTitle>
              <DialogDescription>{t.lager.description}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="lager-name">{t.lager.nameLabel}</Label>
                <Input
                  id="lager-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t.lager.namePlaceholder}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="lager-kind">{t.lager.kindLabel}</Label>
                <Select
                  value={kind}
                  onValueChange={value => setKind(value as MaterialKind)}
                >
                  <SelectTrigger id="lager-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIAL_KINDS.map(k => (
                      <SelectItem key={k} value={k}>
                        {kindLabel(t, k)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {kindHint(t, kind)}
                </p>
              </div>

              {/* Die Stärke gibt es nur beim Filament – siehe lagerConfigIsValid */}
              {kind === "filament" && (
                <div className="grid gap-2">
                  <Label htmlFor="lager-diameter">
                    {t.lager.diameterLabel}
                  </Label>
                  <Select
                    value={String(diameter)}
                    onValueChange={value =>
                      setDiameter(Number(value) as FilamentDiameterUm)
                    }
                  >
                    <SelectTrigger id="lager-diameter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FILAMENT_DIAMETERS_UM.map(um => (
                        <SelectItem key={um} value={String(um)}>
                          {formatDiameter(um)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t.lager.diameterHint}
                  </p>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="lager-notes">{t.common.notesOptional}</Label>
                <Textarea
                  id="lager-notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                {t.common.cancel}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending
                  ? t.common.saving
                  : editing
                    ? t.common.save
                    : t.common.create}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting != null}
        onOpenChange={open => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.lager.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? t.lager.deleteDescription({ name: deleting.name })
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleting && deleteMutation.mutate({ id: deleting.id })
              }
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AuthLayout>
  );
}
