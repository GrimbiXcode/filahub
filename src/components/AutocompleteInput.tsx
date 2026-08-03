import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
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
 */
export function AutocompleteInput({
  id,
  value,
  onChange,
  suggestions,
  placeholder,
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
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
          aria-label="Vorschläge anzeigen"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onMouseDown={e => e.preventDefault()}
          onClick={() => setOpen(o => !o)}
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
          />
        </button>
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover py-1 shadow-md">
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
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && value.trim() && !exactMatch && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md">
          Neuer Eintrag – erscheint beim nächsten Mal in der Auswahl
        </div>
      )}
    </div>
  );
}
