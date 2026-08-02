import { useState } from "react";
import { Archive, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AuthLayout from "@/components/AuthLayout";
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
import { formatGrams } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import type { StorageBoxItem } from "@/types";

export default function StorageBoxes() {
  const utils = trpc.useUtils();
  const { data: boxes, isLoading } = trpc.storageBox.list.useQuery();
  const { data: materials } = trpc.material.list.useQuery();

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
    (materials ?? []).filter((m) => m.storageBoxId === boxId).length;

  const invalidate = () => {
    utils.storageBox.list.invalidate();
    utils.material.list.invalidate();
    utils.material.byId.invalidate();
  };

  const createMutation = trpc.storageBox.create.useMutation({
    onSuccess: () => {
      toast.success("Lagerbox angelegt");
      invalidate();
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.storageBox.update.useMutation({
    onSuccess: () => {
      toast.success("Lagerbox gespeichert");
      invalidate();
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.storageBox.delete.useMutation({
    onSuccess: () => {
      toast.success("Lagerbox gelöscht");
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
      location: location.trim() || undefined,
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
            <h1 className="text-2xl font-semibold tracking-tight">Lagerboxen</h1>
            <p className="text-sm text-muted-foreground">
              Dryboxen und Aufbewahrungsboxen mit Leergewicht – beim Wiegen in der Box
              wird deren Tara automatisch abgezogen
            </p>
          </div>
          <Button
            onClick={() => openDialog(null)}
          >
            <Plus className="mr-2 h-4 w-4" /> Neue Lagerbox
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (boxes ?? []).length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Archive className="h-10 w-10 text-muted-foreground/50" />
                <p className="font-medium">Noch keine Lagerboxen angelegt</p>
                <p className="text-sm text-muted-foreground">
                  Wiege deine leere Drybox, trage das Leergewicht ein und weise sie
                  einem Material zu – die App rechnet die Box-Tara automatisch heraus.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Standort</TableHead>
                    <TableHead>Leergewicht</TableHead>
                    <TableHead>Belegung</TableHead>
                    <TableHead>Notizen</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(boxes ?? []).map((b) => {
                    const count = assignedCount(b.id);
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <TableCell>{b.location ?? "–"}</TableCell>
                        <TableCell>{formatGrams(b.tareWeight)}</TableCell>
                        <TableCell>
                          {count > 0 ? (
                            <Badge variant="secondary">
                              {count} Material{count > 1 ? "ien" : ""}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">frei</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate text-muted-foreground">
                          {b.notes ?? "–"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDialog(b)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleting(b)}>
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Lagerbox bearbeiten" : "Neue Lagerbox"}</DialogTitle>
            <DialogDescription>
              Das Leergewicht der leeren Box (ohne Material) in Gramm.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="b-name">Name *</Label>
              <Input
                id="b-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. Drybox 1"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="b-location">Standort</Label>
              <Input
                id="b-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="z. B. Regal links, Werkstatt"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="b-tare">Leergewicht (g) *</Label>
              <Input
                id="b-tare"
                type="number"
                min={0}
                value={tareWeight}
                onChange={(e) => setTareWeight(e.target.value)}
                placeholder="z. B. 850"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="b-notes">Notizen</Label>
              <Textarea
                id="b-notes"
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

      <AlertDialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lagerbox löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{deleting?.name}“ wird gelöscht. Sie darf aktuell keinem Material
              zugewiesen sein.
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
