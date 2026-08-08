import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  decodeSpoolRef,
  encodeSpoolRef,
  formatNominalWeight,
} from "@contracts/presets";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { NO_SPOOL, SpoolPicker } from "@/components/SpoolPicker";
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
  const { centsToInput, currencySymbol, formatGrams, parseMoney } = useFormat();
  const t = useT();
  const { data: spoolTypes } = trpc.spoolType.list.useQuery();
  const { data: presetOptions } = trpc.preset.options.useQuery();
  const { data: storageBoxes } = trpc.storageBox.list.useQuery();
  const { data: allMaterials } = trpc.material.list.useQuery();

  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [materialType, setMaterialType] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [color, setColor] = useState("");
  const [price, setPrice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [nominalWeight, setNominalWeight] = useState("1000");
  /** "" | "own:<id>" | "preset:<id>" */
  const [spoolRef, setSpoolRef] = useState<string>(NO_SPOOL);
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
      setPrice(centsToInput(material?.priceCents));
      setPurchaseDate(material?.purchaseDate ?? "");
      setNominalWeight(material ? String(material.nominalWeight) : "1000");
      setSpoolRef(
        material?.spoolPresetVariantId
          ? encodeSpoolRef("preset", material.spoolPresetVariantId)
          : material?.spoolTypeId
            ? encodeSpoolRef("own", material.spoolTypeId)
            : NO_SPOOL
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
    spoolTypes?.forEach(s => s.manufacturer && set.add(s.manufacturer));
    presetOptions?.forEach(p => set.add(p.manufacturer));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allMaterials, spoolTypes, presetOptions]);

  const colorSuggestions = useMemo(() => {
    const set = new Set<string>();
    (allMaterials ?? []).forEach(m => m.color && set.add(m.color));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allMaterials]);

  /** Leergewicht der gewählten Rolle – eigener Typ oder Preset-Variante */
  const selectedSpoolTare = useMemo(() => {
    const ref = decodeSpoolRef(spoolRef);
    if (!ref) return 0;
    if (ref.kind === "own")
      return spoolTypes?.find(s => s.id === ref.id)?.tareWeight ?? 0;
    return presetOptions?.find(p => p.id === ref.id)?.tareWeight ?? 0;
  }, [spoolRef, spoolTypes, presetOptions]);
  const selectedBox = useMemo(
    () => storageBoxes?.find(b => String(b.id) === storageBoxId) ?? null,
    [storageBoxes, storageBoxId]
  );
  const totalTare = selectedSpoolTare + (selectedBox?.tareWeight ?? 0);

  const invalidate = () => {
    utils.material.list.invalidate();
    utils.material.byId.invalidate();
    utils.material.recentWeighings.invalidate();
  };

  const createMutation = trpc.material.create.useMutation({
    onSuccess: () => {
      toast.success(t.materialForm.created);
      invalidate();
      onOpenChange(false);
    },
    onError: e => toast.error(e.message),
  });
  const updateMutation = trpc.material.update.useMutation({
    onSuccess: () => {
      toast.success(t.materialForm.saved);
      invalidate();
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

    const spoolSelection = decodeSpoolRef(spoolRef);
    const base = {
      name: finalName,
      identifier: identifier.trim() || null,
      materialType: materialType.trim(),
      manufacturer: manufacturer.trim() || null,
      color: color.trim() || null,
      priceCents: parseMoney(price),
      purchaseDate: purchaseDate || null,
      nominalWeight: nominal,
      // Immer beide Felder senden, damit ein Wechsel das jeweils andere leert
      spoolTypeId: spoolSelection?.kind === "own" ? spoolSelection.id : null,
      spoolPresetVariantId:
        spoolSelection?.kind === "preset" ? spoolSelection.id : null,
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
            <div className="grid gap-2">
              <Label>{t.materialForm.spool}</Label>
              <SpoolPicker
                value={spoolRef}
                onChange={setSpoolRef}
                ownSpoolTypes={spoolTypes ?? []}
                presets={presetOptions ?? []}
                materialType={materialType}
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
                  Tara gesamt: {formatGrams(totalTare)} (Rolle{" "}
                  {formatGrams(selectedSpoolTare)}
                  {selectedBox
                    ? ` + Box ${formatGrams(selectedBox.tareWeight)}`
                    : ""}
                  )
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
