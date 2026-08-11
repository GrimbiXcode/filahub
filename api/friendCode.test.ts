import { describe, expect, it } from "vitest";
import {
  FRIEND_CODE_ALPHABET,
  isFriendCode,
  normalizeFriendCode,
  normalizeTelegramUsername,
} from "@contracts/friends";
import { generateFriendCode } from "./queries/friends";

/**
 * Der Freundescode ist kein Anmeldemerkmal, öffnet aber den Weg zu einer
 * Anfrage. Geprüft wird deshalb nicht die Zufallsquelle – die liefert
 * `node:crypto` –, sondern dass der Wertebereich beim Formatieren erhalten
 * bleibt und dass beim Einlösen niemand an einer Kleinigkeit scheitert.
 */
describe("generateFriendCode", () => {
  it("liefert immer die Normalform", () => {
    for (let i = 0; i < 500; i++) {
      expect(isFriendCode(generateFriendCode())).toBe(true);
    }
  });

  it("benutzt keine verwechselbaren Zeichen", () => {
    // Der Code wird abgetippt und vorgelesen: I/1 und O/0 haben hier nichts zu
    // suchen. Die Zusicherung hängt am Alphabet, nicht am Zufall.
    for (const forbidden of ["I", "O", "0", "1"]) {
      expect(FRIEND_CODE_ALPHABET).not.toContain(forbidden);
    }
    const codes = Array.from({ length: 200 }, generateFriendCode).join("");
    expect(codes).not.toMatch(/[IO01]/);
  });

  it("streut über den Wertebereich", () => {
    // Ohne echten Zufall (etwa bei einer Konstanten) kollabiert die Menge.
    const codes = new Set(Array.from({ length: 1000 }, generateFriendCode));
    expect(codes.size).toBeGreaterThan(990);
  });
});

describe("normalizeFriendCode", () => {
  it("nimmt die Normalform an", () => {
    expect(normalizeFriendCode("FH-A2B3-C4D5")).toBe("FH-A2B3-C4D5");
  });

  /*
    Nachsichtig bei allem, was beim Abtippen und Kopieren passiert. Daran zu
    scheitern wäre schlechte Laune ohne Sicherheitsgewinn – der Code ist danach
    derselbe.
  */
  it("verzeiht Kleinschreibung, Leerzeichen und fehlende Bindestriche", () => {
    for (const input of [
      "fh-a2b3-c4d5",
      "FHA2B3C4D5",
      "a2b3c4d5",
      "  FH A2B3 C4D5  ",
      "A2B3-C4D5",
      "fh-A2B3C4D5",
    ]) {
      expect(normalizeFriendCode(input)).toBe("FH-A2B3-C4D5");
    }
  });

  it("weist ab, was kein Code sein kann", () => {
    for (const input of [
      "",
      "FH-A2B3",
      "FH-A2B3-C4D56",
      // I, O, 0 und 1 gehören nicht zum Alphabet
      "FH-A2B3-C4D0",
      "FH-IIII-OOOO",
      "FH-A2B3-C4D!",
    ]) {
      expect(normalizeFriendCode(input)).toBeNull();
    }
  });
});

describe("normalizeTelegramUsername", () => {
  it("nimmt @Name, Name und einen kopierten Link", () => {
    for (const input of [
      "@filahub_user",
      "filahub_user",
      "https://t.me/filahub_user",
      "  @filahub_user  ",
    ]) {
      expect(normalizeTelegramUsername(input)).toBe("filahub_user");
    }
  });

  it("hält sich an die Regeln von Telegram", () => {
    // 5–32 Zeichen aus a-z, 0-9 und _
    expect(normalizeTelegramUsername("abcd")).toBeNull();
    expect(normalizeTelegramUsername("a".repeat(33))).toBeNull();
    expect(normalizeTelegramUsername("hat-strich")).toBeNull();
    expect(normalizeTelegramUsername("")).toBeNull();
    expect(normalizeTelegramUsername("abcde")).toBe("abcde");
  });
});
