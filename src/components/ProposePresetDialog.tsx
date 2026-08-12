import { useState } from "react";
import { toast } from "sonner";
import { CONTAINER_MATERIALS } from "@contracts/presets";
import { FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES } from "@contracts/i18n";

/** Sprachen, für die ein zusätzliches Namensfeld erscheint */
const TRANSLATION_LANGUAGES = SUPPORTED_LANGUAGES.filter(
  l => l.code !== FALLBACK_LANGUAGE
);
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
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";
import { COMMON_MATERIAL_TYPES, type ContainerTypeItem } from "@/types";

type Props = {
  containerType: ContainerTypeItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Eigene Gebindeart für den gemeinsamen Katalog vorschlagen. Name, Hersteller
 * und Leergewicht kommen aus der Gebindeart, die Einordnung in Serie und
 * Ausführung ergänzt der Benutzer.
 */
export function ProposePresetDialog({
  containerType,
  open,
  onOpenChange,
}: Props) {
  const utils = trpc.useUtils();
  const { formatGrams } = useFormat();
  const t = useT();
  // Der Aufrufer gibt der Komponente einen key je Gebindeart – der Zustand wird
  // deshalb beim Öffnen über den Initialwert gesetzt, nicht über einen Effekt.
  const [manufacturer, setManufacturer] = useState(
    () => containerType?.manufacturer ?? ""
  );
  const [series, setSeries] = useState("");
  const [seriesEn, setSeriesEn] = useState("");
  const [version, setVersion] = useState("");
  const [versionEn, setVersionEn] = useState("");
  const [containerMaterial, setContainerMaterial] =
    useState<string>("kunststoff");
  const [materialType, setMaterialType] = useState<string>("");
  const [nominalWeight, setNominalWeight] = useState("1000");
  const [comment, setComment] = useState("");

  const submit = trpc.preset.proposals.submitFromContainerType.useMutation({
    onSuccess: () => {
      toast.success(t.proposeChange.submitted);
      utils.preset.proposals.mine.invalidate();
      onOpenChange(false);
    },
    onError: e => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!containerType) return;
    const nominal = parseInt(nominalWeight, 10);
    if (!manufacturer.trim())
      return toast.error(t.proposePreset.manufacturerRequired);
    if (!series.trim()) return toast.error(t.proposePreset.seriesRequired);
    if (!version.trim()) return toast.error(t.proposePreset.versionRequired);
    if (!Number.isFinite(nominal) || nominal <= 0)
      return toast.error(t.proposePreset.nominalInvalid);
    /*
      Kein Vergleich mit dem Leergewicht – siehe `variantFieldsSchema`: Ein
      schweres Gebinde mit wenig Inhalt ist eine gültige Angabe, und es
      vorzuschlagen war der Grund, die Regel zu streichen.
    */

    submit.mutate({
      containerTypeId: containerType.id,
      manufacturer: manufacturer.trim(),
      series: series.trim(),
      seriesI18n: seriesEn.trim() ? { en: seriesEn.trim() } : undefined,
      version: version.trim(),
      versionI18n: versionEn.trim() ? { en: versionEn.trim() } : undefined,
      containerMaterial:
        containerMaterial as (typeof CONTAINER_MATERIALS)[number],
      materialTypes: materialType.trim() ? [materialType.trim()] : [],
      nominalWeight: nominal,
      comment: comment.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.proposePreset.title}</DialogTitle>
          <DialogDescription>
            {t.proposePreset.description({
              name: containerType?.name ?? "",
              tare: formatGrams(containerType?.tareWeight ?? 0),
            })}{" "}
            {t.proposePreset.descriptionSuffix}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="pp-manufacturer">
              {t.proposePreset.manufacturerLabel}
            </Label>
            <Input
              id="pp-manufacturer"
              value={manufacturer}
              onChange={e => setManufacturer(e.target.value)}
              placeholder={t.catalogEditor.manufacturerPlaceholder}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pp-series">{t.proposePreset.seriesLabel}</Label>
            <Input
              id="pp-series"
              value={series}
              onChange={e => setSeries(e.target.value)}
              placeholder={t.catalogEditor.seriesPlaceholder}
            />
          </div>
          {TRANSLATION_LANGUAGES.map(lang => (
            <div key={`series-${lang.code}`} className="grid gap-2">
              <Label htmlFor={`pp-series-${lang.code}`}>
                {t.proposePreset.seriesInLanguage({ language: lang.label })}
              </Label>
              <Input
                id={`pp-series-${lang.code}`}
                value={seriesEn}
                onChange={e => setSeriesEn(e.target.value)}
                placeholder={series.trim() || t.catalogEditor.translationHint}
              />
            </div>
          ))}
          <div className="grid gap-2">
            <Label htmlFor="pp-version">{t.proposePreset.versionLabel}</Label>
            <Input
              id="pp-version"
              value={version}
              onChange={e => setVersion(e.target.value)}
              placeholder={t.catalogEditor.versionPlaceholder}
            />
          </div>
          {TRANSLATION_LANGUAGES.map(lang => (
            <div key={`version-${lang.code}`} className="grid gap-2">
              <Label htmlFor={`pp-version-${lang.code}`}>
                {t.proposePreset.versionInLanguage({ language: lang.label })}
              </Label>
              <Input
                id={`pp-version-${lang.code}`}
                value={versionEn}
                onChange={e => setVersionEn(e.target.value)}
                placeholder={version.trim() || t.catalogEditor.translationHint}
              />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>{t.proposePreset.containerMaterialLabel}</Label>
              <Select
                value={containerMaterial}
                onValueChange={setContainerMaterial}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTAINER_MATERIALS.map(m => (
                    <SelectItem key={m} value={m}>
                      {t.preset.containerMaterial[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pp-nominal">{t.proposePreset.nominalLabel}</Label>
              <Input
                id="pp-nominal"
                type="number"
                min={1}
                value={nominalWeight}
                onChange={e => setNominalWeight(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pp-materialtype">
              {t.proposePreset.materialTypeLabel}
            </Label>
            <Input
              id="pp-materialtype"
              list="pp-materialtype-options"
              value={materialType}
              onChange={e => setMaterialType(e.target.value)}
              placeholder={t.proposePreset.materialTypePlaceholder}
            />
            <datalist id="pp-materialtype-options">
              {COMMON_MATERIAL_TYPES.map(t => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pp-comment">{t.proposePreset.commentLabel}</Label>
            <Textarea
              id="pp-comment"
              rows={2}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={t.proposePreset.commentPlaceholder}
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
