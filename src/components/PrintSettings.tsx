import { useState } from "react";
import { Flame, Pencil, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { MaterialKind } from "@contracts/materials";
import {
  MAX_PRINT_NOTES_LENGTH,
  PRINT_SETTING_FIELDS,
  hasPrintSettings,
  printSettingsSchema,
  type PrintSettingField,
  type PrintSettings,
} from "@contracts/printSettings";
import { roleAllows } from "@contracts/organizations";
import { MarkdownContent } from "@/components/MarkdownContent";
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
import { Textarea } from "@/components/ui/textarea";
import { useActiveScope, useScopeRole } from "@/lib/activeScope";
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

/** Einheit und Umrechnung je Feld – gespeichert wird immer ganzzahlig. */
function useValueFormatter(): Formatter {
  const { formatNumber } = useFormat();
  return (field, value) => {
    switch (field) {
      case "nozzleMinC":
      case "nozzleMaxC":
      case "bedMinC":
      case "bedMaxC":
      case "chamberC":
      case "dryingC":
        return `${formatNumber(value)} °C`;
      case "fanPercent":
      case "flowPercent":
      case "refreshPercent":
        return `${formatNumber(value)} %`;
      case "speedMaxMmS":
        return `${formatNumber(value)} mm/s`;
      case "retractionHundredthsMm":
        return `${formatNumber(value / 100)} mm`;
      case "dryingMinutes":
      case "postCureMinutes":
        return value >= 60 && value % 30 === 0
          ? `${formatNumber(value / 60)} h`
          : `${formatNumber(value)} min`;
      case "exposureMs":
      case "bottomExposureMs":
        return `${formatNumber(value / 1000)} s`;
      case "layerHeightUm":
        return `${formatNumber(value)} µm`;
      case "bottomLayers":
        return formatNumber(value);
    }
  };
}

/** „205–220 °C“, „60 °C“ oder nichts – für die Spannen von/bis */
function range(
  format: Formatter,
  minField: PrintSettingField,
  maxField: PrintSettingField,
  min: number | undefined,
  max: number | undefined
): string | null {
  if (min != null && max != null)
    return min === max
      ? format(minField, min)
      : `${format(minField, min).replace(/ °C$/, "")}–${format(maxField, max)}`;
  if (min != null) return format(minField, min);
  if (max != null) return format(maxField, max);
  return null;
}

/**
 * Die kompakte Zeile: das, was man am Drucker stehend nachschaut – Düse,
 * Bett, Trocknen beim Filament, Belichtung beim Harz, Schichthöhe beim Pulver.
 */
export function PrintSettingsSummary({ stored }: { stored: Stored }) {
  const t = useT();
  const format = useValueFormatter();
  const s = stored?.settings;
  if (!s || !hasPrintSettings(s)) return null;
  const parts: string[] = [];
  if (s.kind === "filament") {
    const nozzle = range(
      format,
      "nozzleMinC",
      "nozzleMaxC",
      s.nozzleMinC,
      s.nozzleMaxC
    );
    const bed = range(format, "bedMinC", "bedMaxC", s.bedMinC, s.bedMaxC);
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
}: {
  productId: number;
  /** Materialart des Materials; `null` = unbekannt, dann nichts bearbeitbar */
  kind: MaterialKind | null;
  stored: Stored;
}) {
  const t = useT();
  const { language } = useI18n();
  const role = useScopeRole();
  const format = useValueFormatter();
  const [editOpen, setEditOpen] = useState(false);
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
        {roleAllows(role, "editor") && kind != null && (
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
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
      {kind != null && (
        <PrintSettingsDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          productId={productId}
          kind={kind}
          stored={stored}
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: number;
  kind: MaterialKind;
  stored: Stored;
}) {
  const t = useT();
  const scope = useActiveScope();
  const utils = trpc.useUtils();
  const [values, setValues] = useState<Record<string, string>>({});
  const [enclosure, setEnclosure] = useState(false);
  const [notes, setNotes] = useState("");

  /* Beim Öffnen befüllen – während des Renderns, wie im Materialformular. */
  const formKey = open ? `${productId}` : null;
  const [applied, setApplied] = useState<string | null>(null);
  if (formKey !== applied) {
    setApplied(formKey);
    if (formKey !== null) {
      const current =
        stored?.settings?.kind === kind
          ? (stored.settings as Record<string, unknown>)
          : {};
      setValues(
        Object.fromEntries(
          PRINT_SETTING_FIELDS[kind].map(field => [
            field,
            typeof current[field] === "number"
              ? String(toInput(field, current[field] as number))
              : "",
          ])
        )
      );
      setEnclosure(current.enclosureRequired === true);
      setNotes(stored?.notes ?? "");
    }
  }

  const save = trpc.product.setPrintSettings.useMutation({
    onSuccess: () => {
      toast.success(t.printSettings.saved);
      utils.product.byId.invalidate();
      onOpenChange(false);
    },
    onError: e => toast.error(e.message),
  });

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
      return toast.error(
        field && field in t.printSettings.fields
          ? t.printSettings.invalid({ field: t.printSettings.fields[field] })
          : (issue?.message ?? t.printSettings.title)
      );
    }
    save.mutate({
      ...scope,
      id: productId,
      settings: parsed.data,
      notes: notes.trim() || null,
    });
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
              disabled={save.isPending}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? t.common.saving : t.common.save}
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
