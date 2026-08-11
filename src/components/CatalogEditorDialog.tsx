import { useState } from "react";
import { toast } from "sonner";
import { CONTAINER_FORMS, type ContainerForm } from "@contracts/materials";
import {
  CONTAINER_MATERIALS,
  type NameI18n,
  type ContainerMaterial,
} from "@contracts/presets";
import { FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES } from "@contracts/i18n";
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
import { useT, type TextKey } from "@/lib/i18nContext";
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
  | {
      level: "variant";
      versionId?: number;
      variant?: PresetVariantNode;
      /**
       * Form der übergeordneten Ausführung. Die Variante trägt die Geometrie,
       * die Form steht aber eine Ebene höher – ohne diese Angabe wüsste der
       * Dialog nicht, ob Außendurchmesser, Breite und Bohrung überhaupt etwas
       * bedeuten. `null`/fehlend heißt „unbekannt“, dann werden sie gezeigt.
       */
      parentForm?: ContainerForm | null;
    };

/** Schlüssel in `t.catalogEditor` für [anlegen, bearbeiten] je Ebene */
const TITLES: Record<
  EditorTarget["level"],
  [TextKey<"catalogEditor">, TextKey<"catalogEditor">]
> = {
  manufacturer: ["createManufacturer", "editManufacturer"],
  series: ["createSeries", "editSeries"],
  version: ["createVersion", "editVersion"],
  variant: ["createVariant", "editVariant"],
};

const NO_MATERIAL = "__none__";
const NO_FORM = "__none__";

/** Grundsprache – ihr Feld schreibt in `name`, nicht in `nameI18n` */
const BASE_LANGUAGE_LABEL =
  SUPPORTED_LANGUAGES.find(l => l.code === FALLBACK_LANGUAGE)?.label ??
  FALLBACK_LANGUAGE;

/** Sprachen, für die ein eigenes Übersetzungsfeld erscheint */
const TRANSLATION_LANGUAGES = SUPPORTED_LANGUAGES.filter(
  l => l.code !== FALLBACK_LANGUAGE
);

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
  const t = useT();
  // Vorhandenen Knoten je Ebene herausziehen – die Union lässt sich sonst in
  // den Initialwerten unten nicht einengen.
  const manufacturerNode =
    target?.level === "manufacturer" ? target.manufacturer : undefined;
  const seriesNode = target?.level === "series" ? target.series : undefined;
  const versionNode = target?.level === "version" ? target.version : undefined;
  const variantNode = target?.level === "variant" ? target.variant : undefined;
  /*
    Geometrie gehört zur Rolle. Bei Flasche, Beutel, Eimer und Kartusche wären
    Außendurchmesser, Breite und Bohrung Felder ohne Bedeutung; bei unbekannter
    Form (alles vor 2.3.0) bleiben sie sichtbar, weil dort tatsächlich Spulen
    stehen.
  */
  const parentForm =
    target?.level === "variant" ? target.parentForm : undefined;
  const showGeometry = parentForm == null || parentForm === "rolle";
  const existing = manufacturerNode ?? seriesNode ?? versionNode ?? variantNode;
  const isEdit = existing != null;
  /** Nur Serien und Ausführungen sind beschreibend genug für Übersetzungen */
  const translatable =
    target?.level === "series" || target?.level === "version";

  // Der Aufrufer remountet den Dialog je Ziel, deshalb reichen Initialwerte.
  /**
   * Übersetzungen abseits der Grundsprache. Das Feld für Deutsch schreibt
   * weiter in `name` – dort hängen Slug und Rückfallebene.
   */
  const [translations, setTranslations] = useState<NameI18n>(
    () => (seriesNode ?? versionNode)?.nameI18n ?? {}
  );

  const [name, setName] = useState(
    () => (manufacturerNode ?? seriesNode ?? versionNode)?.name ?? ""
  );
  const [website, setWebsite] = useState(() => manufacturerNode?.website ?? "");
  const [materialTypes, setMaterialTypes] = useState(() =>
    (seriesNode?.materialTypes ?? []).join(", ")
  );
  const [containerMaterial, setContainerMaterial] = useState<string>(
    () => versionNode?.containerMaterial ?? NO_MATERIAL
  );
  const [form, setForm] = useState<string>(() => versionNode?.form ?? NO_FORM);
  const [validFrom, setValidFrom] = useState(
    () => versionNode?.validFrom ?? ""
  );
  const [validTo, setValidTo] = useState(() => versionNode?.validTo ?? "");
  const [nominalWeight, setNominalWeight] = useState(() =>
    variantNode ? String(variantNode.nominalWeight) : "1000"
  );
  const [tareWeight, setTareWeight] = useState(() =>
    variantNode ? String(variantNode.tareWeight) : ""
  );
  const [outerDiameterMm, setOuterDiameterMm] = useState(() =>
    variantNode?.outerDiameterMm ? String(variantNode.outerDiameterMm) : ""
  );
  const [widthMm, setWidthMm] = useState(() =>
    variantNode?.widthMm ? String(variantNode.widthMm) : ""
  );
  const [boreDiameterMm, setBoreDiameterMm] = useState(() =>
    variantNode?.boreDiameterMm ? String(variantNode.boreDiameterMm) : ""
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
      done(t.catalogEditor.savedManufacturerNew)
    ),
    updateManufacturer: trpc.admin.preset.updateManufacturer.useMutation(
      done(t.catalogEditor.savedManufacturer)
    ),
    createSeries: trpc.admin.preset.createSeries.useMutation(
      done(t.catalogEditor.savedSeriesNew)
    ),
    updateSeries: trpc.admin.preset.updateSeries.useMutation(
      done(t.catalogEditor.savedSeries)
    ),
    createVersion: trpc.admin.preset.createVersion.useMutation(
      done(t.catalogEditor.savedVersionNew)
    ),
    updateVersion: trpc.admin.preset.updateVersion.useMutation(
      done(t.catalogEditor.savedVersion)
    ),
    createVariant: trpc.admin.preset.createVariant.useMutation(
      done(t.catalogEditor.savedVariantNew)
    ),
    updateVariant: trpc.admin.preset.updateVariant.useMutation(
      done(t.catalogEditor.savedVariant)
    ),
  };

  const saving = Object.values(m).some(mutation => mutation.isPending);

  const parseMaterialTypes = () =>
    materialTypes
      .split(",")
      .map(t => t.trim())
      .filter(Boolean);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;

    if (target.level !== "variant" && !name.trim())
      return toast.error(t.common.nameRequired);

    if (target.level === "manufacturer") {
      const payload = {
        name: name.trim(),
        website: website.trim() || null,
        notes: notes.trim() || null,
      };
      if (target.manufacturer)
        m.updateManufacturer.mutate({
          id: target.manufacturer.id,
          ...payload,
          active,
        });
      else m.createManufacturer.mutate(payload);
      return;
    }

    if (target.level === "series") {
      if (target.series) {
        m.updateSeries.mutate({
          id: target.series.id,
          name: name.trim(),
          nameI18n: translations,
          materialTypes: parseMaterialTypes(),
          notes: notes.trim() || null,
          active,
        });
      } else if (target.manufacturerId != null) {
        m.createSeries.mutate({
          manufacturerId: target.manufacturerId,
          name: name.trim(),
          nameI18n: translations,
          materialTypes: parseMaterialTypes(),
          notes: notes.trim() || null,
        });
      }
      return;
    }

    if (target.level === "version") {
      const material =
        containerMaterial === NO_MATERIAL
          ? null
          : (containerMaterial as ContainerMaterial);
      const chosenForm = form === NO_FORM ? null : (form as ContainerForm);
      if (validFrom && validTo && validFrom > validTo)
        return toast.error(t.catalogEditor.validRangeInvalid);
      if (target.version) {
        m.updateVersion.mutate({
          id: target.version.id,
          name: name.trim(),
          nameI18n: translations,
          form: chosenForm,
          containerMaterial: material,
          validFrom: validFrom || null,
          validTo: validTo || null,
          notes: notes.trim() || null,
          active,
        });
      } else if (target.seriesId != null) {
        m.createVersion.mutate({
          seriesId: target.seriesId,
          name: name.trim(),
          form: chosenForm,
          containerMaterial: material,
          validFrom: validFrom || null,
          validTo: validTo || null,
        });
      }
      return;
    }

    const nominal = parseInt(nominalWeight, 10);
    const tare = parseInt(tareWeight, 10);
    if (!Number.isFinite(nominal) || nominal <= 0)
      return toast.error(t.catalogEditor.nominalInvalid);
    if (!Number.isFinite(tare) || tare < 0)
      return toast.error(t.common.invalidTare);
    /*
      Keine Prüfung „Leergewicht kleiner als Nenngewicht“ mehr. Sie galt bis
      2.2.0 und war schon damals nur für Spulen richtig – 500 g Testpulver in
      einem 2 kg schweren Metallbehälter verletzen sie, ohne dass an der Angabe
      etwas falsch wäre. `variantFieldsSchema` hat sie in 2.3.0 abgelegt; blieb
      sie hier stehen, wäre genau das Gebinde, für das die Regel fiel, über die
      Oberfläche weiter unerreichbar.
    */

    const outer = optionalInt(outerDiameterMm);
    const width = optionalInt(widthMm);
    const bore = optionalInt(boreDiameterMm);
    if (outer === undefined || width === undefined || bore === undefined)
      return toast.error(t.catalogEditor.dimensionsInvalid);

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
  const [createKey, editKey] = TITLES[target.level];

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t.catalogEditor[editKey] : t.catalogEditor[createKey]}
          </DialogTitle>
          <DialogDescription>{t.catalogEditor.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          {target.level !== "variant" && (
            <div className="grid gap-2">
              <Label htmlFor="ce-name">
                {translatable
                  ? `${t.catalogEditor.nameInLanguage({
                      language: BASE_LANGUAGE_LABEL,
                    })} *`
                  : t.common.nameRequiredLabel}
              </Label>
              <Input
                id="ce-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={
                  target.level === "manufacturer"
                    ? t.catalogEditor.manufacturerPlaceholder
                    : target.level === "series"
                      ? t.catalogEditor.seriesPlaceholder
                      : t.catalogEditor.versionPlaceholder
                }
              />
            </div>
          )}

          {/* Übersetzungen stehen direkt beim Grundnamen, nicht hinter einem
              Reiter: So sieht man beim Tippen, was noch fehlt. */}
          {translatable &&
            TRANSLATION_LANGUAGES.map(lang => (
              <div key={lang.code} className="grid gap-2">
                <Label htmlFor={`ce-name-${lang.code}`}>
                  {t.catalogEditor.nameInLanguage({ language: lang.label })}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id={`ce-name-${lang.code}`}
                    value={translations[lang.code] ?? ""}
                    onChange={e =>
                      setTranslations(prev => ({
                        ...prev,
                        [lang.code]: e.target.value,
                      }))
                    }
                    placeholder={name.trim() || t.catalogEditor.translationHint}
                  />
                  {/* Eigennamen wie „PolyTerra PLA“ heißen überall gleich –
                      ohne diesen Knopf müsste man sie abtippen, nur damit die
                      Verwaltung sie nicht länger als Lücke meldet. */}
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    disabled={!name.trim()}
                    title={t.catalogEditor.sameAsBaseTitle}
                    onClick={() =>
                      setTranslations(prev => ({
                        ...prev,
                        [lang.code]: name.trim(),
                      }))
                    }
                  >
                    {t.catalogEditor.sameAsBase}
                  </Button>
                </div>
              </div>
            ))}

          {translatable && (
            <p className="-mt-2 text-xs text-muted-foreground">
              {t.catalogEditor.translationNote}
            </p>
          )}

          {target.level === "manufacturer" && (
            <div className="grid gap-2">
              <Label htmlFor="ce-website">{t.catalogEditor.website}</Label>
              <Input
                id="ce-website"
                value={website}
                onChange={e => setWebsite(e.target.value)}
                placeholder="https://…"
              />
            </div>
          )}

          {target.level === "series" && (
            <div className="grid gap-2">
              <Label htmlFor="ce-types">{t.catalogEditor.materialTypes}</Label>
              <Input
                id="ce-types"
                value={materialTypes}
                onChange={e => setMaterialTypes(e.target.value)}
                placeholder={t.catalogEditor.materialTypesPlaceholder}
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
                <Label>{t.catalogEditor.formLabel}</Label>
                <Select value={form} onValueChange={setForm}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_FORM}>
                      {t.catalogEditor.unknown}
                    </SelectItem>
                    {CONTAINER_FORMS.map(f => (
                      <SelectItem key={f} value={f}>
                        {t.preset.containerForm[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>{t.catalogEditor.containerMaterial}</Label>
                <Select
                  value={containerMaterial}
                  onValueChange={setContainerMaterial}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_MATERIAL}>
                      {t.catalogEditor.unknown}
                    </SelectItem>
                    {CONTAINER_MATERIALS.map(material => (
                      <SelectItem key={material} value={material}>
                        {t.preset.containerMaterial[material]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid min-w-0 gap-2">
                  <Label htmlFor="ce-from">{t.catalogEditor.validFrom}</Label>
                  <Input
                    id="ce-from"
                    type="date"
                    value={validFrom}
                    onChange={e => setValidFrom(e.target.value)}
                  />
                </div>
                <div className="grid min-w-0 gap-2">
                  <Label htmlFor="ce-to">{t.catalogEditor.validTo}</Label>
                  <Input
                    id="ce-to"
                    type="date"
                    value={validTo}
                    onChange={e => setValidTo(e.target.value)}
                  />
                </div>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">
                {t.catalogEditor.validHint}
              </p>
            </>
          )}

          {target.level === "variant" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="ce-nominal">
                    {t.catalogEditor.nominalLabel}
                  </Label>
                  <Input
                    id="ce-nominal"
                    type="number"
                    min={1}
                    value={nominalWeight}
                    onChange={e => setNominalWeight(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ce-tare">{t.catalogEditor.tareLabel}</Label>
                  <Input
                    id="ce-tare"
                    type="number"
                    min={0}
                    value={tareWeight}
                    onChange={e => setTareWeight(e.target.value)}
                    placeholder={t.catalogEditor.tarePlaceholder}
                  />
                </div>
              </div>
              {showGeometry && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="ce-outer" className="text-xs">
                      {t.catalogEditor.outerDiameter}
                    </Label>
                    <Input
                      id="ce-outer"
                      type="number"
                      value={outerDiameterMm}
                      onChange={e => setOuterDiameterMm(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ce-width" className="text-xs">
                      {t.catalogEditor.width}
                    </Label>
                    <Input
                      id="ce-width"
                      type="number"
                      value={widthMm}
                      onChange={e => setWidthMm(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ce-bore" className="text-xs">
                      {t.catalogEditor.bore}
                    </Label>
                    <Input
                      id="ce-bore"
                      type="number"
                      value={boreDiameterMm}
                      onChange={e => setBoreDiameterMm(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          <div className="grid gap-2">
            <Label htmlFor="ce-notes">{t.common.notes}</Label>
            <Textarea
              id="ce-notes"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {isEdit && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="ce-active"
                checked={active}
                onCheckedChange={checked => setActive(checked === true)}
              />
              <Label htmlFor="ce-active" className="font-normal">
                {t.catalogEditor.active}
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
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? t.common.saving
                : isEdit
                  ? t.common.save
                  : t.common.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
