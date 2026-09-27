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
  /*
    „Neon“ stand bis 4.7.0 hier. Neon ist fluoreszierend – grell am Tag,
    leuchtend unter Schwarzlicht –, nicht nachleuchtend. Seit 4.8.0 ist es
    eine Farbe mit Wirkung („Neongelb“, „Neon green“ in
    `contracts/colorNames.ts`), als Oberfläche zeichnet es nichts mehr.
  */
  {
    kind: "glow",
    names: ["Leuchtend", "Nachleuchtend", "Glow", "Glow in the dark"],
  },
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

/** Ein Treffer im Katalog: die Leitfarbe und, wenn es eines gibt, das Farbbild */
type CatalogHit = { readonly hex: string; readonly spec: ColorSpec | null };

const BUILTIN_COLOR_BY_NAME = new Map<string, CatalogHit>(
  BUILTIN_COLORS.flatMap(color =>
    color.names.map(
      name =>
        [
          normalizeAppearanceName(name),
          { hex: color.hex, spec: color.spec ?? null },
        ] as const
    )
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
 *
 * `colorSpecs` (seit 4.7.0) führt nur die Einträge mit Farbbild; `colors`
 * trägt für **jeden** Eintrag die Leitfarbe. Zwei Maps statt einer mit
 * Objekten, damit alles, was nur eine Farbe braucht, unverändert bleibt.
 */
export type AppearanceCatalog = {
  readonly colors: ReadonlyMap<string, string>;
  readonly textures: ReadonlyMap<string, TextureKind>;
  readonly colorSpecs?: ReadonlyMap<string, ColorSpec>;
};

export const EMPTY_APPEARANCE_CATALOG: AppearanceCatalog = {
  colors: new Map(),
  textures: new Map(),
};

function ownHit(key: string, catalog: AppearanceCatalog): CatalogHit | null {
  const hex = catalog.colors.get(key);
  return hex ? { hex, spec: catalog.colorSpecs?.get(key) ?? null } : null;
}

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
  4. zusammengesetzter Name („Rot/Blau“)          → `compound` (seit 4.7.0)
  5. längster bekannter Teilausdruck              → `word`
  6. deutsches Kompositum über die Endung         → `word`

  Die Lücke in der Zählung ist Absicht: Stufe 3 (RAL-Nummern) folgt, siehe
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

type BuiltinWordEntry = CatalogHit & { readonly weak: boolean };

const BUILTIN_COLOR_BY_PHRASE = new Map<string, BuiltinWordEntry>(
  BUILTIN_COLORS.flatMap(color =>
    color.names.map(
      name =>
        [
          phraseKey(name),
          {
            hex: color.hex,
            spec: color.spec ?? null,
            weak: color.weak === true,
          },
        ] as const
    )
  )
);

/**
 * Die Endungen, längste zuerst – „violett“ muss vor einem denkbaren „ett“
 * geprüft werden, und die Reihenfolge soll nicht davon abhängen, wie jemand
 * die Liste sortiert.
 */
const COMPOUND_BASES: readonly (readonly [string, string])[] =
  COMPOUND_BASE_WORDS.flatMap(word => {
    const hit = BUILTIN_COLOR_BY_NAME.get(word);
    return hit ? [[word, hit.hex] as const] : [];
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

/** Die Mischung, die ein Helligkeitswort verlangt, oder `null` */
function shadeOf(modifier: string | undefined) {
  if (modifier && LIGHTER.has(modifier)) {
    return (hex: string) => mixHex(hex, INK_LIGHT, LIGHTER_MIX);
  }
  if (modifier && DARKER.has(modifier)) {
    return (hex: string) => mixHex(hex, INK_DARK, DARKER_MIX);
  }
  return null;
}

/** Die eigenen Einträge als Wortfolgen – je Katalog einmal gebaut */
const customPhraseCache = new WeakMap<
  AppearanceCatalog,
  ReadonlyMap<string, CatalogHit>
>();

function customByPhrase(
  catalog: AppearanceCatalog
): ReadonlyMap<string, CatalogHit> {
  const cached = customPhraseCache.get(catalog);
  if (cached) return cached;
  const built = new Map<string, CatalogHit>();
  for (const [nameKey, hex] of catalog.colors) {
    const key = phraseKey(nameKey);
    if (key && !built.has(key)) {
      built.set(key, { hex, spec: catalog.colorSpecs?.get(nameKey) ?? null });
    }
  }
  customPhraseCache.set(catalog, built);
  return built;
}

/**
 * Woher ein Farbcode kommt. `word` heißt „aus einem Teil des Namens“,
 * `compound` „aus mehreren Farbnamen zusammengesetzt“ – der Ton bzw. das
 * Farbbild ist dann ungefähr, und das Formular bietet an, es genau
 * festzulegen.
 */
export type ColorSource = "custom" | "builtin" | "compound" | "word";

export type ResolvedColor = {
  /**
   * Leitfarbe; `null` = kein Farbcode bekannt, die Anzeige fällt auf das
   * Rückfallfeld. Bei einem Farbbild die erste bekannte Farbe.
   */
  readonly hex: string | null;
  readonly source: ColorSource | null;
  /** Das gefundene Farbwort in der Schreibweise der Eingabe, bei `word` und `compound` */
  readonly matched: string | null;
  /** Das Farbbild, wenn es mehr als eine Leitfarbe zu zeigen gibt */
  readonly spec: ResolvedColorSpec | null;
};

const UNKNOWN_COLOR: ResolvedColor = {
  hex: null,
  source: null,
  matched: null,
  spec: null,
};

/** Treffer → Ergebnis, mit Helligkeitswort auf Leitfarbe und Farbbild */
function fromHit(
  hit: CatalogHit,
  source: ColorSource,
  matched: string | null,
  shade: ((hex: string) => string) | null = null
): ResolvedColor {
  const spec = hit.spec ? toResolvedSpec(hit.spec) : null;
  if (!shade) return { hex: hit.hex, source, matched, spec };
  return {
    hex: shade(hit.hex),
    source,
    matched,
    spec: spec && {
      ...spec,
      colors: spec.colors.map(stop => ({
        ...stop,
        hex: stop.hex && shade(stop.hex),
      })),
    },
  };
}

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
  const own = customByPhrase(catalog);
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
          let hit: CatalogHit | undefined;
          if (source === "custom") {
            hit = own.get(key);
          } else {
            const found = BUILTIN_COLOR_BY_PHRASE.get(key);
            if (found && (allowWeak || !found.weak)) hit = found;
          }
          if (!hit) continue;
          /*
            Deckt die Wortfolge den ganzen Namen ab („Dark-Green“ statt „Dark
            green“), ist es kein Teiltreffer, sondern nur eine andere
            Schreibweise – dann auch keine Rückfrage im Formular.
          */
          if (length === words.length) return fromHit(hit, source, null);
          const before = words[start - 1];
          const shade = shadeOf(before?.key);
          const used = shade ? [before, ...phrase] : phrase;
          return fromHit(
            hit,
            "word",
            used.map(word => word.raw).join(" "),
            shade
          );
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
      return fromHit({ hex, spec: null }, "word", word.raw, shadeOf(prefix));
    }
  }
  return null;
}

/** Ein einzelner Name über die Stufen 1, 2, 5 und 6 – ohne Zerlegen */
function resolveSingle(
  color: string,
  catalog: AppearanceCatalog
): ResolvedColor {
  const key = normalizeAppearanceName(color);
  if (!key) return UNKNOWN_COLOR;
  const own = ownHit(key, catalog);
  if (own) return fromHit(own, "custom", null);
  const builtin = BUILTIN_COLOR_BY_NAME.get(key);
  if (builtin) return fromHit(builtin, "builtin", null);
  const words = splitWords(color);
  return (
    findColorWord(words, catalog) ?? findCompoundWord(words) ?? UNKNOWN_COLOR
  );
}

// ---------------------------------------------------------------------------
// Zusammengesetzte Namen (seit 4.7.0, Stufe 4)
// ---------------------------------------------------------------------------

/*
  „Rot/Blau“, „Gold & Silber“, „Red to Blue“: mehrere Farbnamen in einem.
  Daraus wird ein berechnetes Farbbild – nie gespeichert; wer es anders will,
  legt den ganzen Namen als eigene Farbe an und schlägt damit diese Stufe.

  Die Trenner sind nicht gleich sicher, und das ist die ganze Kunst hier:

  - **Zeichen** (`/`, `+`, `&`, `|`) meinen fast immer „und noch eine Farbe“.
    Es genügt, wenn ein Teil bekannt ist; ein unbekannter erscheint als
    schraffiertes Stück. Nur mit gleichem Abstand auf beiden Seiten – sonst
    wäre „PLA+ Black“ zweifarbig.
  - **Wörter und Bindestrich** (`,`, „und“, „and“, „-“, „zu“, „to“, „bis“,
    „→“) meinen oft anderes: „Dark-Green“ ist eine Farbe, „Green Glow in the
    Dark“ kein Verlauf. Hier müssen **alle** Teile bekannt sein.

  Teile, die Oberflächenwörter sind („Black, matte“), fallen vorher weg.
*/

const SYMBOL_SPLIT = /(?<=\S)[/+&|](?=\S)|\s+[/+&|]\s+/;
const GRADIENT_SPLIT = /\s*(?:→|->)\s*|\s+(?:zu|to|bis)\s+/i;
const WORD_SPLIT = /\s*,\s*|\s+(?:und|and)\s+|\s*-\s*/i;

/** Schlüsselwörter der Anordnung, in Farb- oder Oberflächenname (Vergleichsform als Wortfolge) */
const LAYOUT_WORDS: readonly (readonly [ColorLayout, RegExp])[] = [
  [
    "coextruded",
    /\b(?:dual|tri|quad|tetra|zweifarbig|dreifarbig|vierfarbig|bi ?colou?r|tri ?colou?r|quad ?colou?r|magic|coextrusion|koextrudiert|[234] ?(?:colou?r|farbig))\b/,
  ],
  ["gradient", /\b(?:gradient|verlauf|farbverlauf|ombre)\b/],
  [
    "segmented",
    /\b(?:segment|segmente|segmented|segmentiert|multi ?colou?r|mehrfarbig)\b/,
  ],
];

/**
 * Dieselben Schlüsselwörter in der Schreibweise der Eingabe – sie werden vor
 * dem Zerlegen entfernt, sonst hätte „Dual Rot/Blau“ drei Teile.
 */
const LAYOUT_WORDS_RAW =
  /(?<![\p{L}\d])(?:dual|tri|quad|tetra|zweifarbig|dreifarbig|vierfarbig|bi-?colou?r|tri-?colou?r|quad-?colou?r|magic|coextrusion|koextrudiert|gradient|farbverlauf|verlauf|ombr[eé]|segmente|segmented|segmentiert|segment|multi-?colou?r|mehrfarbig|[234][ -]?(?:colou?r|farbig))(?![\p{L}\d])/giu;

function layoutFromWords(text: string): ColorLayout | null {
  const key = phraseKey(text);
  for (const [layout, pattern] of LAYOUT_WORDS) {
    if (pattern.test(key)) return layout;
  }
  return null;
}

function isTextureName(part: string, catalog: AppearanceCatalog): boolean {
  const key = normalizeAppearanceName(part);
  return catalog.textures.has(key) || BUILTIN_TEXTURE_BY_NAME.has(key);
}

function findCompoundName(
  color: string,
  texture: string | null | undefined,
  catalog: AppearanceCatalog
): ResolvedColor | null {
  const stripped = color.replace(LAYOUT_WORDS_RAW, " ").trim();
  const attempts: {
    readonly split: RegExp;
    readonly allKnown: boolean;
    readonly layout: ColorLayout | null;
  }[] = [
    { split: SYMBOL_SPLIT, allKnown: false, layout: null },
    { split: GRADIENT_SPLIT, allKnown: true, layout: "gradient" },
    { split: WORD_SPLIT, allKnown: true, layout: null },
  ];
  for (const attempt of attempts) {
    const parts = stripped
      .split(attempt.split)
      .map(part => part.trim())
      .filter(part => part.length > 0 && !isTextureName(part, catalog));
    if (parts.length < 2) continue;
    const resolved = parts.map(part => ({
      raw: part,
      color: resolveSingle(part, catalog),
    }));
    const known = resolved.filter(part => part.color.hex != null);
    if (known.length === 0) continue;
    if (attempt.allKnown && known.length < resolved.length) continue;

    const explicit =
      layoutFromWords(color) ?? (texture ? layoutFromWords(texture) : null);
    let layout: ColorLayout =
      explicit ??
      attempt.layout ??
      (resolved.length <= COLOR_LAYOUT_LIMITS.coextruded.max
        ? "coextruded"
        : "segmented");
    if (layout === "solid") layout = "coextruded";
    if (resolved.length > COLOR_LAYOUT_LIMITS[layout].max) {
      layout = "segmented";
    }
    const stops = resolved.slice(0, COLOR_LAYOUT_LIMITS[layout].max);
    return {
      hex: known[0].color.hex,
      source: "compound",
      matched: stops.map(part => part.raw).join(" / "),
      spec: {
        layout,
        colors: stops.map(part => ({ hex: part.color.hex, name: part.raw })),
        accents: [],
        effects: [],
      },
    };
  }
  return null;
}

function computeColor(
  color: string,
  texture: string | null | undefined,
  catalog: AppearanceCatalog
): ResolvedColor {
  const key = normalizeAppearanceName(color);
  if (!key) return UNKNOWN_COLOR;
  const own = ownHit(key, catalog);
  if (own) return fromHit(own, "custom", null);
  const builtin = BUILTIN_COLOR_BY_NAME.get(key);
  if (builtin) return fromHit(builtin, "builtin", null);
  return (
    findCompoundName(color, texture, catalog) ?? resolveSingle(color, catalog)
  );
}

/*
  Zwischenspeicher je Katalog: Die Übersicht fragt je Zeile und je Rendern,
  die Wortsuche ist teurer als ein Nachschlagen. Geschlüsselt am Katalog – ein
  neu geladener ist ein neues Objekt, der alte Speicher fällt mit ihm weg. Die
  Obergrenze fängt das Formular ab, das bei jedem Tastendruck einen neuen
  Namen fragt.
*/
const RESOLVED_CACHE_LIMIT = 2000;
const resolvedCache = new WeakMap<
  AppearanceCatalog,
  Map<string, ResolvedColor>
>();

/**
 * Farbcode samt Herkunft und Farbbild zu einem Freitext-Farbnamen, eigene
 * Einträge zuerst.
 *
 * `texture` ist nur für die Anordnung eines zusammengesetzten Namens da:
 * „Gold/Silber“ mit der Oberfläche „Silk Dual“ ist koextrudiert, mit
 * „Gradient“ ein Verlauf.
 */
export function resolveColor(
  color: string | null | undefined,
  catalog: AppearanceCatalog = EMPTY_APPEARANCE_CATALOG,
  texture?: string | null
): ResolvedColor {
  if (!color) return UNKNOWN_COLOR;
  let cache = resolvedCache.get(catalog);
  if (!cache) {
    cache = new Map();
    resolvedCache.set(catalog, cache);
  }
  const cacheKey = texture ? `${color}\u0000${texture}` : color;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const resolved = computeColor(color, texture, catalog);
  if (cache.size >= RESOLVED_CACHE_LIMIT) cache.clear();
  cache.set(cacheKey, resolved);
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
  /** Leitfarbe; `null` = kein Farbcode bekannt, die Anzeige fällt auf das Rückfallfeld */
  hex: string | null;
  kind: TextureKind;
  /** Woher der Farbcode kommt; `null`, wenn es keinen gibt */
  source: ColorSource | null;
  /** Das gefundene Farbwort, bei `word` und `compound` */
  matched: string | null;
  /** Das Farbbild, wenn es mehr als die Leitfarbe gibt */
  spec: ResolvedColorSpec | null;
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
  const resolved = resolveColor(color, catalog, texture);
  return {
    hex: resolved.hex,
    kind: resolveTextureKind(texture, catalog),
    source: resolved.source,
    matched: resolved.matched,
    spec: resolved.spec,
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

// ---------------------------------------------------------------------------
// Farbbild (seit 4.7.0)
// ---------------------------------------------------------------------------

/*
  Bis 4.6.0 hatte eine Farbe genau einen Farbcode. Ein Farbbild beschreibt,
  was darüber hinausgeht: mehrere Farben und wie sie im Strang liegen, Farben
  für Partikel und Adern (die Muster „gesprenkelt“, „glitzernd“,
  „marmoriert“ zeichnen darin) und Wirkungen unter Einwirkung (UV, Wärme,
  Dunkelheit – gezeichnet erst ab Phase D des Plans, im Schema aber schon
  jetzt, damit dafür keine zweite Schemaversion nötig wird).

  Es hängt am **Katalogeintrag** (`custom_colors.spec`), nicht am Material:
  Der Name bleibt Freitext, die Darstellung kommt wie bisher über die
  Vergleichsform. Begründung in `docs/plan-farbbild-oberflaechen.md`
  („Architektur-Entscheidung“).
*/

export const COLOR_LAYOUTS = [
  "solid",
  "coextruded",
  "gradient",
  "segmented",
] as const;

export type ColorLayout = (typeof COLOR_LAYOUTS)[number];

/**
 * Wie viele Farben je Anordnung – an **einer** Stelle, gelesen von Schema,
 * Editor und Namensauflösung. Koextrudiert bis vier (Dual, Tri, Quad), Verlauf
 * und Segmente bis acht: mehr unterscheidet auf einer Spule niemand.
 */
export const COLOR_LAYOUT_LIMITS: Readonly<
  Record<ColorLayout, { readonly min: number; readonly max: number }>
> = {
  solid: { min: 1, max: 1 },
  coextruded: { min: 2, max: 4 },
  gradient: { min: 2, max: 8 },
  segmented: { min: 2, max: 8 },
};

/** Höchstens so viele Partikel- bzw. Aderfarben */
export const COLOR_ACCENTS_MAX = 4;

export const COLOR_EFFECT_KINDS = [
  "photochromic", // UV / Sonnenlicht
  "thermochromic", // Wärme
  "phosphorescent", // nachleuchtend
  "fluorescent", // Schwarzlicht / Neon
  "goniochromic", // Blickwinkel (Chamäleon, Iridescent)
  "infrared", // IR-durchlässig / -reaktiv
  "other",
] as const;

export type ColorEffectKind = (typeof COLOR_EFFECT_KINDS)[number];

export const COLOR_EFFECTS_MAX = 4;

/** Wirkungen, die keine Zielfarbe brauchen */
const EFFECTS_WITHOUT_TARGET: ReadonlySet<ColorEffectKind> = new Set([
  "infrared",
  "other",
]);

/**
 * Eine Farbe im Farbbild. Der Name ist **nur Beschriftung** (Hilfstechnik:
 * „wechselt unter UV zu Violett“ statt „zu #7b3fb8“) und wird nicht
 * aufgelöst – sonst hinge ein Farbbild an anderen Katalogeinträgen, und ein
 * Umbenennen dort änderte es still.
 */
export const specColorSchema = z.object({
  hex: hexSchema,
  name: z.string().trim().max(APPEARANCE_NAME_MAX).optional(),
});

export const colorEffectSchema = z.object({
  kind: z.enum(COLOR_EFFECT_KINDS),
  /** Farbe unter Einwirkung; fehlt bei „infrared“, darf bei „other“ fehlen */
  to: specColorSchema.optional(),
  /** Nur thermochrom: Schwelle in ganzen °C */
  thresholdC: z.number().int().min(-40).max(150).optional(),
  note: z.string().trim().max(200).optional(),
});

export type ColorEffect = z.infer<typeof colorEffectSchema>;

export const COLOR_SPEC_VERSION = 1;

export const colorSpecSchema = z
  .object({
    schemaVersion: z.literal(COLOR_SPEC_VERSION),
    layout: z.enum(COLOR_LAYOUTS),
    colors: z.array(specColorSchema).min(1).max(8),
    accents: z.array(specColorSchema).max(COLOR_ACCENTS_MAX).default([]),
    effects: z.array(colorEffectSchema).max(COLOR_EFFECTS_MAX).default([]),
  })
  .superRefine((spec, ctx) => {
    const { min, max } = COLOR_LAYOUT_LIMITS[spec.layout];
    if (spec.colors.length < min || spec.colors.length > max) {
      ctx.addIssue({
        code: "custom",
        path: ["colors"],
        message:
          min === max
            ? `Diese Anordnung hat genau ${min} Farbe`
            : `Diese Anordnung hat ${min} bis ${max} Farben`,
      });
    }
    const kinds = new Set<string>();
    spec.effects.forEach((effect, index) => {
      if (kinds.has(effect.kind)) {
        ctx.addIssue({
          code: "custom",
          path: ["effects", index, "kind"],
          message: "Jede Wirkung höchstens einmal",
        });
      }
      kinds.add(effect.kind);
      if (!effect.to && !EFFECTS_WITHOUT_TARGET.has(effect.kind)) {
        ctx.addIssue({
          code: "custom",
          path: ["effects", index, "to"],
          message: "Farbe unter Einwirkung fehlt",
        });
      }
      if (effect.thresholdC !== undefined && effect.kind !== "thermochromic") {
        ctx.addIssue({
          code: "custom",
          path: ["effects", index, "thresholdC"],
          message: "Eine Schwelle gibt es nur bei Wärme",
        });
      }
    });
  });

/** Ein Farbbild, wie es gespeichert und geschickt wird */
export type ColorSpec = z.output<typeof colorSpecSchema>;
export type ColorSpecInput = z.input<typeof colorSpecSchema>;

/**
 * Ein gespeichertes Farbbild lesen. Was nicht (mehr) zum Schema passt, wird
 * `null` – das Feld fällt dann auf die Leitfarbe zurück, statt die Übersicht
 * scheitern zu lassen. Vorbild `parseStoredPrintSettings`.
 */
export function parseStoredColorSpec(raw: unknown): ColorSpec | null {
  if (raw == null) return null;
  const parsed = colorSpecSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Trägt das Farbbild etwas, das die Leitfarbe allein nicht sagt? Eine
 * einzelne Farbe ohne Partikel und Wirkung ist nur ein Farbcode und wird als
 * solcher gespeichert – eine Wahrheit, nicht zwei.
 */
export function colorSpecIsTrivial(spec: ColorSpec): boolean {
  return (
    spec.layout === "solid" &&
    spec.accents.length === 0 &&
    spec.effects.length === 0
  );
}

/** Eine Farbe eines aufgelösten Farbbilds; `hex: null` = unbekannter Teil */
export type ColorStop = { readonly hex: string | null; readonly name?: string };

/**
 * Das Farbbild, wie die Zeichnung es braucht. Anders als `ColorSpec` darf eine
 * Farbe unbekannt sein: Ein zusammengesetzter Name wie „Rot/Xyz“ zeigt das
 * unbekannte Stück schraffiert.
 */
export type ResolvedColorSpec = {
  readonly layout: ColorLayout;
  readonly colors: readonly ColorStop[];
  /** Partikel- und Aderfarben als `#rrggbb` */
  readonly accents: readonly string[];
  readonly effects: readonly ColorEffect[];
};

export function toResolvedSpec(spec: ColorSpec): ResolvedColorSpec {
  return {
    layout: spec.layout,
    colors: spec.colors.map(color => ({ hex: color.hex, name: color.name })),
    accents: spec.accents.map(accent => accent.hex),
    effects: spec.effects,
  };
}

/**
 * Die Musterfarbe über **mehreren** Grundfarben: die, deren **kleinster**
 * Kontrast über alle Farben am größten ist. Auf einem Verlauf von Schwarz
 * nach Weiß gibt es keine, die überall 4,5:1 schafft – dort zeichnet die
 * Oberfläche zusätzlich einen Rand im Gegenton (`textures.tsx`).
 * Unbekannte Farben zählen nicht mit.
 */
export function overlayInkFor(colors: readonly (string | null)[]): OverlayInk {
  const known = colors.filter((hex): hex is string => hex != null);
  if (known.length === 0) return INK_DARK;
  const worst = (ink: string) =>
    Math.min(...known.map(hex => contrastRatio(hex, ink)));
  return worst(INK_LIGHT) >= worst(INK_DARK) ? INK_LIGHT : INK_DARK;
}

// ---------------------------------------------------------------------------
// Wirkungen zeigen (seit 4.8.0)
// ---------------------------------------------------------------------------

/*
  Eine Wirkung ändert die Farbe unter einer Bedingung – im Regal sieht man
  den Normalzustand, auf Material- und Gebindeseite lässt sich umschalten
  („Normal · UV · Wärme · Dunkel · Schwarzlicht“). Rein zum Ansehen; nichts
  wird gespeichert. Die Rechnung steht hier, damit Feld, Spule und Tests
  dieselbe benutzen.
*/

export const EFFECT_CONDITIONS = [
  "normal",
  "uv",
  "heat",
  "dark",
  "blacklight",
] as const;

export type EffectCondition = (typeof EFFECT_CONDITIONS)[number];

/** Welche Wirkung eine Bedingung zeigt */
const CONDITION_EFFECT: Readonly<
  Record<Exclude<EffectCondition, "normal">, ColorEffectKind>
> = {
  uv: "photochromic",
  heat: "thermochromic",
  dark: "phosphorescent",
  blacklight: "fluorescent",
};

/** Anteil Schwarz, mit dem „im Dunkeln“ die Grundfarbe abgedunkelt wird */
const DARK_MIX = 0.75;

function effectOf(
  spec: ResolvedColorSpec | null | undefined,
  kind: ColorEffectKind
): ColorEffect | undefined {
  return spec?.effects.find(effect => effect.kind === kind);
}

/**
 * Die Bedingungen, unter denen sich dieses Farbbild zeigen lässt – immer
 * „normal“, dazu jede Wirkung mit Zielfarbe. Infrarot und „Sonstiges“ haben
 * keine Ansicht, nur ein Abzeichen und die Beschriftung.
 */
export function availableConditions(
  spec: ResolvedColorSpec | null | undefined
): EffectCondition[] {
  return EFFECT_CONDITIONS.filter(
    condition =>
      condition === "normal" || effectOf(spec, CONDITION_EFFECT[condition])?.to
  );
}

export type DisplayedColor = {
  /** Leitfarbe unter der Bedingung */
  readonly hex: string | null;
  readonly spec: ResolvedColorSpec | null;
  /** Leuchtfarbe, wenn das Stück unter der Bedingung selbst leuchtet */
  readonly glow: string | null;
};

/**
 * Wie ein Farbbild unter einer Bedingung aussieht.
 *
 * - **normal:** wie gespeichert. Einzige Ausnahme: Eine Farbe, die mit dem
 *   Blickwinkel kippt (goniochrom), steht als weicher Verlauf zur zweiten da –
 *   dem Eindruck am nächsten, den so eine Spule im Regal macht.
 * - **UV, Wärme:** die ganze Fläche in der Zielfarbe; Partikelfarben bleiben.
 * - **Schwarzlicht:** die Zielfarbe, und sie leuchtet.
 * - **Dunkel:** die Grundfarbe fast schwarz, darüber das Leuchten in der
 *   Leuchtfarbe. Ohne Wirkung dieser Art bliebe es beim Normalzustand –
 *   `availableConditions` bietet die Bedingung dann gar nicht erst an.
 */
export function displayUnder(
  hex: string | null,
  spec: ResolvedColorSpec | null | undefined,
  condition: EffectCondition
): DisplayedColor {
  const base = spec ?? null;
  if (condition === "normal") {
    const angle = effectOf(base, "goniochromic");
    const single = !base || base.layout === "solid";
    if (hex && angle?.to && single) {
      return {
        hex,
        spec: {
          layout: "gradient",
          colors: [{ hex }, { hex: angle.to.hex, name: angle.to.name }],
          accents: base?.accents ?? [],
          effects: base?.effects ?? [],
        },
        glow: null,
      };
    }
    return { hex, spec: base, glow: null };
  }

  const effect = effectOf(base, CONDITION_EFFECT[condition]);
  if (!effect?.to) return { hex, spec: base, glow: null };
  const to = effect.to.hex;
  const accents = base?.accents ?? [];

  if (condition === "dark") {
    const darken = (value: string) => mixHex(value, INK_DARK, DARK_MIX);
    return {
      hex: hex && darken(hex),
      spec: base && {
        ...base,
        colors: base.colors.map(stop => ({
          ...stop,
          hex: stop.hex && darken(stop.hex),
        })),
        accents: base.accents.map(darken),
      },
      glow: to,
    };
  }

  return {
    hex: to,
    spec:
      accents.length > 0
        ? { layout: "solid", colors: [{ hex: to }], accents, effects: [] }
        : null,
    glow: condition === "blacklight" ? to : null,
  };
}

/** Die Arten der Wirkungen eines Farbbilds, in der Reihenfolge der Liste */
export function effectKindsOf(
  spec: ResolvedColorSpec | null | undefined
): ColorEffectKind[] {
  const present = new Set(spec?.effects.map(effect => effect.kind));
  return COLOR_EFFECT_KINDS.filter(kind => present.has(kind));
}
