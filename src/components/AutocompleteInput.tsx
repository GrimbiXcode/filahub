import { useEffect, useId, useMemo, useRef, useState } from "react";
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
 *
 * **Bedienbar ohne Maus.** Pfeil ab öffnet die Liste und geht hinein, Pfeil auf
 * und ab wählen, Enter übernimmt den hervorgehobenen Vorschlag, Esc schließt
 * nur die Liste und Tab geht zum nächsten Feld. Enter ohne Hervorhebung bleibt
 * das Absenden des Formulars – wer den getippten Wert behalten will, tippt ihn
 * und drückt Enter, ohne die Liste zu benutzen. Die Auszeichnung ist die eines
 * Kombinationsfelds (`combobox` + `listbox`), damit Screenreader den
 * hervorgehobenen Vorschlag vorlesen, ohne dass der Fokus das Feld verlässt.
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
  /** -1 = kein Vorschlag hervorgehoben */
  const [activeIndex, setActiveIndex] = useState(-1);
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const optionId = (index: number) => `${listId}-${index}`;

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
  /* Die Liste wird beim Tippen kürzer; ein Index, den es nicht mehr gibt,
     zeigt auf nichts – abgeleitet statt im Zustand nachgeführt. */
  const active = activeIndex < filtered.length ? activeIndex : -1;

  // Den hervorgehobenen Vorschlag ins Sichtfeld holen: Die Liste zeigt acht
  // Einträge, sichtbar sind je nach Platz weniger.
  useEffect(() => {
    if (!show || active < 0) return;
    document
      .getElementById(optionId(active))
      ?.scrollIntoView({ block: "nearest" });
    // optionId hängt nur an der stabilen listId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, active]);

  const close = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const accept = (suggestion: string) => {
    onChange(suggestion);
    close();
  };

  const move = (delta: number) => {
    if (filtered.length === 0) return;
    setOpen(true);
    setActiveIndex(index => {
      const next = index + delta;
      if (next < -1) return filtered.length - 1;
      if (next >= filtered.length) return filtered.length - 1;
      return next;
    });
  };

  return (
    <Popover
      open={show}
      onOpenChange={next => (next ? setOpen(true) : close())}
    >
      <PopoverAnchor asChild>
        <div ref={anchorRef} className="relative">
          <Input
            id={id}
            ref={inputRef}
            value={value}
            placeholder={placeholder}
            autoComplete="off"
            role="combobox"
            aria-expanded={show}
            aria-controls={show ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={
              show && active >= 0 ? optionId(active) : undefined
            }
            onChange={e => {
              onChange(e.target.value);
              setOpen(true);
              // Nach einer Änderung passt die alte Hervorhebung nicht mehr.
              setActiveIndex(-1);
            }}
            /*
              Beim Antippen und Anklicken aufklappen, aber nicht beim
              Weiterwandern mit Tab: Sonst schiebt sich beim Durchtabben vor
              jedem dieser vier Felder eine Liste über die folgenden. Wer mit
              der Tastatur arbeitet, holt sie mit Pfeil ab.
            */
            onPointerDown={() => setOpen(true)}
            onBlur={() => {
              // Verzögert schließen, damit Klick auf Vorschlag greift
              setTimeout(close, 150);
            }}
            onKeyDown={event => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                // Ohne das springt der Schreibzeiger an Anfang oder Ende
                event.preventDefault();
                move(event.key === "ArrowDown" ? 1 : -1);
                return;
              }
              if (event.key === "Enter" && show && active >= 0) {
                // Sonst schickt dasselbe Enter das Formular ab
                event.preventDefault();
                accept(filtered[active]);
                return;
              }
              if (event.key === "Escape" && show) {
                // Nur die Liste schließen – der Dialog bleibt offen
                event.preventDefault();
                event.stopPropagation();
                close();
                return;
              }
              if (event.key === "Tab") close();
            }}
            className="pr-8"
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={t.autocomplete.showSuggestions}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              // Der Pfeil gehört zum Feld: Wer ihn drückt, will darin tippen.
              inputRef.current?.focus();
              if (show) close();
              else setOpen(true);
            }}
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
          <ul id={listId} role="listbox" className="py-1">
            {filtered.map((s, index) => (
              <li
                key={s}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm",
                  index === active && "bg-accent text-accent-foreground"
                )}
                // Nicht `onClick`: Der Klick soll den Fokus nicht aus dem Feld
                // ziehen, sonst schließt das Ausblenden die Liste vor der Wahl.
                onMouseDown={event => {
                  event.preventDefault();
                  accept(s);
                }}
                onMouseEnter={() => setActiveIndex(index)}
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
