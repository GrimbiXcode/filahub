import { useState } from "react";
import { toast } from "sonner";
import {
  SPOOL_MATERIALS,
  SPOOL_MATERIAL_LABELS,
  type SpoolMaterial,
} from "@contracts/presets";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { trpc } from "@/lib/trpc";
import type {
  PresetManufacturerNode,
  PresetSeriesNode,
  PresetVariantNode,
  PresetVersionNode,
} from "@/types";

/**
 * Was der Dialog gerade bearbeitet. Ohne den jeweiligen Knoten wird ein neuer
 * Eintrag unterhalb der übergebenen Eltern-ID angelegt.
 */
export type EditorTarget =
  | { level: "manufacturer"; manufacturer?: PresetManufacturerNode }
  | { level: "series"; manufacturerId?: number; series?: PresetSeriesNode }
  | { level: "version"; seriesId?: number; version?: PresetVersionNode }
  | { level: "variant"; versionId?: number; variant?: PresetVariantNode };

const TITLES: Record<EditorTarget["level"], [string, string]> = {
  manufacturer: ["Neuer Hersteller", "Hersteller bearbeiten"],
  series: ["Neue Serie", "Serie bearbeiten"],
  version: ["Neue Ausführung", "Ausführung bearbeiten"],
  variant: ["Neue Größe", "Größe bearbeiten"],
};

const NO_MATERIAL = "__none__";

/** Leeres Feld → null, ungültige Zahl → undefined (Eingabefehler) */
function optionalInt(value: string): number | null | undefined {
  if (!value.trim()) return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function CatalogEditorDialog({
  target,
  onClose,
  onSaved,
}: {
  target: EditorTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Vorhandenen Knoten je Ebene herausziehen – die Union lässt sich sonst in
  // den Initialwerten unten nicht einengen.
  const manufacturerNode =
    target?.level === "manufacturer" ? target.manufacturer : undefined;
  const seriesNode = target?.level === "series" ? target.series : undefined;
  const versionNode = target?.level === "version" ? target.version : undefined;
  const variantNode = target?.level === "variant" ? target.variant : undefined;
  const existing = manufacturerNode ?? seriesNode ?? versionNode ?? variantNode;
  const isEdit = existing != null;

  // Der Aufrufer remountet den Dialog je Ziel, deshalb reichen Initialwerte.
  const [name, setName] = useState(
    () => (manufacturerNode ?? seriesNode ?? versionNode)?.name ?? "",
  );
  const [website, setWebsite] = useState(() => manufacturerNode?.website ?? "");
  const [materialTypes, setMaterialTypes] = useState(() =>
    (seriesNode?.materialTypes ?? []).join(", "),
  );
  const [spoolMaterial, setSpoolMaterial] = useState<string>(
    () => versionNode?.spoolMaterial ?? NO_MATERIAL,
  );
  const [validFrom, setValidFrom] = useState(() => versionNode?.validFrom ?? "");
  const [validTo, setValidTo] = useState(() => versionNode?.validTo ?? "");
  const [nominalWeight, setNominalWeight] = useState(() =>
    variantNode ? String(variantNode.nominalWeight) : "1000",
  );
  const [tareWeight, setTareWeight] = useState(() =>
    variantNode ? String(variantNode.tareWeight) : "",
  );
  const [outerDiameterMm, setOuterDiameterMm] = useState(() =>
    variantNode?.outerDiameterMm ? String(variantNode.outerDiameterMm) : "",
  );
  const [widthMm, setWidthMm] = useState(() =>
    variantNode?.widthMm ? String(variantNode.widthMm) : "",
  );
  const [boreDiameterMm, setBoreDiameterMm] = useState(() =>
    variantNode?.boreDiameterMm ? String(variantNode.boreDiameterMm) : "",
  );
  const [notes, setNotes] = useState(() => existing?.notes ?? "");
  const [active, setActive] = useState(() => existing?.active ?? true);

  const done = (message: string) => ({
    onSuccess: () => {
      toast.success(message);
      onSaved();
      onClose();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const m = {
    createManufacturer: trpc.admin.preset.createManufacturer.useMutation(
      done("Hersteller angelegt"),
    ),
    updateManufacturer: trpc.admin.preset.updateManufacturer.useMutation(
      done("Hersteller gespeichert"),
    ),
    createSeries: trpc.admin.preset.createSeries.useMutation(done("Serie angelegt")),
    updateSeries: trpc.admin.preset.updateSeries.useMutation(done("Serie gespeichert")),
    createVersion: trpc.admin.preset.createVersion.useMutation(
      done("Ausführung angelegt"),
    ),
    updateVersion: trpc.admin.preset.updateVersion.useMutation(
      done("Ausführung gespeichert"),
    ),
    createVariant: trpc.admin.preset.createVariant.useMutation(done("Größe angelegt")),
    updateVariant: trpc.admin.preset.updateVariant.useMutation(done("Größe gespeichert")),
  };

  const saving = Object.values(m).some((mutation) => mutation.isPending);

  const parseMaterialTypes = () =>
    materialTypes
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;

    if (target.level !== "variant" && !name.trim())
      return toast.error("Bitte einen Namen angeben");

    if (target.level === "manufacturer") {
      const payload = {
        name: name.trim(),
        website: website.trim() || null,
        notes: notes.trim() || null,
      };
      if (target.manufacturer)
        m.updateManufacturer.mutate({ id: target.manufacturer.id, ...payload, active });
      else m.createManufacturer.mutate(payload);
      return;
    }

    if (target.level === "series") {
      if (target.series) {
        m.updateSeries.mutate({
          id: target.series.id,
          name: name.trim(),
          materialTypes: parseMaterialTypes(),
          notes: notes.trim() || null,
          active,
        });
      } else if (target.manufacturerId != null) {
        m.createSeries.mutate({
          manufacturerId: target.manufacturerId,
          name: name.trim(),
          materialTypes: parseMaterialTypes(),
          notes: notes.trim() || null,
        });
      }
      return;
    }

    if (target.level === "version") {
      const material =
        spoolMaterial === NO_MATERIAL ? null : (spoolMaterial as SpoolMaterial);
      if (validFrom && validTo && validFrom > validTo)
        return toast.error("„Gültig ab“ muss vor „Gültig bis“ liegen");
      if (target.version) {
        m.updateVersion.mutate({
          id: target.version.id,
          name: name.trim(),
          spoolMaterial: material,
          validFrom: validFrom || null,
          validTo: validTo || null,
          notes: notes.trim() || null,
          active,
        });
      } else if (target.seriesId != null) {
        m.createVersion.mutate({
          seriesId: target.seriesId,
          name: name.trim(),
          spoolMaterial: material,
          validFrom: validFrom || null,
          validTo: validTo || null,
        });
      }
      return;
    }

    const nominal = parseInt(nominalWeight, 10);
    const tare = parseInt(tareWeight, 10);
    if (!Number.isFinite(nominal) || nominal <= 0)
      return toast.error("Bitte ein gültiges Nenngewicht in Gramm angeben");
    if (!Number.isFinite(tare) || tare < 0)
      return toast.error("Bitte ein gültiges Leergewicht in Gramm angeben");
    if (tare >= nominal)
      return toast.error("Das Leergewicht muss kleiner als das Nenngewicht sein");

    const outer = optionalInt(outerDiameterMm);
    const width = optionalInt(widthMm);
    const bore = optionalInt(boreDiameterMm);
    if (outer === undefined || width === undefined || bore === undefined)
      return toast.error("Bitte gültige Abmessungen in Millimetern angeben");

    const dims = {
      outerDiameterMm: outer,
      widthMm: width,
      boreDiameterMm: bore,
      notes: notes.trim() || null,
    };
    if (target.variant) {
      m.updateVariant.mutate({
        id: target.variant.id,
        nominalWeight: nominal,
        tareWeight: tare,
        ...dims,
        active,
      });
    } else if (target.versionId != null) {
      m.createVariant.mutate({
        versionId: target.versionId,
        nominalWeight: nominal,
        tareWeight: tare,
        ...dims,
      });
    }
  };

  if (!target) return null;
  const [createTitle, editTitle] = TITLES[target.level];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? editTitle : createTitle}</DialogTitle>
          <DialogDescription>
            Änderungen wirken sofort für alle Benutzer. Bearbeitete Einträge
            werden vom automatischen Startkatalog künftig nicht mehr
            überschrieben.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          {target.level !== "variant" && (
            <div className="grid gap-2">
              <Label htmlFor="ce-name">Name *</Label>
              <Input
                id="ce-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  target.level === "manufacturer"
                    ? "z. B. Polymaker"
                    : target.level === "series"
                      ? "z. B. PolyTerra PLA"
                      : "z. B. Kartonspule (ab 2023)"
                }
              />
            </div>
          )}

          {target.level === "manufacturer" && (
            <div className="grid gap-2">
              <Label htmlFor="ce-website">Website</Label>
              <Input
                id="ce-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://…"
              />
            </div>
          )}

          {target.level === "series" && (
            <div className="grid gap-2">
              <Label htmlFor="ce-types">Materialarten</Label>
              <Input
                id="ce-types"
                value={materialTypes}
                onChange={(e) => setMaterialTypes(e.target.value)}
                placeholder="z. B. PLA, PETG – leer = gilt für alle"
              />
              <p className="text-xs text-muted-foreground">
                Kommagetrennt. Steuert nur die Vorsortierung in der Auswahl,
                nicht die Sichtbarkeit.
              </p>
            </div>
          )}

          {target.level === "version" && (
            <>
              <div className="grid gap-2">
                <Label>Spulenmaterial</Label>
                <Select value={spoolMaterial} onValueChange={setSpoolMaterial}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_MATERIAL}>Unbekannt</SelectItem>
                    {SPOOL_MATERIALS.map((material) => (
                      <SelectItem key={material} value={material}>
                        {SPOOL_MATERIAL_LABELS[material]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="ce-from">Gültig ab</Label>
                  <Input
                    id="ce-from"
                    type="date"
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ce-to">Gültig bis</Label>
                  <Input
                    id="ce-to"
                    type="date"
                    value={validTo}
                    onChange={(e) => setValidTo(e.target.value)}
                  />
                </div>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">
                Ohne „Gültig bis“ gilt die Ausführung als aktuell im Handel.
              </p>
            </>
          )}

          {target.level === "variant" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="ce-nominal">Nenngewicht (g) *</Label>
                  <Input
                    id="ce-nominal"
                    type="number"
                    min={1}
                    value={nominalWeight}
                    onChange={(e) => setNominalWeight(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ce-tare">Leergewicht (g) *</Label>
                  <Input
                    id="ce-tare"
                    type="number"
                    min={0}
                    value={tareWeight}
                    onChange={(e) => setTareWeight(e.target.value)}
                    placeholder="z. B. 140"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="ce-outer" className="text-xs">
                    Außen-Ø (mm)
                  </Label>
                  <Input
                    id="ce-outer"
                    type="number"
                    value={outerDiameterMm}
                    onChange={(e) => setOuterDiameterMm(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ce-width" className="text-xs">
                    Breite (mm)
                  </Label>
                  <Input
                    id="ce-width"
                    type="number"
                    value={widthMm}
                    onChange={(e) => setWidthMm(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ce-bore" className="text-xs">
                    Bohrung (mm)
                  </Label>
                  <Input
                    id="ce-bore"
                    type="number"
                    value={boreDiameterMm}
                    onChange={(e) => setBoreDiameterMm(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <div className="grid gap-2">
            <Label htmlFor="ce-notes">Notizen</Label>
            <Textarea
              id="ce-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {isEdit && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="ce-active"
                checked={active}
                onCheckedChange={(checked) => setActive(checked === true)}
              />
              <Label htmlFor="ce-active" className="font-normal">
                Aktiv (wählbar für alle Benutzer)
              </Label>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Speichern …" : isEdit ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
