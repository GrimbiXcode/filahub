import { useState } from "react";
import { toast } from "sonner";
import { formatNominalWeight } from "@contracts/presets";
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
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/providers/trpc";
import type { PresetVariantNode } from "@/types";

type Props = {
  variant: PresetVariantNode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Optionale Zahl aus einem Eingabefeld: leer → null, ungültig → undefined */
function parseOptionalInt(value: string): number | null | undefined {
  if (!value.trim()) return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Änderungsvorschlag zu einer Katalog-Variante. Übermittelt wird nur, was
 * gegenüber dem aktuellen Stand abweicht – ein leerer Vorschlag wird
 * serverseitig abgelehnt.
 */
export function ProposeChangeDialog({ variant, open, onOpenChange }: Props) {
  const utils = trpc.useUtils();
  // Der Aufrufer gibt der Komponente einen key je Variante – der Zustand wird
  // deshalb beim Öffnen über den Initialwert gesetzt, nicht über einen Effekt.
  const [tareWeight, setTareWeight] = useState(() =>
    variant ? String(variant.tareWeight) : "",
  );
  const [outerDiameterMm, setOuterDiameterMm] = useState(() =>
    variant?.outerDiameterMm ? String(variant.outerDiameterMm) : "",
  );
  const [widthMm, setWidthMm] = useState(() =>
    variant?.widthMm ? String(variant.widthMm) : "",
  );
  const [boreDiameterMm, setBoreDiameterMm] = useState(() =>
    variant?.boreDiameterMm ? String(variant.boreDiameterMm) : "",
  );
  const [comment, setComment] = useState("");

  const submit = trpc.preset.proposals.submitChange.useMutation({
    onSuccess: () => {
      toast.success("Vorschlag eingereicht – er wird von der Moderation geprüft.");
      utils.preset.proposals.mine.invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!variant) return;

    const tare = parseInt(tareWeight, 10);
    if (!Number.isFinite(tare) || tare < 0)
      return toast.error("Bitte ein gültiges Leergewicht in Gramm angeben");

    const outer = parseOptionalInt(outerDiameterMm);
    const width = parseOptionalInt(widthMm);
    const bore = parseOptionalInt(boreDiameterMm);
    if (outer === undefined || width === undefined || bore === undefined)
      return toast.error("Bitte gültige Abmessungen in Millimetern angeben");

    // Nur tatsächliche Abweichungen übermitteln
    const patch: Record<string, number | null> = {};
    if (tare !== variant.tareWeight) patch.tareWeight = tare;
    if (outer !== variant.outerDiameterMm) patch.outerDiameterMm = outer;
    if (width !== variant.widthMm) patch.widthMm = width;
    if (bore !== variant.boreDiameterMm) patch.boreDiameterMm = bore;

    if (Object.keys(patch).length === 0)
      return toast.error("Der Vorschlag enthält keine Änderungen");

    submit.mutate({
      targetType: "variant",
      targetId: variant.id,
      payload: { kind: "change", scope: "variant", patch },
      comment: comment.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Änderung vorschlagen</DialogTitle>
          <DialogDescription>
            {variant?.displayName} ·{" "}
            {variant ? formatNominalWeight(variant.nominalWeight) : ""}. Deine
            Korrektur wird von einer Administratorin oder einem Administrator
            geprüft, bevor sie im Katalog landet.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="pc-tare">Leergewicht (g)</Label>
            <Input
              id="pc-tare"
              type="number"
              min={0}
              value={tareWeight}
              onChange={(e) => setTareWeight(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pc-outer" className="text-xs">
                Außen-Ø (mm)
              </Label>
              <Input
                id="pc-outer"
                type="number"
                value={outerDiameterMm}
                onChange={(e) => setOuterDiameterMm(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pc-width" className="text-xs">
                Breite (mm)
              </Label>
              <Input
                id="pc-width"
                type="number"
                value={widthMm}
                onChange={(e) => setWidthMm(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pc-bore" className="text-xs">
                Bohrung (mm)
              </Label>
              <Input
                id="pc-bore"
                type="number"
                value={boreDiameterMm}
                onChange={(e) => setBoreDiameterMm(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pc-comment">Begründung</Label>
            <Textarea
              id="pc-comment"
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="z. B. „Leere Spule dreimal gewogen, im Mittel 138 g“"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submit.isPending}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending ? "Wird gesendet …" : "Vorschlag einreichen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
