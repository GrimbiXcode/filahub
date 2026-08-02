import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Disc3 } from "lucide-react";
import {
  decodeSpoolRef,
  encodeSpoolRef,
  formatNominalWeight,
  materialTypeMatches,
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
import { formatGrams } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PresetOption, SpoolTypeItem } from "@/types";

/** Wert für „keine Rolle gewählt“ */
export const NO_SPOOL = "";

type Props = {
  /** "" | "own:12" | "preset:34" */
  value: string;
  onChange: (ref: string) => void;
  ownSpoolTypes: SpoolTypeItem[];
  presets: PresetOption[];
  /** Aktuell im Formular gewählte Materialart – nur zur Gruppierung */
  materialType?: string;
  /** Nennmenge des Materials – passende Varianten werden vorgereiht */
  nominalWeight?: number | null;
  disabled?: boolean;
};

/**
 * Auswahl der Rolle/Verpackung: eigene Rollentypen und Presets aus dem
 * Katalog in einer Liste.
 *
 * Presets werden nach Materialart nur *gruppiert*, nie gefiltert – die
 * Materialart ist im Bestand Freitext („PLA“, „PLA+“, „PLA Silk“), eine harte
 * Filterung würde passende Rollen verschwinden lassen.
 */
export function SpoolPicker({
  value,
  onChange,
  ownSpoolTypes,
  presets,
  materialType,
  nominalWeight,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => {
    const ref = decodeSpoolRef(value);
    if (!ref) return null;
    if (ref.kind === "own") {
      const own = ownSpoolTypes.find((s) => s.id === ref.id);
      return own ? { label: own.name, tareWeight: own.tareWeight, preset: false } : null;
    }
    const preset = presets.find((p) => p.id === ref.id);
    return preset
      ? { label: preset.displayName, tareWeight: preset.tareWeight, preset: true }
      : null;
  }, [value, ownSpoolTypes, presets]);

  /** Passende Presets zuerst, danach der Rest – beides bleibt sichtbar. */
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
    if (!materialType?.trim()) {
      return { matching: [] as PresetOption[], others: [...presets].sort(sort) };
    }
    const matching: PresetOption[] = [];
    const others: PresetOption[] = [];
    for (const preset of presets) {
      if (materialTypeMatches(preset.materialTypes, materialType)) matching.push(preset);
      else others.push(preset);
    }
    return { matching: matching.sort(sort), others: others.sort(sort) };
  }, [presets, materialType, nominalWeight]);

  const renderPreset = (preset: PresetOption) => (
    <CommandItem
      key={`preset-${preset.id}`}
      value={`${preset.displayName} ${preset.manufacturer} ${preset.series} ${formatNominalWeight(preset.nominalWeight)}`}
      onSelect={() => {
        onChange(encodeSpoolRef("preset", preset.id));
        setOpen(false);
      }}
    >
      <Check
        className={cn(
          "mr-2 h-4 w-4",
          value === encodeSpoolRef("preset", preset.id) ? "opacity-100" : "opacity-0",
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="leading-tight">{preset.displayName}</span>
        <span className="text-xs text-muted-foreground">
          {formatGrams(preset.tareWeight)} Tara
          {!preset.isCurrent && " · ältere Ausführung"}
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
          className="w-full justify-between font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected ? (
              <>
                <Disc3 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{selected.label}</span>
                <span className="shrink-0 text-muted-foreground">
                  ({formatGrams(selected.tareWeight)})
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Rolle wählen</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[26rem] max-w-[calc(100vw-2rem)] min-w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Hersteller, Serie oder Gewicht suchen …" />
          <CommandList>
            <CommandEmpty>Keine passende Rolle gefunden.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="keine unbekannt"
                onSelect={() => {
                  onChange(NO_SPOOL);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === NO_SPOOL ? "opacity-100" : "opacity-0",
                  )}
                />
                Keine / unbekannt
              </CommandItem>
            </CommandGroup>

            {ownSpoolTypes.length > 0 && (
              <CommandGroup heading="Eigene Rollentypen">
                {ownSpoolTypes.map((own) => (
                  <CommandItem
                    key={`own-${own.id}`}
                    value={`${own.name} ${own.manufacturer ?? ""}`}
                    onSelect={() => {
                      onChange(encodeSpoolRef("own", own.id));
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === encodeSpoolRef("own", own.id)
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="leading-tight">{own.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatGrams(own.tareWeight)} Tara
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {matching.length > 0 && (
              <CommandGroup heading={`Passend zu ${materialType}`}>
                {matching.map(renderPreset)}
              </CommandGroup>
            )}

            {others.length > 0 && (
              <CommandGroup
                heading={matching.length > 0 ? "Weitere Katalog-Rollen" : "Katalog-Rollen"}
              >
                {others.map(renderPreset)}
              </CommandGroup>
            )}

            {presets.length === 0 && ownSpoolTypes.length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground">
                Noch keine Rollentypen angelegt – unter „Rollentypen“ hinzufügen
                oder ein Preset aus dem Katalog wählen.
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Kleines Kennzeichen für Rollen aus dem Katalog */
export function PresetBadge() {
  return (
    <Badge variant="secondary" className="font-normal">
      Katalog
    </Badge>
  );
}
