import { z } from "zod";

/**
 * Oberflächensprache pro Benutzer.
 *
 * Bewusst getrennt vom Regionalformat in `contracts/locale.ts`: Das eine
 * bestimmt, in welcher Sprache die Oberfläche spricht, das andere, wie Zahlen
 * und Datumsangaben aussehen. Wer die Oberfläche auf Englisch stellt, will
 * deshalb nicht zwangsläufig auch amerikanische Datumsformate.
 *
 * Wie `contracts/locale.ts` wird diese Datei von Client, Server und Tests
 * importiert und darf zur Laufzeit nichts aus `@db` oder `api/` laden.
 */

/**
 * Verfügbare Sprachen. Die Bezeichnung steht in der jeweiligen Sprache selbst
 * (Autonym) – so findet sich auch jemand zurecht, der die aktuell eingestellte
 * Sprache nicht liest.
 */
export const SUPPORTED_LANGUAGES = [
  { code: "de", label: "Deutsch" },
  { code: "en", label: "English" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

const LANGUAGE_CODES = SUPPORTED_LANGUAGES.map(l => l.code) as unknown as [
  LanguageCode,
  ...LanguageCode[],
];

/** Sprache, wenn weder Benutzer noch Browser etwas Brauchbares liefern */
export const FALLBACK_LANGUAGE: LanguageCode = "de";

/** `null` = automatisch, also die Sprache des Browsers */
export const languageSchema = z.enum(LANGUAGE_CODES).nullable();

/**
 * Ordnet ein BCP-47-Tag (`de-CH`, `en-GB`, `fr-FR`) einer unterstützten
 * Sprache zu. Alles, was wir nicht sprechen, landet auf Englisch – die
 * wahrscheinlichere Zweitsprache für jemanden, der weder Deutsch noch
 * Englisch als Browsersprache gesetzt hat.
 */
export function languageFromTag(tag: string | undefined | null): LanguageCode {
  if (!tag) return FALLBACK_LANGUAGE;
  const primary = tag.toLowerCase().split("-").at(0);
  return primary === "de" ? "de" : "en";
}
