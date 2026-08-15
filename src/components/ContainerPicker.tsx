import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Disc3 } from "lucide-react";
import { formFitsKind, type MaterialKind } from "@contracts/materials";
import {
  decodeContainerRef,
  encodeContainerRef,
  containerFits,
  formatNominalWeight,
} from "@contracts/presets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";
import { kindLabel } from "@/lib/materialKind";
import { cn } from "@/lib/utils";
import type { PresetOption, ContainerTypeItem } from "@/types";

/** Wert für „kein Gebinde gewählt“ */
export const NO_CONTAINER = "";

type Props = {
  /** "" | "own:12" | "preset:34" */
  value: string;
  onChange: (ref: string) => void;
  ownContainerTypes: ContainerTypeItem[];
  presets: PresetOption[];
  /** Aktuell im Formular gewählte Materialart – nur zur Gruppierung */
  materialType?: string;
  /**
   * Materialart des gewählten Lagers – auch nur zur Gruppierung. Ein Harzlager
   * reiht Flaschen und Kartuschen nach oben.
   */
  materialKind?: MaterialKind | null;
  /** Nennmenge des Materials – passende Varianten werden vorgereiht */
  nominalWeight?: number | null;
  disabled?: boolean;
};

/**
 * Auswahl des Gebindes: eigene Gebindearten und Presets aus dem
 * Katalog in einer Liste.
 *
 * **Gruppiert, filtert nicht** – weder nach Materialart noch nach Gebindeform.
 * Die Materialart ist im Bestand Freitext („PLA“, „PLA+“, „PLA Silk“), und die
 * Form eines Gebindes ist eine Angabe des Benutzers. Wer beides hart filtert,
 * lässt genau das Gebinde verschwinden, das jemand bewusst so angelegt hat, und
 * gibt ihm keine Möglichkeit, es zu wählen. Passendes steht oben, alles andere
 * darunter.
 */
export function ContainerPicker({
  value,
  onChange,
  ownContainerTypes,
  presets,
  materialType,
  materialKind,
  nominalWeight,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const { formatGrams } = useFormat();
  const t = useT();

  const selected = useMemo(() => {
    const ref = decodeContainerRef(value);
    if (!ref) return null;
    if (ref.kind === "own") {
      const own = ownContainerTypes.find(s => s.id === ref.id);
      return own
        ? { label: own.name, tareWeight: own.tareWeight, preset: false }
        : null;
    }
    const preset = presets.find(p => p.id === ref.id);
    return preset
      ? {
          label: preset.displayName,
          tareWeight: preset.tareWeight,
          preset: true,
        }
      : null;
  }, [value, ownContainerTypes, presets]);

  /**
   * Passende Presets zuerst, danach der Rest – beides bleibt sichtbar.
   *
   * Was „passend“ heißt, entscheidet `containerFits` (`contracts/presets.ts`):
   * Form und Materialart dürfen nicht widersprechen, und mindestens eine von
   * beiden muss ausdrücklich zustimmen. Zwei unbekannte Merkmale reichen nicht –
   * sonst stünde eine unverschlagwortete Filamentspule unter „Passend zu Harz“.
   */
  const { matching, others } = useMemo(() => {
    const sort = (a: PresetOption, b: PresetOption) => {
      // Zur Nennmenge passende Varianten nach oben
      if (nominalWeight != null) {
        const aFit = a.nominalWeight === nominalWeight ? 0 : 1;
        const bFit = b.nominalWeight === nominalWeight ? 0 : 1;
        if (aFit !== bFit) return aFit - bFit;
      }
      // Aktuelle Ausführungen vor ausgelaufenen
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return a.displayName.localeCompare(b.displayName);
    };
    const matching: PresetOption[] = [];
    const others: PresetOption[] = [];
    for (const preset of presets) {
      if (containerFits(preset, { kind: materialKind, materialType }))
        matching.push(preset);
      else others.push(preset);
    }
    return { matching: matching.sort(sort), others: others.sort(sort) };
  }, [presets, materialType, materialKind, nominalWeight]);

  /*
    Eigene Gebindearten stehen immer oben und werden nicht aufgeteilt: Es sind
    die Einträge des Benutzers, meist eine Handvoll, und er weiß, was er angelegt
    hat. Sortiert wird nur – passende Form zuerst.
  */
  const ownSorted = useMemo(
    () =>
      [...ownContainerTypes].sort((a, b) => {
        const aFit = formFitsKind(a.form, materialKind) ? 0 : 1;
        const bFit = formFitsKind(b.form, materialKind) ? 0 : 1;
        if (aFit !== bFit) return aFit - bFit;
        return a.name.localeCompare(b.name);
      }),
    [ownContainerTypes, materialKind]
  );

  const renderPreset = (preset: PresetOption) => (
    <CommandItem
      key={`preset-${preset.id}`}
      value={`${preset.displayName} ${preset.manufacturer} ${preset.series} ${formatNominalWeight(preset.nominalWeight)}`}
      onSelect={() => {
        onChange(encodeContainerRef("preset", preset.id));
        setOpen(false);
      }}
    >
      <Check
        className={cn(
          "mr-2 h-4 w-4",
          value === encodeContainerRef("preset", preset.id)
            ? "opacity-100"
            : "opacity-0"
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="leading-tight">{preset.displayName}</span>
        <span className="text-xs text-muted-foreground">
          {t.preset.tareSuffix({ amount: formatGrams(preset.tareWeight) })}
          {preset.form && ` · ${t.preset.containerForm[preset.form]}`}
          {!preset.isCurrent && ` · ${t.preset.olderVersion}`}
        </span>
      </div>
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          /*
            `min-w-0`, damit der Knopf nicht mindestens so breit wird wie der
            Name des gewählten Gebindes: In einem Rasterfeld schob er sich
            sonst über die Nachbarspalte. So bleibt er bei der Breite seines
            Felds und der Name kürzt sich mit `truncate`.
          */
          className="w-full min-w-0 justify-between font-normal"
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {selected ? (
              <>
                <Disc3 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{selected.label}</span>
                <span className="shrink-0 text-muted-foreground">
                  ({formatGrams(selected.tareWeight)})
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                {t.containerPicker.choose}
              </span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-104 max-w-[calc(100vw-2rem)] min-w-(--radix-popover-trigger-width) p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder={t.containerPicker.searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{t.containerPicker.empty}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="keine unbekannt"
                onSelect={() => {
                  onChange(NO_CONTAINER);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === NO_CONTAINER ? "opacity-100" : "opacity-0"
                  )}
                />
                {t.containerPicker.none}
              </CommandItem>
            </CommandGroup>

            {ownSorted.length > 0 && (
              <CommandGroup heading={t.containerPicker.ownTypes}>
                {ownSorted.map(own => (
                  <CommandItem
                    key={`own-${own.id}`}
                    value={`${own.name} ${own.manufacturer ?? ""}`}
                    onSelect={() => {
                      onChange(encodeContainerRef("own", own.id));
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === encodeContainerRef("own", own.id)
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="leading-tight">{own.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.preset.tareSuffix({
                          amount: formatGrams(own.tareWeight),
                        })}
                        {` · ${t.preset.containerForm[own.form]}`}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {matching.length > 0 && (
              <CommandGroup
                heading={t.preset.formFits({
                  /*
                    Die Materialart, wenn sie eingetragen ist – sonst die des
                    Lagers. „Passend zu PLA" ist die genauere Auskunft, „Passend
                    zu Harz" die, die immer verfügbar ist.
                  */
                  kind: materialType?.trim()
                    ? materialType
                    : materialKind
                      ? kindLabel(t, materialKind)
                      : "",
                })}
              >
                {matching.map(renderPreset)}
              </CommandGroup>
            )}

            {others.length > 0 && (
              <CommandGroup
                heading={
                  matching.length > 0
                    ? t.containerPicker.catalogMore
                    : t.containerPicker.catalog
                }
              >
                {others.map(renderPreset)}
              </CommandGroup>
            )}

            {presets.length === 0 && ownContainerTypes.length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground">
                {t.containerPicker.nothingYet}
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Kleines Kennzeichen für Gebinde aus dem Katalog */
export function PresetBadge() {
  const t = useT();
  return (
    <Badge variant="secondary" className="font-normal">
      {t.preset.catalogBadge}
    </Badge>
  );
}
