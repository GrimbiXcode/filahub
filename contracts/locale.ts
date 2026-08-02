import { z } from "zod";

/**
 * Auswahllisten für die benutzerbezogenen Anzeige-Einstellungen (Währung und
 * Regionalformat) samt der zugehörigen zod-Schemas.
 *
 * Diese Datei wird von Client, Server und Tests importiert und darf deshalb
 * nichts aus `@db` oder `api/` zur Laufzeit laden – nur zod und eigene Logik.
 */

// ---------------------------------------------------------------------------
// Währungen
// ---------------------------------------------------------------------------

/**
 * Auswählbare Anzeigewährungen (ISO 4217). Bewusst nur Währungen mit zwei
 * Nachkommastellen – Beträge liegen als `priceCents` in Hundertsteln vor.
 */
export const SUPPORTED_CURRENCIES = [
  { code: "EUR", label: "Euro" },
  { code: "CHF", label: "Schweizer Franken" },
  { code: "USD", label: "US-Dollar" },
  { code: "GBP", label: "Britisches Pfund" },
  { code: "PLN", label: "Polnischer Złoty" },
  { code: "CZK", label: "Tschechische Krone" },
  { code: "SEK", label: "Schwedische Krone" },
  { code: "DKK", label: "Dänische Krone" },
  { code: "NOK", label: "Norwegische Krone" },
  { code: "HUF", label: "Ungarischer Forint" },
  { code: "RON", label: "Rumänischer Leu" },
  { code: "BGN", label: "Bulgarischer Lew" },
  { code: "CAD", label: "Kanadischer Dollar" },
  { code: "AUD", label: "Australischer Dollar" },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];

const CURRENCY_CODES = SUPPORTED_CURRENCIES.map(c => c.code) as unknown as [
  CurrencyCode,
  ...CurrencyCode[],
];

/** Währung, solange der Benutzer nichts anderes gewählt hat */
export const DEFAULT_CURRENCY: CurrencyCode = "EUR";

export const currencySchema = z.enum(CURRENCY_CODES);

// ---------------------------------------------------------------------------
// Regionalformate
// ---------------------------------------------------------------------------

/**
 * Auswählbare Locales für Zahlen-, Gewichts- und Datumsformate. `null` in der
 * Datenbank bedeutet „der Browser entscheidet“ (`navigator.language`).
 */
export const SUPPORTED_LOCALES = [
  { code: "de-DE", label: "Deutsch (Deutschland)" },
  { code: "de-AT", label: "Deutsch (Österreich)" },
  { code: "de-CH", label: "Deutsch (Schweiz)" },
  { code: "en-US", label: "Englisch (USA)" },
  { code: "en-GB", label: "Englisch (Vereinigtes Königreich)" },
  { code: "fr-FR", label: "Französisch (Frankreich)" },
  { code: "fr-CH", label: "Französisch (Schweiz)" },
  { code: "it-IT", label: "Italienisch (Italien)" },
  { code: "it-CH", label: "Italienisch (Schweiz)" },
  { code: "es-ES", label: "Spanisch (Spanien)" },
  { code: "nl-NL", label: "Niederländisch (Niederlande)" },
  { code: "pl-PL", label: "Polnisch (Polen)" },
  { code: "cs-CZ", label: "Tschechisch (Tschechien)" },
  { code: "sv-SE", label: "Schwedisch (Schweden)" },
  { code: "da-DK", label: "Dänisch (Dänemark)" },
] as const;

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]["code"];

const LOCALE_CODES = SUPPORTED_LOCALES.map(l => l.code) as unknown as [
  LocaleCode,
  ...LocaleCode[],
];

/** Notnagel, wenn weder Benutzer noch Browser eine brauchbare Locale liefern */
export const FALLBACK_LOCALE: LocaleCode = "de-DE";

/** `null` = automatisch, also die Locale des Browsers */
export const localeSchema = z.enum(LOCALE_CODES).nullable();
