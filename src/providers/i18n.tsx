import { type ReactNode, useEffect, useMemo } from "react";
import type { LanguageCode } from "@contracts/i18n";
import { setCurrentLanguage } from "@/lib/currentLanguage";
import { browserLanguage, I18nContext, type I18n } from "@/lib/i18nContext";
import { de } from "@/messages/de";
import { en } from "@/messages/en";
import { trpc } from "@/lib/trpc";

const CATALOGUES = { de, en } as const;

/**
 * Stellt die Oberflächensprache bereit: aus `users.language`, und wenn dort
 * nichts hinterlegt ist, aus dem Browser.
 *
 * Setzt außerdem `<html lang>`. Das gehört hierher und nicht in den
 * FormatProvider: Das Attribut beschreibt die Sprache des Inhalts (relevant
 * für Screenreader, Silbentrennung und Übersetzungsangebote des Browsers),
 * nicht das Zahlenformat.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  // Gleicher Query-Key wie in `useAuth`, deshalb kein zusätzlicher Request.
  const { data: user } = trpc.auth.me.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const languageSetting =
    (user?.language as LanguageCode | null | undefined) ?? null;
  const language = languageSetting ?? browserLanguage();

  // Vor dem ersten Effekt setzen: Sonst ginge die erste Abfragewelle nach dem
  // Sprachwechsel noch mit der alten Kopfzeile raus.
  setCurrentLanguage(language);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18n>(
    () => ({ language, languageSetting, t: CATALOGUES[language] }),
    [language, languageSetting]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
