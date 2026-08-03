import { describe, expect, it } from "vitest";
import {
  buildVariantDisplayName,
  decodeSpoolRef,
  encodeSpoolRef,
  formatNominalWeight,
  hiddenKey,
  isCurrentVersion,
  isPresetHidden,
  materialTypeMatches,
  normalizeMaterialType,
  resolveSpoolTare,
  slugify,
} from "@contracts/presets";

describe("slugify", () => {
  it("löst Umlaute und Sonderzeichen auf", () => {
    expect(slugify("Polymaker PolyTerra™ Grün")).toBe(
      "polymaker-polyterra-gruen"
    );
    expect(slugify("Weiß & Schwarz")).toBe("weiss-schwarz");
    expect(slugify("eSUN")).toBe("esun");
  });

  it("entfernt führende und abschließende Bindestriche", () => {
    expect(slugify("  --PLA+ 1kg-- ")).toBe("pla-1kg");
  });

  it("begrenzt die Länge auf 100 Zeichen", () => {
    expect(slugify("a".repeat(200))).toHaveLength(100);
  });
});

describe("normalizeMaterialType", () => {
  it("vereinheitlicht Schreibweise und Leerzeichen", () => {
    expect(normalizeMaterialType("  pla+ ")).toBe("PLA+");
    expect(normalizeMaterialType("pla   silk")).toBe("PLA SILK");
  });
});

describe("materialTypeMatches", () => {
  it("passt bei exakter Übereinstimmung", () => {
    expect(materialTypeMatches(["PLA"], "PLA")).toBe(true);
  });

  it("passt auch bei Varianten der Materialart", () => {
    expect(materialTypeMatches(["PLA"], "PLA+")).toBe(true);
    expect(materialTypeMatches(["PLA"], "PLA Silk")).toBe(true);
    expect(materialTypeMatches(["PLA"], "pla+")).toBe(true);
  });

  it("passt nicht bei anderer Materialart", () => {
    expect(materialTypeMatches(["PLA"], "PETG")).toBe(false);
    // Kein Präfix-Treffer über Wortgrenzen hinweg
    expect(materialTypeMatches(["PLA"], "PLASTIK")).toBe(false);
  });

  it("passt ohne Schlagwörter zu allem", () => {
    expect(materialTypeMatches([], "PETG")).toBe(true);
    expect(materialTypeMatches([], null)).toBe(true);
  });

  it("passt bei fehlender Materialart nur ohne Schlagwörter", () => {
    expect(materialTypeMatches(["PLA"], "")).toBe(false);
    expect(materialTypeMatches(["PLA"], undefined)).toBe(false);
  });
});

describe("formatNominalWeight / buildVariantDisplayName", () => {
  it("formatiert volle Kilogramm als kg", () => {
    expect(formatNominalWeight(1000)).toBe("1 kg");
    expect(formatNominalWeight(3000)).toBe("3 kg");
    expect(formatNominalWeight(750)).toBe("750 g");
  });

  it("setzt den Anzeigenamen aus dem Katalogpfad zusammen", () => {
    expect(
      buildVariantDisplayName({
        manufacturer: "Polymaker",
        series: "PolyTerra PLA",
        version: "Kartonspule (ab 2021)",
        nominalWeight: 1000,
      })
    ).toBe("Polymaker · PolyTerra PLA · Kartonspule (ab 2021) · 1 kg");
  });
});

describe("encodeSpoolRef / decodeSpoolRef", () => {
  it("kodiert und dekodiert verlustfrei", () => {
    expect(decodeSpoolRef(encodeSpoolRef("own", 12))).toEqual({
      kind: "own",
      id: 12,
    });
    expect(decodeSpoolRef(encodeSpoolRef("preset", 34))).toEqual({
      kind: "preset",
      id: 34,
    });
  });

  it("liefert null bei ungültiger Eingabe", () => {
    expect(decodeSpoolRef("")).toBeNull();
    expect(decodeSpoolRef(null)).toBeNull();
    expect(decodeSpoolRef("foo:1")).toBeNull();
    expect(decodeSpoolRef("own:abc")).toBeNull();
    expect(decodeSpoolRef("own:0")).toBeNull();
  });
});

describe("resolveSpoolTare", () => {
  it("bevorzugt die Preset-Variante", () => {
    expect(
      resolveSpoolTare({
        spoolType: { tareWeight: 220 },
        spoolPresetVariant: { tareWeight: 140 },
      })
    ).toBe(140);
  });

  it("fällt auf den eigenen Rollentyp zurück", () => {
    expect(resolveSpoolTare({ spoolType: { tareWeight: 220 } })).toBe(220);
  });

  it("liefert ohne Rolle 0", () => {
    expect(resolveSpoolTare({})).toBe(0);
    expect(
      resolveSpoolTare({ spoolType: null, spoolPresetVariant: null })
    ).toBe(0);
  });
});

describe("isPresetHidden", () => {
  const path = {
    manufacturerId: 1,
    seriesId: 2,
    versionId: 3,
    variantId: 4,
  };

  it("blendet kaskadierend nach unten aus", () => {
    expect(isPresetHidden(new Set([hiddenKey("manufacturer", 1)]), path)).toBe(
      true
    );
    expect(isPresetHidden(new Set([hiddenKey("series", 2)]), path)).toBe(true);
    expect(isPresetHidden(new Set([hiddenKey("version", 3)]), path)).toBe(true);
    expect(isPresetHidden(new Set([hiddenKey("variant", 4)]), path)).toBe(true);
  });

  it("wirkt nicht auf Geschwister", () => {
    expect(isPresetHidden(new Set([hiddenKey("series", 99)]), path)).toBe(
      false
    );
    expect(isPresetHidden(new Set([hiddenKey("manufacturer", 2)]), path)).toBe(
      false
    );
  });

  it("bewertet auch Teilpfade", () => {
    expect(
      isPresetHidden(new Set([hiddenKey("variant", 4)]), { manufacturerId: 1 })
    ).toBe(false);
  });
});

describe("isCurrentVersion", () => {
  it("gilt ohne Gültigkeitsende als aktuell", () => {
    expect(isCurrentVersion({ validTo: null })).toBe(true);
    expect(isCurrentVersion({ validTo: "2020-12-31" })).toBe(false);
  });
});
