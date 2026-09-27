import { COLOR_LAYOUTS, type TextureKind } from "@contracts/appearance";
import { ArrowUp, Plus, X } from "lucide-react";
import { AppearanceSwatch } from "@/components/AppearanceSwatch";
import { Spool } from "@/components/Spool";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  canAddAccent,
  canAddColor,
  canRemoveColor,
  editorPreview,
  withLayout,
  type ColorEditorValue,
} from "@/lib/colorSpecEditor";
import { useT } from "@/lib/i18nContext";
import { cn } from "@/lib/utils";

/**
 * Farbbild bearbeiten: Anordnung, Farben, Partikelfarben – mit Vorschau.
 *
 * Benutzt auf `/farben` (Dialog „Eigene Farbe“) und im Materialformular
 * („genau festlegen“), damit es **einen** Editor gibt. Der Zustand gehört dem
 * Aufrufer; Umwandeln und Anpassen stehen in `src/lib/colorSpecEditor.ts`.
 *
 * Mobil zuerst: Jede Farbzeile bricht um, die Reihenfolge ändert ein Knopf
 * „nach vorn“ statt Ziehen – auf dem Telefon verlässlicher und mit der
 * Tastatur bedienbar. Wirkungen (UV, Wärme …) werden noch nicht bearbeitet,
 * aber erhalten.
 */
export function ColorSpecEditor({
  value,
  onChange,
  idPrefix,
  previewKind = "plain",
  compact = false,
}: {
  value: ColorEditorValue;
  onChange: (value: ColorEditorValue) => void;
  /** Eindeutiger Vorsatz für Feldkennungen, falls zwei Editoren auf einer Seite stehen */
  idPrefix: string;
  /** Oberfläche für die Vorschau – im Materialformular die eingetragene */
  previewKind?: TextureKind;
  /** Schmale Fassung ohne Spule und Erklärtexte, für das Materialformular */
  compact?: boolean;
}) {
  const t = useT();
  const preview = editorPreview(value);
  const multi = value.layout !== "solid";

  const setColor = (
    index: number,
    patch: Partial<{ hex: string; name: string }>
  ) =>
    onChange({
      ...value,
      colors: value.colors.map((color, i) =>
        i === index ? { ...color, ...patch } : color
      ),
    });

  const moveUp = (index: number) => {
    const colors = [...value.colors];
    [colors[index - 1], colors[index]] = [colors[index], colors[index - 1]];
    onChange({ ...value, colors });
  };

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex min-w-0 items-end gap-3">
        <div className="grid min-w-0 flex-1 gap-2">
          <Label htmlFor={`${idPrefix}-layout`}>
            {t.appearance.layoutLabel}
          </Label>
          <Select
            value={value.layout}
            onValueChange={layout =>
              onChange(withLayout(value, layout as ColorEditorValue["layout"]))
            }
          >
            <SelectTrigger id={`${idPrefix}-layout`} className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COLOR_LAYOUTS.map(layout => (
                <SelectItem key={layout} value={layout}>
                  {t.appearance.layouts[layout]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {compact ? (
          <AppearanceSwatch
            hex={preview.hex}
            kind={previewKind}
            spec={preview.spec}
            label={t.appearance.preview}
            size="md"
          />
        ) : (
          <Spool
            hex={preview.hex}
            kind={previewKind}
            spec={preview.spec}
            percent={null}
            label={t.appearance.preview}
            size={72}
          />
        )}
      </div>
      {!compact && (
        <p className="text-xs text-muted-foreground">
          {t.appearance.layoutHints[value.layout]}
        </p>
      )}

      <fieldset className="grid min-w-0 gap-3">
        <legend className="mb-2 text-sm font-medium">
          {multi ? t.appearance.colorsLabel : t.appearance.hexLabel}
        </legend>
        {value.colors.map((color, index) => {
          const n = index + 1;
          return (
            <div
              key={index}
              className="flex min-w-0 flex-wrap items-center gap-2"
            >
              {/*
                Farbwähler und Textfeld nebeneinander: Der Wähler ist der
                bequeme Weg, das Textfeld der genaue – einen Code aus dem
                Datenblatt des Herstellers tippt man ab, statt ihn zu treffen.
              */}
              <Input
                type="color"
                aria-label={t.appearance.colorStopLabel({ n })}
                value={
                  /^#[0-9a-f]{6}$/i.test(color.hex)
                    ? color.hex.toLowerCase()
                    : "#000000"
                }
                onChange={e => setColor(index, { hex: e.target.value })}
                className="h-9 w-12 shrink-0 p-1"
              />
              <Input
                id={index === 0 ? `${idPrefix}-hex` : undefined}
                aria-label={t.appearance.colorStopLabel({ n })}
                value={color.hex}
                onChange={e => setColor(index, { hex: e.target.value })}
                className="w-28 min-w-0 flex-1 font-mono sm:flex-none"
                placeholder="#1a2b3c"
              />
              {multi && (
                <>
                  <Input
                    aria-label={`${t.appearance.colorStopLabel({ n })}, ${t.appearance.colorStopName}`}
                    value={color.name}
                    onChange={e => setColor(index, { name: e.target.value })}
                    placeholder={t.appearance.colorStopName}
                    className={cn(
                      // Telefon: eigene Zeile unter Farbe und Knöpfen
                      "order-last min-w-0 basis-full",
                      "sm:order-none sm:flex-1 sm:basis-32"
                    )}
                  />
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={index === 0}
                      onClick={() => moveUp(index)}
                      aria-label={t.appearance.moveColorStopUp({ n })}
                      title={t.appearance.moveColorStopUp({ n })}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={!canRemoveColor(value)}
                      onClick={() =>
                        onChange({
                          ...value,
                          colors: value.colors.filter((_, i) => i !== index),
                        })
                      }
                      aria-label={t.appearance.removeColorStop({ n })}
                      title={t.appearance.removeColorStop({ n })}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          );
        })}
        {multi && canAddColor(value) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() =>
              onChange({
                ...value,
                colors: [
                  ...value.colors,
                  { hex: value.colors.at(-1)?.hex ?? "#8a8a8f", name: "" },
                ],
              })
            }
          >
            <Plus className="mr-1 size-4" /> {t.appearance.addColorStop}
          </Button>
        )}
      </fieldset>

      <fieldset className="grid min-w-0 gap-2">
        <legend className="mb-1 text-sm font-medium">
          {t.appearance.accentsLabel}
        </legend>
        {!compact && (
          <p className="text-xs text-muted-foreground">
            {t.appearance.accentsHint}
          </p>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {value.accents.map((accent, index) => {
            const n = index + 1;
            return (
              <div key={index} className="flex items-center">
                <Input
                  type="color"
                  aria-label={t.appearance.accentStopLabel({ n })}
                  value={
                    /^#[0-9a-f]{6}$/i.test(accent)
                      ? accent.toLowerCase()
                      : "#000000"
                  }
                  onChange={e =>
                    onChange({
                      ...value,
                      accents: value.accents.map((a, i) =>
                        i === index ? e.target.value : a
                      ),
                    })
                  }
                  className="h-9 w-12 p-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() =>
                    onChange({
                      ...value,
                      accents: value.accents.filter((_, i) => i !== index),
                    })
                  }
                  aria-label={t.appearance.removeAccent({ n })}
                  title={t.appearance.removeAccent({ n })}
                >
                  <X className="size-4" />
                </Button>
              </div>
            );
          })}
          {canAddAccent(value) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(value.accents.length === 0 && "justify-self-start")}
              onClick={() =>
                onChange({ ...value, accents: [...value.accents, "#2a2a2a"] })
              }
            >
              <Plus className="mr-1 size-4" /> {t.appearance.addAccent}
            </Button>
          )}
        </div>
      </fieldset>
    </div>
  );
}
