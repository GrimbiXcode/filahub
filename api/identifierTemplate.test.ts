import { describe, expect, it } from "vitest";
import {
  formatIdentifier,
  identifierNumber,
  identifierInputSchema,
  identifierTemplateSchema,
  nextIdentifier,
  nextIdentifiers,
  normalizeIdentifier,
  parseIdentifierTemplate,
} from "@contracts/identifierTemplate";

describe("parseIdentifierTemplate", () => {
  it("zerlegt Vorlagen mit genau einem Platzhalter", () => {
    expect(parseIdentifierTemplate("ID: {n}")).toEqual({
      prefix: "ID: ",
      suffix: "",
      width: 1,
    });
    expect(parseIdentifierTemplate("F{nnn}-A")).toEqual({
      prefix: "F",
      suffix: "-A",
      width: 3,
    });
  });

  it("lehnt keinen oder mehrere Platzhalter ab", () => {
    expect(parseIdentifierTemplate("ID")).toBeNull();
    expect(parseIdentifierTemplate("{n}-{n}")).toBeNull();
    expect(parseIdentifierTemplate("{x}")).toBeNull();
  });
});

describe("formatIdentifier", () => {
  it("setzt die Nummer ein und füllt mit Nullen auf", () => {
    expect(formatIdentifier("ID: {n}", 4)).toBe("ID: 4");
    expect(formatIdentifier("ID: {n}", 53)).toBe("ID: 53");
    expect(formatIdentifier("F{nn}", 1)).toBe("F01");
    expect(formatIdentifier("F{nn}", 100)).toBe("F100");
  });
});

describe("identifierNumber", () => {
  it("liest die Nummer unabhängig von Großschreibung, Leerraum und Stellen", () => {
    expect(identifierNumber("ID: {n}", "ID: 4")).toBe(4);
    expect(identifierNumber("ID: {n}", " id:4 ")).toBe(4);
    expect(identifierNumber("F{nn}", "F001")).toBe(1);
    expect(identifierNumber("F{nn}", "f7")).toBe(7);
  });

  it("nimmt Sonderzeichen der Vorlage wörtlich", () => {
    expect(identifierNumber("(A.{n})", "(A.3)")).toBe(3);
    expect(identifierNumber("(A.{n})", "(AX3)")).toBeNull();
  });

  it("ignoriert Kennungen, die nicht passen", () => {
    expect(identifierNumber("ID: {n}", "F01")).toBeNull();
    expect(identifierNumber("ID: {n}", "ID: 4a")).toBeNull();
    expect(identifierNumber("ID: {n}", "ID: ")).toBeNull();
  });
});

describe("nextIdentifier", () => {
  it("beginnt bei 1", () => {
    expect(nextIdentifier("ID: {n}", [])).toBe("ID: 1");
  });

  it("nimmt die kleinste freie Nummer", () => {
    expect(nextIdentifier("ID: {n}", ["ID: 1", "ID: 2", "ID: 4"])).toBe(
      "ID: 3"
    );
    expect(nextIdentifier("F{nn}", ["F01", "F02", null, "Rolle 3"])).toBe(
      "F03"
    );
  });

  it("zählt fremde Schreibweisen derselben Nummer als belegt", () => {
    expect(nextIdentifier("F{nn}", ["F1", "f002"])).toBe("F03");
  });

  it("liefert null bei ungültiger Vorlage", () => {
    expect(nextIdentifier("ID", ["ID"])).toBeNull();
  });
});

describe("identifierTemplateSchema", () => {
  it("macht aus einem leeren Feld null", () => {
    expect(identifierTemplateSchema.parse("   ")).toBeNull();
    expect(identifierTemplateSchema.parse(null)).toBeNull();
  });

  it("trimmt die Vorlage", () => {
    expect(identifierTemplateSchema.parse("  ID: {n} ")).toBe("ID: {n}");
  });

  it("verlangt genau einen Platzhalter", () => {
    expect(identifierTemplateSchema.safeParse("ID").success).toBe(false);
    expect(identifierTemplateSchema.safeParse("{n}{n}").success).toBe(false);
  });

  it("begrenzt die Länge", () => {
    expect(
      identifierTemplateSchema.safeParse(`${"x".repeat(40)}{n}`).success
    ).toBe(false);
  });
});

describe("nextIdentifiers", () => {
  it("vergibt mehrere am Stück und füllt Lücken zuerst", () => {
    expect(nextIdentifiers("ID: {n}", ["ID: 2"], 3)).toEqual([
      "ID: 1",
      "ID: 3",
      "ID: 4",
    ]);
  });

  it("liefert bei ungültiger Vorlage nichts", () => {
    expect(nextIdentifiers("ID", [], 2)).toEqual([]);
  });
});

describe("Kennung als Eingabe", () => {
  it("vergleicht ohne Rand und Großschreibung", () => {
    expect(normalizeIdentifier(" F01 ")).toBe(normalizeIdentifier("f01"));
  });

  it("trimmt und macht aus leer null", () => {
    expect(identifierInputSchema.parse(" F01 ")).toBe("F01");
    expect(identifierInputSchema.parse("   ")).toBeNull();
    expect(identifierInputSchema.parse(null)).toBeNull();
  });
});
