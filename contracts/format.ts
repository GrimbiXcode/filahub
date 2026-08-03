/**
 * Formatierungs-Helfer für Zahlen, Gewichte, Geldbeträge und Daten.
 *
 * Alle Funktionen bekommen die Locale (und ggf. die Währung) als Argument –
 * kein Modul-Zustand, damit sie auch in Tests und auf dem Server nutzbar sind.
 * Im Frontend werden sie über `useFormat()` (`src/providers/format.tsx`) an die
 * Einstellungen des angemeldeten Benutzers gebunden.
 */

// ---------------------------------------------------------------------------
// Intl-Instanzen zwischenspeichern: Sie sind teuer und werden in Tabellen
// hundertfach pro Render gebraucht.
// ---------------------------------------------------------------------------

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

function numberFormat(locale: string, options?: Intl.NumberFormatOptions) {
  const key = `${locale}|${JSON.stringify(options ?? {})}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, format);
  }
  return format;
}

function dateFormat(locale: string, options: Intl.DateTimeFormatOptions) {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, format);
  }
  return format;
}

// ---------------------------------------------------------------------------
// Trennzeichen und Währungssymbol der Locale
// ---------------------------------------------------------------------------

/** Dezimaltrennzeichen der Locale, z. B. "," für de-DE und "." für en-US */
export function decimalSeparator(locale: string): string {
  const part = numberFormat(locale)
    .formatToParts(1.1)
    .find(p => p.type === "decimal");
  return part?.value ?? ".";
}

/** Tausendertrennzeichen der Locale (kann ein geschütztes Leerzeichen sein) */
export function groupSeparator(locale: string): string {
  const part = numberFormat(locale)
    .formatToParts(1234567)
    .find(p => p.type === "group");
  return part?.value ?? "";
}

/** Symbol der Währung in der jeweiligen Locale, z. B. "€", "CHF", "$" */
export function currencySymbol(locale: string, currency: string): string {
  for (const currencyDisplay of ["narrowSymbol", "symbol"] as const) {
    try {
      const part = numberFormat(locale, {
        style: "currency",
        currency,
        currencyDisplay,
      })
        .formatToParts(0)
        .find(p => p.type === "currency");
      if (part) return part.value;
    } catch {
      // `narrowSymbol` kennt nicht jede Laufzeit – dann greift "symbol".
    }
  }
  return currency;
}

// ---------------------------------------------------------------------------
// Ausgabe
// ---------------------------------------------------------------------------

export function formatNumber(
  value: number | null | undefined,
  locale: string
): string {
  if (value == null || !Number.isFinite(value)) return "–";
  return numberFormat(locale).format(value);
}

export function formatGrams(
  grams: number | null | undefined,
  locale: string
): string {
  if (grams == null || !Number.isFinite(grams)) return "–";
  return `${numberFormat(locale).format(grams)} g`;
}

/** Prozentwert von 0–100 (nicht 0–1) */
export function formatPercent(
  percent: number | null | undefined,
  locale: string
): string {
  if (percent == null || !Number.isFinite(percent)) return "–";
  return numberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(percent / 100);
}

export function formatMoney(
  cents: number | null | undefined,
  locale: string,
  currency: string
): string {
  if (cents == null || !Number.isFinite(cents)) return "–";
  return numberFormat(locale, { style: "currency", currency }).format(
    cents / 100
  );
}

/** Wandelt string/Date sicher in ein Date-Objekt um, sonst null. */
function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return d;
}

export function formatDate(
  value: string | Date | null | undefined,
  locale: string
): string {
  const d = toDate(value);
  if (!d) return "–";
  return dateFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(
  value: string | Date | null | undefined,
  locale: string
): string {
  const d = toDate(value);
  if (!d) return "–";
  return dateFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// ---------------------------------------------------------------------------
// Eingabe
// ---------------------------------------------------------------------------

/**
 * Führt eine vom Benutzer getippte Zahl auf die JS-Schreibweise mit Punkt
 * zurück. Akzeptiert bewusst beide Trennzeichen, egal welche Locale gerade
 * aktiv ist – getippt wird oft in der Schreibweise der Rechnung.
 *
 * Regeln bei mehrdeutigen Eingaben:
 * - Kommen beide Zeichen vor, ist das *letzte* das Dezimaltrennzeichen
 *   ("1.234,56" → 1234.56, "1,234.56" → 1234.56).
 * - Kommt nur eines vor und trennt es genau drei Endziffern ab, entscheidet
 *   die Locale ("1.234" ist in de-DE 1234, in en-US 1.234).
 * - Sonst ist es das Dezimaltrennzeichen ("24,99", "24.99").
 */
function normalizeDecimalInput(raw: string, locale: string): string {
  const cleaned = raw.replace(/[^\d.,-]/g, "");
  if (!cleaned) return "";

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let decimal: string | null;
  if (lastComma >= 0 && lastDot >= 0) {
    decimal = lastComma > lastDot ? "," : ".";
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const index = lastComma >= 0 ? lastComma : lastDot;
    const isOnlyOccurrence = cleaned.indexOf(sep) === index;
    const head = cleaned.slice(0, index).replace("-", "");
    const tail = cleaned.slice(index + 1);
    const looksGrouped = tail.length === 3 && head.length > 0;
    if (!isOnlyOccurrence) {
      decimal = null; // mehrfach → sicher Tausendertrennzeichen
    } else if (looksGrouped) {
      decimal = sep === groupSeparator(locale) ? null : sep;
    } else {
      decimal = sep;
    }
  } else {
    decimal = null;
  }

  if (decimal === null) return cleaned.replace(/[.,]/g, "");
  const group = decimal === "," ? "." : ",";
  return cleaned.split(group).join("").replace(decimal, ".");
}

/** Geld-Eingabe nach Cent, null bei leer/ungültig/negativ */
export function parseMoneyToCents(
  value: string,
  locale: string
): number | null {
  const normalized = normalizeDecimalInput(value.trim(), locale);
  if (!normalized) return null;
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

/**
 * Cent-Betrag als Wert für ein Eingabefeld – mit dem Dezimaltrennzeichen der
 * Locale, aber bewusst ohne Tausendertrennzeichen.
 */
export function centsToInputString(
  cents: number | null | undefined,
  locale: string
): string {
  if (cents == null || !Number.isFinite(cents)) return "";
  return (cents / 100).toFixed(2).replace(".", decimalSeparator(locale));
}
