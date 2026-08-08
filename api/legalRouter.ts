import { createRouter, publicQuery } from "./middleware";
import { env } from "./lib/env";

/**
 * Betreiberangaben für die Rechtstexte.
 *
 * `publicQuery`, weil Impressum und Datenschutzerklärung vor der Anmeldung
 * erreichbar sein müssen – die Informationspflicht nach Art. 13 DSGVO greift,
 * bevor jemand ein Konto hat.
 *
 * Preisgegeben wird ausschließlich, was ohnehin ins Impressum gehört. Die
 * Adresse ist die des Betreibers, nicht die eines Nutzers.
 */
export const legalRouter = createRouter({
  operator: publicQuery.query(() => {
    const name = env.operatorName.trim();
    const address = env.operatorAddress.trim();
    const email = env.operatorEmail.trim();
    const hosting = env.operatorHosting.trim();
    return {
      name,
      /** Mehrzeilige Anschrift: `\n` im Wert trennt die Zeilen. */
      address,
      email,
      /** Auftragsverarbeiter für den Serverbetrieb, frei formulierbar. */
      hosting,
      /**
       * `false` heißt: Diese Instanz ist rechtlich nicht auskunftsfähig. Die
       * Oberfläche zeigt dann einen Hinweis an den Betreiber, statt die
       * Platzhalter roh oder – schlimmer – fremde Angaben anzuzeigen.
       *
       * `hosting` zählt mit: Wer die Server stellt, ist nach Art. 13 Abs. 1
       * lit. e DSGVO zu nennen. Wer selbst hostet, trägt genau das ein –
       * eine leere Angabe ist keine Antwort.
       */
      configured:
        name !== "" && address !== "" && email !== "" && hosting !== "",
    };
  }),
});
