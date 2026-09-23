import { z } from "zod";

/**
 * Kennungsvorlage eines Lagers, z. B. „ID: {n}" oder „F{nn}".
 *
 * Die Vorlage ist eine **Vorbelegung**, keine Regel: Beim Anlegen eines
 * Materials trägt das Formular die nächste freie Kennung ein, gespeichert wird
 * aber wie bisher der fertige Text in `materials.identifier`. Wer die Kennung
 * überschreibt oder leert, darf das – ein Gebinde mit altem Etikett soll nicht
 * umbeschriftet werden müssen, nur weil das Lager jetzt eine Vorlage hat.
 *
 * - `{n}` steht für die Nummer ohne führende Nullen: „ID: {n}" → „ID: 4".
 * - `{nn}`, `{nnn}` … füllen mit Nullen auf so viele Stellen auf: „F{nn}" →
 *   „F01". Größere Nummern werden länger, nicht abgeschnitten („F100").
 * - Genau **ein** Platzhalter. Zwei Nummern in einer Kennung ließen offen,
 *   welche hochgezählt wird.
 *
 * Die Nummer ist die **kleinste freie ab 1** – Lücken gelöschter Materialien
 * werden wieder vergeben. Gezählt wird über alle Lager des Bereichs, nicht nur
 * über das eine: Die Kennungssuche in der Kopfzeile sucht bereichsweit, und zwei
 * Lager mit derselben Vorlage vergäben sonst beide „ID: 1".
 */

/** Höchstlänge der Vorlage – die fertige Kennung darf 50 Zeichen haben */
export const IDENTIFIER_TEMPLATE_MAX_LENGTH = 40;

const PLACEHOLDER = /\{(n+)\}/g;

type ParsedTemplate = { prefix: string; suffix: string; width: number };

/** Zerlegt die Vorlage; `null`, wenn sie nicht genau einen Platzhalter hat. */
export function parseIdentifierTemplate(
  template: string
): ParsedTemplate | null {
  const matches = [...template.matchAll(PLACEHOLDER)];
  if (matches.length !== 1) return null;
  const [match] = matches;
  const start = match.index;
  return {
    prefix: template.slice(0, start),
    suffix: template.slice(start + match[0].length),
    width: match[1].length,
  };
}

/** Setzt eine Nummer in die Vorlage ein. `null` bei ungültiger Vorlage. */
export function formatIdentifier(
  template: string,
  number: number
): string | null {
  const parsed = parseIdentifierTemplate(template);
  if (!parsed) return null;
  return `${parsed.prefix}${String(number).padStart(parsed.width, "0")}${parsed.suffix}`;
}

/** Vorlagentext als Muster: Sonderzeichen wörtlich, Leerraum beliebig lang */
function literalPattern(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
}

/**
 * Die Nummer einer Kennung, wenn sie zur Vorlage passt – sonst `null`.
 *
 * Großschreibung und Leerraum zählen nicht: „id:4" belegt die 4 genauso wie
 * „ID: 4". Die Stellenzahl ist frei, „F1" und „F001" belegen bei
 * „F{nn}" beide die 1 – sonst vergäbe die Vorlage eine Nummer, die auf einem
 * älteren Etikett schon steht.
 */
export function identifierNumber(
  template: string,
  identifier: string
): number | null {
  const parsed = parseIdentifierTemplate(template);
  if (!parsed) return null;
  const pattern = new RegExp(
    `^${literalPattern(parsed.prefix.trimStart())}(\\d+)${literalPattern(parsed.suffix.trimEnd())}$`,
    "i"
  );
  const match = identifier.trim().match(pattern);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isSafeInteger(number) ? number : null;
}

/**
 * Die nächste freie Kennung nach der Vorlage: die kleinste Nummer ab 1, die
 * keine der vorhandenen Kennungen belegt. `null` bei ungültiger Vorlage.
 */
export function nextIdentifier(
  template: string,
  existing: readonly (string | null)[]
): string | null {
  if (!parseIdentifierTemplate(template)) return null;
  const taken = new Set<number>();
  for (const identifier of existing) {
    if (!identifier) continue;
    const number = identifierNumber(template, identifier);
    if (number != null) taken.add(number);
  }
  let next = 1;
  while (taken.has(next)) next++;
  return formatIdentifier(template, next);
}

/**
 * Eingabe der Vorlage am Lager. Leer heißt „keine Vorlage" und wird zu `null`,
 * damit ein geleertes Feld die Vorlage entfernt statt einen Leerstring zu
 * speichern, der zu nichts passt.
 */
export const identifierTemplateSchema = z
  .string()
  .max(
    IDENTIFIER_TEMPLATE_MAX_LENGTH,
    `Die Vorlage darf höchstens ${IDENTIFIER_TEMPLATE_MAX_LENGTH} Zeichen haben`
  )
  .transform(value => value.trim() || null)
  .refine(
    value => value == null || parseIdentifierTemplate(value) != null,
    "Die Vorlage braucht genau einen Platzhalter {n}, z. B. „ID: {n}“ oder „F{nn}“"
  )
  .nullable();

/**
 * Mehrere Kennungen am Stück, für den Import: Jede vergebene gilt für die
 * nächste als belegt. `[]` bei ungültiger Vorlage.
 */
export function nextIdentifiers(
  template: string,
  existing: readonly (string | null)[],
  count: number
): string[] {
  if (!parseIdentifierTemplate(template)) return [];
  const taken = [...existing];
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    const next = nextIdentifier(template, taken);
    if (next == null) break;
    result.push(next);
    taken.push(next);
  }
  return result;
}

/**
 * Vergleichsform einer Kennung: ohne Leerraum am Rand, klein geschrieben.
 *
 * **Je Lager darf jede Vergleichsform nur einmal vorkommen** – erzwungen vom
 * Index `materials_identifier_per_lager_unique` auf `lower("identifier")`.
 * Groß-/Kleinschreibung zählt nicht, weil die Kennungssuche sie auch nicht
 * unterscheidet: „F01" und „f01" wären auf dem Etikett dasselbe und in der
 * Suche nicht auseinanderzuhalten. Den Rand schneidet schon die Eingabe ab
 * (`identifierInputSchema`), deshalb reicht im Index `lower`.
 */
export function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

/**
 * Kennung als Eingabe am Material: getrimmt, leer wird `null`. Ohne das Trimmen
 * wären „F01" und „F01 " im Index zwei verschiedene Kennungen.
 */
export const identifierInputSchema = z
  .string()
  .max(50)
  .transform(value => value.trim() || null)
  .nullable();

/** Meldung bei doppelter Kennung – `CONFLICT` steht bei Material nur hierfür */
export function identifierTakenMessage(identifier: string): string {
  return `Die Kennung „${identifier}“ gibt es in diesem Lager schon.`;
}
