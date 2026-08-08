import { FALLBACK_LANGUAGE, type LanguageCode } from "@contracts/i18n";
import { type LegalDocument } from "@/const";

/**
 * Lädt die Rechtstexte aus `src/legal/`.
 *
 * Gleiches Vorgehen wie bei den Release Notes (`src/lib/releaseNotes.ts`):
 * `eager: true` zieht die Texte ins Bundle, damit sie auch im Produktions-Image
 * vorliegen, das nur `dist/` enthält und keine losen Dateien aus dem
 * Repository.
 *
 * Dateiname ist `<dokument>.<sprache>.md`, also etwa `privacy.de.md`.
 */

/** Verzeichnispräfix der Glob-Schlüssel – die Globs sind relativ zu dieser Datei. */
const DIR = "../legal/";

const rawDocuments = import.meta.glob<string>("../legal/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** `privacy.de` → Markdown-Quelltext */
const byKey = new Map(
  Object.entries(rawDocuments).map(([path, body]) => [
    path.slice(DIR.length).replace(/\.md$/, ""),
    body,
  ])
);

export type LegalText = {
  /**
   * Sprache, in der der Text tatsächlich vorliegt. Kann von der
   * Oberflächensprache abweichen, wenn eine Übersetzung fehlt – dann muss das
   * `lang`-Attribut die echte Sprache nennen, sonst liest ein Screenreader
   * deutschen Text mit englischer Aussprache vor.
   */
  language: LanguageCode;
  body: string;
};

/**
 * Rechtstext in der gewünschten Sprache; fällt auf die Standardsprache zurück,
 * wenn es keine Übersetzung gibt. `null`, wenn das Dokument ganz fehlt.
 */
export function legalText(
  document: LegalDocument,
  language: LanguageCode
): LegalText | null {
  const preferred = byKey.get(`${document}.${language}`);
  if (preferred !== undefined) return { language, body: preferred };

  const fallback = byKey.get(`${document}.${FALLBACK_LANGUAGE}`);
  if (fallback !== undefined) {
    return { language: FALLBACK_LANGUAGE, body: fallback };
  }
  return null;
}

export type LegalOperator = {
  name: string;
  address: string;
  email: string;
  hosting: string;
};

/**
 * Setzt die Betreiberangaben in einen Rechtstext ein.
 *
 * Die Texte beschreiben die Software und sind für jede Instanz gleich; wer sie
 * betreibt, unterscheidet sich. Deshalb stehen im Markdown Platzhalter, die
 * hier aus der Serverkonfiguration gefüllt werden (siehe `api/legalRouter.ts`).
 */
export function fillOperator(body: string, operator: LegalOperator): string {
  /*
    Zwei Leerzeichen vor dem Umbruch erzwingen in Markdown einen harten
    Zeilenumbruch – ein bloßer `\n` wäre nur ein weiches Leerzeichen und die
    Anschrift stünde in einer Zeile. Deshalb gibt es `postalAddress` als
    fertigen Block: Stünden Name und Anschrift als zwei Platzhalter
    untereinander im Text, hinge der Umbruch dazwischen an Leerzeichen am
    Zeilenende, die jeder Formatierer wegräumen darf.
  */
  const hardBreak = (value: string) => value.split("\n").join("  \n");
  const postalAddress = hardBreak(
    [operator.name, operator.address].filter(Boolean).join("\n")
  );

  return body
    .replaceAll("{{operator.postalAddress}}", postalAddress)
    .replaceAll("{{operator.name}}", operator.name)
    .replaceAll("{{operator.address}}", hardBreak(operator.address))
    .replaceAll("{{operator.email}}", operator.email)
    .replaceAll("{{operator.hosting}}", hardBreak(operator.hosting));
}
