import { describe, expect, it } from "vitest";
import { multiline } from "./lib/env";

/**
 * Mehrzeilige Umgebungswerte – vor allem `LEGAL_OPERATOR_ADDRESS`.
 *
 * Es gibt zu viele Wege, wie ein Zeilenumbruch in eine Umgebungsvariable
 * gerät, und keiner davon ist falsch. Diese Datei hält fest, dass alle
 * dasselbe ergeben: Wer seine Anschrift einträgt, soll sie so wiederfinden,
 * wie er sie gemeint hat – im Impressum sieht ein durchgerutschtes `\r`
 * niemand gern.
 */

const ERWARTET = "Strasse 1\n1234 Ort\nSchweiz";

describe("multiline", () => {
  it("löst literale \\n auf (nicht gequotete Konfiguration, compose)", () => {
    expect(multiline("Strasse 1\\n1234 Ort\\nSchweiz")).toBe(ERWARTET);
  });

  it("lässt echte Umbrüche stehen (gequotet oder Eingabefeld)", () => {
    expect(multiline("Strasse 1\n1234 Ort\nSchweiz")).toBe(ERWARTET);
  });

  it("versteht literales \\r\\n", () => {
    /*
      Regression: Vorher wurde nur `\n` ersetzt – der Backslash-r blieb als
      sichtbarer Text stehen.
    */
    expect(multiline("Strasse 1\\r\\n1234 Ort\\r\\nSchweiz")).toBe(ERWARTET);
    expect(multiline("Strasse 1\\r\\n1234 Ort")).not.toContain("\\r");
  });

  it("versteht echtes CRLF", () => {
    expect(multiline("Strasse 1\r\n1234 Ort\r\nSchweiz")).toBe(ERWARTET);
  });

  it("versteht ein einzelnes CR", () => {
    expect(multiline("Strasse 1\r1234 Ort\rSchweiz")).toBe(ERWARTET);
  });

  it("verträgt gemischte Schreibweisen", () => {
    // Kommt vor, wenn jemand einen Wert von Hand ergänzt.
    expect(multiline("Strasse 1\\n1234 Ort\r\nSchweiz")).toBe(ERWARTET);
  });

  it("lässt in keinem Fall ein Wagenrücklaufzeichen übrig", () => {
    for (const eingabe of [
      "A\r\nB",
      "A\\r\\nB",
      "A\rB",
      "A\\rB",
      "A\r\n\r\nB",
    ]) {
      expect(multiline(eingabe), JSON.stringify(eingabe)).not.toMatch(/\r|\\r/);
    }
  });

  it("räumt Leerräume am Zeilenrand weg", () => {
    // Zwei Leerzeichen am Zeilenende steuern in Markdown den Umbruch –
    // versehentliche dürfen dort nicht mitreden.
    expect(multiline("  Strasse 1  \\n  1234 Ort  ")).toBe(
      "Strasse 1\n1234 Ort"
    );
  });

  it("wirft Leerzeilen heraus", () => {
    // Eine leere Zeile begänne in Markdown einen neuen Absatz; eine
    // Anschrift ist aber ein zusammenhängender Block.
    expect(multiline("Strasse 1\\n\\n\\n1234 Ort")).toBe("Strasse 1\n1234 Ort");
  });

  it("kommt mit fehlendem und leerem Wert zurecht", () => {
    expect(multiline(undefined)).toBe("");
    expect(multiline("")).toBe("");
    expect(multiline("   ")).toBe("");
    expect(multiline("\\n\\n")).toBe("");
  });

  it("lässt eine einzeilige Angabe unverändert", () => {
    expect(multiline("Strasse 1, 1234 Ort")).toBe("Strasse 1, 1234 Ort");
  });
});
