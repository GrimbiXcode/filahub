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
 *
 * `4` seit 2.4.1: Die **bekommenen** Freigaben in `lagerShares` sind auf eine
 * Zeile je Besitzer verdichtet (`ownerUserId` und Stufe statt Lager-Kennung,
 * Empfänger-Kennung und Zeitstempeln) – sie verrieten den Bestand des Freundes.
 * Dieselbe Erwägung wie bei `3`, nur eine Version später bemerkt: Der Abschnitt
 * bleibt, seine Zeilen haben eine andere Form, und ohne Erhöhung hießen beide
 * Formen `3`.
 *
 * **Bleibt `4` in 2.5.0**, obwohl die Organisationen zwei Abschnitte ergänzen
 * und die Fachzeilen ein Feld `organizationId` dazubekommen. Beides macht einen
 * älteren Export nicht falsch: Neue Abschnitte fehlen dort schlicht (wie
 * `lager` vor 2.2.0, das ebenfalls ohne Erhöhung dazukam), und das neue Feld
 * steht in einer Auskunft ohnehin immer auf `null` – exportiert werden nur die
 * **persönlichen** Zeilen der Person. Erhöht wird, wenn sich die Form
 * bestehender Zeilen ändert, nicht wenn etwas dazukommt.
 *
 * **Bleibt `4` in 2.9.0**: Der Abschnitt `consumptions` kommt dazu, bestehende
 * Zeilen bleiben, wie sie sind – dieselbe Erwägung wie bei `lager` in 2.2.0.
 *
 * **`5` seit 4.0.0**: Zum ersten Mal ändert sich die Form bestehender Zeilen.
 * `materials` verliert Name, Materialart, Hersteller, Farbe, Oberfläche und
 * Dichte und bekommt `productId`; die Felder stehen im neuen Abschnitt
 * `materialProducts`. Ein Programm, das Version 4 liest, fände sie sonst
 * nicht mehr.
 */
export const ACCOUNT_EXPORT_VERSION = 5;

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
  /*
    Seit 4.0.0 (Exportversion 5): Materialien als Produkt – Name,
    Materialart, Hersteller, Farbe, Oberfläche, Dichte. Die Gebinde unter
    `materials` zeigen über `productId` darauf und tragen diese Felder nicht
    mehr.
  */
  "materialProducts",
  /*
    Seit 4.1.0: Druckeinstellungen je Material – Werte und Notizen der Person.
    Additiv, die Exportversion bleibt 5.
  */
  "materialPrintSettings",
  "materials",
  "weighings",
  /*
    Druckhistorie (seit 4.2.0): Drucke mit Titel, Notizen, Tags, Drucker –
    und ihre Materialzeilen und Links. Additiv, Version bleibt 5.
  */
  "printJobs",
  "printJobMaterials",
  "printJobLinks",
  /*
    Verbräuche seit 2.9.0 – Abbuchungen in Gramm samt Notiz und Zeitpunkt.
    Personenbezug wie bei den Wägungen über das Material, deshalb in der
    handgepflegten Ausnahmeliste des Integrationstests.
  */
  "consumptions",
  "containerTypes",
  "storageBoxes",
  /* Eigene Farben und Oberflächen – seine Zuordnung, also seine Angabe. */
  "customColors",
  "customTextures",
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
    Mitgliedschaften in Organisationen und die Einladungen dazu, letztere in
    **beiden** Richtungen (bekommene und selbst ausgesprochene) – dieselbe
    Erwägung wie bei den Freundschaften.

    Was hier **nicht** hineingehört, ist der Bestand der Organisation. Er ist
    nicht die Auskunft dieser Person, sondern das Material einer anderen
    Stelle; sie hat Zugriff darauf, aber er gehört ihr nicht. Genau deshalb
    tragen Org-Zeilen keinen Personenbezug (siehe `ownerXor` in
    `db/schema.ts`) – gäbe es dort einen „erfasst von“, stünde hier die Frage,
    wie viel davon mitmuss.
  */
  "organizationMemberships",
  "organizationInvitations",
  /*
    Das Sicherheitsprotokoll gehört dazu: Es enthält Ereignisse über diese
    Person, also ihre Daten. Auskunft heißt Auskunft – auch über das, was
    unbequem sein könnte. Die gehashte Adresse bleibt draußen, sie sagt der
    betroffenen Person nichts und wäre nur für Dritte interessant.
  */
  "auditLog",
  /*
    Die eigenen Entsperr-Anträge. Sie sind ganz und gar die Angabe dieser Person
    – Freitext, den sie selbst verfasst hat – samt der Entscheidung darüber.
    Gerade bei einer Maßnahme gegen sie muss die Auskunft vollständig sein:
    Auskunft heißt Auskunft, auch und besonders über das Unbequeme.

    Der Sperrzustand selbst steht nicht hier, sondern in `profile` – er ist eine
    Eigenschaft des Kontos, keine eigene Zeile.
  */
  "unblockRequests",
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
