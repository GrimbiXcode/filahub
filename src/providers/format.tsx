import { type ReactNode, useMemo } from "react";
import {
  centsToInputString,
  currencySymbol as currencySymbolFor,
  formatDate,
  formatDateTime,
  formatGrams,
  formatLiters,
  formatMeters,
  formatMoney,
  formatNumber,
  formatPercent,
  parseDateInput,
  parseMoneyToCents,
} from "@contracts/format";
import {
  DEFAULT_CURRENCY,
  type CurrencyCode,
  type LocaleCode,
} from "@contracts/locale";
import { formatDiameter } from "@contracts/materials";
import {
  browserLocale,
  FormatContext,
  type FormatHelpers,
} from "@/lib/formatContext";
import { trpc } from "@/lib/trpc";

/**
 * Bindet die reinen Formatierer aus `@contracts/format` an die Einstellungen
 * des angemeldeten Benutzers: Währung aus `users.currency`, Regionalformat aus
 * `users.locale` – und wenn dort nichts hinterlegt ist, aus dem Browser.
 */
export function FormatProvider({ children }: { children: ReactNode }) {
  // Gleicher Query-Key wie in `useAuth`, deshalb kein zusätzlicher Request.
  const { data: user } = trpc.auth.me.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const localeSetting = (user?.locale as LocaleCode | null | undefined) ?? null;
  const currency =
    (user?.currency as CurrencyCode | undefined) ?? DEFAULT_CURRENCY;
  const locale = localeSetting ?? browserLocale();

  const helpers = useMemo<FormatHelpers>(
    () => ({
      locale,
      localeSetting,
      currency,
      currencySymbol: currencySymbolFor(locale, currency),
      formatNumber: n => formatNumber(n, locale),
      formatGrams: grams => formatGrams(grams, locale),
      formatDiameter: um => formatDiameter(um, locale),
      formatSecondary: amount => {
        if (amount == null) return "–";
        return amount.unit === "m"
          ? formatMeters(amount.value, locale)
          : formatLiters(amount.value, locale);
      },
      formatPercent: percent => formatPercent(percent, locale),
      formatMoney: cents => formatMoney(cents, locale, currency),
      formatDate: date => formatDate(date, locale),
      formatDateTime: date => formatDateTime(date, locale),
      parseMoney: input => parseMoneyToCents(input, locale),
      parseDate: input => parseDateInput(input, locale),
      centsToInput: cents => centsToInputString(cents, locale),
    }),
    [locale, localeSetting, currency]
  );

  return (
    <FormatContext.Provider value={helpers}>{children}</FormatContext.Provider>
  );
}
