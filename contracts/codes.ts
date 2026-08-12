/**
 * Teilbare Kurz-Codes: Freundescode (`FH-…`) und Beitrittscode einer
 * Organisation (`ORG-…`).
 *
 * Beide werden abgetippt, vorgelesen und weitergeschickt, beide öffnen einen
 * Weg zu einer Anfrage – Alphabet, Länge und die Nachsicht beim Einlesen sind
 * dieselben. Sie zweimal zu schreiben hieße, die Feinheit in `normalizeCode`
 * zweimal richtig zu treffen; sie stand schon einmal falsch da (siehe dort).
 *
 * Wie alles in `contracts/` von Client, Server und Tests importierbar, ohne
 * Laufzeitabhängigkeit auf `@db` oder `api/`. Das **Erzeugen** steht deshalb
 * nicht hier: Es braucht `crypto.randomInt` und bleibt in `api/queries/`.
 */

/**
 * Alphabet der Codes – ohne `I`, `O`, `0`, `1`.
 *
 * Verwechselbare Zeichen kosten beim Abtippen und Vorlesen mehr, als das
 * größere Alphabet einbringt. Bei acht Stellen aus 32 Zeichen bleiben rund
 * 1,1 Billionen Möglichkeiten – genug, dass Erraten keine Rolle spielt.
 */
export const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Stellen im Code, ohne Präfix und Bindestriche */
export const CODE_LENGTH = 8;

/**
 * Setzt die Anzeigeform zusammen: `FH-A2B3-C4D5`.
 *
 * Das Präfix macht einen Code als solchen erkennbar und sagt, wohin er gehört –
 * wer einen `ORG-`-Code ins Freundesfeld tippt, bekommt „ungültig“ statt „kein
 * Konto gefunden“.
 */
export function formatCode(prefix: string, bare: string): string {
  return `${prefix}-${bare.slice(0, 4)}-${bare.slice(4)}`;
}

const patterns = new Map<string, RegExp>();

/**
 * Präfixe sind Buchstabenfolgen aus dem Code der Anwendung (`FH`, `ORG`), keine
 * Eingaben – trotzdem wird das Muster nur einmal je Präfix gebaut und
 * zwischengespeichert, statt es bei jedem Vergleich neu zu übersetzen.
 */
function patternFor(prefix: string): RegExp {
  const cached = patterns.get(prefix);
  if (cached) return cached;
  const pattern = new RegExp(
    `^${prefix}-[${CODE_ALPHABET}]{4}-[${CODE_ALPHABET}]{4}$`
  );
  patterns.set(prefix, pattern);
  return pattern;
}

/**
 * Bringt eine Eingabe in die Normalform, oder `null`, wenn daraus kein gültiger
 * Code werden kann.
 *
 * Nachsichtig bei allem, was beim Abtippen und Kopieren passiert:
 * Kleinschreibung, fehlende oder zusätzliche Bindestriche, Leerzeichen,
 * vergessenes Präfix. Wer `fh a2b3c4d5` eintippt, meint denselben Code – ihn
 * daran scheitern zu lassen wäre schlechte Laune ohne Sicherheitsgewinn.
 */
export function normalizeCode(prefix: string, input: string): string | null {
  const stripped = input.toUpperCase().replace(/[\s-]/g, "");
  /*
    Das Präfix nur abschneiden, wenn danach noch ein voller Code übrig bleibt.
    `F` und `H` stehen beide im Alphabet, also fängt etwa jeder 1024ste
    Freundescode selbst mit `FH` an – unbedingtes Abschneiden fraß dort echte
    Stellen, und der Eigentümer bekam für seinen gültigen Code „Zu diesem
    Freundescode gibt es kein Konto“ zu sehen. Ein `FH` bleibt stehen, wenn es
    zum Code gehört.
  */
  const bare =
    stripped.length === CODE_LENGTH + prefix.length &&
    stripped.startsWith(prefix)
      ? stripped.slice(prefix.length)
      : stripped;
  if (bare.length !== CODE_LENGTH) return null;
  if (![...bare].every(c => CODE_ALPHABET.includes(c))) return null;
  return formatCode(prefix, bare);
}

/** Prüft die Normalform. Für Tests und als Zusicherung beim Erzeugen. */
export function isCode(prefix: string, value: string): boolean {
  return patternFor(prefix).test(value);
}
