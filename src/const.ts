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
export const FRIENDS_PATH = "/freunde";
export const LAGER_PATH = "/lager";
export const ORGANIZATIONS_PATH = "/organisationen";

/** Eine einzelne Organisation: Mitglieder, Rollen, Beitrittscode. */
export function organizationPath(id: number): string {
  return `${ORGANIZATIONS_PATH}/${id}`;
}

/**
 * Dryboxen. Bis 2.1.0 hieß die Seite „Lagerboxen" und lag unter
 * `/lagerboxen`; mit dem neuen Lager-Begriff wäre das zum Verwechseln
 * ähnlich gewesen. Der alte Pfad leitet weiter, damit gesetzte Lesezeichen
 * nicht ins Leere laufen.
 */
export const DRYBOXES_PATH = "/dryboxen";
export const LEGACY_DRYBOXES_PATH = "/lagerboxen";

/**
 * Gebindearten. Bis 2.2.0 „Rollentypen" unter `/rollentypen` – ein Name, der
 * eine Annahme über den Inhalt machte: Wer Pulver in Eimern führt, hat keine
 * Rollentypen. Der alte Pfad leitet weiter, wie bei den Dryboxen.
 */
export const CONTAINER_TYPES_PATH = "/gebinde";
export const LEGACY_CONTAINER_TYPES_PATH = "/rollentypen";

/** Lager eines Freundes – nur bei Sichtbarkeitsstufe `full` erreichbar. */
export function friendInventoryPath(friendId: number): string {
  return `${FRIENDS_PATH}/${friendId}`;
}

/**
 * Rechtstexte. Sie liegen als Markdown unter `src/legal/<doc>.<sprache>.md`.
 *
 * Erreichbar ohne Anmeldung – die Informationspflicht nach Art. 13 DSGVO und
 * Art. 19 revDSG greift, bevor jemand ein Konto hat, und ein Impressum hinter
 * einer Anmeldeschranke wäre keins.
 *
 * Die Pfade sind deutsch wie überall in der App (`/gebinde`,
 * `/einstellungen`), unabhängig von der eingestellten Oberflächensprache.
 */
export const LEGAL_DOCUMENTS = ["privacy", "imprint", "terms"] as const;

export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];

export const LEGAL_PATHS = {
  privacy: "/datenschutz",
  imprint: "/impressum",
  terms: "/nutzungsbedingungen",
} as const satisfies Record<LegalDocument, string>;
