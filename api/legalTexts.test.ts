import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SUPPORTED_LANGUAGES } from "@contracts/i18n";

/**
 * Prüft die Rechtstexte in `src/legal/` als Dateien.
 *
 * Wie `api/releaseNotes.test.ts` bewusst gegen das Dateisystem und nicht gegen
 * den Vite-Loader: `vitest.config.ts` sammelt nur `api/**`, und `vite build`
 * führt die Module nicht aus. Ohne diesen Test fiele eine fehlende Übersetzung
 * erst dem Besucher auf – bei einem Impressum ist das keine Kleinigkeit.
 */

const LEGAL_DIR = path.resolve(import.meta.dirname, "../src/legal");

/** Dokumente, die es geben muss. Spiegelt LEGAL_DOCUMENTS in src/const.ts. */
const DOCUMENTS = ["privacy", "imprint", "terms"] as const;

/** Platzhalter, die `fillOperator` in `src/lib/legal.ts` auflöst. */
const KNOWN_PLACEHOLDERS = [
  "{{operator.postalAddress}}",
  "{{operator.name}}",
  "{{operator.address}}",
  "{{operator.email}}",
  "{{operator.hosting}}",
];

const files = readdirSync(LEGAL_DIR);

function read(document: string, language: string) {
  return readFileSync(
    path.join(LEGAL_DIR, `${document}.${language}.md`),
    "utf-8"
  );
}

describe("Rechtstexte", () => {
  it("liegen in jeder unterstützten Sprache vor", () => {
    for (const document of DOCUMENTS) {
      for (const { code } of SUPPORTED_LANGUAGES) {
        expect(files, `${document}.${code}.md fehlt`).toContain(
          `${document}.${code}.md`
        );
      }
    }
  });

  it("enthält keine unbekannten Platzhalter", () => {
    for (const name of files) {
      const raw = readFileSync(path.join(LEGAL_DIR, name), "utf-8");
      const found = raw.match(/\{\{[^}]+\}\}/g) ?? [];
      for (const placeholder of found) {
        expect(
          KNOWN_PLACEHOLDERS,
          `${name}: ${placeholder} wird von fillOperator nicht ersetzt`
        ).toContain(placeholder);
      }
    }
  });

  it("nennt in Impressum und Datenschutzerklärung den Verantwortlichen", () => {
    // Ohne diesen Platzhalter stünde dort niemand – die Kernangabe beider Texte.
    for (const document of ["imprint", "privacy"]) {
      for (const { code } of SUPPORTED_LANGUAGES) {
        expect(read(document, code)).toContain("{{operator.postalAddress}}");
      }
    }
  });

  it("beginnt jeweils mit einer Überschrift", () => {
    for (const name of files) {
      const raw = readFileSync(path.join(LEGAL_DIR, name), "utf-8");
      expect(raw.trimStart().startsWith("# "), `${name}`).toBe(true);
    }
  });

  it("enthält kein rohes HTML", () => {
    /*
      `MarkdownContent` rendert ohne `rehype-raw` und würde HTML stillschweigend
      verwerfen – der Text sähe dann anders aus als gedacht.
    */
    for (const name of files) {
      const raw = readFileSync(path.join(LEGAL_DIR, name), "utf-8");
      expect(raw, `${name}`).not.toMatch(/<[a-zA-Z][^>]*>/);
    }
  });

  it("verweist intern mit absoluten Pfaden", () => {
    // Relative Verweise brächen je nach aufgerufener Seite.
    for (const name of files) {
      const raw = readFileSync(path.join(LEGAL_DIR, name), "utf-8");
      const relative = raw.match(/\]\((?!https?:\/\/|\/|#)[^)]+\)/g) ?? [];
      expect(relative, `${name}`).toEqual([]);
    }
  });
});
