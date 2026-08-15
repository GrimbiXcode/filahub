import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { useT } from "@/lib/i18nContext";
import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Bisher erfasste Werte als Vorschläge */
  suggestions: string[];
  placeholder?: string;
};

/**
 * Eingabefeld mit Dropdown-Vorschlägen aus bereits erfassten Werten.
 * Neue Werte können frei eingegeben werden und erscheinen beim nächsten
 * Mal automatisch in der Auswahl.
 *
 * **Die Liste hängt in einem Popover und nicht im Feld.** Als absolut
 * positioniertes Kind lag sie im scrollenden Teil des Formulars und wurde an
 * dessen Rand abgeschnitten – auf dem Telefon blieb vom ersten Vorschlag ein
 * halber Buchstabe unter der Fußzeile übrig. Das Popover zeichnet in einem
 * Portal, dreht bei wenig Platz nach oben und liegt über dem Dialog; dieselbe
 * Grundlage benutzt der Gebindewähler.
 */
export function AutocompleteInput({
  id,
  value,
  onChange,
  suggestions,
  placeholder,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q
      ? suggestions.filter(s => s.toLowerCase().includes(q))
      : suggestions;
    return list.slice(0, 8);
  }, [suggestions, value]);

  const exactMatch = suggestions.some(
    s => s.toLowerCase() === value.trim().toLowerCase()
  );

  /** Ohne Vorschläge und ohne Hinweis bleibt das Popover zu – ein leerer
      Kasten unter dem Feld ist keine Auskunft. */
  const hint = !!value.trim() && !exactMatch && filtered.length === 0;
  const show = open && (filtered.length > 0 || hint);

  return (
    <Popover open={show} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={anchorRef} className="relative">
          <Input
            id={id}
            value={value}
            placeholder={placeholder}
            autoComplete="off"
            onChange={e => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              // Verzögert schließen, damit Klick auf Vorschlag greift
              setTimeout(() => setOpen(false), 150);
            }}
            className="pr-8"
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={t.autocomplete.showSuggestions}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onMouseDown={e => e.preventDefault()}
            onClick={() => setOpen(o => !o)}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                open && "rotate-180"
              )}
            />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="max-h-56 w-(--radix-popover-trigger-width) overflow-auto p-0"
        // Der Zeiger bleibt im Feld: Ohne das zöge das Popover den Fokus aus
        // dem Eingabefeld und die Tastatur klappte auf dem Telefon weg.
        onOpenAutoFocus={event => event.preventDefault()}
        onCloseAutoFocus={event => event.preventDefault()}
        // Ein Klick ins Feld selbst ist kein Klick daneben – sonst schlösse
        // das Setzen des Schreibzeigers die gerade geöffnete Liste.
        onInteractOutside={event => {
          if (anchorRef.current?.contains(event.target as Node))
            event.preventDefault();
        }}
      >
        {filtered.length > 0 ? (
          <ul className="py-1">
            {filtered.map(s => (
              <li key={s}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                  onMouseDown={e => {
                    e.preventDefault();
                    onChange(s);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      s.toLowerCase() === value.trim().toLowerCase()
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                  <span className="min-w-0 truncate">{s}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            {t.autocomplete.newEntry}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
