import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
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
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";
import type { MaterialOverview } from "@/types";
import { useActiveScope } from "@/lib/activeScope";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  material: MaterialOverview | null;
};

/**
 * Verbrauch abbuchen: die Gramm, die ein Druck gebraucht hat – laut Slicer,
 * ohne Waage. Aufgebaut wie `WeighingDialog`, nur dass die Zahl abgezogen
 * statt gemessen wird.
 */
export function ConsumptionDialog({ open, onOpenChange, material }: Props) {
  const utils = trpc.useUtils();
  const { formatGrams, formatPercent } = useFormat();
  const t = useT();
  const scope = useActiveScope();
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");

  // Formular beim Öffnen leeren – während des Renderns, wie im WeighingDialog.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setWeight("");
      setNote("");
    }
  }

  /*
    Die Vorschau rechnet nur „bisher übrig minus Eingabe“. `remainingWeight`
    kommt vom Server und enthält Tara und frühere Verbräuche schon – hier
    entsteht keine zweite Fassung der Restmengenrechnung.
  */
  const preview = useMemo(() => {
    if (!material) return null;
    const grams = parseInt(weight, 10);
    if (!Number.isFinite(grams) || grams <= 0) return null;
    const after = Math.max(0, material.remainingWeight - grams);
    const percent =
      material.nominalWeight > 0
        ? Math.min(100, Math.round((after / material.nominalWeight) * 100))
        : null;
    return { after, percent, exceeds: grams > material.remainingWeight };
  }, [material, weight]);

  const addConsumption = trpc.material.addConsumption.useMutation({
    onSuccess: () => {
      toast.success(t.consumption.saved);
      utils.material.list.invalidate();
      utils.material.byId.invalidate();
      onOpenChange(false);
    },
    onError: e => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!material) return;
    const grams = parseInt(weight, 10);
    if (!Number.isFinite(grams) || grams <= 0)
      return toast.error(t.consumption.invalidWeight);
    addConsumption.mutate({
      ...scope,
      materialId: material.id,
      weight: grams,
      note: note.trim() || undefined,
    });
  };

  if (!material) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" /> {t.consumption.title}
          </DialogTitle>
          <DialogDescription>
            {t.consumption.description({ name: material.name })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="c-weight">{t.consumption.weightLabel}</Label>
            <Input
              id="c-weight"
              type="number"
              inputMode="numeric"
              min={1}
              autoFocus
              value={weight}
              onChange={e => setWeight(e.target.value)}
              placeholder={t.consumption.weightPlaceholder}
              className="h-14 text-center text-2xl font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
          <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t.consumption.before}
              </span>
              <span className="tabular-nums">
                {formatGrams(material.remainingWeight)}
              </span>
            </div>
            {preview && (
              <div className="flex justify-between border-t pt-1 font-medium">
                <span>{t.consumption.after}</span>
                <span className="tabular-nums">
                  {formatGrams(preview.after)}
                  {preview.percent != null &&
                    ` (${formatPercent(preview.percent)})`}
                </span>
              </div>
            )}
          </div>
          {preview?.exceeds && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              {t.consumption.exceeds}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="c-note">{t.common.notesOptional}</Label>
            <Input
              id="c-note"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={t.consumption.notePlaceholder}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={addConsumption.isPending}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={addConsumption.isPending}>
              {addConsumption.isPending
                ? t.common.saving
                : t.consumption.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
