import type { LanguageCode } from "@contracts/i18n";

/**
 * Fertiger Prompt für ein LLM, um eine Bestellliste (z. B. Rechnung oder
 * Bestellbestätigung) in das JSON-Format des Massenimports zu überführen.
 * Das Format entspricht `importPayloadSchema` in `@contracts/import`.
 *
 * `currency` ist die Anzeigewährung des Benutzers (ISO-4217-Code) – Beträge
 * werden ohne Umrechnung übernommen, deshalb muss das LLM wissen, in welcher
 * Währung die Preise erwartet werden.
 *
 * Der Prompt folgt der Oberflächensprache, die **JSON-Schlüssel bleiben aber
 * in jedem Fall deutsch** („typ“, „hersteller“ …): Sie sind Teil des Vertrags
 * in `@contracts/import` und werden serverseitig genau so validiert.
 */
export function buildImportPrompt(
  currency: string,
  language: LanguageCode = "de"
): string {
  return language === "en"
    ? buildEnglishPrompt(currency)
    : buildGermanPrompt(currency);
}

function buildGermanPrompt(currency: string): string {
  return `Du bekommst von mir eine Bestellliste mit 3D-Druck-Filamenten (z. B. eine Rechnung oder Bestellbestätigung). Extrahiere daraus alle Filament-Positionen und gib sie als JSON zurück.

Das JSON muss exakt dieses Format haben:

{
  "bestelldatum": "JJJJ-MM-TT",
  "positionen": [
    {
      "hersteller": "Name des Herstellers",
      "typ": "Materialart, z. B. PLA, PETG, ABS, TPU",
      "farbe": "Farbname",
      "nenngewicht": 1000,
      "preis": 29.99,
      "anzahl": 2
    }
  ]
}

Regeln:
- Antworte ausschließlich mit dem JSON, ohne Markdown-Codefences und ohne weiteren Text davor oder danach.
- "bestelldatum" im ISO-Format JJJJ-MM-TT (z. B. 2026-07-20). Feld weglassen, wenn kein Datum erkennbar ist.
- "nenngewicht" ist das Gewicht pro Rolle in Gramm als ganze Zahl (z. B. 1000 für 1 kg).
- "preis" ist der Preis pro Rolle in ${currency} als Zahl mit Punkt als Dezimaltrennzeichen (z. B. 29.99), ohne Währungszeichen. Preise in einer anderen Währung nicht umrechnen, sondern das Feld weglassen.
- "anzahl" ist die Stückzahl der Position als ganze Zahl (mindestens 1).
- "typ" und "nenngewicht" sind Pflichtfelder. Alle anderen Felder weglassen, wenn sie unbekannt sind.
- Keine erfundenen Werte: Wenn eine Angabe in der Bestellliste fehlt, das Feld weglassen statt zu raten.

Beispiel-Antwort:

{
  "bestelldatum": "2026-07-20",
  "positionen": [
    {
      "hersteller": "Prusament",
      "typ": "PETG",
      "farbe": "Galaxy Black",
      "nenngewicht": 1000,
      "preis": 29.99,
      "anzahl": 2
    },
    {
      "hersteller": "Bambu Lab",
      "typ": "PLA",
      "farbe": "Jade White",
      "nenngewicht": 1000,
      "preis": 19.99,
      "anzahl": 1
    }
  ]
}

Hier ist die Bestellliste:
`;
}

function buildEnglishPrompt(currency: string): string {
  return `I am going to give you an order list for 3D-printing filament (an invoice or an order confirmation, for example). Extract every filament line from it and return them as JSON.

The JSON has to match this shape exactly — keep the German field names, they are what the app expects:

{
  "bestelldatum": "YYYY-MM-DD",
  "positionen": [
    {
      "hersteller": "manufacturer name",
      "typ": "material type, e.g. PLA, PETG, ABS, TPU",
      "farbe": "colour name",
      "nenngewicht": 1000,
      "preis": 29.99,
      "anzahl": 2
    }
  ]
}

Rules:
- Answer with the JSON only – no markdown code fences and no text before or after it.
- "bestelldatum" in ISO format YYYY-MM-DD (e.g. 2026-07-20). Leave the field out if no date is recognisable.
- "nenngewicht" is the weight per container in grams as a whole number (e.g. 1000 for 1 kg).
- "preis" is the price per container in ${currency} as a number with a dot as the decimal separator (e.g. 29.99), without a currency symbol. Do not convert prices in another currency – leave the field out instead.
- "anzahl" is the quantity of that line as a whole number (at least 1).
- "typ" and "nenngewicht" are required. Leave out every other field you do not know.
- Do not invent values: if something is missing from the order list, leave the field out rather than guessing.

Example answer:

{
  "bestelldatum": "2026-07-20",
  "positionen": [
    {
      "hersteller": "Prusament",
      "typ": "PETG",
      "farbe": "Galaxy Black",
      "nenngewicht": 1000,
      "preis": 29.99,
      "anzahl": 2
    },
    {
      "hersteller": "Bambu Lab",
      "typ": "PLA",
      "farbe": "Jade White",
      "nenngewicht": 1000,
      "preis": 19.99,
      "anzahl": 1
    }
  ]
}

Here is the order list:
`;
}
