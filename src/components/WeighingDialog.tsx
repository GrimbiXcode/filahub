import { useMemo, useState } from "react";
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
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";
import type { MaterialOverview } from "@/types";
import { PERSONAL_SCOPE } from "@/lib/scope";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  material: MaterialOverview | null;
};

export function WeighingDialog({ open, onOpenChange, material }: Props) {
  const utils = trpc.useUtils();
  const { formatGrams, formatPercent } = useFormat();
  const t = useT();
  const [grossWeight, setGrossWeight] = useState("");
  const [note, setNote] = useState("");

  // Formular beim Öffnen leeren. Bewusst während des Renderns statt im
  // Effekt: React verwirft den Render sofort wieder und rendert mit den
  // neuen Werten neu, sodass kein Zwischenstand mit alten Eingaben
  // sichtbar wird (https://react.dev/reference/react/useState).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setGrossWeight("");
      setNote("");
    }
  }

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
      toast.success(t.weighing.saved);
      utils.material.list.invalidate();
      utils.material.byId.invalidate();
      utils.material.recentWeighings.invalidate();
      onOpenChange(false);
    },
    onError: e => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!material) return;
    const gross = parseInt(grossWeight, 10);
    if (!Number.isFinite(gross) || gross <= 0)
      return toast.error(t.weighing.invalidWeight);
    addWeighing.mutate({
      ...PERSONAL_SCOPE,
      materialId: material.id,
      grossWeight: gross,
      note: note.trim() || undefined,
    });
  };

  if (!material) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" /> {t.weighing.title}
          </DialogTitle>
          <DialogDescription>
            {t.weighing.description({
              name: material.name,
              withBox: material.storageBox != null,
            })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          {/* Das Gewichtsfeld steht bewusst oben: Wer vor der Waage steht,
              tippt die Zahl ein und ist fertig. */}
          <div className="grid gap-2">
            <Label htmlFor="w-gross">{t.weighing.grossLabel}</Label>
            <Input
              id="w-gross"
              type="number"
              inputMode="numeric"
              min={1}
              autoFocus
              value={grossWeight}
              onChange={e => setGrossWeight(e.target.value)}
              placeholder={t.weighing.grossPlaceholder}
              // Die Pfeilchen des Zahlenfelds stören in der großen Anzeige
              className="h-14 text-center text-2xl font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
          {preview && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
              <div className="flex justify-between font-medium">
                <span>{t.weighing.remaining}</span>
                <span className="tabular-nums">
                  {formatGrams(preview.remaining)}
                  {preview.percent != null &&
                    ` (${formatPercent(preview.percent)})`}
                </span>
              </div>
            </div>
          )}
          <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t.weighing.tareContainer}
              </span>
              <span>{formatGrams(material.containerTareWeight)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {material.storageBox
                  ? t.weighing.tareBoxNamed({ name: material.storageBox.name })
                  : t.weighing.tareBox}
              </span>
              <span>{formatGrams(material.storageBox?.tareWeight ?? 0)}</span>
            </div>
            <div className="flex justify-between font-medium border-t pt-1">
              <span>{t.weighing.tareTotal}</span>
              <span>{formatGrams(material.tareWeight)}</span>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="w-note">{t.common.notesOptional}</Label>
            <Input
              id="w-note"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={t.weighing.notePlaceholder}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={addWeighing.isPending}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={addWeighing.isPending}>
              {addWeighing.isPending ? t.common.saving : t.weighing.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
