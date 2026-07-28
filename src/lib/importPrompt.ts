/**
 * Fertiger Prompt für ein LLM, um eine Bestellliste (z. B. Rechnung oder
 * Bestellbestätigung) in das JSON-Format des Massenimports zu überführen.
 * Das Format entspricht `importPayloadSchema` in `@contracts/import`.
 */
export const IMPORT_PROMPT = `Du bekommst von mir eine Bestellliste mit 3D-Druck-Filamenten (z. B. eine Rechnung oder Bestellbestätigung). Extrahiere daraus alle Filament-Positionen und gib sie als JSON zurück.

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
- "preis" ist der Preis pro Rolle in Euro als Zahl mit Punkt als Dezimaltrennzeichen (z. B. 29.99), ohne Währungszeichen.
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
