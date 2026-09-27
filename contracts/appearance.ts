import { z } from "zod";
import {
  BUILTIN_COLORS,
  COMPOUND_BASE_WORDS,
  DARKER_WORDS,
  LIGHTER_WORDS,
} from "./colorNames";

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
 *
 * **Die Reihenfolge ist die des Postgres-Enums** (`texture_kind` in
 * `db/schema.ts`) und damit nicht frei: Neue Werte kommen nur ans Ende, weil
 * `ALTER TYPE … ADD VALUE` sie dort anhängt. Für Auswahllisten gibt es
 * deshalb eine eigene Reihenfolge, `TEXTURE_KIND_CHOICES`.
 *
 * `fiber` hieß bis 4.4.0 `carbon`. Kohlefaser ist nur eine von mehreren
 * Verstärkungen; Glas-, Aramid-, Basalt- und Aluminiumfasern sehen im Regal
 * gleich aus. Umbenannt in der von Hand geschriebenen Migration
 * `0026_texture_kinds.sql` (`RENAME VALUE`), weil drizzle-kit eine Umbenennung
 * nicht erkennt und den Typ neu anlegen würde.
 */
export const TEXTURE_KINDS = [
  "plain",
  "matte",
  "glossy",
  "silk",
  "metallic",
  "fiber",
  "transparent",
  "glow",
  "wood",
  // seit 4.5.0
  "speckle",
  "sparkle",
  "marble",
  "satin",
] as const;

export type TextureKind = (typeof TEXTURE_KINDS)[number];

export const textureKindSchema = z.enum(TEXTURE_KINDS);

/**
 * Die Musterarten in der Reihenfolge, in der eine Auswahl sie anbietet: erst
 * die Glanzstufen von matt nach spiegelnd, dann Durchsicht und Leuchten,
 * zuletzt die Strukturen. `api/appearance.test.ts` hält fest, dass jede Art
 * genau einmal vorkommt – sonst fehlte eine still in der Verwaltung.
 */
export const TEXTURE_KIND_CHOICES: readonly TextureKind[] = [
  "plain",
  "matte",
  "satin",
  "silk",
  "glossy",
  "metallic",
  "transparent",
  "glow",
  "fiber",
  "wood",
  "speckle",
  "sparkle",
  "marble",
];

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

/*
  Die Farben stehen seit 4.6.0 in `contracts/colorNames.ts` – mit dem
  Farbwortschatz sind es zu viele Zeilen für diese Datei. Weitergereicht, damit
  kein Aufrufer seinen Import ändern muss.
*/
export { BUILTIN_COLORS, type BuiltinColor } from "./colorNames";

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
  { kind: "matte", names: ["Matt", "Matte"] },
  /*
    „Seidenmatt“ stand bis 4.4.0 bei `matte`. Es ist die wörtliche
    Übersetzung von „Satin“ und gehört seit es die Art gibt dorthin.
  */
  {
    kind: "satin",
    names: ["Satin", "Seidenmatt", "Satiniert", "Satin finish"],
  },
  { kind: "glossy", names: ["Glänzend", "Glanz", "Glossy", "Shiny"] },
  {
    kind: "silk",
    names: ["Silk", "Seide", "Seidenglanz", "Perlmutt", "Pearl", "Pearlescent"],
  },
  {
    kind: "metallic",
    names: [
      "Metallic",
      "Metallisch",
      "Metall",
      "Metal",
      "Metallfüllung",
      "Bronzefill",
      "Copperfill",
    ],
  },
  /*
    Faserverstärkt: alles, was eine Faser im Strang hat. Die Kürzel sind die
    der Materialbezeichnungen (PLA-CF, PETG-GF, PA-AF) – wer sie als
    Oberfläche einträgt, meint genau das.
  */
  {
    kind: "fiber",
    names: [
      "Faserverstärkt",
      "Faser",
      "Carbon",
      "Karbon",
      "Kohlefaser",
      "Carbonfaser",
      "Glasfaser",
      "Aramid",
      "Aramidfaser",
      "Kevlar",
      "Basaltfaser",
      "Aluminiumfaser",
      "CF",
      "GF",
      "AF",
      "Fibre reinforced",
      "Fiber reinforced",
      "Fibre",
      "Fiber",
      "Carbon fibre",
      "Carbon fiber",
      "Glass fibre",
      "Glass fiber",
      "Aramid fibre",
      "Aramid fiber",
      "Basalt fibre",
      "Basalt fiber",
      "Aluminium fibre",
      "Aluminum fiber",
    ],
  },
  {
    kind: "transparent",
    names: [
      "Transparent",
      "Klar",
      "Clear",
      "Transluzent",
      "Translucent",
      "Kristall",
      "Crystal",
    ],
  },
  { kind: "glow", names: ["Leuchtend", "Glow", "Glow in the dark", "Neon"] },
  {
    kind: "wood",
    names: ["Holzoptik", "Holz", "Wood", "Kork", "Cork", "Bambus", "Bamboo"],
  },
  /*
    Gesprenkelt: matte, deckende Einsprengsel – Steinmehl, Granulat,
    Farbpartikel (colorFabb stoneFill, Terrazzo, „Rock“-PLA).
  */
  {
    kind: "speckle",
    names: [
      "Gesprenkelt",
      "Stein",
      "Steinoptik",
      "Granit",
      "Terrazzo",
      "Konfetti",
      "Speckled",
      "Speckle",
      "Stone",
      "Stonefill",
      "Granite",
      "Sprinkle",
      "Sprinkles",
      "Rock",
    ],
  },
  /*
    Glitzernd: reflektierende Plättchen (Glimmer, Glitter). Galaxy ist
    dieselbe Zeichnung – eine dunkle Grundfarbe mit Glitter darin.
  */
  {
    kind: "sparkle",
    names: [
      "Glitzer",
      "Glitzernd",
      "Funkelnd",
      "Galaxy",
      "Galaxie",
      "Sternenstaub",
      "Sparkle",
      "Glitter",
      "Starlight",
      "Stardust",
    ],
  },
  { kind: "marble", names: ["Marmor", "Marmoriert", "Marble", "Marbled"] },
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

// ---------------------------------------------------------------------------
// Farbwörter in längeren Namen (seit 4.6.0)
// ---------------------------------------------------------------------------

/*
  Herstellerfarben sind fast immer ein Bild plus ein Farbwort: „Savanna
  Yellow“, „Earth Brown“, „Charcoal Black“, „Tannengrün“. Bis 4.5.0 fand die
  Auflösung nur den ganzen Namen, und all das blieb schraffiert.

  Die Regel „ohne Farbcode wird nicht geraten“ gilt weiter, nur genauer: Ein
  Ton entsteht ausschließlich aus einem Farbwort, das **im Namen steht**. Ein
  Name ohne bekanntes Farbwort („Dawn Radiance“) bleibt schraffiert – kein
  Hash, kein Zufall.

  Die Stufen, die erste mit Treffer gewinnt:

  1. ganzer Name im eigenen Katalog                → `custom`
  2. ganzer Name im mitgelieferten Katalog        → `builtin`
  5. längster bekannter Teilausdruck              → `word`
  6. deutsches Kompositum über die Endung         → `word`

  Die Lücken in der Zählung sind Absicht: Stufe 3 (RAL-Nummern) und Stufe 4
  (zusammengesetzte Namen wie „Rot/Blau“) folgen, siehe
  `docs/plan-farbbild-oberflaechen.md`. Die Nummern bleiben die des Plans,
  damit Code und Plan dieselbe Sprache sprechen.
*/

/** Trennzeichen zwischen Wörtern eines Farbnamens */
const WORD_SEPARATORS = /[\s\-_/+&|,;:.()[\]{}"'„“”‚‘’«»]+/;

/** Längste Wortfolge, die als Farbname gesucht wird („Dark Slate Grey“) */
const MAX_PHRASE_WORDS = 3;

/** Anteil Weiß bzw. Schwarz, den ein Helligkeitswort beimischt */
const LIGHTER_MIX = 0.4;
const DARKER_MIX = 0.35;

/**
 * Mindestlänge des Worts **vor** einer erkannten Endung: „Himmelblau“ ja,
 * „Brot“ nicht – dort bliebe nur „b“, und aus Brot würde Rot.
 */
const COMPOUND_MIN_PREFIX = 3;

type Word = { readonly raw: string; readonly key: string };

/**
 * Zerlegt einen Namen in Wörter und merkt sich zu jedem die Schreibweise der
 * Eingabe – die Oberfläche nennt das gefundene Wort so, wie es dasteht
 * („Erkannt aus ‚Yellow‘“), nicht in der Vergleichsform.
 */
function splitWords(raw: string): Word[] {
  return raw
    .split(WORD_SEPARATORS)
    .map(part => ({ raw: part, key: normalizeAppearanceName(part) }))
    .filter(word => word.key.length > 0);
}

/** Vergleichsform eines Namens als Wortfolge: „Blau-Grün“ → „blau grun“ */
function phraseKey(name: string): string {
  return splitWords(name)
    .map(word => word.key)
    .join(" ");
}

type BuiltinWordEntry = { readonly hex: string; readonly weak: boolean };

const BUILTIN_COLOR_BY_PHRASE = new Map<string, BuiltinWordEntry>(
  BUILTIN_COLORS.flatMap(color =>
    color.names.map(
      name =>
        [
          phraseKey(name),
          { hex: color.hex, weak: color.weak === true },
        ] as const
    )
  )
);

/**
 * Die Endungen, längste zuerst – „weiss“ vor „ss“ gäbe es nicht, aber
 * „violett“ muss vor einem denkbaren „ett“ geprüft werden, und die Reihenfolge
 * soll nicht davon abhängen, wie jemand die Liste sortiert.
 */
const COMPOUND_BASES: readonly (readonly [string, string])[] =
  COMPOUND_BASE_WORDS.flatMap(word => {
    const hex = BUILTIN_COLOR_BY_NAME.get(word);
    return hex ? [[word, hex] as const] : [];
  }).sort((a, b) => b[0].length - a[0].length);

const LIGHTER = new Set(LIGHTER_WORDS);
const DARKER = new Set(DARKER_WORDS);

/** Mischt `hex` zum Anteil `share` mit `toward` – beides `#rrggbb` */
function mixHex(hex: string, toward: string, share: number): string {
  const channel = (value: string, index: number) =>
    parseInt(value.slice(1 + index * 2, 3 + index * 2), 16);
  return (
    "#" +
    [0, 1, 2]
      .map(index => {
        const from = channel(hex, index);
        const mixed = Math.round(
          from + (channel(toward, index) - from) * share
        );
        return mixed.toString(16).padStart(2, "0");
      })
      .join("")
  );
}

/** Heller oder dunkler, wenn das Wort davor es sagt; sonst unverändert */
function shade(hex: string, modifier: string | undefined) {
  if (modifier && LIGHTER.has(modifier)) {
    return { hex: mixHex(hex, INK_LIGHT, LIGHTER_MIX), shaded: true };
  }
  if (modifier && DARKER.has(modifier)) {
    return { hex: mixHex(hex, INK_DARK, DARKER_MIX), shaded: true };
  }
  return { hex, shaded: false };
}

/** Die eigenen Einträge als Wortfolgen – je Katalog einmal gebaut */
const customPhraseCache = new WeakMap<
  ReadonlyMap<string, string>,
  ReadonlyMap<string, string>
>();

function customByPhrase(
  colors: ReadonlyMap<string, string>
): ReadonlyMap<string, string> {
  const cached = customPhraseCache.get(colors);
  if (cached) return cached;
  const built = new Map<string, string>();
  for (const [nameKey, hex] of colors) {
    const key = phraseKey(nameKey);
    if (key && !built.has(key)) built.set(key, hex);
  }
  customPhraseCache.set(colors, built);
  return built;
}

/**
 * Woher ein Farbcode kommt. `word` heißt „aus einem Teil des Namens“ – der Ton
 * ist dann ungefähr, und das Formular bietet an, ihn genau festzulegen.
 */
export type ColorSource = "custom" | "builtin" | "word";

export type ResolvedColor = {
  /** `null` = kein Farbcode bekannt; die Anzeige fällt auf das Rückfallfeld */
  readonly hex: string | null;
  readonly source: ColorSource | null;
  /** Das gefundene Farbwort in der Schreibweise der Eingabe, nur bei `word` */
  readonly matched: string | null;
};

const UNKNOWN_COLOR: ResolvedColor = { hex: null, source: null, matched: null };

/**
 * Stufe 5: der längste bekannte Teilausdruck, bei gleicher Länge eigene
 * Einträge vor mitgelieferten, dann der **hinterste** – im Deutschen wie im
 * Englischen steht das Farbwort am Ende („Earth Brown“, nicht „Brown Earth“).
 * „Matte Dark Green“ findet so „Dark green“ und nicht bloß „Green“.
 *
 * Schwache Farbwörter (Transparent, Natur) zählen erst im zweiten Durchgang,
 * wenn sonst nichts passt: „Red Transparent“ ist rot.
 */
function findColorWord(
  words: readonly Word[],
  catalog: AppearanceCatalog
): ResolvedColor | null {
  const own = customByPhrase(catalog.colors);
  for (const allowWeak of [false, true]) {
    for (
      let length = Math.min(words.length, MAX_PHRASE_WORDS);
      length > 0;
      length--
    ) {
      for (const source of ["custom", "builtin"] as const) {
        if (source === "custom" && allowWeak) continue;
        for (let start = words.length - length; start >= 0; start--) {
          const phrase = words.slice(start, start + length);
          const key = phrase.map(word => word.key).join(" ");
          const entry =
            source === "custom"
              ? own.get(key)
              : (() => {
                  const found = BUILTIN_COLOR_BY_PHRASE.get(key);
                  return found && (allowWeak || !found.weak)
                    ? found.hex
                    : undefined;
                })();
          if (!entry) continue;
          /*
            Deckt die Wortfolge den ganzen Namen ab („Dark-Green“ statt „Dark
            green“), ist es kein Teiltreffer, sondern nur eine andere
            Schreibweise – dann auch keine Rückfrage im Formular.
          */
          if (length === words.length) {
            return { hex: entry, source, matched: null };
          }
          const before = words[start - 1];
          const shaded = shade(entry, before?.key);
          const used = shaded.shaded ? [before, ...phrase] : phrase;
          return {
            hex: shaded.hex,
            source: "word",
            matched: used.map(word => word.raw).join(" "),
          };
        }
      }
    }
  }
  return null;
}

/**
 * Stufe 6: ein zusammengeschriebenes deutsches Wort mit einer Grundfarbe am
 * Ende – „Himmelblau“, „Abendrot“, „Weißgold“. Steht davor ein
 * Helligkeitswort („Dunkeltürkis“, „Pastellgrün“), wirkt es wie in Stufe 5.
 * Hinterstes Wort zuerst, aus demselben Grund.
 */
function findCompoundWord(words: readonly Word[]): ResolvedColor | null {
  for (let index = words.length - 1; index >= 0; index--) {
    const word = words[index];
    for (const [base, hex] of COMPOUND_BASES) {
      if (!word.key.endsWith(base)) continue;
      const prefix = word.key.slice(0, -base.length);
      if (prefix.length < COMPOUND_MIN_PREFIX) continue;
      return {
        hex: shade(hex, prefix).hex,
        source: "word",
        matched: word.raw,
      };
    }
  }
  return null;
}

function computeColor(
  color: string,
  catalog: AppearanceCatalog
): ResolvedColor {
  const key = normalizeAppearanceName(color);
  if (!key) return UNKNOWN_COLOR;
  const own = catalog.colors.get(key);
  if (own) return { hex: own, source: "custom", matched: null };
  const builtin = BUILTIN_COLOR_BY_NAME.get(key);
  if (builtin) return { hex: builtin, source: "builtin", matched: null };
  const words = splitWords(color);
  return (
    findColorWord(words, catalog) ?? findCompoundWord(words) ?? UNKNOWN_COLOR
  );
}

/*
  Zwischenspeicher je Katalog: Die Übersicht fragt je Zeile und je Rendern,
  die Wortsuche ist teurer als ein Nachschlagen. Geschlüsselt am Objekt der
  eigenen Farben – ein neu geladener Katalog ist ein neues Objekt, der alte
  Speicher fällt mit ihm weg. Die Obergrenze fängt das Formular ab, das bei
  jedem Tastendruck einen neuen Namen fragt.
*/
const RESOLVED_CACHE_LIMIT = 2000;
const resolvedCache = new WeakMap<
  ReadonlyMap<string, string>,
  Map<string, ResolvedColor>
>();

/** Farbcode samt Herkunft zu einem Freitext-Farbnamen, eigene Einträge zuerst */
export function resolveColor(
  color: string | null | undefined,
  catalog: AppearanceCatalog = EMPTY_APPEARANCE_CATALOG
): ResolvedColor {
  if (!color) return UNKNOWN_COLOR;
  let cache = resolvedCache.get(catalog.colors);
  if (!cache) {
    cache = new Map();
    resolvedCache.set(catalog.colors, cache);
  }
  const cached = cache.get(color);
  if (cached) return cached;
  const resolved = computeColor(color, catalog);
  if (cache.size >= RESOLVED_CACHE_LIMIT) cache.clear();
  cache.set(color, resolved);
  return resolved;
}

/** Nur der Farbcode – für Aufrufer, die die Herkunft nicht brauchen */
export function resolveColorHex(
  color: string | null | undefined,
  catalog: AppearanceCatalog = EMPTY_APPEARANCE_CATALOG
): string | null {
  return resolveColor(color, catalog).hex;
}

export type ResolvedAppearance = {
  /** `null` = kein Farbcode bekannt; die Anzeige fällt auf das Rückfallfeld */
  hex: string | null;
  kind: TextureKind;
  /** Woher der Farbcode kommt; `null`, wenn es keinen gibt */
  source: ColorSource | null;
  /** Das gefundene Farbwort, nur bei `source === "word"` */
  matched: string | null;
};

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
  const resolved = resolveColor(color, catalog);
  return {
    hex: resolved.hex,
    kind: resolveTextureKind(texture, catalog),
    source: resolved.source,
    matched: resolved.matched,
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

/**
 * Name einer eigenen Farbe oder Oberfläche.
 *
 * **Begrenzt wird die Vergleichsform mit, nicht nur der eingetippte Name.** Die
 * Spalten `name` und `nameKey` sind beide `varchar(100)`, aber
 * `normalizeAppearanceName` macht aus jedem „ß" ein „ss" – der Schlüssel kann
 * also länger werden als der Name. „Weiß" fünfundzwanzigmal sind hundert
 * erlaubte Zeichen und ergeben einen Schlüssel aus hundertfünfundzwanzig.
 *
 * Ohne die zweite Prüfung liefe das in einen `22001` von Postgres, und der ist
 * hier kein erwarteter Fehler: `asConflict` (`api/appearanceRouter.ts`) kennt
 * nur `23505` und reichte alles andere roh weiter – samt SQL-Text und
 * Parametern. Genau der Weg, den die Fassung davor für doppelte Namen
 * geschlossen hat.
 */
export const appearanceNameSchema = z
  .string()
  .trim()
  .min(1, "Name ist erforderlich")
  .max(APPEARANCE_NAME_MAX, "Name ist zu lang")
  .refine(
    value => normalizeAppearanceName(value).length <= APPEARANCE_NAME_MAX,
    "Name ist zu lang"
  );
