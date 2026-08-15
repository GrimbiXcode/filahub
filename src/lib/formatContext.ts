import { createContext, useContext } from "react";
import {
  FALLBACK_LOCALE,
  type CurrencyCode,
  type LocaleCode,
} from "@contracts/locale";
import type { SecondaryAmount } from "@contracts/materials";

/**
 * Kontext für die an den Benutzer gebundenen Formatierer.
 *
 * Bewusst eine eigene Datei ohne Komponenten: Läge das zusammen mit
 * `FormatProvider`, würde Fast Refresh für diese Datei ausfallen
 * (react-refresh/only-export-components).
 */
export type FormatHelpers = {
  /** Tatsächlich verwendete Locale (Einstellung oder Browser) */
  locale: string;
  /** Eingestellte Locale bzw. null, wenn der Browser entscheidet */
  localeSetting: LocaleCode | null;
  currency: CurrencyCode;
  /** Währungssymbol in der aktiven Locale, z. B. "€" oder "CHF" */
  currencySymbol: string;
  formatNumber: (value: number | null | undefined) => string;
  formatGrams: (grams: number | null | undefined) => string;
  /** Filamentstärke aus Mikrometern, mit dem Trennzeichen der Locale */
  formatDiameter: (um: number) => string;
  /**
   * Zweitanzeige (Meter beim Filament, Liter beim Harz) samt Einheit.
   *
   * Eine Funktion für beide Einheiten und nicht zwei: So kann an keiner
   * Aufrufstelle die falsche Einheit zum falschen Formatierer geraten. `null`
   * ergibt „–", wie bei den übrigen Formatierern.
   */
  formatSecondary: (amount: SecondaryAmount | null | undefined) => string;
  /** Prozentwert von 0–100 (nicht 0–1) */
  formatPercent: (percent: number | null | undefined) => string;
  formatMoney: (cents: number | null | undefined) => string;
  formatDate: (value: string | Date | null | undefined) => string;
  formatDateTime: (value: string | Date | null | undefined) => string;
  /** Geld-Eingabe nach Cent, null bei leer/ungültig */
  parseMoney: (value: string) => number | null;
  /**
   * Datumseingabe nach `YYYY-MM-DD`, null wenn daraus kein Datum wird –
   * für Text, der in ein Datumsfeld eingefügt wird.
   */
  parseDate: (value: string) => string | null;
  /** Cent-Betrag als Wert für ein Eingabefeld */
  centsToInput: (cents: number | null | undefined) => string;
};

export const FormatContext = createContext<FormatHelpers | null>(null);

/**
 * Locale des Browsers – die Vorgabe, solange der Benutzer nichts anderes
 * eingestellt hat. Fällt auf `FALLBACK_LOCALE` zurück, wenn der Browser einen
 * Tag ohne Formatdaten meldet.
 */
export function browserLocale(): string {
  const candidate = navigator.languages?.at(0) ?? navigator.language;
  if (!candidate) return FALLBACK_LOCALE;
  try {
    return (
      Intl.NumberFormat.supportedLocalesOf(candidate).at(0) ?? FALLBACK_LOCALE
    );
  } catch {
    return FALLBACK_LOCALE;
  }
}

export function useFormat(): FormatHelpers {
  const value = useContext(FormatContext);
  if (!value) {
    throw new Error(
      "useFormat muss innerhalb von <FormatProvider> genutzt werden"
    );
  }
  return value;
}
