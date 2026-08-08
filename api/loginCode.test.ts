import { describe, expect, it } from "vitest";
import { generateLoginCode } from "./telegram/bot";

/**
 * Der Login-Code ist ein Authentifizierungsmerkmal: Wer ihn errät, meldet sich
 * als der betreffende Benutzer an. Geprüft wird deshalb nicht die Zufallsquelle
 * selbst – die liefert `node:crypto` –, sondern dass der Wertebereich beim
 * Formatieren nicht wieder verlorengeht.
 */
describe("generateLoginCode", () => {
  it("liefert immer genau sechs Ziffern", () => {
    for (let i = 0; i < 500; i++) {
      expect(generateLoginCode()).toMatch(/^\d{6}$/);
    }
  });

  it("kann führende Nullen erzeugen", () => {
    /*
      Regressionstest für `Math.floor(100000 + Math.random() * 900000)`: Diese
      Form konnte nie unter 100000 fallen, der Raum war also 900 000 statt einer
      Million. Über genügend Ziehungen muss mindestens ein Code mit führender
      Null auftauchen – die Wahrscheinlichkeit, dass das bei 20 000 Versuchen
      zufällig ausbleibt, liegt bei (0,9)^20000.
    */
    const codes = Array.from({ length: 20_000 }, generateLoginCode);
    expect(codes.some(code => code.startsWith("0"))).toBe(true);
  });

  it("streut über den gesamten Bereich", () => {
    // Ohne echten Zufall (etwa bei einer Konstanten) kollabiert die Menge.
    const codes = new Set(Array.from({ length: 1000 }, generateLoginCode));
    expect(codes.size).toBeGreaterThan(900);
  });
});
