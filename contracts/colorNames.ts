/**
 * Der mitgelieferte Farbkatalog – Namen und Farbcodes, deutsch und englisch.
 *
 * Eigene Datei, weil die Liste seit 4.6.0 mehr ist als die Grundfarben: Sie
 * ist zugleich der **Farbwortschatz**, aus dem `resolveColor`
 * (`contracts/appearance.ts`) in längeren Namen das Farbwort findet –
 * „Savanna Yellow“ → Gelb, „Charcoal Black“ → Schwarz. Die Regeln dazu stehen
 * dort; hier stehen nur Daten.
 *
 * Die Auswahl folgt dem, was auf Filamentetiketten steht, nicht einer
 * Farbenlehre. Quellen: die benannten Farben aus CSS (W3C, frei verwendbar –
 * nur die, die auf Rollen vorkommen), typische Wörter der Herstellerpaletten
 * (Charcoal, Nardo, Sakura, Terracotta …) und ihre deutschen Gegenstücke. Die
 * Codes sind mittlere Vertreter ihres Namens – wer es genauer will, legt sich
 * die Farbe selbst an, und der eigene Eintrag schlägt diesen hier.
 *
 * Zu jedem Eintrag gehören der deutsche und der englische Name; die
 * Vergleichsform kommt aus `normalizeAppearanceName`, Akzente und
 * Groß-/Kleinschreibung müssen hier also nicht doppelt geführt werden.
 * `api/appearance.test.ts` prüft, dass kein Name zweimal vorkommt – auch nicht
 * in verschiedener Schreibweise derselben Vergleichsform.
 *
 * **Keine Oberflächenwörter.** „Stone“, „Galaxy“, „Silk“, „Marble“, „Glow“,
 * „Matte“ stehen bewusst nicht hier, sonst würde „Stone Grey“ zu einem Steinton
 * statt zu Grau und „Galaxy“ allein zu einer Farbe. Wo ein Oberflächenwort Teil
 * eines echten Farbnamens ist („Stone grey“, „Pearl white“), steht der ganze
 * Name als Eintrag.
 */

export type BuiltinColor = {
  /** Stabile Kennung, unabhängig von den Namen – für Tests und Sortierung */
  readonly key: string;
  readonly hex: string;
  /** Namen, unter denen dieser Eintrag gefunden wird; deutsch und englisch */
  readonly names: readonly string[];
  /**
   * Schwaches Farbwort: als ganzer Name gültig, in einem längeren Namen nur,
   * wenn sonst kein Farbwort darin steht. „Transparent“ und „Natur“ sind auf
   * Etiketten auch Beschreibungen – „Red Transparent“ ist rot, nicht klar,
   * obwohl „Transparent“ das hinterste Wort ist.
   */
  readonly weak?: true;
};

export const BUILTIN_COLORS: readonly BuiltinColor[] = [
  // --- Schwarz, Weiß, Grau ------------------------------------------------
  { key: "black", hex: "#1c1c1e", names: ["Schwarz", "Black"] },
  {
    key: "jetBlack",
    hex: "#0f0f10",
    names: ["Tiefschwarz", "Jet black", "Onyx"],
  },
  /*
    Kein „Weiss" neben „Weiß": Die Vergleichsform macht daraus ohnehin dasselbe,
    ein zweiter Eintrag wäre nur eine Zeile, die niemand mehr nachzieht.
  */
  {
    key: "white",
    hex: "#f5f5f5",
    names: [
      "Weiß",
      "White",
      "Reinweiß",
      "Schneeweiß",
      "Pure white",
      "Snow white",
    ],
  },
  {
    key: "natural",
    hex: "#e8e0cf",
    names: ["Natur", "Naturweiß", "Natural"],
    weak: true,
  },
  { key: "ivory", hex: "#f4efdc", names: ["Elfenbein", "Ivory"] },
  {
    key: "bone",
    hex: "#e3dac9",
    names: ["Knochenweiß", "Bone", "Bone white"],
  },
  {
    key: "cream",
    hex: "#f3e9d2",
    names: ["Creme", "Cremeweiß", "Cream", "Cream white"],
  },
  {
    key: "pearlWhite",
    hex: "#f0ede5",
    names: ["Perlweiß", "Pearl white"],
  },
  { key: "grey", hex: "#8a8a8f", names: ["Grau", "Grey", "Gray"] },
  {
    key: "darkGrey",
    hex: "#3a3d42",
    names: ["Anthrazit", "Dunkelgrau", "Anthracite", "Dark grey", "Dark gray"],
  },
  {
    key: "lightGrey",
    hex: "#c6c6cb",
    names: ["Hellgrau", "Light grey", "Light gray"],
  },
  {
    key: "charcoal",
    hex: "#36454f",
    names: ["Holzkohle", "Kohlegrau", "Charcoal"],
  },
  { key: "graphite", hex: "#41424c", names: ["Graphit", "Graphite"] },
  {
    key: "slate",
    hex: "#5a6470",
    names: ["Schiefer", "Schiefergrau", "Slate", "Slate grey", "Slate gray"],
  },
  {
    key: "ash",
    hex: "#b2b4b2",
    names: ["Asche", "Aschgrau", "Ash", "Ash grey", "Ash gray"],
  },
  {
    key: "nardo",
    hex: "#7b7f80",
    names: ["Nardo", "Nardograu", "Nardo grey", "Nardo gray"],
  },
  {
    key: "stoneGrey",
    hex: "#8b8c89",
    names: ["Steingrau", "Stone grey", "Stone gray"],
  },
  {
    key: "steel",
    hex: "#71797e",
    names: ["Stahl", "Stahlgrau", "Steel", "Steel grey", "Steel gray"],
  },
  { key: "gunmetal", hex: "#2c3539", names: ["Gunmetal", "Gun metal"] },
  {
    key: "titanium",
    hex: "#878681",
    names: ["Titan", "Titangrau", "Titanium"],
  },

  // --- Metalle --------------------------------------------------------------
  { key: "silver", hex: "#b6bcc4", names: ["Silber", "Silver"] },
  { key: "chrome", hex: "#dbe4eb", names: ["Chrom", "Chrome"] },
  { key: "platinum", hex: "#e5e4e2", names: ["Platin", "Platinum"] },
  { key: "gold", hex: "#c8a02c", names: ["Gold", "Golden"] },
  {
    key: "roseGold",
    hex: "#b76e79",
    names: ["Roségold", "Rotgold", "Rose gold"],
  },
  { key: "brass", hex: "#b5a642", names: ["Messing", "Brass"] },
  { key: "copper", hex: "#a45c33", names: ["Kupfer", "Copper"] },
  { key: "bronze", hex: "#8a6a3d", names: ["Bronze"] },

  // --- Rot ------------------------------------------------------------------
  { key: "red", hex: "#d02c2c", names: ["Rot", "Red"] },
  {
    key: "signalRed",
    hex: "#c1121c",
    names: [
      "Signalrot",
      "Feuerrot",
      "Verkehrsrot",
      "Signal red",
      "Fire red",
      "Traffic red",
    ],
  },
  {
    key: "darkRed",
    hex: "#8c1c22",
    names: ["Dunkelrot", "Bordeaux", "Maroon", "Dark red"],
  },
  {
    key: "wine",
    hex: "#6e1e2c",
    names: ["Weinrot", "Wein", "Wine", "Wine red"],
  },
  {
    key: "burgundy",
    hex: "#7a1f35",
    names: ["Burgund", "Burgunderrot", "Burgundy"],
  },
  {
    key: "cherry",
    hex: "#b0162c",
    names: ["Kirschrot", "Kirsche", "Cherry", "Cherry red"],
  },
  {
    key: "ruby",
    hex: "#9b1133",
    names: ["Rubin", "Rubinrot", "Ruby", "Ruby red"],
  },
  {
    key: "crimson",
    hex: "#c0172f",
    names: ["Karmesin", "Karmin", "Karminrot", "Crimson", "Carmine"],
  },
  {
    key: "scarlet",
    hex: "#e0301e",
    names: ["Scharlach", "Scharlachrot", "Scarlet", "Scarlet red"],
  },
  {
    key: "coral",
    hex: "#f26b5b",
    names: ["Koralle", "Korallenrot", "Coral"],
  },
  { key: "salmon", hex: "#f58f7c", names: ["Lachs", "Lachsrosa", "Salmon"] },
  {
    key: "rust",
    hex: "#a0431e",
    names: ["Rost", "Rostrot", "Rostbraun", "Rust"],
  },
  {
    key: "brick",
    hex: "#9c3d2e",
    names: ["Ziegel", "Ziegelrot", "Brick", "Brick red"],
  },
  {
    key: "terracotta",
    hex: "#c8653f",
    names: ["Terrakotta", "Terracotta"],
  },

  // --- Rosa, Pink, Magenta -------------------------------------------------
  { key: "pink", hex: "#e878a8", names: ["Rosa", "Pink"] },
  {
    key: "lightPink",
    hex: "#f8c8dc",
    names: ["Hellrosa", "Babyrosa", "Light pink", "Baby pink"],
  },
  {
    key: "hotPink",
    hex: "#e8338f",
    names: ["Knallpink", "Hot pink", "Fuchsia"],
  },
  { key: "rose", hex: "#e7849b", names: ["Rose"] },
  {
    key: "dustyPink",
    hex: "#c9a0a0",
    names: ["Altrosa", "Dusty pink", "Dusty rose"],
  },
  { key: "blush", hex: "#f4c2c2", names: ["Zartrosa", "Blush"] },
  {
    key: "sakura",
    hex: "#f6c1cf",
    names: ["Kirschblüte", "Sakura", "Cherry blossom"],
  },
  { key: "magenta", hex: "#c02888", names: ["Magenta"] },

  // --- Orange ---------------------------------------------------------------
  { key: "orange", hex: "#e8721c", names: ["Orange"] },
  {
    key: "mandarin",
    hex: "#f37a1f",
    names: ["Mandarine", "Mandarin", "Tangerine"],
  },
  {
    key: "darkOrange",
    hex: "#c1581f",
    names: ["Dunkelorange", "Dark orange", "Burnt orange"],
  },
  { key: "peach", hex: "#f7b28b", names: ["Pfirsich", "Peach"] },
  { key: "apricot", hex: "#f5a06a", names: ["Aprikose", "Apricot"] },
  {
    key: "skin",
    hex: "#e8b98f",
    names: ["Hautfarben", "Hautfarbe", "Skin", "Nude"],
  },

  // --- Gelb -----------------------------------------------------------------
  { key: "yellow", hex: "#e8c018", names: ["Gelb", "Yellow"] },
  {
    key: "lightYellow",
    hex: "#f6e7a1",
    names: ["Hellgelb", "Light yellow"],
  },
  {
    key: "lemon",
    hex: "#f4e04d",
    names: ["Zitrone", "Zitronengelb", "Lemon", "Lemon yellow"],
  },
  {
    key: "signalYellow",
    hex: "#efb10c",
    names: ["Signalgelb", "Verkehrsgelb", "Signal yellow", "Traffic yellow"],
  },
  {
    key: "sunflower",
    hex: "#f2b705",
    names: ["Sonnenblume", "Sonnengelb", "Sunflower", "Sunshine"],
  },
  { key: "amber", hex: "#f2a900", names: ["Bernstein", "Amber"] },
  {
    key: "mustard",
    hex: "#d1a42a",
    names: ["Senf", "Senfgelb", "Mustard", "Mustard yellow"],
  },
  { key: "ochre", hex: "#c8962d", names: ["Ocker", "Ochre", "Ocher"] },
  { key: "vanilla", hex: "#f3e5ab", names: ["Vanille", "Vanilla"] },

  // --- Grün -----------------------------------------------------------------
  { key: "green", hex: "#2e9e46", names: ["Grün", "Green"] },
  {
    key: "lightGreen",
    hex: "#7ec850",
    names: ["Hellgrün", "Limette", "Light green", "Lime"],
  },
  {
    key: "darkGreen",
    hex: "#1d5c30",
    names: ["Dunkelgrün", "Tannengrün", "Dark green"],
  },
  {
    key: "olive",
    hex: "#708238",
    names: ["Oliv", "Olivgrün", "Olive", "Olive green"],
  },
  {
    key: "army",
    hex: "#4b5320",
    names: ["Armeegrün", "Militärgrün", "Army green", "Military green"],
  },
  {
    key: "moss",
    hex: "#5b6d3a",
    names: ["Moos", "Moosgrün", "Moss", "Moss green"],
  },
  {
    key: "forest",
    hex: "#22573b",
    names: ["Waldgrün", "Forest", "Forest green"],
  },
  {
    key: "emerald",
    hex: "#169b62",
    names: ["Smaragd", "Smaragdgrün", "Emerald", "Emerald green"],
  },
  {
    key: "jade",
    hex: "#00a36c",
    names: ["Jade", "Jadegrün", "Jade green"],
  },
  {
    key: "mint",
    hex: "#98e0b4",
    names: ["Minze", "Mintgrün", "Mint", "Mint green"],
  },
  {
    key: "sage",
    hex: "#9caf88",
    names: ["Salbei", "Salbeigrün", "Sage", "Sage green"],
  },
  {
    key: "grass",
    hex: "#4caf2e",
    names: ["Gras", "Grasgrün", "Grass", "Grass green"],
  },
  { key: "apple", hex: "#8cc63f", names: ["Apfelgrün", "Apple green"] },
  { key: "pistachio", hex: "#a8c68f", names: ["Pistazie", "Pistachio"] },

  // --- Blaugrün, Türkis ----------------------------------------------------
  {
    key: "turquoise",
    hex: "#1fa8a0",
    names: ["Türkis", "Cyan", "Turquoise"],
  },
  /*
    „Blau-Grün“ als ganzer Name: Gemeint ist fast immer Petrol, nicht zwei
    Farben. Steht es hier, findet es die Auflösung, bevor ein
    zusammengesetzter Name daraus zwei Farben machen könnte.
  */
  {
    key: "teal",
    hex: "#0f6e73",
    names: ["Petrol", "Blaugrün", "Blau-Grün", "Teal", "Petrol blue"],
  },
  {
    key: "aqua",
    hex: "#3cc6d0",
    names: ["Aqua", "Aquamarin", "Aquamarine"],
  },

  // --- Blau -----------------------------------------------------------------
  { key: "blue", hex: "#2158c8", names: ["Blau", "Blue"] },
  { key: "lightBlue", hex: "#4aa8e0", names: ["Hellblau", "Light blue"] },
  {
    key: "darkBlue",
    hex: "#16306e",
    names: [
      "Dunkelblau",
      "Marineblau",
      "Marine",
      "Dark blue",
      "Navy",
      "Navy blue",
      "Marine blue",
    ],
  },
  {
    key: "sky",
    hex: "#87c3eb",
    names: ["Himmelblau", "Sky", "Sky blue"],
  },
  {
    key: "ice",
    hex: "#bfe3f2",
    names: ["Eisblau", "Ice", "Ice blue"],
  },
  { key: "babyBlue", hex: "#a9d2ef", names: ["Babyblau", "Baby blue"] },
  {
    key: "azure",
    hex: "#2f8fd8",
    names: ["Azur", "Azurblau", "Azure", "Azure blue"],
  },
  {
    key: "ocean",
    hex: "#1e6fa8",
    names: ["Ozeanblau", "Ocean", "Ocean blue"],
  },
  {
    key: "steelBlue",
    hex: "#4682b4",
    names: ["Stahlblau", "Steel blue"],
  },
  {
    key: "denim",
    hex: "#3b5d8f",
    names: ["Jeansblau", "Denim", "Denim blue"],
  },
  {
    key: "royal",
    hex: "#2d4fb8",
    names: ["Königsblau", "Royal", "Royal blue"],
  },
  {
    key: "cobalt",
    hex: "#0047ab",
    names: ["Kobalt", "Kobaltblau", "Cobalt", "Cobalt blue"],
  },
  {
    key: "sapphire",
    hex: "#0f52ba",
    names: ["Saphir", "Saphirblau", "Sapphire", "Sapphire blue"],
  },
  {
    key: "signalBlue",
    hex: "#1f4e8c",
    names: ["Signalblau", "Enzianblau", "Signal blue", "Gentian blue"],
  },
  {
    key: "ultramarine",
    hex: "#3f48cc",
    names: ["Ultramarin", "Ultramarinblau", "Ultramarine"],
  },
  {
    key: "midnight",
    hex: "#191970",
    names: ["Mitternachtsblau", "Midnight", "Midnight blue"],
  },
  { key: "indigo", hex: "#3f3a8c", names: ["Indigo"] },

  // --- Violett --------------------------------------------------------------
  {
    key: "purple",
    hex: "#7b3fb8",
    names: ["Violett", "Lila", "Purple", "Violet"],
  },
  { key: "lavender", hex: "#b7a4d6", names: ["Lavendel", "Lavender"] },
  { key: "lilac", hex: "#c8a2c8", names: ["Flieder", "Lilac"] },
  { key: "mauve", hex: "#b784a7", names: ["Malve", "Mauve"] },
  { key: "orchid", hex: "#b660cd", names: ["Orchidee", "Orchid"] },
  { key: "amethyst", hex: "#9966cc", names: ["Amethyst"] },
  { key: "plum", hex: "#6e2c5b", names: ["Pflaume", "Pflaumenlila", "Plum"] },
  { key: "grape", hex: "#5d2b6d", names: ["Traube", "Traubenlila", "Grape"] },
  { key: "aubergine", hex: "#4b2340", names: ["Aubergine", "Eggplant"] },

  // --- Braun, Beige ---------------------------------------------------------
  { key: "brown", hex: "#6f4a2e", names: ["Braun", "Brown"] },
  {
    key: "lightBrown",
    hex: "#a67b5b",
    names: ["Hellbraun", "Light brown"],
  },
  {
    key: "darkBrown",
    hex: "#4a2c1d",
    names: ["Dunkelbraun", "Dark brown"],
  },
  {
    key: "chocolate",
    hex: "#5c3a21",
    names: ["Schokolade", "Schokobraun", "Chocolate"],
  },
  {
    key: "coffee",
    hex: "#6f4e37",
    names: ["Kaffee", "Kaffeebraun", "Coffee"],
  },
  { key: "mocha", hex: "#7b5a45", names: ["Mokka", "Mocha"] },
  { key: "latte", hex: "#c8a987", names: ["Milchkaffee", "Latte"] },
  { key: "caramel", hex: "#b86e2e", names: ["Karamell", "Caramel"] },
  { key: "walnut", hex: "#5d4031", names: ["Walnuss", "Walnut"] },
  { key: "beige", hex: "#d8c4a0", names: ["Beige", "Sand"] },
  {
    key: "tan",
    hex: "#d2b48c",
    names: ["Wüstensand", "Tan", "Desert", "Desert tan"],
  },
  { key: "khaki", hex: "#c3b091", names: ["Khaki", "Kaki"] },
  { key: "taupe", hex: "#8b7d6b", names: ["Taupe"] },
  { key: "champagne", hex: "#f1ddb3", names: ["Champagner", "Champagne"] },

  // --- Durchsichtig -----------------------------------------------------------
  {
    key: "clear",
    hex: "#dfe6ea",
    names: ["Transparent", "Klar", "Clear", "Glasklar"],
    weak: true,
  },
];

/**
 * Deutsche Grundfarbwörter, die am **Ende** eines zusammengeschriebenen Worts
 * erkannt werden: „Himmel**blau**“, „Abend**rot**“, „Weiß**gold**“.
 *
 * Eine eigene, kurze Liste statt aller Namen des Katalogs: Die Endungssuche ist
 * eine Eigenheit des Deutschen. Mit allen Namen träfe das englische „Tan“ in
 * „Sultan“ und „Ash“ in jedem Wort auf „-ash“. Verglichen wird in der
 * Vergleichsform (klein, ohne Umlaut-Punkte, „ß“ als „ss“).
 */
export const COMPOUND_BASE_WORDS: readonly string[] = [
  "schwarz",
  "weiss",
  "grau",
  "silber",
  "gold",
  "kupfer",
  "bronze",
  "rot",
  "rosa",
  "pink",
  "magenta",
  "orange",
  "gelb",
  "ocker",
  "grun",
  "oliv",
  "turkis",
  "petrol",
  "cyan",
  "blau",
  "violett",
  "lila",
  "braun",
  "beige",
  "creme",
];

/**
 * Wörter vor einem Farbwort, die den Ton heller oder dunkler machen, wenn es
 * für die Kombination keinen eigenen Eintrag gibt („Pastel Pink“). „Light
 * blue“ oder „Dunkelgrün“ stehen als ganze Namen im Katalog und kommen hier
 * gar nicht erst an. Vergleichsform.
 */
export const LIGHTER_WORDS: readonly string[] = [
  "hell",
  "light",
  "pale",
  "pastell",
  "pastel",
  "blass",
];
export const DARKER_WORDS: readonly string[] = [
  "dunkel",
  "dark",
  "deep",
  "tief",
];
