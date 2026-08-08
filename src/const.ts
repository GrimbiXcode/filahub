/**
 * Produktname. Eigenname, deshalb in keiner Sprache übersetzt und überall
 * klein geschrieben – so wie Repository, Docker-Image und Produktseite.
 */
export const APP_NAME = "filahub";

/**
 * Einwilligung in das Nachladen des Telegram-Login-Widgets. Das Skript kommt
 * von telegram.org und gibt dabei IP-Adresse und Gerätedaten an Telegram
 * (Sitz: Vereinigte Arabische Emirate) preis – deshalb wird es erst nach einem
 * ausdrücklichen Klick geladen und die Entscheidung hier festgehalten.
 *
 * Bewusst `localStorage` und nicht der Server: Die Einwilligung fällt vor der
 * Anmeldung, es gibt zu diesem Zeitpunkt also noch kein Konto, an dem sie
 * hängen könnte.
 */
export const TELEGRAM_WIDGET_CONSENT_KEY = "telegram-widget-consent";

export const LOGIN_PATH = "/login";
export const SETTINGS_PATH = "/einstellungen";
export const RELEASE_NOTES_PATH = "/neuerungen";

/**
 * Rechtstexte. Sie liegen als Markdown unter `src/legal/<doc>.<sprache>.md`.
 *
 * Erreichbar ohne Anmeldung – die Informationspflicht nach Art. 13 DSGVO und
 * Art. 19 revDSG greift, bevor jemand ein Konto hat, und ein Impressum hinter
 * einer Anmeldeschranke wäre keins.
 *
 * Die Pfade sind deutsch wie überall in der App (`/rollentypen`,
 * `/einstellungen`), unabhängig von der eingestellten Oberflächensprache.
 */
export const LEGAL_DOCUMENTS = ["privacy", "imprint", "terms"] as const;

export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];

export const LEGAL_PATHS = {
  privacy: "/datenschutz",
  imprint: "/impressum",
  terms: "/nutzungsbedingungen",
} as const satisfies Record<LegalDocument, string>;
