import { useState } from "react";
import { toast } from "sonner";
import { SPOOL_MATERIALS, SPOOL_MATERIAL_LABELS } from "@contracts/presets";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatGrams } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { COMMON_MATERIAL_TYPES, type SpoolTypeItem } from "@/types";

type Props = {
  spoolType: SpoolTypeItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Eigenen Rollentyp für den gemeinsamen Katalog vorschlagen. Name, Hersteller
 * und Leergewicht kommen aus dem Rollentyp, die Einordnung in Serie und
 * Ausführung ergänzt der Benutzer.
 */
export function ProposePresetDialog({ spoolType, open, onOpenChange }: Props) {
  const utils = trpc.useUtils();
  // Der Aufrufer gibt der Komponente einen key je Rollentyp – der Zustand wird
  // deshalb beim Öffnen über den Initialwert gesetzt, nicht über einen Effekt.
  const [manufacturer, setManufacturer] = useState(
    () => spoolType?.manufacturer ?? "",
  );
  const [series, setSeries] = useState("");
  const [version, setVersion] = useState("");
  const [spoolMaterial, setSpoolMaterial] = useState<string>("kunststoff");
  const [materialType, setMaterialType] = useState<string>("");
  const [nominalWeight, setNominalWeight] = useState("1000");
  const [comment, setComment] = useState("");

  const submit = trpc.preset.proposals.submitFromSpoolType.useMutation({
    onSuccess: () => {
      toast.success("Vorschlag eingereicht – er wird von der Moderation geprüft.");
      utils.preset.proposals.mine.invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!spoolType) return;
    const nominal = parseInt(nominalWeight, 10);
    if (!manufacturer.trim()) return toast.error("Bitte einen Hersteller angeben");
    if (!series.trim()) return toast.error("Bitte eine Serie angeben");
    if (!version.trim()) return toast.error("Bitte eine Ausführung angeben");
    if (!Number.isFinite(nominal) || nominal <= 0)
      return toast.error("Bitte ein gültiges Nenngewicht in Gramm angeben");
    if (spoolType.tareWeight >= nominal)
      return toast.error("Das Leergewicht muss kleiner als das Nenngewicht sein");

    submit.mutate({
      spoolTypeId: spoolType.id,
      manufacturer: manufacturer.trim(),
      series: series.trim(),
      version: version.trim(),
      spoolMaterial: spoolMaterial as (typeof SPOOL_MATERIALS)[number],
      materialTypes: materialType.trim() ? [materialType.trim()] : [],
      nominalWeight: nominal,
      comment: comment.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Als Preset vorschlagen</DialogTitle>
          <DialogDescription>
            „{spoolType?.name}“ ({formatGrams(spoolType?.tareWeight ?? 0)} Tara)
            für alle vorschlagen. Ordne die Rolle bitte einem Hersteller, einer
            Serie und einer Ausführung zu.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="pp-manufacturer">Hersteller *</Label>
            <Input
              id="pp-manufacturer"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              placeholder="z. B. Polymaker"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pp-series">Serie / Produktlinie *</Label>
            <Input
              id="pp-series"
              value={series}
              onChange={(e) => setSeries(e.target.value)}
              placeholder="z. B. PolyTerra PLA"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pp-version">Ausführung *</Label>
            <Input
              id="pp-version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="z. B. Kartonspule (ab 2023)"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Spulenmaterial</Label>
              <Select value={spoolMaterial} onValueChange={setSpoolMaterial}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPOOL_MATERIALS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {SPOOL_MATERIAL_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pp-nominal">Nenngewicht (g) *</Label>
              <Input
                id="pp-nominal"
                type="number"
                min={1}
                value={nominalWeight}
                onChange={(e) => setNominalWeight(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pp-materialtype">Materialart</Label>
            <Input
              id="pp-materialtype"
              list="pp-materialtype-options"
              value={materialType}
              onChange={(e) => setMaterialType(e.target.value)}
              placeholder="leer lassen, wenn die Serie für alle Arten gilt"
            />
            <datalist id="pp-materialtype-options">
              {COMMON_MATERIAL_TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pp-comment">Anmerkung</Label>
            <Textarea
              id="pp-comment"
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Woher stammt das Leergewicht?"
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
