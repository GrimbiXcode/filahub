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

/**
 * Material und Gebinde (seit 4.0.0). Die Oberfläche nennt das Produkt
 * „Material“ und das einzelne Stück „Gebinde“ bzw. „Rolle“ – siehe
 * `AGENTS.md`, „Material und Gebinde“.
 *
 * Das Gebinde liegt **unter** den Materialien und nicht unter `/gebinde`:
 * Dort stehen seit 2.2.0 die Gebindearten, und `/gebinde/42` sähe aus wie
 * die Gebindeart 42. Bis 3.1.0 lag die Detailseite eines Gebindes unter
 * `/material/:id`; der alte Pfad leitet weiter, damit Lesezeichen gehen.
 */
export const MATERIALS_PATH = "/materialien";
export const LEGACY_GEBINDE_PATH = "/material/:id";

/** Ein Material (Produkt) mit allen seinen Gebinden */
export function materialPath(productId: number): string {
  return `${MATERIALS_PATH}/${productId}`;
}

/** Ein einzelnes Gebinde: Wägungen, Verbräuche, Verlauf */
export function gebindePath(id: number): string {
  return `${MATERIALS_PATH}/gebinde/${id}`;
}

/**
 * Druckhistorie (seit 4.2.0). Die Liste nimmt ihre Filter aus der Adresse
 * (`?material=`, `?gebinde=`, …), damit „Alle Drucke mit diesem Material“ ein
 * gewöhnlicher Link ist und ein Lesezeichen die Filter behält.
 */
export const PRINTS_PATH = "/drucke";

export function printJobPath(id: number): string {
  return `${PRINTS_PATH}/${id}`;
}

/** Die Druckliste, gefiltert auf ein Material oder ein einzelnes Gebinde */
export function printsForPath(filter: {
  productId?: number;
  materialId?: number;
}): string {
  const params = new URLSearchParams();
  if (filter.productId != null)
    params.set("material", String(filter.productId));
  if (filter.materialId != null)
    params.set("gebinde", String(filter.materialId));
  const query = params.toString();
  return query ? `${PRINTS_PATH}?${query}` : PRINTS_PATH;
}

/**
 * Dateien zu Drucken (seit 4.3.0) – eigene Routen neben tRPC, siehe
 * `api/fileRoutes.ts`. Als `<img src>` ladbar; der Server prüft Sitzung und
 * Bereich selbst.
 */
export function printFileUrl(id: number): string {
  return `/api/files/${id}`;
}

export function printFileThumbnailUrl(id: number): string {
  return `/api/files/${id}/thumbnail`;
}

export function printFileUploadUrl(
  printJobId: number,
  organizationId: number | null
): string {
  const query = organizationId ? `?organizationId=${organizationId}` : "";
  return `/api/files/print-jobs/${printJobId}${query}`;
}

/** Alle eigenen Dateien als ZIP – neben dem JSON-Export */
export const PRINT_FILES_EXPORT_URL = "/api/files/export";

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

/**
 * Eigene Farben und Oberflächen – die Darstellung, nicht der Bestand.
 *
 * Deutscher Pfad wie die übrigen: `/optik` und nicht `/appearance`, weil die
 * Adressen dieser App deutsch sind (`/gebinde`, `/dryboxen`, `/freunde`).
 */
export const APPEARANCE_PATH = "/optik";

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
/**
 * Die Verwaltungsseiten.
 *
 * Sie standen bis 2.7.0 als Zeichenketten in `App.tsx`, `AuthLayout.tsx` und
 * `QuickActions.tsx` – dreimal derselbe Wert, den beim Umbenennen niemand
 * gemeinsam findet. Mit den beiden neuen Seiten wären es sechs Stellen
 * geworden; deshalb jetzt hier wie alle anderen Pfade auch.
 */
export const ADMIN_PRESETS_PATH = "/verwaltung/presets";
export const ADMIN_PROPOSALS_PATH = "/verwaltung/vorschlaege";
export const ADMIN_SYSTEM_PATH = "/verwaltung/system";
export const ADMIN_USERS_PATH = "/verwaltung/nutzer";
export const ADMIN_ABUSE_PATH = "/verwaltung/missbrauch";

export const LEGAL_DOCUMENTS = ["privacy", "imprint", "terms"] as const;

export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];

export const LEGAL_PATHS = {
  privacy: "/datenschutz",
  imprint: "/impressum",
  terms: "/nutzungsbedingungen",
} as const satisfies Record<LegalDocument, string>;
