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
  COLOR_LAYOUTS,
  COLOR_LAYOUT_LIMITS,
  colorSpecIsTrivial,
  colorSpecSchema,
  overlayInkFor,
  parseStoredColorSpec,
  type ColorSpec,
  availableConditions,
  displayUnder,
  effectKindsOf,
  type ResolvedColorSpec,
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
      spec: null,
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
        spec: null,
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
        spec: null,
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
      spec: null,
    });
    expect(resolveColor("Matte Dark Green").matched).toBe("Dark Green");
    expect(resolveColor("Himmelblau-Traum").matched).toBe("Himmelblau");
  });

  it("gilt als ganzer Name, wenn die Wortfolge alles abdeckt", () => {
    expect(resolveColor("Dark-Green")).toEqual({
      hex: builtinHex("darkGreen"),
      source: "builtin",
      matched: null,
      spec: null,
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
      spec: null,
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
      spec: null,
    });
    // Der ganze Name schlägt jede Wortsuche.
    const whole = catalog({ "savanna yellow": "#d4b000" });
    expect(resolveColor("Savanna Yellow", whole)).toEqual({
      hex: "#d4b000",
      source: "custom",
      matched: null,
      spec: null,
    });
  });

  it("findet eigene Einträge auch als Teil eines Namens", () => {
    const own = catalog({ "moos nebel": "#667755" });
    expect(resolveColor("Matt Moos Nebel", own)).toEqual({
      hex: "#667755",
      source: "word",
      matched: "Moos Nebel",
      spec: null,
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
      spec: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Farbbild (seit 4.7.0)
// ---------------------------------------------------------------------------

function stops(count: number) {
  const palette = ["#d02c2c", "#e8c018", "#2e9e46", "#2158c8"];
  return Array.from({ length: count }, (_, index) => ({
    hex: palette[index % palette.length],
  }));
}

describe("Farbbild-Schema", () => {
  /*
    Drei- und vierfarbige Filamente sind vollwertig: Die Grenzen je Anordnung
    stehen an einer Stelle, und hier wird jede an der Grenze geprüft – die
    Untergrenze geht, die Obergrenze geht, eins darüber nicht.
  */
  for (const layout of COLOR_LAYOUTS) {
    const { min, max } = COLOR_LAYOUT_LIMITS[layout];
    it(`nimmt bei „${layout}“ ${min} bis ${max} Farben`, () => {
      const base = { schemaVersion: 1, layout };
      expect(
        colorSpecSchema.safeParse({ ...base, colors: stops(min) }).success
      ).toBe(true);
      expect(
        colorSpecSchema.safeParse({ ...base, colors: stops(max) }).success
      ).toBe(true);
      expect(
        colorSpecSchema.safeParse({ ...base, colors: stops(max + 1) }).success
      ).toBe(false);
      if (min > 1) {
        expect(
          colorSpecSchema.safeParse({ ...base, colors: stops(min - 1) }).success
        ).toBe(false);
      }
    });
  }

  it("führt koextrudiert als zwei-, drei- und vierfarbig", () => {
    expect(COLOR_LAYOUT_LIMITS.coextruded).toEqual({ min: 2, max: 4 });
  });

  it("ergänzt fehlende Partikel und Wirkungen als leere Listen", () => {
    const parsed = colorSpecSchema.parse({
      schemaVersion: 1,
      layout: "coextruded",
      colors: stops(2),
    });
    expect(parsed.accents).toEqual([]);
    expect(parsed.effects).toEqual([]);
  });

  it("verlangt bei Wirkungen eine Zielfarbe, außer bei Infrarot und Sonstigem", () => {
    const base = { schemaVersion: 1, layout: "solid", colors: stops(1) };
    expect(
      colorSpecSchema.safeParse({
        ...base,
        effects: [{ kind: "photochromic" }],
      }).success
    ).toBe(false);
    expect(
      colorSpecSchema.safeParse({
        ...base,
        effects: [{ kind: "photochromic", to: { hex: "#7b3fb8" } }],
      }).success
    ).toBe(true);
    expect(
      colorSpecSchema.safeParse({ ...base, effects: [{ kind: "infrared" }] })
        .success
    ).toBe(true);
  });

  it("lässt jede Wirkung nur einmal zu und die Schwelle nur bei Wärme", () => {
    const base = { schemaVersion: 1, layout: "solid", colors: stops(1) };
    const uv = { kind: "photochromic", to: { hex: "#7b3fb8" } };
    expect(
      colorSpecSchema.safeParse({ ...base, effects: [uv, uv] }).success
    ).toBe(false);
    expect(
      colorSpecSchema.safeParse({
        ...base,
        effects: [{ ...uv, thresholdC: 30 }],
      }).success
    ).toBe(false);
    expect(
      colorSpecSchema.safeParse({
        ...base,
        effects: [
          { kind: "thermochromic", to: { hex: "#ffffff" }, thresholdC: 31 },
        ],
      }).success
    ).toBe(true);
  });

  it("liest Unlesbares als null statt zu scheitern", () => {
    expect(parseStoredColorSpec(null)).toBeNull();
    expect(parseStoredColorSpec({ schemaVersion: 99 })).toBeNull();
    expect(parseStoredColorSpec("kaputt")).toBeNull();
    expect(
      parseStoredColorSpec({
        schemaVersion: 1,
        layout: "gradient",
        colors: stops(3),
      })?.colors
    ).toHaveLength(3);
  });

  it("erkennt ein Farbbild, das nur ein Farbcode ist", () => {
    const solid = colorSpecSchema.parse({
      schemaVersion: 1,
      layout: "solid",
      colors: stops(1),
    });
    expect(colorSpecIsTrivial(solid)).toBe(true);
    const withAccent = colorSpecSchema.parse({
      schemaVersion: 1,
      layout: "solid",
      colors: stops(1),
      accents: [{ hex: "#000000" }],
    });
    expect(colorSpecIsTrivial(withAccent)).toBe(false);
  });

  it("führt nur gültige mitgelieferte Farbbilder", () => {
    for (const color of BUILTIN_COLORS) {
      if (!color.spec) continue;
      expect(colorSpecSchema.safeParse(color.spec).success, color.key).toBe(
        true
      );
      expect(color.spec.colors[0].hex, color.key).toBe(color.hex);
    }
  });
});

describe("Farbbild in der Auflösung", () => {
  it("liefert den Regenbogen als Segmente", () => {
    const rainbow = resolveColor("Regenbogen");
    expect(rainbow.source).toBe("builtin");
    expect(rainbow.spec?.layout).toBe("segmented");
    expect(rainbow.spec?.colors).toHaveLength(6);
  });

  it("gibt das Farbbild eines eigenen Eintrags mit", () => {
    const spec: ColorSpec = colorSpecSchema.parse({
      schemaVersion: 1,
      layout: "coextruded",
      colors: [{ hex: "#c8a02c" }, { hex: "#b6bcc4" }, { hex: "#a45c33" }],
    });
    const own: AppearanceCatalog = {
      ...catalog({ dreiklang: "#c8a02c" }),
      colorSpecs: new Map([["dreiklang", spec]]),
    };
    const resolved = resolveColor("Dreiklang", own);
    expect(resolved.source).toBe("custom");
    expect(resolved.spec?.colors.map(stop => stop.hex)).toEqual([
      "#c8a02c",
      "#b6bcc4",
      "#a45c33",
    ]);
    // Auch als Teil eines längeren Namens
    expect(resolveColor("Silk Dreiklang", own).spec?.layout).toBe("coextruded");
  });
});

/*
  Stufe 4. Die Trenner sind nicht gleich sicher: Zeichen genügen mit einem
  bekannten Teil, Wörter und Bindestrich brauchen lauter bekannte – sonst
  würde „Dark-Green“ zweifarbig und „Back to Black“ ein Verlauf.
*/
describe("Zusammengesetzte Farbnamen", () => {
  function layoutOf(name: string, texture?: string) {
    const resolved = resolveColor(name, undefined, texture);
    return {
      source: resolved.source,
      layout: resolved.spec?.layout ?? null,
      colors: resolved.spec?.colors.map(stop => stop.hex) ?? [],
    };
  }

  it("macht aus zwei, drei und vier Farben ein koextrudiertes Farbbild", () => {
    expect(layoutOf("Rot/Blau")).toEqual({
      source: "compound",
      layout: "coextruded",
      colors: [builtinHex("red"), builtinHex("blue")],
    });
    expect(layoutOf("Rot/Gelb/Blau").colors).toHaveLength(3);
    expect(layoutOf("Rot/Gelb/Grün/Blau")).toMatchObject({
      layout: "coextruded",
    });
    expect(layoutOf("Rot/Gelb/Grün/Blau").colors).toHaveLength(4);
  });

  it("macht aus fünf und mehr Farben Segmente", () => {
    expect(layoutOf("Rot/Orange/Gelb/Grün/Blau").layout).toBe("segmented");
  });

  it("nimmt Leerraum um das Zeichen hin, aber nur auf beiden Seiten", () => {
    expect(layoutOf("Rot / Blau").layout).toBe("coextruded");
    expect(layoutOf("PLA+ Black").layout).toBeNull();
    expect(resolveColorHex("PLA+ Black")).toBe(builtinHex("black"));
  });

  it("liest Verlaufswörter als Verlauf", () => {
    expect(layoutOf("Red to Blue").layout).toBe("gradient");
    expect(layoutOf("Blau zu Violett").layout).toBe("gradient");
  });

  it("folgt Schlüsselwörtern in Farbe oder Oberfläche", () => {
    expect(layoutOf("Dual Rot/Blau").colors).toHaveLength(2);
    expect(layoutOf("Gold/Silber", "Gradient").layout).toBe("gradient");
    expect(layoutOf("Gold & Silber", "Silk Dual").layout).toBe("coextruded");
    expect(layoutOf("Rot/Blau", "Multicolor").layout).toBe("segmented");
  });

  it("trennt am Bindestrich nur, wenn alle Teile Farben sind", () => {
    expect(layoutOf("Rot-Blau").layout).toBe("coextruded");
    expect(layoutOf("Dark-Green")).toEqual({
      source: "builtin",
      layout: null,
      colors: [],
    });
    expect(resolveColorHex("Blau-Grün")).toBe(builtinHex("teal"));
  });

  it("trennt an Wörtern nur, wenn alle Teile Farben sind", () => {
    expect(layoutOf("Black and White").colors).toEqual([
      builtinHex("black"),
      builtinHex("white"),
    ]);
    expect(layoutOf("Back to Black").layout).toBeNull();
    expect(layoutOf("Green Glow in the Dark").layout).toBeNull();
    expect(resolveColor("Salt and Pepper").hex).toBeNull();
  });

  it("lässt Oberflächenwörter als Teil weg", () => {
    expect(layoutOf("Black, matte")).toEqual({
      source: "word",
      layout: null,
      colors: [],
    });
  });

  it("zeigt einen unbekannten Teil als Lücke, wenn ein anderer bekannt ist", () => {
    expect(layoutOf("Rot/Xyz").colors).toEqual([builtinHex("red"), null]);
    expect(resolveColor("Dawn/Dusk").hex).toBeNull();
  });

  it("löst jeden Teil einzeln samt Farbwörtern auf", () => {
    expect(layoutOf("Savanna Yellow / Earth Brown").colors).toEqual([
      builtinHex("yellow"),
      builtinHex("brown"),
    ]);
    expect(resolveColor("Savanna Yellow / Earth Brown").matched).toBe(
      "Savanna Yellow / Earth Brown"
    );
  });

  it("nimmt die erste bekannte Farbe als Leitfarbe", () => {
    expect(resolveColorHex("Xyz/Blau")).toBe(builtinHex("blue"));
  });

  it("lässt einen eigenen Eintrag für den ganzen Namen gewinnen", () => {
    const own = catalog({ "rot/blau": "#800080" });
    expect(resolveColor("Rot/Blau", own)).toMatchObject({
      hex: "#800080",
      source: "custom",
      spec: null,
    });
  });
});

describe("Musterfarbe über mehreren Grundfarben", () => {
  it("nimmt die Tinte mit dem besten schlechtesten Kontrast", () => {
    expect(overlayInkFor(["#f5f5f5", "#e8c018"])).toBe(INK_DARK);
    expect(overlayInkFor(["#1c1c1e", "#16306e"])).toBe(INK_LIGHT);
    expect(overlayInkFor([null, "#f5f5f5"])).toBe(INK_DARK);
  });

  /*
    Auf einem Verlauf von Schwarz nach Weiß reicht keine Tinte überall. Die
    Zeichnung legt deshalb einen Rand im Gegenton um das Muster – an jedem
    Stopp erreicht dann Tinte **oder** Rand die 4,5:1. Geprüft über ein Raster
    aus Zweier- und Dreierverläufen.
  */
  it("bleibt mit Rand auf jedem Stopp eines Verlaufs sichtbar", () => {
    const steps = [0, 64, 128, 192, 255];
    const hex = (r: number, g: number, b: number) =>
      "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
    const grid = steps.flatMap(r =>
      steps.flatMap(g => steps.map(b => hex(r, g, b)))
    );
    for (let i = 0; i < grid.length; i += 7) {
      for (let j = 0; j < grid.length; j += 11) {
        const colors = [grid[i], grid[j], grid[(i + j) % grid.length]];
        const ink = overlayInkFor(colors);
        const rim = counterInk(ink);
        for (const color of colors) {
          const best = Math.max(
            contrastRatio(color, ink),
            contrastRatio(color, rim)
          );
          expect(best).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Wirkungen (seit 4.8.0)
// ---------------------------------------------------------------------------

describe("Wirkungen zeigen", () => {
  const uvWhite: ResolvedColorSpec = {
    layout: "solid",
    colors: [{ hex: "#f5f5f5" }],
    accents: [],
    effects: [
      { kind: "photochromic", to: { hex: "#7b3fb8", name: "Violett" } },
      { kind: "phosphorescent", to: { hex: "#7dff6a" } },
      { kind: "infrared" },
    ],
  };

  it("bietet nur Bedingungen mit Zielfarbe an, „normal“ immer", () => {
    expect(availableConditions(uvWhite)).toEqual(["normal", "uv", "dark"]);
    expect(availableConditions(null)).toEqual(["normal"]);
  });

  it("zeigt unter UV die Zielfarbe", () => {
    expect(displayUnder("#f5f5f5", uvWhite, "uv")).toEqual({
      hex: "#7b3fb8",
      spec: null,
      glow: null,
    });
  });

  it("dunkelt im Dunkeln ab und leuchtet in der Leuchtfarbe", () => {
    const dark = displayUnder("#f5f5f5", uvWhite, "dark");
    expect(dark.glow).toBe("#7dff6a");
    expect(relativeLuminance(dark.hex!)).toBeLessThan(
      relativeLuminance("#f5f5f5") / 4
    );
  });

  it("behält Partikelfarben unter UV", () => {
    const spec: ResolvedColorSpec = { ...uvWhite, accents: ["#000000"] };
    expect(displayUnder("#f5f5f5", spec, "uv").spec?.accents).toEqual([
      "#000000",
    ]);
  });

  it("bleibt ohne passende Wirkung beim Normalzustand", () => {
    expect(displayUnder("#f5f5f5", uvWhite, "heat")).toEqual({
      hex: "#f5f5f5",
      spec: uvWhite,
      glow: null,
    });
  });

  it("zeigt eine blickwinkelabhängige Farbe als Verlauf", () => {
    const chameleon: ResolvedColorSpec = {
      layout: "solid",
      colors: [{ hex: "#7b3fb8" }],
      accents: [],
      effects: [{ kind: "goniochromic", to: { hex: "#2e9e46" } }],
    };
    const shown = displayUnder("#7b3fb8", chameleon, "normal");
    expect(shown.spec?.layout).toBe("gradient");
    expect(shown.spec?.colors.map(stop => stop.hex)).toEqual([
      "#7b3fb8",
      "#2e9e46",
    ]);
  });

  it("nennt die Wirkungsarten in fester Reihenfolge", () => {
    expect(effectKindsOf(uvWhite)).toEqual([
      "photochromic",
      "phosphorescent",
      "infrared",
    ]);
  });
});

describe("Neon und Nachleuchten", () => {
  /*
    Bis 4.7.0 stand „Neon“ als Oberfläche bei „Leuchtend“ (nachleuchtend) –
    fachlich falsch. Seit 4.8.0 zeichnet es als Oberfläche nichts mehr, und
    die Neonfarben sind Farben mit fluoreszierender Wirkung.
  */
  it("zeichnet „Neon“ als Oberfläche nicht mehr als Leuchten", () => {
    expect(resolveTextureKind("Neon")).toBe("plain");
    expect(resolveTextureKind("Glow in the dark")).toBe("glow");
    expect(resolveTextureKind("Nachleuchtend")).toBe("glow");
  });

  it("führt Neonfarben als fluoreszierend", () => {
    for (const name of ["Neongelb", "Neon green", "Neonorange", "Neon pink"]) {
      const resolved = resolveColor(name);
      expect(resolved.source, name).toBe("builtin");
      expect(effectKindsOf(resolved.spec), name).toEqual(["fluorescent"]);
    }
    expect(resolveColor("Neon Green PLA").spec?.effects[0].kind).toBe(
      "fluorescent"
    );
  });

  it("führt Nachleuchtendes mit Tagfarbe und Leuchtfarbe", () => {
    const glow = resolveColor("Glow in the dark green");
    expect(glow.hex).toBe(builtinHex("natural"));
    expect(availableConditions(glow.spec)).toEqual(["normal", "dark"]);
  });
});
