import { useMemo, useState } from "react";
import { toast } from "sonner";
import { COMMON_TEXTURES, resolveDensity } from "@contracts/materials";
import {
  decodeContainerRef,
  encodeContainerRef,
  formatNominalWeight,
} from "@contracts/presets";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { NO_CONTAINER, ContainerPicker } from "@/components/ContainerPicker";
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
import { setActiveLagerId, useActiveLagerId } from "@/lib/activeLager";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import { kindLabel } from "@/lib/materialKind";
import { trpc } from "@/lib/trpc";
import { COMMON_MATERIAL_TYPES, type MaterialOverview } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wenn gesetzt: Bearbeiten-Modus */
  material?: MaterialOverview | null;
};

const NONE = "__none__";

/** Übliche Netto-Füllmengen einer Spule in Gramm */
const COMMON_NOMINAL_WEIGHTS = [250, 500, 750, 1000] as const;

/** Baut die Bezeichnung aus Hersteller + Typ + Farbe. */
function buildAutoName(manufacturer: string, type: string, color: string) {
  return [manufacturer, type, color]
    .map(s => s.trim())
    .filter(Boolean)
    .join(" ");
}

export function MaterialFormDialog({ open, onOpenChange, material }: Props) {
  const isEdit = !!material;
  const utils = trpc.useUtils();
  const {
    centsToInput,
    currencySymbol,
    formatDiameter,
    formatGrams,
    parseMoney,
  } = useFormat();
  const t = useT();
  const { data: containerTypes } = trpc.containerType.list.useQuery();
  const { data: presetOptions } = trpc.preset.options.useQuery();
  const { data: storageBoxes } = trpc.storageBox.list.useQuery();
  const { data: allMaterials } = trpc.material.list.useQuery({});
  const { data: lagerList } = trpc.lager.list.useQuery();
  const activeLagerId = useActiveLagerId(lagerList);

  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [materialType, setMaterialType] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [color, setColor] = useState("");
  const [texture, setTexture] = useState("");
  const [lagerId, setLagerId] = useState<string>("");
  const [density, setDensity] = useState("");
  const [price, setPrice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [nominalWeight, setNominalWeight] = useState("1000");
  /** "" | "own:<id>" | "preset:<id>" */
  const [containerRef, setContainerRef] = useState<string>(NO_CONTAINER);
  const [storageBoxId, setStorageBoxId] = useState<string>(NONE);
  const [initialGrossWeight, setInitialGrossWeight] = useState("");
  const [notes, setNotes] = useState("");
  /** Sobald der Benutzer die Bezeichnung manuell anfasst, nicht mehr auto-befüllen */
  const [nameTouched, setNameTouched] = useState(false);

  /**
   * Formular beim Öffnen befüllen – und nur dann. Bewusst während des
   * Renderns statt in einem Effekt, damit kein Zwischenstand mit den alten
   * Werten sichtbar wird (https://react.dev/reference/react/useState).
   *
   * Der Schlüssel hängt an der ID, nicht am `material`-Objekt: Sonst würde
   * jedes Neuladen der Materialliste die laufende Eingabe überschreiben.
   */
  const formKey = open ? String(material?.id ?? "neu") : null;
  const [appliedFormKey, setAppliedFormKey] = useState<string | null>(null);
  if (formKey !== appliedFormKey) {
    setAppliedFormKey(formKey);
    if (formKey !== null) {
      setNameTouched(!!material?.name);
      setIdentifier(material?.identifier ?? "");
      setName(material?.name ?? "");
      setMaterialType(material?.materialType ?? "");
      setManufacturer(material?.manufacturer ?? "");
      setColor(material?.color ?? "");
      setTexture(material?.texture ?? "");
      /*
        Beim Anlegen bleibt das Feld leer und `effectiveLagerId` unten setzt das
        aktive Lager ein. Hier den Wert einzusetzen war ein Schnappschuss auf
        genau den Renderdurchlauf, in dem `formKey` umsprang – wer den Dialog
        öffnete, bevor `lager.list` geantwortet hatte, behielt eine leere
        Lagerauswahl für die ganze Sitzung und bekam beim Speichern „lege zuerst
        ein Lager an“ zu sehen, obwohl er Lager hat.
      */
      setLagerId(material?.lagerId != null ? String(material.lagerId) : "");
      setDensity(
        material?.densityGramsPerLiter != null
          ? String(material.densityGramsPerLiter)
          : ""
      );
      setPrice(centsToInput(material?.priceCents));
      setPurchaseDate(material?.purchaseDate ?? "");
      setNominalWeight(material ? String(material.nominalWeight) : "1000");
      setContainerRef(
        material?.containerPresetVariantId
          ? encodeContainerRef("preset", material.containerPresetVariantId)
          : material?.containerTypeId
            ? encodeContainerRef("own", material.containerTypeId)
            : NO_CONTAINER
      );
      setStorageBoxId(
        material?.storageBoxId ? String(material.storageBoxId) : NONE
      );
      setInitialGrossWeight("");
      setNotes(material?.notes ?? "");
    }
  }

  // Bezeichnung aus Hersteller + Typ + Farbe vorschlagen, solange der
  // Benutzer das Feld nicht selbst bearbeitet hat – abgeleitet statt in
  // den Zustand zurückgeschrieben.
  const autoName = buildAutoName(manufacturer, materialType, color);
  const effectiveName = nameTouched ? name : autoName;

  // Vorschläge aus bereits erfassten Materialien (neue Werte erscheinen
  // beim nächsten Mal automatisch in der Auswahl)
  const typeSuggestions = useMemo(() => {
    const set = new Set<string>(COMMON_MATERIAL_TYPES);
    (allMaterials ?? []).forEach(
      m => m.materialType && set.add(m.materialType)
    );
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allMaterials]);

  const manufacturerSuggestions = useMemo(() => {
    const set = new Set<string>();
    (allMaterials ?? []).forEach(
      m => m.manufacturer && set.add(m.manufacturer)
    );
    containerTypes?.forEach(s => s.manufacturer && set.add(s.manufacturer));
    presetOptions?.forEach(p => set.add(p.manufacturer));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allMaterials, containerTypes, presetOptions]);

  const colorSuggestions = useMemo(() => {
    const set = new Set<string>();
    (allMaterials ?? []).forEach(m => m.color && set.add(m.color));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allMaterials]);

  /*
    Vorschläge für die Oberfläche: die gepflegte Liste plus alles, was der
    Benutzer schon eingetragen hat – dasselbe Muster wie bei der Materialart.
    Es bleibt ein Freitextfeld, die Liste hilft nur beim Tippen.
  */
  const textureSuggestions = useMemo(() => {
    const set = new Set<string>(COMMON_TEXTURES);
    (allMaterials ?? []).forEach(m => m.texture && set.add(m.texture));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allMaterials]);

  /*
    Das wirksame Lager: was im Feld steht, sonst das aktive. Abgeleitet und nicht
    in den Zustand kopiert – so wirkt eine später eintreffende Lagerliste sofort,
    ohne dass der Dialog neu aufgebaut werden muss. Wer die Übersicht eines
    Lagers ansieht und dort etwas anlegt, meint fast immer dieses.
  */
  const effectiveLagerId =
    lagerId !== ""
      ? lagerId
      : activeLagerId != null
        ? String(activeLagerId)
        : "";

  const selectedLager = useMemo(
    () => lagerList?.find(l => String(l.id) === effectiveLagerId) ?? null,
    [lagerList, effectiveLagerId]
  );

  /** Leergewicht des gewählten Gebindes – eigene Art oder Preset-Variante */
  const selectedContainerTare = useMemo(() => {
    const ref = decodeContainerRef(containerRef);
    if (!ref) return 0;
    if (ref.kind === "own")
      return containerTypes?.find(s => s.id === ref.id)?.tareWeight ?? 0;
    return presetOptions?.find(p => p.id === ref.id)?.tareWeight ?? 0;
  }, [containerRef, containerTypes, presetOptions]);
  const selectedBox = useMemo(
    () => storageBoxes?.find(b => String(b.id) === storageBoxId) ?? null,
    [storageBoxes, storageBoxId]
  );
  const totalTare = selectedContainerTare + (selectedBox?.tareWeight ?? 0);

  const invalidate = () => {
    utils.material.list.invalidate();
    utils.material.byId.invalidate();
    utils.material.recentWeighings.invalidate();
  };

  /**
   * Dem Material in sein Lager folgen.
   *
   * Ohne das verschwindet ein gerade gespeichertes Material vor den Augen des
   * Benutzers: Die Übersicht zeigt nur das gewählte Lager, und wer beim
   * Anlegen ein anderes ausgewählt hat, sieht danach eine Liste ohne den
   * Eintrag, den er eben angelegt hat. Die Erfolgsmeldung stünde über einer
   * Liste, die sie nicht belegt.
   */
  const followLager = () => {
    const target = Number(effectiveLagerId);
    if (Number.isInteger(target) && target > 0) setActiveLagerId(target);
  };

  const createMutation = trpc.material.create.useMutation({
    onSuccess: () => {
      toast.success(t.materialForm.created);
      invalidate();
      followLager();
      onOpenChange(false);
    },
    onError: e => toast.error(e.message),
  });
  const updateMutation = trpc.material.update.useMutation({
    onSuccess: () => {
      toast.success(t.materialForm.saved);
      invalidate();
      followLager();
      onOpenChange(false);
    },
    onError: e => toast.error(e.message),
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nominal = parseInt(nominalWeight, 10);
    const finalName = effectiveName.trim() || autoName;
    if (!finalName) return toast.error(t.materialForm.nameRequired);
    if (!materialType.trim()) return toast.error(t.materialForm.typeRequired);
    if (!Number.isFinite(nominal) || nominal <= 0)
      return toast.error(t.materialForm.nominalRequired);
    const lager = Number(effectiveLagerId);
    if (!Number.isInteger(lager) || lager <= 0)
      return toast.error(t.lager.noLagerDescription);
    /*
      Leer lassen ist erlaubt (dann greift die Vorgabe der Materialart); ein
      eingetragener Unsinn nicht – sonst stünde eine Meter-Angabe daneben, die
      niemand nachvollziehen kann.
    */
    const densityValue = density.trim() ? parseInt(density, 10) : null;
    if (
      densityValue != null &&
      (!Number.isFinite(densityValue) || densityValue <= 0)
    )
      return toast.error(t.lager.densityLabel);

    const containerSelection = decodeContainerRef(containerRef);
    const base = {
      lagerId: lager,
      name: finalName,
      identifier: identifier.trim() || null,
      materialType: materialType.trim(),
      manufacturer: manufacturer.trim() || null,
      color: color.trim() || null,
      texture: texture.trim() || null,
      densityGramsPerLiter: densityValue,
      priceCents: parseMoney(price),
      purchaseDate: purchaseDate || null,
      nominalWeight: nominal,
      // Immer beide Felder senden, damit ein Wechsel das jeweils andere leert
      containerTypeId:
        containerSelection?.kind === "own" ? containerSelection.id : null,
      containerPresetVariantId:
        containerSelection?.kind === "preset" ? containerSelection.id : null,
      storageBoxId: storageBoxId === NONE ? null : Number(storageBoxId),
      notes: notes.trim() || null,
    };

    if (isEdit && material) {
      updateMutation.mutate({ id: material.id, ...base });
    } else {
      const initial = initialGrossWeight.trim()
        ? parseInt(initialGrossWeight, 10)
        : null;
      if (initial != null && (!Number.isFinite(initial) || initial <= 0))
        return toast.error(t.materialForm.initialInvalid);
      createMutation.mutate({ ...base, initialGrossWeight: initial });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Kopf und Fußzeile bleiben stehen, nur die Felder scrollen – auf dem
          Telefon sonst ein weiter Weg zurück zum Speichern-Knopf. */}
      <DialogContent
        className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-2xl"
        // Ohne das legt Radix den Fokus auf das erste Feld – die
        // Vorschlagsliste klappt sofort auf und verdeckt auf dem Telefon
        // das halbe Formular, dazu springt die Tastatur hoch.
        onOpenAutoFocus={event => event.preventDefault()}
      >
        <DialogHeader className="border-b p-4 sm:p-6">
          <DialogTitle>
            {isEdit ? t.materialForm.editTitle : t.materialForm.createTitle}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t.materialForm.editDescription
              : t.materialForm.createDescription}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="grid gap-4 overflow-y-auto p-4 sm:grid-cols-2 sm:p-6">
            {/*
              Das Lager zuerst und über die ganze Breite: Es bestimmt Materialart
              und – beim Filament – die Stärke, aus denen die Zweitanzeige
              entsteht. Wer es wechselt, ändert damit mehr als eine Zuordnung.
            */}
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="m-lager">{t.materialForm.lagerLabel}</Label>
              <Select value={effectiveLagerId} onValueChange={setLagerId}>
                <SelectTrigger id="m-lager">
                  <SelectValue placeholder={t.lager.switchLabel} />
                </SelectTrigger>
                <SelectContent>
                  {(lagerList ?? []).map(item => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedLager && (
                <p className="text-xs text-muted-foreground">
                  {t.materialForm.lagerHint({
                    kind: kindLabel(t, selectedLager.materialKind),
                    diameter:
                      selectedLager.filamentDiameterUm != null
                        ? formatDiameter(selectedLager.filamentDiameterUm)
                        : null,
                  })}
                  {isEdit && selectedLager.materialKind === "filament"
                    ? ` · ${t.materialForm.lagerChangeHint}`
                    : ""}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="m-type">{t.materialForm.materialTypeLabel}</Label>
              <AutocompleteInput
                id="m-type"
                value={materialType}
                onChange={setMaterialType}
                suggestions={typeSuggestions}
                placeholder="z. B. PLA, PETG, ABS"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="m-manufacturer">{t.common.manufacturer}</Label>
              <AutocompleteInput
                id="m-manufacturer"
                value={manufacturer}
                onChange={setManufacturer}
                suggestions={manufacturerSuggestions}
                placeholder="z. B. Prusament, eSun"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="m-color">{t.common.color}</Label>
              <AutocompleteInput
                id="m-color"
                value={color}
                onChange={setColor}
                suggestions={colorSuggestions}
                placeholder="z. B. Schwarz"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="m-texture">{t.materialForm.textureLabel}</Label>
              <AutocompleteInput
                id="m-texture"
                value={texture}
                onChange={setTexture}
                suggestions={textureSuggestions}
                placeholder={t.materialForm.texturePlaceholder}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="m-identifier">{t.materialForm.identifier}</Label>
              <Input
                id="m-identifier"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                placeholder="z. B. F01 – zum Beschriften & Suchen"
                maxLength={50}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="m-name">{t.materialForm.nameLabel}</Label>
              <Input
                id="m-name"
                value={effectiveName}
                onChange={e => {
                  setNameTouched(true);
                  setName(e.target.value);
                }}
                placeholder={t.materialForm.namePlaceholder}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="m-price">
                {t.materialForm.priceLabel({ symbol: currencySymbol })}
              </Label>
              <Input
                id="m-price"
                inputMode="decimal"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder={t.materialForm.pricePlaceholder({
                  example: centsToInput(2499),
                })}
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="m-date">{t.materialForm.purchaseDate}</Label>
              <Input
                id="m-date"
                type="date"
                value={purchaseDate}
                onChange={e => setPurchaseDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="m-nominal">{t.materialForm.nominalLabel}</Label>
              <Input
                id="m-nominal"
                type="number"
                inputMode="numeric"
                min={1}
                value={nominalWeight}
                onChange={e => setNominalWeight(e.target.value)}
                placeholder={t.materialForm.nominalPlaceholder}
              />
              {/* Die vier üblichen Spulengrößen als Knopf – spart auf dem
                  Telefon das Eintippen. */}
              <div className="flex flex-wrap gap-1.5">
                {COMMON_NOMINAL_WEIGHTS.map(grams => (
                  <Button
                    key={grams}
                    type="button"
                    size="sm"
                    variant={
                      parseInt(nominalWeight, 10) === grams
                        ? "secondary"
                        : "outline"
                    }
                    onClick={() => setNominalWeight(String(grams))}
                  >
                    {formatNominalWeight(grams)}
                  </Button>
                ))}
              </div>
            </div>
            {/*
              Dichte nur, wo sie etwas bewirkt: Beim Pulver gibt es keine
              Zweitanzeige, also wäre das Feld dort eine Angabe ohne Wirkung.
            */}
            {selectedLager && selectedLager.materialKind !== "powder" && (
              <div className="grid gap-2">
                <Label htmlFor="m-density">{t.lager.densityLabel}</Label>
                <Input
                  id="m-density"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={density}
                  onChange={e => setDensity(e.target.value)}
                  placeholder={String(
                    resolveDensity({
                      kind: selectedLager.materialKind,
                      materialType,
                    }) ?? ""
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  {t.lager.densityHint}
                </p>
              </div>
            )}
            <div className="grid gap-2">
              <Label>{t.materialForm.container}</Label>
              <ContainerPicker
                value={containerRef}
                onChange={setContainerRef}
                ownContainerTypes={containerTypes ?? []}
                presets={presetOptions ?? []}
                materialType={materialType}
                /* Aus dem Lager, nicht aus dem Material – dort steht die Art. */
                materialKind={selectedLager?.materialKind}
                nominalWeight={parseInt(nominalWeight, 10) || null}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t.materialForm.storageBox}</Label>
              <Select value={storageBoxId} onValueChange={setStorageBoxId}>
                <SelectTrigger>
                  <SelectValue placeholder={t.materialForm.chooseBox} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t.materialForm.noBox}</SelectItem>
                  {storageBoxes?.map(b => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name} ({formatGrams(b.tareWeight)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {storageBoxes?.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {t.materialForm.noBoxesHint}
                </p>
              )}
            </div>
            {!isEdit && (
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="m-initial">
                  {t.materialForm.initialLabel({ withBox: !!selectedBox })}
                </Label>
                <Input
                  id="m-initial"
                  type="number"
                  min={1}
                  value={initialGrossWeight}
                  onChange={e => setInitialGrossWeight(e.target.value)}
                  placeholder={t.materialForm.initialPlaceholder}
                />
                <p className="text-xs text-muted-foreground">
                  {t.materialForm.tareBreakdown({
                    total: formatGrams(totalTare),
                    container: formatGrams(selectedContainerTare),
                    box: selectedBox
                      ? formatGrams(selectedBox.tareWeight)
                      : null,
                  })}
                </p>
              </div>
            )}
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="m-notes">{t.common.notes}</Label>
              <Textarea
                id="m-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={t.materialForm.notesPlaceholder}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="border-t bg-background p-4 sm:p-6 sm:py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Abbrechen
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
