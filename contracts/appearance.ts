import { z } from "zod";

/**
 * Farbe und Oberfläche als **Darstellung** statt als Text.
 *
 * `materials.color` und `materials.texture` bleiben Freitext – daran ändert
 * diese Datei nichts. Sie liefert nur die Zuordnung, mit der aus „Schwarz" ein
 * Farbcode und aus „Silk" eine Musterart wird, damit die Übersicht ein Feld
 * zeichnen kann statt ein Wort zu drucken.
 *
 * Wie die übrigen Dateien in `contracts/` von Client, Server und Tests
 * importierbar; zur Laufzeit wird nichts aus `@db` oder `api/` geladen. Die
 * Musterliste wird in `db/schema.ts` als `pgEnum` weiterverwendet – die
 * Abhängigkeit läuft nur in eine Richtung.
 */

// ---------------------------------------------------------------------------
// Musterarten
// ---------------------------------------------------------------------------

/**
 * Die Muster, die gezeichnet werden können.
 *
 * Hier ist die Liste **geschlossen**, obwohl `materials.texture` Freitext ist –
 * und das ist kein Widerspruch, sondern die Trennlinie: Der Name ist offen
 * („Sparkle" muss eintragbar bleiben), die Zeichnung ist es nicht. Eine eigene
 * Oberfläche ordnet ihren Namen einer dieser Arten zu; sie bringt kein neues
 * Muster mit. Alles andere hieße, Zeichenanweisungen aus der Datenbank zu
 * laden.
 *
 * `plain` ist der Normalfall und keine Lücke: eine Farbe ohne Muster.
 */
export const TEXTURE_KINDS = [
  "plain",
  "matte",
  "glossy",
  "silk",
  "metallic",
  "carbon",
  "transparent",
  "glow",
  "wood",
] as const;

export type TextureKind = (typeof TEXTURE_KINDS)[number];

export const textureKindSchema = z.enum(TEXTURE_KINDS);

// ---------------------------------------------------------------------------
// Farbcode
// ---------------------------------------------------------------------------

/**
 * Farbcode als `#rrggbb`, klein geschrieben.
 *
 * Nur die lange Form und keine Kurzschreibweise (`#fff`): Gespeichert wird
 * genau ein Format, damit ein Vergleich zweier Codes eine Zeichenkettengleich-
 * heit sein kann. `normalizeHex` bringt die Eingabe vorher auf diese Form.
 */
export const hexSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/, "Farbcode muss die Form #1a2b3c haben");

/**
 * Bringt eine Farbeingabe auf `#rrggbb`.
 *
 * Nimmt `#FFF`, `FFF`, `#FFFFFF` und `ffffff` an – das ist die Bandbreite
 * dessen, was Menschen aus einem Slicer, einer Herstellerseite oder einem
 * Farbwähler kopieren. Was danach nicht passt, gibt `null` zurück und läuft in
 * die Prüfung, statt still ein falsches Feld zu färben.
 */
export function normalizeHex(raw: string): string | null {
  const value = raw.trim().toLowerCase().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/.test(value)) {
    const [r, g, b] = [...value];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^[0-9a-f]{6}$/.test(value)) return `#${value}`;
  return null;
}

// ---------------------------------------------------------------------------
// Namen vergleichbar machen
// ---------------------------------------------------------------------------

/**
 * Vergleichsform eines Farb- oder Oberflächennamens.
 *
 * Getrimmt, klein, Innenabstände zusammengezogen, Akzente entfernt (NFD, dann
 * die Kombinationszeichen weg), „ß" → „ss". Damit finden sich „Grün", „grun"
 * und „GRÜN " gegenseitig.
 *
 * **Was hier bewusst nicht passiert: übersetzen.** Dass jemand „black" statt
 * „Schwarz" schreibt, ist keine Frage der Schreibweise, sondern der Sprache –
 * das deckt die Namensliste des Katalogeintrags ab. Eine Faltung „ü" → „ue"
 * unterbleibt aus demselben Grund: Sie ließe „Grün" und „Gruen" erst recht
 * auseinanderfallen, weil das eine zu „gruen" und das andere zu „gruen" nur
 * dann zusammenfände, wenn man beide Richtungen gleichzeitig anwendet.
 */
export function normalizeAppearanceName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Mitgelieferter Katalog
// ---------------------------------------------------------------------------

export type BuiltinColor = {
  /** Stabile Kennung, unabhängig von den Namen – für Tests und Sortierung */
  readonly key: string;
  readonly hex: string;
  /** Namen, unter denen dieser Eintrag gefunden wird; deutsch und englisch */
  readonly names: readonly string[];
};

/**
 * Farben, die ohne Zutun erkannt werden.
 *
 * Die Auswahl folgt dem, was auf Filamentetiketten steht, nicht einer
 * Farbenlehre: „Naturweiß" und „Anthrazit" kommen vor, „Ultramarin" nicht. Die
 * Codes sind mittlere, gesättigte Vertreter ihres Namens – wer es genauer will,
 * legt sich die Farbe selbst an, und der eigene Eintrag schlägt diesen hier.
 *
 * Zu jedem Eintrag gehören der deutsche und der englische Name; die
 * Vergleichsform kommt aus `normalizeAppearanceName`, Akzente und
 * Groß-/Kleinschreibung müssen hier also nicht doppelt geführt werden.
 */
export const BUILTIN_COLORS: readonly BuiltinColor[] = [
  { key: "black", hex: "#1c1c1e", names: ["Schwarz", "Black"] },
  /*
    Kein „Weiss" neben „Weiß": Die Vergleichsform macht daraus ohnehin dasselbe,
    ein zweiter Eintrag wäre nur eine Zeile, die niemand mehr nachzieht.
  */
  { key: "white", hex: "#f5f5f5", names: ["Weiß", "White"] },
  {
    key: "natural",
    hex: "#e8e0cf",
    names: ["Natur", "Naturweiß", "Natural"],
  },
  { key: "grey", hex: "#8a8a8f", names: ["Grau", "Grey", "Gray"] },
  {
    key: "darkGrey",
    hex: "#3a3d42",
    names: ["Anthrazit", "Dunkelgrau", "Anthracite", "Dark grey"],
  },
  {
    key: "lightGrey",
    hex: "#c6c6cb",
    names: ["Hellgrau", "Light grey", "Light gray"],
  },
  { key: "silver", hex: "#b6bcc4", names: ["Silber", "Silver"] },
  { key: "gold", hex: "#c8a02c", names: ["Gold", "Golden"] },
  { key: "copper", hex: "#a45c33", names: ["Kupfer", "Copper"] },
  { key: "bronze", hex: "#8a6a3d", names: ["Bronze"] },
  { key: "red", hex: "#d02c2c", names: ["Rot", "Red"] },
  {
    key: "darkRed",
    hex: "#8c1c22",
    names: ["Dunkelrot", "Bordeaux", "Maroon"],
  },
  { key: "orange", hex: "#e8721c", names: ["Orange"] },
  { key: "yellow", hex: "#e8c018", names: ["Gelb", "Yellow"] },
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
  { key: "turquoise", hex: "#1fa8a0", names: ["Türkis", "Cyan", "Turquoise"] },
  { key: "lightBlue", hex: "#4aa8e0", names: ["Hellblau", "Light blue"] },
  { key: "blue", hex: "#2158c8", names: ["Blau", "Blue"] },
  {
    key: "darkBlue",
    hex: "#16306e",
    names: ["Dunkelblau", "Marineblau", "Dark blue", "Navy"],
  },
  { key: "purple", hex: "#7b3fb8", names: ["Violett", "Lila", "Purple"] },
  { key: "magenta", hex: "#c02888", names: ["Magenta"] },
  { key: "pink", hex: "#e878a8", names: ["Rosa", "Pink"] },
  { key: "brown", hex: "#6f4a2e", names: ["Braun", "Brown"] },
  { key: "beige", hex: "#d8c4a0", names: ["Beige", "Sand"] },
  {
    key: "clear",
    hex: "#dfe6ea",
    names: ["Transparent", "Klar", "Clear", "Glasklar"],
  },
];

export type BuiltinTexture = {
  readonly kind: TextureKind;
  readonly names: readonly string[];
};

/**
 * Oberflächen, die ohne Zutun erkannt werden.
 *
 * Deckt `COMMON_TEXTURES` aus `contracts/materials.ts` vollständig ab – die
 * Vorschlagsliste im Formular und die Zeichnung dürfen nicht auseinanderlaufen,
 * sonst schlägt genau der Wert fehl, den die App selbst vorgeschlagen hat.
 * `api/appearance.test.ts` nagelt das fest.
 */
export const BUILTIN_TEXTURES: readonly BuiltinTexture[] = [
  { kind: "matte", names: ["Matt", "Matte", "Seidenmatt"] },
  { kind: "glossy", names: ["Glänzend", "Glanz", "Glossy", "Shiny"] },
  { kind: "silk", names: ["Silk", "Seide", "Seidenglanz"] },
  { kind: "metallic", names: ["Metallic", "Metallisch", "Metall", "Metal"] },
  { kind: "carbon", names: ["Carbon", "Karbon", "Carbon fibre", "CF"] },
  { kind: "transparent", names: ["Transparent", "Klar", "Clear"] },
  { kind: "glow", names: ["Leuchtend", "Glow", "Glow in the dark", "Neon"] },
  { kind: "wood", names: ["Holzoptik", "Holz", "Wood"] },
];

// ---------------------------------------------------------------------------
// Auflösung
// ---------------------------------------------------------------------------

const BUILTIN_COLOR_BY_NAME = new Map<string, string>(
  BUILTIN_COLORS.flatMap(color =>
    color.names.map(name => [normalizeAppearanceName(name), color.hex] as const)
  )
);

const BUILTIN_TEXTURE_BY_NAME = new Map<string, TextureKind>(
  BUILTIN_TEXTURES.flatMap(texture =>
    texture.names.map(
      name => [normalizeAppearanceName(name), texture.kind] as const
    )
  )
);

/**
 * Die eigenen Einträge eines Bereichs, nach Vergleichsform geschlüsselt.
 *
 * Als Map und nicht als Liste, weil sie für jede Zeile der Übersicht befragt
 * wird – einmal gebaut, danach nur noch nachgeschlagen.
 */
export type AppearanceCatalog = {
  readonly colors: ReadonlyMap<string, string>;
  readonly textures: ReadonlyMap<string, TextureKind>;
};

export const EMPTY_APPEARANCE_CATALOG: AppearanceCatalog = {
  colors: new Map(),
  textures: new Map(),
};

export type ResolvedAppearance = {
  /** `null` = kein Farbcode bekannt; die Anzeige fällt auf das Rückfallfeld */
  hex: string | null;
  kind: TextureKind;
};

/** Farbcode zu einem Freitext-Farbnamen, eigene Einträge zuerst */
export function resolveColorHex(
  color: string | null | undefined,
  catalog: AppearanceCatalog = EMPTY_APPEARANCE_CATALOG
): string | null {
  if (!color) return null;
  const key = normalizeAppearanceName(color);
  if (!key) return null;
  return catalog.colors.get(key) ?? BUILTIN_COLOR_BY_NAME.get(key) ?? null;
}

/**
 * Musterart zu einem Freitext-Oberflächennamen, eigene Einträge zuerst.
 *
 * Unbekannt heißt `plain` und nicht „nichts": Eine Farbe ohne Muster ist eine
 * gültige Darstellung, ein leeres Feld wäre ein Fehler, der keiner ist.
 */
export function resolveTextureKind(
  texture: string | null | undefined,
  catalog: AppearanceCatalog = EMPTY_APPEARANCE_CATALOG
): TextureKind {
  if (!texture) return "plain";
  const key = normalizeAppearanceName(texture);
  if (!key) return "plain";
  return (
    catalog.textures.get(key) ?? BUILTIN_TEXTURE_BY_NAME.get(key) ?? "plain"
  );
}

/**
 * Beides auf einmal – der übliche Aufruf, weil das Feld beides zeigt.
 *
 * Eigene Einträge schlagen den mitgelieferten Katalog: Wer „Schwarz" bei sich
 * anders definiert, meint es so.
 */
export function resolveAppearance(
  color: string | null | undefined,
  texture: string | null | undefined,
  catalog: AppearanceCatalog = EMPTY_APPEARANCE_CATALOG
): ResolvedAppearance {
  return {
    hex: resolveColorHex(color, catalog),
    kind: resolveTextureKind(texture, catalog),
  };
}

// ---------------------------------------------------------------------------
// Sichtbarkeit des Musters
// ---------------------------------------------------------------------------

function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative Helligkeit nach WCAG 2.1 (0 = Schwarz, 1 = Weiß) */
export function relativeLuminance(hex: string): number {
  const value = normalizeHex(hex);
  if (!value) return 0;
  const r = parseInt(value.slice(1, 3), 16);
  const g = parseInt(value.slice(3, 5), 16);
  const b = parseInt(value.slice(5, 7), 16);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

/** Kontrastverhältnis zweier Farben nach WCAG 2.1 (1 bis 21) */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hell, dunkel] = la >= lb ? [la, lb] : [lb, la];
  return (hell + 0.05) / (dunkel + 0.05);
}

export const INK_LIGHT = "#ffffff";
export const INK_DARK = "#000000";

export type OverlayInk = typeof INK_LIGHT | typeof INK_DARK;

/**
 * Die Farbe, in der das Muster über der Grundfarbe gezeichnet wird.
 *
 * **Der Punkt der ganzen Funktion: kein weißes Muster auf weißer Farbe.** Ein
 * fest weißer Glanzstrich verschwindet auf weißem Filament vollständig, ein
 * fest schwarzes Karbonmuster auf schwarzem – die Zeichnung wäre genau dort
 * weg, wo sie am meisten gebraucht wird.
 *
 * Genommen wird die kontrastreichere der beiden Endfarben. Das ist keine
 * Näherung: Die beiden Kontraste sind bei einer Helligkeit von rund 0,179
 * gleichauf, und dort beträgt der größere immer noch etwa 4,58:1. Es gibt also
 * keine Grundfarbe, auf der das Muster verschwindet – abgesichert in
 * `api/appearance.test.ts`.
 */
export function overlayInk(hex: string): OverlayInk {
  return contrastRatio(hex, INK_LIGHT) >= contrastRatio(hex, INK_DARK)
    ? INK_LIGHT
    : INK_DARK;
}

/** Der Gegenton zu `overlayInk` – für Muster, die zwei Töne brauchen */
export function counterInk(ink: OverlayInk): OverlayInk {
  return ink === INK_LIGHT ? INK_DARK : INK_LIGHT;
}

// ---------------------------------------------------------------------------
// Eingaben
// ---------------------------------------------------------------------------

/** Obergrenze passend zu `varchar(100)` in `db/schema.ts` */
export const APPEARANCE_NAME_MAX = 100;

export const appearanceNameSchema = z
  .string()
  .trim()
  .min(1, "Name ist erforderlich")
  .max(APPEARANCE_NAME_MAX, "Name ist zu lang");
