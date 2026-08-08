/**
 * Datenauskunft und Kontolöschung.
 *
 * Wie `contracts/import.ts` von Client, Server und Tests importiert – hier darf
 * zur Laufzeit nichts aus `@db` oder `api/` geladen werden.
 */

/**
 * Format-Version des Exports. Zu erhöhen, sobald sich der Aufbau so ändert,
 * dass ein älterer Export anders gelesen werden müsste.
 */
export const ACCOUNT_EXPORT_VERSION = 1;

/**
 * Tabellen, die im Export enthalten sein müssen.
 *
 * Bewusst als Liste und nicht bloß implizit im Abfragecode: Der
 * Integrationstest gleicht sie gegen die Tabellen mit Personenbezug in
 * `db/schema.ts` ab. Wer eine Tabelle ergänzt, ohne sie hier einzutragen,
 * bekommt einen roten Test statt einer stillschweigend unvollständigen
 * Auskunft nach Art. 15 DSGVO.
 */
export const ACCOUNT_EXPORT_SECTIONS = [
  "profile",
  "materials",
  "weighings",
  "spoolTypes",
  "storageBoxes",
  "hiddenSpoolPresets",
  "presetProposals",
  "loginCodes",
  /*
    Das Sicherheitsprotokoll gehört dazu: Es enthält Ereignisse über diese
    Person, also ihre Daten. Auskunft heißt Auskunft – auch über das, was
    unbequem sein könnte. Die gehashte Adresse bleibt draußen, sie sagt der
    betroffenen Person nichts und wäre nur für Dritte interessant.
  */
  "auditLog",
] as const;

export type AccountExportSection = (typeof ACCOUNT_EXPORT_SECTIONS)[number];

/**
 * Bestätigungswort für die Kontolöschung.
 *
 * Der Benutzer tippt seinen Anzeigenamen ab. Ein reiner „Wirklich?“-Dialog
 * wird weggeklickt; etwas abzutippen erzwingt einen Moment des Hinsehens –
 * und die Löschung ist nicht rückgängig zu machen.
 */
export function deletionConfirmationMatches(
  typed: string,
  displayName: string | null
): boolean {
  const expected = (displayName ?? "").trim();
  if (expected === "") return false;
  return typed.trim().toLocaleLowerCase() === expected.toLocaleLowerCase();
}
