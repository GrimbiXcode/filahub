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

/**
 * Länge in Metern – die Zweitanzeige beim Filament.
 *
 * Eine Dezimalstelle: Der Wert stammt aus einer Dichte, die meist eine Vorgabe
 * ist. Mehr Stellen wären eine Genauigkeit, die die Eingangsdaten nicht haben.
 */
export function formatMeters(
  meters: number | null | undefined,
  locale: string
): string {
  if (meters == null || !Number.isFinite(meters)) return "–";
  return `${numberFormat(locale, { maximumFractionDigits: 1 }).format(meters)} m`;
}

/** Volumen in Litern – die Zweitanzeige beim Harz. Zwei Stellen (0,45 l). */
export function formatLiters(
  liters: number | null | undefined,
  locale: string
): string {
  if (liters == null || !Number.isFinite(liters)) return "–";
  return `${numberFormat(locale, { maximumFractionDigits: 2 }).format(liters)} l`;
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

/** Reihenfolge von Tag, Monat und Jahr in der Locale */
function dateFieldOrder(locale: string): ("day" | "month" | "year")[] {
  const parts = dateFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    // Ohne Zeitzone hängt die Reihenfolge sonst am Ort des Servers; für die
    // Frage „Tag oder Monat zuerst" ist das Datum selbst ohnehin egal.
    timeZone: "UTC",
  }).formatToParts(new Date(Date.UTC(2001, 1, 3)));
  const order = parts
    .map(part => part.type)
    .filter(
      (type): type is "day" | "month" | "year" =>
        type === "day" || type === "month" || type === "year"
    );
  return order.length === 3 ? order : ["day", "month", "year"];
}

/** Zweistellige Jahre gehören in dieses Jahrhundert: „26" → 2026 */
function expandYear(year: number): number {
  return year < 100 ? 2000 + year : year;
}

/** Baut `YYYY-MM-DD`, wenn es den Tag wirklich gibt – sonst null */
function isoDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2999) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null; // z. B. der 31. Februar
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Datumseingabe nach `YYYY-MM-DD` – die Form, die ein `<input type="date">`
 * als Wert erwartet. `null`, wenn daraus kein Datum wird.
 *
 * Gedacht für das, was Menschen in ein Datumsfeld **einfügen**: die Zeile aus
 * der Bestellbestätigung, eine Zelle aus der Tabellenkalkulation, das Datum,
 * das filahub selbst anzeigt. Der Browser wirft eingefügten Text im
 * Datumsfeld kommentarlos weg – erst diese Umwandlung macht das Einfügen
 * überhaupt möglich.
 *
 * Angenommen werden:
 * - die ISO-Form mit und ohne Uhrzeit (`2026-08-12`, `2026-08-12T10:30:00Z`),
 * - drei Zahlen in beliebiger Trennung (`12.08.2026`, `12/8/26`, `12 08 2026`),
 *   auch mitten im Satz („bestellt am 12.08.2026"),
 * - zweistellige Jahre.
 *
 * Ob „08/12" der 8. Dezember oder der 12. August ist, entscheidet die Locale
 * des Benutzers – mit einer Ausnahme: Eine Zahl über zwölf kann kein Monat
 * sein, dann steht sie für den Tag, egal was die Locale sagt.
 */
export function parseDateInput(raw: string, locale: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  // Zuerst die Maschinenform – sie ist eindeutig und braucht keine Locale.
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(value);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const tokens = value.match(/\d+/g)?.slice(0, 3);
  if (!tokens || tokens.length < 3) return null;
  if (tokens.some(token => token.length > 4)) return null;

  const order = dateFieldOrder(locale);
  // Vier Ziffern sind das Jahr; sonst steht es dort, wo die Locale es erwartet.
  const fourDigits = tokens.findIndex(token => token.length === 4);
  const yearAt = fourDigits >= 0 ? fourDigits : order.indexOf("year");
  if (tokens[yearAt].length === 3) return null;
  const year = expandYear(Number(tokens[yearAt]));

  const rest = tokens.filter((_, index) => index !== yearAt).map(Number);
  // Steht das Jahr vorn, ist die Schreibweise absteigend (2026-08-12);
  // sonst gibt die Locale die Reihenfolge von Tag und Monat vor.
  const dayFirst =
    yearAt === 0 ? false : order.indexOf("day") < order.indexOf("month");
  let [day, month] = dayFirst ? rest : [rest[1], rest[0]];
  if (month > 12 && day <= 12) [day, month] = [month, day];

  return isoDate(year, month, day);
}
