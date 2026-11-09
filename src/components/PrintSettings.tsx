import { useRef, useState } from "react";
import {
  Download,
  FileUp,
  Nfc,
  Flame,
  Pencil,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { normalizeMaterialType, type MaterialKind } from "@contracts/materials";
import {
  MAX_PRINT_NOTES_LENGTH,
  PRINT_SETTING_FIELDS,
  hasPrintSettings,
  printSettingsSchema,
  type PrintSettingField,
  type PrintSettings,
} from "@contracts/printSettings";
import {
  MAX_PRUSA_PROFILE_BYTES,
  PrusaProfileError,
  bestProfileIndex,
  printSettingsFromProfile,
  profileName,
  prusaBundleFromPrintSettings,
  readPrusaProfiles,
  type ImportedPrintSettings,
} from "@contracts/prusaProfile";
import { roleAllows } from "@contracts/organizations";
import { MarkdownContent } from "@/components/MarkdownContent";
import { NfcScanDialog } from "@/components/NfcScanDialog";
import { nfcSupported } from "@/lib/nfc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useActiveScope, useScopeRole } from "@/lib/activeScope";
import { useAppearanceResolver } from "@/lib/appearance";
import { useFormat } from "@/lib/formatContext";
import { formKeys } from "@/lib/formKeyboard";
import { useI18n, useT } from "@/lib/i18nContext";
import { trpc } from "@/lib/trpc";

/**
 * Druckeinstellungen eines Materials (seit 4.1.0): die kompakte Zeile für
 * Panel und Gebinde-Seite, die Karte für die Material-Seite und der Dialog
 * zum Bearbeiten. Die Regeln – Felder je Materialart, Bereiche, ganze Zahlen –
 * stehen in `contracts/printSettings.ts`.
 */

type Stored = {
  settings: PrintSettings | null;
  notes: string | null;
} | null;

type Formatter = (field: PrintSettingField, value: number) => string;

/** Was die Karte vom Material braucht – für Export und Dichte-Angebot */
export type PrintSettingsProduct = {
  name: string;
  manufacturer: string | null;
  materialType: string;
  color: string | null;
  densityGramsPerLiter: number | null;
};

/**
 * Werte zum Übernehmen – aus einem Profil von PrusaSlicer (eine oder mehrere
 * Möglichkeiten) oder von einem NFC-Tag (genau eine).
 */
type ImportedProfiles = {
  fileName: string;
  options: { name: string | null; imported: ImportedPrintSettings }[];
  /** Vorausgewählte Möglichkeit */
  preselect: number;
  /** Neu je Einlesen – der Dialog befüllt sich damit neu */
  nonce: number;
};

/**
 * Einheit und Umrechnung je Feld – gespeichert wird immer ganzzahlig. Die
 * Einheiten kommen aus dem Katalog (`t.printSettings.units`), dieselben, die
 * der Dialog neben die Felder schreibt.
 */
function useValueFormatter(): Formatter {
  const { formatNumber } = useFormat();
  const t = useT();
  return (field, value) => {
    const unit = t.printSettings.units[field];
    switch (field) {
      case "retractionHundredthsMm":
        return `${formatNumber(value / 100)} ${unit}`;
      case "dryingMinutes":
      case "postCureMinutes":
        return value >= 60 && value % 30 === 0
          ? `${formatNumber(value / 60)} ${t.printSettings.hoursUnit}`
          : `${formatNumber(value)} ${unit}`;
      case "exposureMs":
      case "bottomExposureMs":
        return `${formatNumber(value / 1000)} ${unit}`;
      case "bottomLayers":
        return formatNumber(value);
      default:
        return `${formatNumber(value)} ${unit}`;
    }
  };
}

/** „205–220 °C“, „60 °C“ oder nichts – für die Temperaturspannen von/bis */
function useRange() {
  const { formatNumber } = useFormat();
  const format = useValueFormatter();
  return (
    minField: PrintSettingField,
    maxField: PrintSettingField,
    min: number | undefined,
    max: number | undefined
  ): string | null => {
    if (min != null && max != null)
      return min === max
        ? format(minField, min)
        : `${formatNumber(min)}–${format(maxField, max)}`;
    if (min != null) return format(minField, min);
    if (max != null) return format(maxField, max);
    return null;
  };
}

/**
 * Die kompakte Zeile: das, was man am Drucker stehend nachschaut – Düse,
 * Bett, Trocknen beim Filament, Belichtung beim Harz, Schichthöhe beim Pulver.
 */
export function PrintSettingsSummary({ stored }: { stored: Stored }) {
  const t = useT();
  const format = useValueFormatter();
  const range = useRange();
  const s = stored?.settings;
  if (!s || !hasPrintSettings(s)) return null;
  const parts: string[] = [];
  if (s.kind === "filament") {
    const nozzle = range(
      "nozzleMinC",
      "nozzleMaxC",
      s.nozzleMinC,
      s.nozzleMaxC
    );
    const bed = range("bedMinC", "bedMaxC", s.bedMinC, s.bedMaxC);
    if (nozzle) parts.push(`${t.printSettings.short.nozzle} ${nozzle}`);
    if (bed) parts.push(`${t.printSettings.short.bed} ${bed}`);
    if (s.dryingC != null)
      parts.push(
        `${t.printSettings.short.drying} ${format("dryingC", s.dryingC)}${
          s.dryingMinutes != null
            ? ` / ${format("dryingMinutes", s.dryingMinutes)}`
            : ""
        }`
      );
    if (s.enclosureRequired) parts.push(t.printSettings.short.enclosure);
  } else if (s.kind === "resin") {
    if (s.exposureMs != null)
      parts.push(
        `${t.printSettings.short.exposure} ${format("exposureMs", s.exposureMs)}`
      );
    if (s.bottomExposureMs != null)
      parts.push(
        `${t.printSettings.short.bottom} ${format("bottomExposureMs", s.bottomExposureMs)}`
      );
    if (s.layerHeightUm != null)
      parts.push(format("layerHeightUm", s.layerHeightUm));
  } else {
    if (s.layerHeightUm != null)
      parts.push(format("layerHeightUm", s.layerHeightUm));
    if (s.refreshPercent != null)
      parts.push(
        `${t.printSettings.short.refresh} ${format("refreshPercent", s.refreshPercent)}`
      );
  }
  if (parts.length === 0) return null;
  return (
    <p className="flex items-start gap-1.5 rounded-lg border px-3 py-2 font-mono text-[11px] text-muted-foreground">
      <Flame aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span className="sr-only">{t.printSettings.title}: </span>
      <span>{parts.join(" · ")}</span>
    </p>
  );
}

/** Die volle Karte auf der Material-Seite */
export function PrintSettingsCard({
  productId,
  kind,
  stored,
  product,
}: {
  productId: number;
  /** Materialart des Materials; `null` = unbekannt, dann nichts bearbeitbar */
  kind: MaterialKind | null;
  stored: Stored;
  product: PrintSettingsProduct;
}) {
  const t = useT();
  const { language } = useI18n();
  const role = useScopeRole();
  const format = useValueFormatter();
  const resolveAppearance = useAppearanceResolver();
  const [editOpen, setEditOpen] = useState(false);
  const [imported, setImported] = useState<ImportedProfiles | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const canEdit = roleAllows(role, "editor") && kind != null;
  const [nfcOpen, setNfcOpen] = useState(false);
  const canScan = kind === "filament" && canEdit && nfcSupported();

  /**
   * Profil von PrusaSlicer einlesen (seit 4.7.0) – im Browser, und nur in den
   * Dialog: Gespeichert wird erst, wenn jemand die Werte prüft und speichert.
   */
  const onProfileFile = async (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    if (file.size > MAX_PRUSA_PROFILE_BYTES)
      return toast.error(t.printSettings.prusa.errors.tooLarge);
    try {
      const profiles = readPrusaProfiles(await file.text());
      setImported({
        fileName: file.name,
        options: profiles.map(profile => ({
          name: profile.name,
          imported: printSettingsFromProfile(profile),
        })),
        preselect: bestProfileIndex(profiles, product.name),
        nonce: Date.now(),
      });
      setEditOpen(true);
    } catch (error) {
      toast.error(
        error instanceof PrusaProfileError
          ? t.printSettings.prusa.errors.noFilament
          : t.printSettings.prusa.errors.unreadable
      );
    }
  };

  /** Konfigurationspaket für PrusaSlicer herunterladen */
  const exportProfile = () => {
    const settings =
      stored?.settings?.kind === "filament" ? stored.settings : null;
    const input = {
      name: product.name,
      manufacturer: product.manufacturer,
      materialType: product.materialType,
      colorHex: resolveAppearance(product.color, null).hex,
      densityGramsPerLiter: product.densityGramsPerLiter,
      settings,
    };
    const text = prusaBundleFromPrintSettings(
      input,
      t.printSettings.prusa.exportHeader
    );
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${profileName(input)
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "")}.ini`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(t.printSettings.prusa.exported);
  };
  const settings = stored?.settings ?? null;
  const notes = stored?.notes ?? null;
  const filled = hasPrintSettings(settings, notes);
  const fields = settings ? PRINT_SETTING_FIELDS[settings.kind] : [];
  const values = fields.flatMap(field => {
    const value = (settings as Record<string, unknown> | null)?.[field];
    return typeof value === "number" ? [[field, value] as const] : [];
  });

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">{t.printSettings.title}</CardTitle>
        <div className="flex flex-wrap gap-2">
          {kind === "filament" && canEdit && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept=".ini,text/plain"
                className="hidden"
                onChange={e => void onProfileFile(e.target.files?.[0])}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInput.current?.click()}
              >
                <FileUp className="mr-1.5 h-3.5 w-3.5" />
                {t.printSettings.prusa.importButton}
              </Button>
            </>
          )}
          {canScan && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setNfcOpen(true)}
            >
              <Nfc className="mr-1.5 h-3.5 w-3.5" />
              {t.nfc.fromTag}
            </Button>
          )}
          {kind === "filament" && filled && (
            <Button size="sm" variant="outline" onClick={exportProfile}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {t.printSettings.prusa.exportButton}
            </Button>
          )}
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setImported(null);
                setEditOpen(true);
              }}
            >
              {filled ? (
                <>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> {t.common.edit}
                </>
              ) : (
                <>
                  <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />{" "}
                  {t.printSettings.add}
                </>
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!filled ? (
          <p className="text-sm text-muted-foreground">
            {t.printSettings.empty}
          </p>
        ) : (
          <>
            {values.length > 0 && (
              <dl className="grid grid-cols-[minmax(0,12rem)_1fr] gap-x-4 gap-y-2 text-sm">
                {values.map(([field, value]) => (
                  <div key={field} className="contents">
                    <dt className="text-muted-foreground">
                      {t.printSettings.fields[field]}
                    </dt>
                    <dd className="font-mono">{format(field, value)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {settings?.kind === "filament" && settings.enclosureRequired && (
              <p className="text-sm">{t.printSettings.enclosureRequired}</p>
            )}
            {notes && (
              <div className="rounded-lg border p-3 text-sm">
                <MarkdownContent lang={language}>{notes}</MarkdownContent>
              </div>
            )}
          </>
        )}
      </CardContent>
      {canScan && (
        <NfcScanDialog
          open={nfcOpen}
          onOpenChange={setNfcOpen}
          onRead={material => {
            if (!material.printSettings)
              return void toast.info(t.nfc.noPrintSettings);
            setImported({
              fileName: "OpenPrintTag",
              options: [
                {
                  name:
                    [material.manufacturer, material.name]
                      .filter(Boolean)
                      .join(" ") || null,
                  imported: {
                    settings: material.printSettings,
                    densityGramsPerLiter: material.densityGramsPerLiter,
                    filamentType: material.materialType,
                    outOfRange: [],
                  },
                },
              ],
              preselect: 0,
              nonce: Date.now(),
            });
            setEditOpen(true);
          }}
        />
      )}
      {kind != null && (
        <PrintSettingsDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          productId={productId}
          kind={kind}
          stored={stored}
          product={product}
          imported={imported}
        />
      )}
    </Card>
  );
}

/** Bearbeiten: eine Zahl je Feld der Materialart, dazu Notizen */
function PrintSettingsDialog({
  open,
  onOpenChange,
  productId,
  kind,
  stored,
  product,
  imported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: number;
  kind: MaterialKind;
  stored: Stored;
  product: PrintSettingsProduct;
  imported: ImportedProfiles | null;
}) {
  const t = useT();
  const { formatNumber } = useFormat();
  const scope = useActiveScope();
  const utils = trpc.useUtils();
  const [values, setValues] = useState<Record<string, string>>({});
  const [enclosure, setEnclosure] = useState(false);
  const [notes, setNotes] = useState("");
  const [profileIndex, setProfileIndex] = useState(0);
  const [takeDensity, setTakeDensity] = useState(false);

  const storedValues = (): Record<string, unknown> =>
    stored?.settings?.kind === kind
      ? (stored.settings as Record<string, unknown>)
      : {};

  /**
   * Die gespeicherten Werte, darüber die des gewählten Profils. Was das Profil
   * nicht kennt (Trocknen, Höchstgeschwindigkeit), bleibt, wie es war.
   */
  const fillValues = (index: number | null) => {
    const current = storedValues();
    const fromProfile =
      index !== null && imported
        ? (imported.options[index].imported.settings as Record<string, unknown>)
        : {};
    setValues(
      Object.fromEntries(
        PRINT_SETTING_FIELDS[kind].map(field => {
          const value = fromProfile[field] ?? current[field];
          return [
            field,
            typeof value === "number" ? String(toInput(field, value)) : "",
          ];
        })
      )
    );
  };

  /* Beim Öffnen befüllen – während des Renderns, wie im Materialformular. */
  const formKey = open ? `${productId}-${imported?.nonce ?? "-"}` : null;
  const [applied, setApplied] = useState<string | null>(null);
  if (formKey !== applied) {
    setApplied(formKey);
    if (formKey !== null) {
      const index = imported ? imported.preselect : null;
      setProfileIndex(index ?? 0);
      fillValues(index);
      setEnclosure(storedValues().enclosureRequired === true);
      setNotes(stored?.notes ?? "");
      const density =
        index !== null && imported
          ? imported.options[index].imported.densityGramsPerLiter
          : null;
      // Ohne eigene Dichte am Material angekreuzt, sonst nur angeboten
      setTakeDensity(density !== null && product.densityGramsPerLiter == null);
    }
  }

  const current =
    imported && kind === "filament"
      ? imported.options[profileIndex].imported
      : null;
  const offeredDensity =
    current?.densityGramsPerLiter != null &&
    current.densityGramsPerLiter !== product.densityGramsPerLiter
      ? current.densityGramsPerLiter
      : null;
  const typeMismatch =
    current?.filamentType != null &&
    normalizeMaterialType(current.filamentType) !==
      normalizeMaterialType(product.materialType)
      ? current.filamentType
      : null;

  const save = trpc.product.setPrintSettings.useMutation();
  const updateProduct = trpc.product.update.useMutation();
  const pending = save.isPending || updateProduct.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw: Record<string, unknown> = { kind };
    for (const field of PRINT_SETTING_FIELDS[kind]) {
      const text = values[field]?.trim().replace(",", ".");
      if (!text) continue;
      const number = Number(text);
      if (!Number.isFinite(number))
        return toast.error(
          t.printSettings.invalid({ field: t.printSettings.fields[field] })
        );
      raw[field] = fromInput(field, number);
    }
    if (kind === "filament" && enclosure) raw.enclosureRequired = true;
    const parsed = printSettingsSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path[0] as PrintSettingField | undefined;
      if (!field || !(field in t.printSettings.fields))
        return toast.error(t.printSettings.title);
      const label = t.printSettings.fields[field];
      // „bis“ unter „von“ (refine im Schema) – eigene Meldung, nicht „ungültig“
      return toast.error(
        issue?.code === "custom"
          ? t.printSettings.rangeInvalid({ field: label })
          : t.printSettings.invalid({ field: label })
      );
    }
    void (async () => {
      try {
        await save.mutateAsync({
          ...scope,
          id: productId,
          settings: parsed.data,
          notes: notes.trim() || null,
        });
        if (takeDensity && offeredDensity !== null)
          await updateProduct.mutateAsync({
            ...scope,
            id: productId,
            densityGramsPerLiter: offeredDensity,
          });
        toast.success(t.printSettings.saved);
        utils.product.byId.invalidate();
        onOpenChange(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-xl"
        onOpenAutoFocus={event => event.preventDefault()}
      >
        <DialogHeader className="border-b p-4 sm:p-6">
          <DialogTitle>{t.printSettings.editTitle}</DialogTitle>
          <DialogDescription>
            {t.printSettings.editDescription}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={submit}
          {...formKeys}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="grid gap-4 overflow-y-auto p-4 sm:grid-cols-2 sm:p-6">
            {imported && current && (
              <div className="grid gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground sm:col-span-2">
                {imported.options.length > 1 && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="ps-profile">
                      {t.printSettings.prusa.profileLabel}
                    </Label>
                    <Select
                      value={String(profileIndex)}
                      onValueChange={value => {
                        const index = Number(value);
                        setProfileIndex(index);
                        fillValues(index);
                      }}
                    >
                      <SelectTrigger id="ps-profile" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {imported.options.map((profile, index) => (
                          <SelectItem key={index} value={String(index)}>
                            {profile.name ??
                              t.printSettings.prusa.unnamed({
                                number: index + 1,
                              })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <p className="wrap-anywhere">
                  {t.printSettings.prusa.importedFrom({
                    name:
                      imported.options[profileIndex].name ?? imported.fileName,
                  })}
                </p>
                {current.outOfRange.length > 0 && (
                  <p className="text-amber-600 dark:text-amber-400">
                    {t.printSettings.prusa.outOfRange({
                      fields: current.outOfRange
                        .map(field =>
                          field in t.printSettings.fields
                            ? t.printSettings.fields[field as PrintSettingField]
                            : field
                        )
                        .join(", "),
                    })}
                  </p>
                )}
                {typeMismatch && (
                  <p className="text-amber-600 dark:text-amber-400">
                    {t.printSettings.prusa.typeMismatch({
                      profile: typeMismatch,
                      material: product.materialType,
                    })}
                  </p>
                )}
                {offeredDensity !== null && (
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox
                      checked={takeDensity}
                      onCheckedChange={v => setTakeDensity(v === true)}
                    />
                    {t.printSettings.prusa.takeDensity({
                      value: formatNumber(offeredDensity / 1000),
                    })}
                  </label>
                )}
              </div>
            )}
            {PRINT_SETTING_FIELDS[kind].map(field => (
              <div key={field} className="grid gap-2">
                <Label htmlFor={`ps-${field}`}>
                  {t.printSettings.fields[field]}{" "}
                  <span className="text-muted-foreground">
                    ({t.printSettings.units[field]})
                  </span>
                </Label>
                <Input
                  id={`ps-${field}`}
                  inputMode="decimal"
                  className="font-mono"
                  value={values[field] ?? ""}
                  onChange={e =>
                    setValues(v => ({ ...v, [field]: e.target.value }))
                  }
                />
              </div>
            ))}
            {kind === "filament" && (
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox
                  checked={enclosure}
                  onCheckedChange={v => setEnclosure(v === true)}
                />
                {t.printSettings.enclosureRequired}
              </label>
            )}
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="ps-notes">{t.printSettings.notesLabel}</Label>
              <Textarea
                id="ps-notes"
                rows={4}
                maxLength={MAX_PRINT_NOTES_LENGTH}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={t.printSettings.notesPlaceholder}
              />
            </div>
          </div>
          <DialogFooter className="border-t p-4 sm:p-6 sm:py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t.common.saving : t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Eingabe in der Einheit, die man vom Slicer kennt: Rückzug in mm (0,8),
 * Belichtung in s (2,5); gespeichert wird ganzzahlig in 1/100 mm bzw. ms.
 */
function toInput(field: string, stored: number): number {
  if (field === "retractionHundredthsMm") return stored / 100;
  if (field === "exposureMs" || field === "bottomExposureMs")
    return stored / 1000;
  return stored;
}

function fromInput(field: string, input: number): number {
  if (field === "retractionHundredthsMm") return Math.round(input * 100);
  if (field === "exposureMs" || field === "bottomExposureMs")
    return Math.round(input * 1000);
  return input;
}
