/**
 * Datenauskunft und Kontolöschung.
 *
 * Wie `contracts/import.ts` von Client, Server und Tests importiert – hier darf
 * zur Laufzeit nichts aus `@db` oder `api/` geladen werden.
 */

/**
 * Format-Version des Exports. Zu erhöhen, sobald sich der Aufbau so ändert,
 * dass ein älterer Export anders gelesen werden müsste.
 *
 * `2` in 2.3.0: Die Abschnitte `spoolTypes` und `hiddenSpoolPresets` hießen
 * seither `containerTypes` und `hiddenContainerPresets`.
 *
 * `3` seit 2.4.0: Die Freigabestufen sind aus den `friendships`-Zeilen
 * ausgezogen (`visibilityFromUser`/`visibilityFromFriend` gibt es nicht mehr)
 * und stehen jetzt je Lager im neuen Abschnitt `lagerShares`. Der neue
 * Abschnitt allein wäre kein Grund – `lager` kam in 2.2.0 ohne Erhöhung dazu,
 * weil ein älterer Export dadurch nicht falsch wird. Hier verschwinden aber
 * zwei Felder aus einem bestehenden Abschnitt: Wer eine Datei von 2.3.0 liest,
 * findet sie dort noch, und beide trügen ohne Erhöhung dieselbe Versionsnummer.
 */
export const ACCOUNT_EXPORT_VERSION = 3;

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
  /*
    Die Lager des Benutzers. Name und Notizen sind Freitext, also seine Angaben;
    die Konfiguration (Materialart, Filamentstärke) beschreibt seinen Bestand.
  */
  "lager",
  "materials",
  "weighings",
  "containerTypes",
  "storageBoxes",
  "hiddenContainerPresets",
  "presetProposals",
  "loginCodes",
  /*
    Freundschaften und Ausleih-Vorgänge, jeweils in **beiden** Richtungen: Eine
    Freundschaft betrifft die Person auch dann, wenn die Anfrage von der anderen
    Seite kam. Enthalten ist der Anzeigename der Gegenseite, ohne den die Zeile
    für die betroffene Person eine sinnlose Zahlenkolonne wäre – anders als beim
    `ipHash` unten hilft der Name hier ihr und nicht einem Dritten, und aus der
    Oberfläche kennt sie ihn ohnehin.
  */
  "friendships",
  /*
    Freigaben von Lagern, ebenfalls in **beiden** Richtungen: die, die diese
    Person erteilt hat, und die, die sie bekommen hat. Beide sagen etwas über
    sie aus – die einen, was sie zeigt, die anderen, worauf sie zugreifen darf.
  */
  "lagerShares",
  "loanRequests",
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
