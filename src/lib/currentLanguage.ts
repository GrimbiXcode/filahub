import { FALLBACK_LANGUAGE, type LanguageCode } from "@contracts/i18n";

/**
 * Die aktuell sichtbare Oberflächensprache, damit der tRPC-Client sie bei
 * jeder Anfrage mitschicken kann.
 *
 * Bewusst ein Modul-Zustand und kein Kontext: Der Link des tRPC-Clients wird
 * einmal beim Start gebaut und steht ausserhalb des React-Baums, kann also
 * keinen Hook aufrufen. Geschrieben wird ausschliesslich vom `I18nProvider`.
 */
let current: LanguageCode = FALLBACK_LANGUAGE;

export function setCurrentLanguage(language: LanguageCode) {
  current = language;
}

export function getCurrentLanguage(): LanguageCode {
  return current;
}
