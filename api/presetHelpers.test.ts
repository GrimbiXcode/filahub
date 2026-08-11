import { describe, expect, it } from "vitest";
import {
  buildVariantDisplayName,
  containerFits,
  decodeContainerRef,
  encodeContainerRef,
  formatNominalWeight,
  hiddenKey,
  isCurrentVersion,
  isPresetHidden,
  materialTypeMatches,
  normalizeMaterialType,
  resolveContainerTare,
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

describe("encodeContainerRef / decodeContainerRef", () => {
  it("kodiert und dekodiert verlustfrei", () => {
    expect(decodeContainerRef(encodeContainerRef("own", 12))).toEqual({
      kind: "own",
      id: 12,
    });
    expect(decodeContainerRef(encodeContainerRef("preset", 34))).toEqual({
      kind: "preset",
      id: 34,
    });
  });

  it("liefert null bei ungültiger Eingabe", () => {
    expect(decodeContainerRef("")).toBeNull();
    expect(decodeContainerRef(null)).toBeNull();
    expect(decodeContainerRef("foo:1")).toBeNull();
    expect(decodeContainerRef("own:abc")).toBeNull();
    expect(decodeContainerRef("own:0")).toBeNull();
  });
});

describe("resolveContainerTare", () => {
  it("bevorzugt die Preset-Variante", () => {
    expect(
      resolveContainerTare({
        containerType: { tareWeight: 220 },
        containerPresetVariant: { tareWeight: 140 },
      })
    ).toBe(140);
  });

  it("fällt auf den eigenen Rollentyp zurück", () => {
    expect(resolveContainerTare({ containerType: { tareWeight: 220 } })).toBe(
      220
    );
  });

  it("liefert ohne Rolle 0", () => {
    expect(resolveContainerTare({})).toBe(0);
    expect(
      resolveContainerTare({
        containerType: null,
        containerPresetVariant: null,
      })
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

describe("containerFits", () => {
  const cardboardSpool = { form: "rolle" as const, materialTypes: ["PLA"] };
  const resinBottle = { form: "flasche" as const, materialTypes: ["RESIN"] };
  /** Wie der Startkatalog vor 2.3.0: keine Form, keine Schlagworte. */
  const legacy = { form: null, materialTypes: [] };

  it("nimmt an, wenn Form und Materialart zustimmen", () => {
    expect(
      containerFits(cardboardSpool, { kind: "filament", materialType: "PLA" })
    ).toBe(true);
    expect(
      containerFits(resinBottle, { kind: "resin", materialType: "Resin" })
    ).toBe(true);
  });

  /** Schlagworte stehen groß im Katalog, der Bestand ist Freitext. */
  it("vergleicht Materialarten unabhängig von Groß- und Kleinschreibung", () => {
    expect(
      containerFits(resinBottle, { kind: "resin", materialType: "resin" })
    ).toBe(true);
  });

  it("lässt eine zustimmende Form genügen, wenn die Materialart offen ist", () => {
    expect(
      containerFits(
        { form: "flasche", materialTypes: [] },
        { kind: "resin", materialType: "Irgendein Harz" }
      )
    ).toBe(true);
  });

  it("lässt eine zustimmende Materialart genügen, wenn die Form fehlt", () => {
    expect(
      containerFits(
        { form: null, materialTypes: ["PLA"] },
        { kind: "filament", materialType: "PLA+" }
      )
    ).toBe(true);
  });

  /**
   * **Der Grund, warum diese Funktion existiert.** Vorher galt „passt“, sobald
   * nichts widersprach – und weil eine leere Schlagwortliste zu allem passt und
   * eine unbekannte Form zu allem passt, stand eine Filamentspule aus dem
   * Startkatalog unter „Passend zu Harz“.
   */
  it("hält zwei unbekannte Merkmale nicht für einen Beleg", () => {
    expect(
      containerFits(legacy, { kind: "resin", materialType: "Resin" })
    ).toBe(false);
    expect(
      containerFits(legacy, { kind: "filament", materialType: "PLA" })
    ).toBe(false);
  });

  it("schließt aus, sobald ein Merkmal widerspricht", () => {
    // Form passt, Materialart nicht.
    expect(
      containerFits(cardboardSpool, { kind: "filament", materialType: "PETG" })
    ).toBe(false);
    // Materialart passt, Form nicht.
    expect(
      containerFits(
        { form: "flasche", materialTypes: ["PLA"] },
        { kind: "filament", materialType: "PLA" }
      )
    ).toBe(false);
  });

  it("hält „Sonstiges“ nicht für einen Widerspruch", () => {
    expect(
      containerFits(
        { form: "sonstiges", materialTypes: [] },
        { kind: "powder", materialType: "PA12" }
      )
    ).toBe(true);
  });

  it("liefert ohne jeden Zusammenhang nichts Passendes", () => {
    expect(containerFits(cardboardSpool, {})).toBe(false);
  });
});
