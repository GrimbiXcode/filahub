import { describe, it, expect } from "vitest";
import { COMMON_TEXTURES } from "@contracts/materials";
import {
  COMPOUND_BASE_WORDS,
  DARKER_WORDS,
  LIGHTER_WORDS,
} from "@contracts/colorNames";
import {
  APPEARANCE_NAME_MAX,
  BUILTIN_COLORS,
  BUILTIN_TEXTURES,
  appearanceNameSchema,
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
  resolveColor,
  resolveColorHex,
  resolveTextureKind,
  TEXTURE_KIND_CHOICES,
  TEXTURE_KINDS,
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

describe("appearanceNameSchema", () => {
  it("nimmt einen gewöhnlichen Namen an und trimmt ihn", () => {
    expect(appearanceNameSchema.parse("  Signalrot  ")).toBe("Signalrot");
  });

  it("verlangt einen Namen", () => {
    expect(() => appearanceNameSchema.parse("   ")).toThrow();
  });

  /*
    Der Grund für die zweite Längenprüfung: `normalizeAppearanceName` macht aus
    „ß" ein „ss", der Schlüssel wird also länger als der Name. Fünfundzwanzigmal
    „Weiß" sind hundert erlaubte Zeichen und ergaben einen Schlüssel aus
    hundertfünfundzwanzig – zu lang für `varchar(100)`. Das lief in einen
    `22001` von Postgres, den `asConflict` nicht kennt und deshalb roh
    weiterreichte: SQL-Text samt Parametern bis in den Browser.
  */
  it("weist einen Namen ab, dessen Vergleichsform zu lang wird", () => {
    const name = "Weiß".repeat(25);
    expect(name.length).toBe(APPEARANCE_NAME_MAX);
    expect(normalizeAppearanceName(name).length).toBeGreaterThan(
      APPEARANCE_NAME_MAX
    );
    expect(() => appearanceNameSchema.parse(name)).toThrow();
  });

  it("lässt einen langen Namen ohne „ß“ zu", () => {
    const name = "a".repeat(APPEARANCE_NAME_MAX);
    expect(appearanceNameSchema.parse(name)).toBe(name);
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
    expect(resolveTextureKind("Wolkenschimmer")).toBe("plain");
    expect(resolveTextureKind(null)).toBe("plain");
  });

  it("ordnet eine eigene Oberfläche einer mitgelieferten Musterart zu", () => {
    const own = catalog({}, { wolkenschimmer: "silk" });
    expect(resolveTextureKind("Wolkenschimmer", own)).toBe("silk");
  });

  it("lässt eine eigene Oberfläche den Katalog schlagen", () => {
    const own = catalog({}, { sparkle: "metallic" });
    expect(resolveTextureKind("Sparkle")).toBe("sparkle");
    expect(resolveTextureKind("Sparkle", own)).toBe("metallic");
  });

  it("löst Farbe und Oberfläche in einem Zug auf", () => {
    expect(resolveAppearance("Rot", "Carbon")).toEqual({
      hex: "#d02c2c",
      kind: "fiber",
      source: "builtin",
      matched: null,
    });
  });
});

describe("Musterarten seit 4.5.0", () => {
  it("bietet jede Musterart genau einmal zur Auswahl an", () => {
    expect([...TEXTURE_KIND_CHOICES].sort()).toEqual([...TEXTURE_KINDS].sort());
    expect(new Set(TEXTURE_KIND_CHOICES).size).toBe(TEXTURE_KINDS.length);
  });

  it("kennt „carbon“ nicht mehr als Musterart", () => {
    expect(textureKindSchema.safeParse("carbon").success).toBe(false);
    expect(textureKindSchema.safeParse("fiber").success).toBe(true);
  });

  /*
    Faserverstärkt ist mehr als Kohlefaser: Glas-, Aramid-, Basalt- und
    Aluminiumfasern sehen im Regal gleich aus. Die alten Namen („Carbon“, „CF“)
    müssen weiter treffen – sie stehen in bestehenden Materialien.
  */
  it("fasst alle Faserverstärkungen unter „Faserverstärkt“", () => {
    for (const name of [
      "Faserverstärkt",
      "Carbon",
      "CF",
      "Kohlefaser",
      "Glasfaser",
      "GF",
      "Aramid",
      "Kevlar",
      "Aluminiumfaser",
      "Fibre reinforced",
      "Glass fiber",
    ]) {
      expect(resolveTextureKind(name), name).toBe("fiber");
    }
  });

  it("führt „Seidenmatt“ als Satin, nicht mehr als Matt", () => {
    expect(resolveTextureKind("Seidenmatt")).toBe("satin");
    expect(resolveTextureKind("Satin")).toBe("satin");
    expect(resolveTextureKind("Matt")).toBe("matte");
  });

  it("erkennt Stein, Glitzer und Marmor", () => {
    expect(resolveTextureKind("Stonefill")).toBe("speckle");
    expect(resolveTextureKind("Gesprenkelt")).toBe("speckle");
    expect(resolveTextureKind("Terrazzo")).toBe("speckle");
    expect(resolveTextureKind("Galaxy")).toBe("sparkle");
    expect(resolveTextureKind("Glitzer")).toBe("sparkle");
    expect(resolveTextureKind("Marmor")).toBe("marble");
    expect(resolveTextureKind("Marble")).toBe("marble");
  });

  it("ordnet verwandte Namen den vorhandenen Arten zu", () => {
    expect(resolveTextureKind("Perlmutt")).toBe("silk");
    expect(resolveTextureKind("Transluzent")).toBe("transparent");
    expect(resolveTextureKind("Kork")).toBe("wood");
    expect(resolveTextureKind("Bronzefill")).toBe("metallic");
  });

  it("zeichnet jede Musterart außer „plain“ über einen Katalognamen", () => {
    const drawn = new Set(BUILTIN_TEXTURES.map(t => t.kind));
    for (const kind of TEXTURE_KINDS) {
      if (kind === "plain") continue;
      expect(drawn.has(kind), kind).toBe(true);
    }
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

// ---------------------------------------------------------------------------
// Farbwörter (seit 4.6.0)
// ---------------------------------------------------------------------------

/** Der Farbcode eines mitgelieferten Eintrags, über seine Kennung */
function builtinHex(key: string): string {
  const entry = BUILTIN_COLORS.find(color => color.key === key);
  if (!entry) throw new Error(`Kein mitgelieferter Eintrag „${key}“`);
  return entry.hex;
}

describe("Farbwortschatz", () => {
  it("kennt jede Grundfarbe der Endungssuche als ganzen Namen", () => {
    for (const word of COMPOUND_BASE_WORDS) {
      expect(resolveColor(word).source, word).toBe("builtin");
    }
  });

  it("führt die Helligkeitswörter nicht selbst als Farbe", () => {
    for (const word of [...LIGHTER_WORDS, ...DARKER_WORDS]) {
      expect(resolveColorHex(word), word).toBeNull();
    }
  });

  /*
    Oberflächenwörter dürfen keine Farbe sein – sonst würde „Stone Grey“ zu
    einem Steinton und „Galaxy“ allein zu einer Farbe, die niemand hinterlegt
    hat.
  */
  it("führt keinen mitgelieferten Oberflächennamen als Farbe", () => {
    const textureNames = new Set(
      BUILTIN_TEXTURES.filter(t => t.kind !== "transparent").flatMap(t =>
        t.names.map(normalizeAppearanceName)
      )
    );
    for (const color of BUILTIN_COLORS) {
      for (const name of color.names) {
        const key = normalizeAppearanceName(name);
        // Metalle sind beides; die stehen bewusst als Farbe da.
        if (
          ["gold", "silber", "silver", "kupfer", "copper", "bronze"].includes(
            key
          )
        )
          continue;
        expect(textureNames.has(key), name).toBe(false);
      }
    }
  });
});

/*
  Die Zusicherung, auf die es ankommt: echte Farbnamen aus den Paletten der
  Hersteller (Bambu Lab, Polymaker, Prusament, eSUN, Elegoo, Sunlu, Extrudr,
  colorFabb), dazu deutsche Namen. Wer den Wortschatz erweitert oder eine Regel
  ändert, sieht hier, was sich verschiebt.
*/
describe("Farbwörter in Herstellerfarben", () => {
  const cases: [name: string, key: string][] = [
    ["Savanna Yellow", "yellow"],
    ["Earth Brown", "brown"],
    ["Charcoal Black", "black"],
    ["Jade White", "white"],
    ["Bone White", "bone"],
    ["Cotton White", "white"],
    ["Ivory White", "white"],
    ["Mandarin Orange", "orange"],
    ["Sakura Pink", "pink"],
    ["Ice Blue", "ice"],
    ["Sky Blue", "sky"],
    ["Marine Blue", "darkBlue"],
    ["Azure Blue", "azure"],
    ["Ash Gray", "ash"],
    ["Nardo Gray", "nardo"],
    ["Desert Tan", "tan"],
    ["Lemon Yellow", "lemon"],
    ["Scarlet Red", "scarlet"],
    ["Grass Green", "grass"],
    ["Apple Green", "apple"],
    ["Jet Black", "jetBlack"],
    ["Galaxy Black", "black"],
    ["Lipstick Red", "red"],
    ["Mystic Green", "green"],
    ["Urban Grey", "grey"],
    ["Fire Engine Red", "red"],
    ["Space Grey", "grey"],
    ["Stone Grey", "stoneGrey"],
    ["Army Red", "red"],
    ["Silk Gold", "gold"],
    ["Matte Dark Green", "darkGreen"],
    ["Red Transparent", "red"],
    ["Natural Orange", "orange"],
    ["PLA+ Black 1.75", "black"],
    ["Signalweiß", "white"],
    ["Abendrot", "red"],
    ["Weißgold", "gold"],
    ["Rubinrot", "ruby"],
  ];

  for (const [name, key] of cases) {
    it(`findet in „${name}“ ${key}`, () => {
      expect(resolveColorHex(name)).toBe(builtinHex(key));
    });
  }

  it("findet ganze Namen des erweiterten Katalogs", () => {
    for (const [name, key] of [
      ["Charcoal", "charcoal"],
      ["Terracotta", "terracotta"],
      ["Himmelblau", "sky"],
      ["Tannengrün", "darkGreen"],
      ["Petrol", "teal"],
      ["Blau-Grün", "teal"],
      ["Oliv", "olive"],
      ["Signalrot", "signalRed"],
    ] as const) {
      expect(resolveColor(name), name).toEqual({
        hex: builtinHex(key),
        source: "builtin",
        matched: null,
      });
    }
  });

  /*
    Die Kehrseite: ohne Farbwort kein Ton. Ein Name aus Bild und Stimmung
    bleibt schraffiert, Oberflächenwörter färben nicht, und die Endungssuche
    macht aus „Brot“ kein Rot.
  */
  it("rät nicht, wo kein Farbwort steht", () => {
    for (const name of [
      "Dawn Radiance",
      "Galaxy",
      "Stone",
      "Silk",
      "Marble",
      "Glow",
      "Matte",
      "Feuerdrache",
      "PLA",
      "Brot",
      "Pearl Mouse",
      "Dark",
      "Pastell",
    ]) {
      expect(resolveColor(name), name).toEqual({
        hex: null,
        source: null,
        matched: null,
      });
    }
  });
});

describe("Auflösung über Farbwörter", () => {
  it("nennt das gefundene Wort in der Schreibweise der Eingabe", () => {
    expect(resolveColor("Savanna Yellow")).toEqual({
      hex: builtinHex("yellow"),
      source: "word",
      matched: "Yellow",
    });
    expect(resolveColor("Matte Dark Green").matched).toBe("Dark Green");
    expect(resolveColor("Himmelblau-Traum").matched).toBe("Himmelblau");
  });

  it("gilt als ganzer Name, wenn die Wortfolge alles abdeckt", () => {
    expect(resolveColor("Dark-Green")).toEqual({
      hex: builtinHex("darkGreen"),
      source: "builtin",
      matched: null,
    });
  });

  it("lässt den längeren Treffer gewinnen", () => {
    // „Sky blue“ ist länger als „Blue“: Gefunden wird Himmelblau, nicht Blau.
    expect(resolveColor("Deep Sky Blue").matched).toBe("Deep Sky Blue");
    expect(resolveColorHex("Deep Sky Blue")).toBe(resolveColorHex("Deep Sky"));
    expect(resolveColorHex("Deep Sky Blue")).not.toBe(
      resolveColorHex("Deep Blue")
    );
  });

  it("macht mit einem Helligkeitswort davor heller oder dunkler", () => {
    const pink = builtinHex("pink");
    const pastel = resolveColor("Pastel Pink");
    expect(pastel.source).toBe("word");
    expect(pastel.matched).toBe("Pastel Pink");
    expect(pastel.hex).not.toBe(pink);
    expect(relativeLuminance(pastel.hex!)).toBeGreaterThan(
      relativeLuminance(pink)
    );

    const deep = resolveColor("Deep Purple");
    expect(relativeLuminance(deep.hex!)).toBeLessThan(
      relativeLuminance(builtinHex("purple"))
    );
  });

  it("nimmt einen eigenen Katalogeintrag für die Kombination statt zu rechnen", () => {
    // „Light pink“ steht im Katalog und wird nicht aus „Pink“ gemischt.
    expect(resolveColor("Light Pink")).toEqual({
      hex: builtinHex("lightPink"),
      source: "builtin",
      matched: null,
    });
  });

  it("erkennt deutsche Komposita samt Helligkeit", () => {
    const dunkel = resolveColor("Dunkeltürkis");
    expect(dunkel.source).toBe("word");
    expect(relativeLuminance(dunkel.hex!)).toBeLessThan(
      relativeLuminance(builtinHex("turquoise"))
    );
    expect(resolveColor("Pastellgrün").hex).not.toBe(builtinHex("green"));
    expect(resolveColorHex("Morgenrot")).toBe(builtinHex("red"));
  });

  it("zieht eigene Einträge den mitgelieferten bei gleicher Länge vor", () => {
    const own = catalog({ savanne: "#e0c060" });
    expect(resolveColor("Savanne Gelb", own)).toEqual({
      hex: "#e0c060",
      source: "word",
      matched: "Savanne",
    });
    // Der ganze Name schlägt jede Wortsuche.
    const whole = catalog({ "savanna yellow": "#d4b000" });
    expect(resolveColor("Savanna Yellow", whole)).toEqual({
      hex: "#d4b000",
      source: "custom",
      matched: null,
    });
  });

  it("findet eigene Einträge auch als Teil eines Namens", () => {
    const own = catalog({ "moos nebel": "#667755" });
    expect(resolveColor("Matt Moos Nebel", own)).toEqual({
      hex: "#667755",
      source: "word",
      matched: "Moos Nebel",
    });
  });

  it("liefert für denselben Namen dasselbe Ergebnis aus dem Speicher", () => {
    const own = catalog({ nebel: "#aabbcc" });
    expect(resolveColor("Grauer Nebel", own)).toBe(
      resolveColor("Grauer Nebel", own)
    );
  });

  it("gibt die Herkunft über resolveAppearance weiter", () => {
    expect(resolveAppearance("Earth Brown", "Matt")).toEqual({
      hex: builtinHex("brown"),
      kind: "matte",
      source: "word",
      matched: "Brown",
    });
  });
});
