import { describe, it, expect } from "vitest";
import { COMMON_TEXTURES } from "@contracts/materials";
import {
  BUILTIN_COLORS,
  BUILTIN_TEXTURES,
  INK_DARK,
  INK_LIGHT,
  contrastRatio,
  counterInk,
  hexSchema,
  normalizeAppearanceName,
  normalizeHex,
  overlayInk,
  relativeLuminance,
  resolveAppearance,
  resolveColorHex,
  resolveTextureKind,
  textureKindSchema,
  type AppearanceCatalog,
} from "@contracts/appearance";

function catalog(
  colors: Record<string, string> = {},
  textures: Record<string, string> = {}
): AppearanceCatalog {
  return {
    colors: new Map(Object.entries(colors)),
    textures: new Map(
      Object.entries(textures).map(([name, kind]) => [
        name,
        textureKindSchema.parse(kind),
      ])
    ),
  };
}

describe("normalizeAppearanceName", () => {
  it("macht Groß- und Kleinschreibung gleich", () => {
    expect(normalizeAppearanceName("SCHWARZ")).toBe("schwarz");
  });

  it("wirft Randabstände weg und zieht innere zusammen", () => {
    expect(normalizeAppearanceName("  dunkel   blau ")).toBe("dunkel blau");
  });

  it("entfernt Akzente, damit „Grün“ und „grun“ zusammenfinden", () => {
    expect(normalizeAppearanceName("Grün")).toBe(
      normalizeAppearanceName("grun")
    );
    expect(normalizeAppearanceName("Türkis")).toBe("turkis");
  });

  it("schreibt „ß“ als „ss“", () => {
    expect(normalizeAppearanceName("Weiß")).toBe(
      normalizeAppearanceName("Weiss")
    );
  });

  it("übersetzt nicht – das ist Sache der Namensliste", () => {
    expect(normalizeAppearanceName("Schwarz")).not.toBe(
      normalizeAppearanceName("Black")
    );
  });
});

describe("normalizeHex", () => {
  it("nimmt die Kurzform an", () => {
    expect(normalizeHex("#FFF")).toBe("#ffffff");
    expect(normalizeHex("abc")).toBe("#aabbcc");
  });

  it("nimmt die lange Form mit und ohne Raute an", () => {
    expect(normalizeHex("  #1A2B3C ")).toBe("#1a2b3c");
    expect(normalizeHex("1a2b3c")).toBe("#1a2b3c");
  });

  it("weist ab, was keine Farbe ist", () => {
    expect(normalizeHex("rot")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("")).toBeNull();
  });
});

describe("Mitgelieferter Katalog", () => {
  it("führt nur gültige Farbcodes", () => {
    for (const color of BUILTIN_COLORS) {
      expect(() => hexSchema.parse(color.hex)).not.toThrow();
    }
  });

  it("vergibt jede Kennung genau einmal", () => {
    const keys = BUILTIN_COLORS.map(c => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("führt keinen Farbnamen unter zwei Einträgen", () => {
    const names = BUILTIN_COLORS.flatMap(c =>
      c.names.map(normalizeAppearanceName)
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it("führt keinen Oberflächennamen unter zwei Musterarten", () => {
    const names = BUILTIN_TEXTURES.flatMap(t =>
      t.names.map(normalizeAppearanceName)
    );
    expect(new Set(names).size).toBe(names.length);
  });

  /*
    Der Riegel dagegen, dass die Vorschlagsliste im Formular und die Zeichnung
    auseinanderlaufen: Ohne ihn schlüge ausgerechnet der Wert fehl, den die App
    selbst vorgeschlagen hat.
  */
  it("zeichnet jeden Vorschlag aus COMMON_TEXTURES", () => {
    for (const texture of COMMON_TEXTURES) {
      expect(resolveTextureKind(texture)).not.toBe("plain");
    }
  });
});

describe("Auflösung", () => {
  it("findet mitgelieferte Farben in beiden Sprachen", () => {
    expect(resolveColorHex("Schwarz")).toBe(resolveColorHex("black"));
    expect(resolveColorHex("Grün")).toBe(resolveColorHex("green"));
  });

  it("lässt eigene Einträge den Katalog schlagen", () => {
    const own = catalog({ schwarz: "#101010" });
    expect(resolveColorHex("Schwarz", own)).toBe("#101010");
    expect(resolveColorHex("Schwarz")).not.toBe("#101010");
  });

  it("meldet eine unbekannte Farbe als unbekannt, statt zu raten", () => {
    expect(resolveColorHex("Feuerdrache")).toBeNull();
    expect(resolveColorHex("")).toBeNull();
    expect(resolveColorHex(null)).toBeNull();
  });

  it("hält eine unbekannte Oberfläche für „ohne Muster“", () => {
    expect(resolveTextureKind("Sparkle")).toBe("plain");
    expect(resolveTextureKind(null)).toBe("plain");
  });

  it("ordnet eine eigene Oberfläche einer mitgelieferten Musterart zu", () => {
    const own = catalog({}, { sparkle: "metallic" });
    expect(resolveTextureKind("Sparkle", own)).toBe("metallic");
  });

  it("löst Farbe und Oberfläche in einem Zug auf", () => {
    expect(resolveAppearance("Rot", "Carbon")).toEqual({
      hex: "#d02c2c",
      kind: "carbon",
    });
  });
});

describe("Sichtbarkeit des Musters", () => {
  it("rechnet die Helligkeit nach den WCAG-Bezugswerten", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#808080")).toBeCloseTo(0.2159, 3);
  });

  it("rechnet das Kontrastverhältnis richtig herum", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#123456", "#123456")).toBeCloseTo(1, 5);
  });

  it("zeichnet auf Weiß dunkel und auf Schwarz hell", () => {
    expect(overlayInk("#ffffff")).toBe(INK_DARK);
    expect(overlayInk("#000000")).toBe(INK_LIGHT);
  });

  it("liefert zum Ton den Gegenton", () => {
    expect(counterInk(overlayInk("#ffffff"))).toBe(INK_LIGHT);
    expect(counterInk(overlayInk("#000000"))).toBe(INK_DARK);
  });

  /*
    Die eigentliche Zusicherung der Funktion: Es gibt keine Grundfarbe, auf der
    das Muster verschwindet. Am knappsten wird es bei einer Helligkeit um 0,179,
    wo beide Richtungen gleichauf liegen – und dort bleiben immer noch rund
    4,58:1.
  */
  it("bleibt auf jeder mitgelieferten Farbe deutlich sichtbar", () => {
    for (const color of BUILTIN_COLORS) {
      expect(contrastRatio(color.hex, overlayInk(color.hex))).toBeGreaterThan(
        4.5
      );
    }
  });

  it("bleibt auf jeder Graustufe sichtbar", () => {
    for (let value = 0; value <= 255; value++) {
      const hex = `#${value.toString(16).padStart(2, "0").repeat(3)}`;
      expect(contrastRatio(hex, overlayInk(hex))).toBeGreaterThan(4.5);
    }
  });

  it("bleibt auf einem Raster durch den ganzen Farbraum sichtbar", () => {
    const steps = [0, 51, 102, 153, 204, 255];
    for (const r of steps) {
      for (const g of steps) {
        for (const b of steps) {
          const hex = `#${[r, g, b]
            .map(v => v.toString(16).padStart(2, "0"))
            .join("")}`;
          expect(contrastRatio(hex, overlayInk(hex))).toBeGreaterThan(4.5);
        }
      }
    }
  });
});
