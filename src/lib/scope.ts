/**
 * Der Bereich, in dem die Oberfläche arbeitet.
 *
 * Seit 2.5.0 trägt **jede** bereichsbezogene Prozedur ein Feld
 * `organizationId` – Pflicht und nicht optional, damit `{}` und
 * `{ organizationId: undefined }` nicht auf denselben Query-Cache-Schlüssel
 * fallen. Genau diese Falle ist in `src/pages/Home.tsx` für `lagerId`
 * dokumentiert; sie ließ dort die Daten eines anderen Lagers stehen.
 *
 * **Vorläufig eine Konstante.** Der Kontext-Umschalter kommt im nächsten
 * Schritt; bis dahin arbeitet die Oberfläche ausschließlich im persönlichen
 * Bereich, und der Server verhält sich dabei genau wie vorher. Wer den
 * Umschalter einbaut, ersetzt die Verwendungsstellen dieser Konstante durch den
 * Store – sie sind über einen `grep` vollständig zu finden, und das ist der
 * Grund, warum hier eine benannte Konstante steht und nicht überall ein
 * eingetipptes `{ organizationId: null }`.
 */
export const PERSONAL_SCOPE = { organizationId: null } as const;
