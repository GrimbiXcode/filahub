import { createContext, useContext } from "react";
import { languageFromTag, type LanguageCode } from "@contracts/i18n";
import type { Messages } from "@/messages/de";

/**
 * Kontext für die Oberflächensprache.
 *
 * Bewusst eine eigene Datei ohne Komponenten – dieselbe Begründung wie bei
 * `formatContext.ts`: Läge das zusammen mit dem Provider, würde Fast Refresh
 * für diese Datei ausfallen (react-refresh/only-export-components).
 *
 * Die Texte werden nicht über Schlüsselpfade aufgelöst („home.title“), sondern
 * als verschachteltes Objekt durchgereicht: `t.home.title`. Das kostet keine
 * Laufzeit, braucht keine Bibliothek, und ein Tippfehler oder ein in `en.ts`
 * vergessener Eintrag ist ein Typfehler statt eines leeren Kästchens in der
 * Oberfläche.
 */
export type I18n = {
  /** Tatsächlich verwendete Sprache (Einstellung oder Browser) */
  language: LanguageCode;
  /** Eingestellte Sprache bzw. null, wenn der Browser entscheidet */
  languageSetting: LanguageCode | null;
  /** Texte der aktiven Sprache */
  t: Messages;
};

export const I18nContext = createContext<I18n | null>(null);

/**
 * Schlüssel eines Textbereichs, deren Wert eine schlichte Zeichenkette ist –
 * also ohne die Einträge, die zum Einsetzen von Werten Funktionen sind.
 *
 * Damit lassen sich Tabellen wie die Navigation über ihren Schlüssel führen
 * (`label: "overview"`) statt über den fertigen Text, ohne dass versehentlich
 * eine Funktion in ein Attribut gerät, das eine Zeichenkette erwartet.
 */
export type TextKey<S extends keyof Messages> = {
  [K in keyof Messages[S]]: Messages[S][K] extends string ? K : never;
}[keyof Messages[S]];

/** Sprache des Browsers – die Vorgabe, solange nichts eingestellt ist */
export function browserLanguage(): LanguageCode {
  return languageFromTag(navigator.languages?.at(0) ?? navigator.language);
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n muss innerhalb von <I18nProvider> genutzt werden");
  }
  return value;
}

/** Kurzform für den häufigsten Fall: nur die Texte. */
export function useT(): Messages {
  return useI18n().t;
}
