import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";

type Props = Omit<React.ComponentProps<"input">, "type" | "onChange"> & {
  value: string;
  /** Bekommt `YYYY-MM-DD` oder "" – wie das native Feld selbst */
  onChange: (value: string) => void;
};

/**
 * Datumsfeld, in das sich ein Datum auch **einfügen** lässt.
 *
 * Ein `<input type="date">` besteht aus drei Teilfeldern und nimmt eingefügten
 * Text nicht an: Wer „12.08.2026“ aus der Bestellbestätigung kopiert und
 * einfügt, sieht nichts passieren – ohne Fehler, ohne Hinweis. Hier fängt
 * `onPaste` das ab, `parseDateInput` macht aus dem Eingefügten `YYYY-MM-DD`
 * (siehe `contracts/format.ts`), und das Feld übernimmt es.
 *
 * Getippt wird weiter wie gewohnt; die Umwandlung greift ausschliesslich beim
 * Einfügen. Was sich nicht lesen lässt, sagt das kurz statt es stillschweigend
 * zu verschlucken – die Rückmeldung des Browsers wäre sonst dieselbe wie
 * vorher: keine.
 */
export function DateInput({ value, onChange, ...props }: Props) {
  const { parseDate } = useFormat();
  const t = useT();

  return (
    <Input
      {...props}
      type="date"
      value={value}
      onChange={event => onChange(event.target.value)}
      onPaste={event => {
        const text = event.clipboardData.getData("text");
        if (!text.trim()) return;
        event.preventDefault();
        const parsed = parseDate(text);
        if (parsed) onChange(parsed);
        else toast.error(t.common.dateNotRecognized({ value: text.trim() }));
      }}
    />
  );
}
