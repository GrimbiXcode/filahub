import { useState } from "react";
import { Archive, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";
import type { StorageBoxItem } from "@/types";
import { PERSONAL_SCOPE } from "@/lib/scope";

export default function StorageBoxes() {
  const utils = trpc.useUtils();
  const { formatGrams } = useFormat();
  const t = useT();
  const { data: boxes, isLoading } =
    trpc.storageBox.list.useQuery(PERSONAL_SCOPE);
  const { data: materials } = trpc.material.list.useQuery(PERSONAL_SCOPE);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StorageBoxItem | null>(null);
  const [deleting, setDeleting] = useState<StorageBoxItem | null>(null);

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [tareWeight, setTareWeight] = useState("");
  const [notes, setNotes] = useState("");

  /** Dialog öffnen und die Felder aus dem Eintrag befüllen (`null` = neu). */
  const openDialog = (box: StorageBoxItem | null) => {
    setEditing(box);
    setName(box?.name ?? "");
    setLocation(box?.location ?? "");
    setTareWeight(box ? String(box.tareWeight) : "");
    setNotes(box?.notes ?? "");
    setDialogOpen(true);
  };

  const assignedCount = (boxId: number) =>
    (materials ?? []).filter(m => m.storageBoxId === boxId).length;

  const invalidate = () => {
    utils.storageBox.list.invalidate();
    utils.material.list.invalidate();
    utils.material.byId.invalidate();
  };

  const createMutation = trpc.storageBox.create.useMutation({
    onSuccess: () => {
      toast.success(t.storageBoxes.created);
      invalidate();
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const updateMutation = trpc.storageBox.update.useMutation({
    onSuccess: () => {
      toast.success(t.storageBoxes.saved);
      invalidate();
      setDialogOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const deleteMutation = trpc.storageBox.delete.useMutation({
    onSuccess: () => {
      toast.success(t.storageBoxes.deleted);
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
      location: location.trim() || undefined,
      tareWeight: tare,
      notes: notes.trim() || undefined,
    };
    if (editing)
      updateMutation.mutate({ ...PERSONAL_SCOPE, id: editing.id, ...payload });
    else createMutation.mutate({ ...PERSONAL_SCOPE, ...payload });
  };

  const list = boxes ?? [];

  return (
    <AuthLayout>
      <div className="flex flex-col gap-4 sm:gap-6">
        <PageHeader
          title={t.storageBoxes.title}
          description={t.storageBoxes.description}
          actions={
            <Button
              className="w-full sm:w-auto"
              onClick={() => openDialog(null)}
            >
              <Plus className="mr-2 h-4 w-4" /> {t.storageBoxes.newBox}
            </Button>
          }
        />

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl sm:h-12" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Archive className="h-10 w-10 text-muted-foreground/50" />
              <p className="font-medium">{t.storageBoxes.emptyTitle}</p>
              <p className="max-w-md text-sm text-muted-foreground">
                {t.storageBoxes.emptyDescription}
              </p>
              <Button onClick={() => openDialog(null)}>
                <Plus className="mr-2 h-4 w-4" /> {t.storageBoxes.firstBox}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Telefon: Karten statt Tabelle */}
            <div className="flex flex-col gap-3 sm:hidden">
              {list.map(b => {
                const count = assignedCount(b.id);
                return (
                  <div
                    key={b.id}
                    className="rounded-xl border bg-card p-3 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{b.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t.storageBoxes.tareSuffix({
                            amount: formatGrams(b.tareWeight),
                          })}
                          {b.location ? ` · ${b.location}` : ""}
                        </p>
                      </div>
                      {count > 0 ? (
                        <Badge variant="secondary" className="shrink-0">
                          {t.storageBoxes.assigned({ count })}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="shrink-0 font-normal"
                        >
                          {t.storageBoxes.free}
                        </Badge>
                      )}
                    </div>
                    {b.notes && (
                      <p className="mt-2 wrap-break-word text-xs text-muted-foreground">
                        {b.notes}
                      </p>
                    )}
                    <div className="mt-3 flex gap-2 border-t pt-2">
                      <Button
                        variant="ghost"
                        className="h-10 flex-1"
                        onClick={() => openDialog(b)}
                      >
                        <Pencil className="mr-2 h-4 w-4" /> {t.common.edit}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10"
                        aria-label={t.storageBoxes.deleteBox}
                        onClick={() => setDeleting(b)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <Card className="hidden sm:block">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.common.name}</TableHead>
                      <TableHead>{t.storageBoxes.location}</TableHead>
                      <TableHead>{t.common.tare}</TableHead>
                      <TableHead>{t.storageBoxes.occupancy}</TableHead>
                      <TableHead className="hidden lg:table-cell">
                        {t.common.notes}
                      </TableHead>
                      <TableHead className="text-right">
                        {t.common.actions}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map(b => {
                      const count = assignedCount(b.id);
                      return (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium">
                            {b.name}
                          </TableCell>
                          <TableCell>{b.location ?? "–"}</TableCell>
                          <TableCell>{formatGrams(b.tareWeight)}</TableCell>
                          <TableCell>
                            {count > 0 ? (
                              <Badge variant="secondary">
                                {t.storageBoxes.assigned({ count })}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">
                                frei
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="hidden max-w-[240px] truncate text-muted-foreground lg:table-cell">
                            {b.notes ?? "–"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={t.common.edit}
                                onClick={() => openDialog(b)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={t.common.delete}
                                onClick={() => setDeleting(b)}
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? t.storageBoxes.editBox : t.storageBoxes.newBox}
            </DialogTitle>
            <DialogDescription>
              Das Leergewicht der leeren Box (ohne Material) in Gramm.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="b-name">{t.common.nameRequiredLabel}</Label>
              <Input
                id="b-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t.storageBoxes.namePlaceholder}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="b-location">{t.storageBoxes.location}</Label>
              <Input
                id="b-location"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder={t.storageBoxes.locationPlaceholder}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="b-tare">{t.storageBoxes.tareLabel}</Label>
              <Input
                id="b-tare"
                type="number"
                inputMode="numeric"
                min={0}
                value={tareWeight}
                onChange={e => setTareWeight(e.target.value)}
                placeholder={t.storageBoxes.tarePlaceholder}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="b-notes">{t.common.notes}</Label>
              <Textarea
                id="b-notes"
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

      <AlertDialog
        open={deleting != null}
        onOpenChange={o => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.storageBoxes.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.storageBoxes.deleteDescription({
                name: deleting?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleting &&
                deleteMutation.mutate({ ...PERSONAL_SCOPE, id: deleting.id })
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
