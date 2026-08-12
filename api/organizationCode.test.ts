import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, CODE_LENGTH, normalizeCode } from "@contracts/codes";
import { normalizeFriendCode } from "@contracts/friends";
import {
  JOIN_CODE_PREFIX,
  isJoinCode,
  normalizeJoinCode,
} from "@contracts/organizations";

/**
 * Der Beitrittscode einer Organisation.
 *
 * Alphabet, Länge und Nachsicht teilt er sich seit 2.5.0 mit dem Freundescode
 * (`contracts/codes.ts`). Geprüft wird hier deshalb vor allem das, was das
 * Herausziehen kaputt machen könnte: dass das Präfix richtig behandelt wird und
 * dass die beiden Codesorten sich nicht gegenseitig annehmen.
 */
describe("normalizeJoinCode", () => {
  it("nimmt die Normalform unverändert an", () => {
    expect(normalizeJoinCode("ORG-A2B3-C4D5")).toBe("ORG-A2B3-C4D5");
  });

  it("verzeiht, was beim Abtippen und Kopieren passiert", () => {
    for (const input of [
      "org-a2b3-c4d5",
      "ORGA2B3C4D5",
      "  ORG-A2B3-C4D5  ",
      "A2B3C4D5",
      "a2b3 c4d5",
      "ORG A2B3 C4D5",
    ]) {
      expect(normalizeJoinCode(input)).toBe("ORG-A2B3-C4D5");
    }
  });

  it("weist ab, was kein Code werden kann", () => {
    for (const input of [
      "",
      "ORG-",
      "A2B3C4D",
      "A2B3C4D55",
      // I, O, 0 und 1 stehen nicht im Alphabet – sie sind verwechselbar.
      "A2B3C4DI",
      "A2B3C4D0",
    ]) {
      expect(normalizeJoinCode(input)).toBeNull();
    }
  });

  /*
    Die Feinheit, die beim Herausziehen der gemeinsamen Funktion zerbrechen
    könnte: Das Präfix wird nur abgeschnitten, wenn danach noch ein voller Code
    übrig bleibt. Beim Freundescode ist das keine Theorie – `F` und `H` stehen
    beide im Alphabet, also fängt etwa jeder 1024ste Code selbst mit `FH` an.
    Beim Beitrittscode kann das nicht passieren (`O` ist ausgeschlossen), aber
    die Regel muss für beide dieselbe sein.
  */
  it("frisst kein Präfix, das zum Code gehört", () => {
    expect(normalizeFriendCode("FHA2B3C4")).toBe("FH-FHA2-B3C4");
    expect(normalizeFriendCode("FH-FHA2-B3C4")).toBe("FH-FHA2-B3C4");
  });

  it("hält die beiden Codesorten auseinander", () => {
    // Wer einen Beitrittscode ins Freundesfeld tippt, soll „ungültig“ bekommen
    // und nicht „zu diesem Freundescode gibt es kein Konto“.
    expect(isJoinCode("FH-A2B3-C4D5")).toBe(false);
    expect(normalizeJoinCode("FH-A2B3-C4D5")).toBeNull();
  });
});

describe("isJoinCode", () => {
  it("prüft genau die Normalform", () => {
    expect(isJoinCode("ORG-A2B3-C4D5")).toBe(true);
    for (const value of [
      "org-a2b3-c4d5",
      "ORGA2B3C4D5",
      "ORG-A2B3C4D5",
      "ORG-A2B3-C4D",
      "ORG-A2B3-C4DI",
    ]) {
      expect(isJoinCode(value)).toBe(false);
    }
  });
});

describe("normalizeCode", () => {
  it("bleibt für jedes Zeichen des Alphabets stabil", () => {
    // Ein Zeichen, das die Normalisierung verschluckt oder ablehnt, machte
    // jeden 32sten erzeugten Code unbrauchbar – und nur für seinen Besitzer.
    for (const char of CODE_ALPHABET) {
      const bare = char.repeat(CODE_LENGTH);
      const expected = `${JOIN_CODE_PREFIX}-${char.repeat(4)}-${char.repeat(4)}`;
      expect(normalizeCode(JOIN_CODE_PREFIX, bare)).toBe(expected);
      expect(isJoinCode(expected)).toBe(true);
    }
  });
});
