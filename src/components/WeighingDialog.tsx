import { useEffect, useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { formatGrams } from "@/lib/format";
import { trpc } from "@/providers/trpc";
import type { MaterialOverview } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  material: MaterialOverview | null;
};

export function WeighingDialog({ open, onOpenChange, material }: Props) {
  const utils = trpc.useUtils();
  const [grossWeight, setGrossWeight] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setGrossWeight("");
      setNote("");
    }
  }, [open]);

  const preview = useMemo(() => {
    if (!material) return null;
    const gross = parseInt(grossWeight, 10);
    if (!Number.isFinite(gross) || gross <= 0) return null;
    const remaining = Math.max(0, gross - material.tareWeight);
    const percent =
      material.nominalWeight > 0
        ? Math.min(100, Math.round((remaining / material.nominalWeight) * 100))
        : null;
    return { remaining, percent };
  }, [material, grossWeight]);

  const addWeighing = trpc.material.addWeighing.useMutation({
    onSuccess: () => {
      toast.success("Wägung gespeichert");
      utils.material.list.invalidate();
      utils.material.byId.invalidate();
      utils.material.recentWeighings.invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!material) return;
    const gross = parseInt(grossWeight, 10);
    if (!Number.isFinite(gross) || gross <= 0)
      return toast.error("Bitte ein gültiges Gewicht in Gramm angeben");
    addWeighing.mutate({
      materialId: material.id,
      grossWeight: gross,
      note: note.trim() || undefined,
    });
  };

  if (!material) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" /> Material wiegen
          </DialogTitle>
          <DialogDescription>
            Wiege „{material.name}" komplett – inklusive Rolle
            {material.storageBox ? " und Lagerbox" : ""}. Das Leergewicht wird
            automatisch abgezogen.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tara Rolle/Verpackung</span>
              <span>{formatGrams(material.spoolTareWeight)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Tara Lagerbox{material.storageBox ? ` (${material.storageBox.name})` : ""}
              </span>
              <span>{formatGrams(material.storageBox?.tareWeight ?? 0)}</span>
            </div>
            <div className="flex justify-between font-medium border-t pt-1">
              <span>Tara gesamt</span>
              <span>{formatGrams(material.tareWeight)}</span>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="w-gross">Gemessenes Gesamtgewicht (g) *</Label>
            <Input
              id="w-gross"
              type="number"
              min={1}
              autoFocus
              value={grossWeight}
              onChange={(e) => setGrossWeight(e.target.value)}
              placeholder="z. B. 740"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="w-note">Notiz (optional)</Label>
            <Input
              id="w-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="z. B. nach Druck von Teil X"
            />
          </div>
          {preview && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
              <div className="flex justify-between font-medium">
                <span>Effektiv übrig</span>
                <span>
                  {formatGrams(preview.remaining)}
                  {preview.percent != null && ` (${preview.percent} %)`}
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={addWeighing.isPending}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={addWeighing.isPending}>
              {addWeighing.isPending ? "Speichern …" : "Wägung speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
