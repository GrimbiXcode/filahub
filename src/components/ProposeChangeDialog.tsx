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
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";
import type { PresetVariantNode } from "@/types";

type Props = {
  variant: PresetVariantNode | null;
  /**
   * Fertiger Anzeigename der Variante. Kommt vom Aufrufer, weil nur der die
   * drei Ebenen darüber kennt – die Variante selbst trägt ihn nicht mehr.
   */
  label: string;
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
export function ProposeChangeDialog({
  variant,
  label,
  open,
  onOpenChange,
}: Props) {
  const utils = trpc.useUtils();
  const t = useT();
  // Der Aufrufer gibt der Komponente einen key je Variante – der Zustand wird
  // deshalb beim Öffnen über den Initialwert gesetzt, nicht über einen Effekt.
  const [tareWeight, setTareWeight] = useState(() =>
    variant ? String(variant.tareWeight) : ""
  );
  const [outerDiameterMm, setOuterDiameterMm] = useState(() =>
    variant?.outerDiameterMm ? String(variant.outerDiameterMm) : ""
  );
  const [widthMm, setWidthMm] = useState(() =>
    variant?.widthMm ? String(variant.widthMm) : ""
  );
  const [boreDiameterMm, setBoreDiameterMm] = useState(() =>
    variant?.boreDiameterMm ? String(variant.boreDiameterMm) : ""
  );
  const [comment, setComment] = useState("");

  const submit = trpc.preset.proposals.submitChange.useMutation({
    onSuccess: () => {
      toast.success(t.proposeChange.submitted);
      utils.preset.proposals.mine.invalidate();
      onOpenChange(false);
    },
    onError: e => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!variant) return;

    const tare = parseInt(tareWeight, 10);
    if (!Number.isFinite(tare) || tare < 0)
      return toast.error(t.proposeChange.invalidTare);

    const outer = parseOptionalInt(outerDiameterMm);
    const width = parseOptionalInt(widthMm);
    const bore = parseOptionalInt(boreDiameterMm);
    if (outer === undefined || width === undefined || bore === undefined)
      return toast.error(t.proposeChange.invalidDimensions);

    // Nur tatsächliche Abweichungen übermitteln
    const patch: Record<string, number | null> = {};
    if (tare !== variant.tareWeight) patch.tareWeight = tare;
    if (outer !== variant.outerDiameterMm) patch.outerDiameterMm = outer;
    if (width !== variant.widthMm) patch.widthMm = width;
    if (bore !== variant.boreDiameterMm) patch.boreDiameterMm = bore;

    if (Object.keys(patch).length === 0)
      return toast.error(t.proposeChange.noChanges);

    submit.mutate({
      targetType: "variant",
      targetId: variant.id,
      payload: { kind: "change", scope: "variant", patch },
      comment: comment.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.proposeChange.title}</DialogTitle>
          <DialogDescription>
            {t.proposeChange.description({
              spool: label,
              size: variant ? formatNominalWeight(variant.nominalWeight) : "",
            })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="pc-tare">{t.proposeChange.tareLabel}</Label>
            <Input
              id="pc-tare"
              type="number"
              min={0}
              value={tareWeight}
              onChange={e => setTareWeight(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pc-outer" className="text-xs">
                {t.proposeChange.outerDiameter}
              </Label>
              <Input
                id="pc-outer"
                type="number"
                value={outerDiameterMm}
                onChange={e => setOuterDiameterMm(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pc-width" className="text-xs">
                {t.proposeChange.width}
              </Label>
              <Input
                id="pc-width"
                type="number"
                value={widthMm}
                onChange={e => setWidthMm(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pc-bore" className="text-xs">
                {t.proposeChange.bore}
              </Label>
              <Input
                id="pc-bore"
                type="number"
                value={boreDiameterMm}
                onChange={e => setBoreDiameterMm(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pc-comment">{t.proposeChange.reason}</Label>
            <Textarea
              id="pc-comment"
              rows={2}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={t.proposeChange.reasonPlaceholder}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submit.isPending}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending
                ? t.proposeChange.submitting
                : t.proposeChange.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
