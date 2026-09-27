# Plan: Farbbild und neue Oberflächen

Stand: 4.4.0. **Entwurf** – nichts davon ist umgesetzt. Die Punkte unter
„Offene Fragen“ am Ende sind vor Phase A zu entscheiden.

## Ziel

Bis 4.4.0 hat ein Material genau **eine** Farbe: Der Freitext
`material_products.color` wird über den Katalog (`BUILTIN_COLORS`, eigene
`custom_colors`) zu einem Farbcode aufgelöst, der Freitext `texture` zu einer
Musterart (`TEXTURE_KINDS`). Zwei Wünsche:

1. **Alle Farbvarianten pflegen können** – mehrfarbig, Farbverläufe, Farbwechsel
   unter Einwirkung (UV, Wärme, Infrarot …), leuchtend und was es sonst gibt.
2. **Neue Oberflächen** – Partikel wie Stein- oder Galaxy-Filament und
   gesprenkelte Oberflächen wie colorFabb stoneFill („Moss Green“: grüne Basis
   mit dunklen und hellen Einsprengseln, matt).

Was bleibt, wie es ist – das sind die tragenden Entscheidungen aus 2.7.0
(siehe `AGENTS.md`, „Farbe und Oberfläche als Darstellung“):

- `material_products.color` und `.texture` bleiben **Freitext**. Suche, Filter,
  Import, automatische Bezeichnung und Freundesansicht arbeiten weiter mit dem
  Namen.
- Die Darstellung entsteht beim **Anzeigen** über die Vergleichsform
  (`normalizeAppearanceName`), eigene Einträge schlagen den Katalog.
- **Ohne Farbcode wird nicht geraten.**
- **Der Name ist offen, die Zeichnung nicht** – neue Muster kommen als Code,
  nie als Zeichenanweisung aus der Datenbank.
- Das Muster bleibt auf jeder Grundfarbe sichtbar (`overlayInk`).

## Recherche: Welche Farbvarianten es gibt

Stand der Angebote 2026 (Bambu Lab, Polymaker/Panchroma, eSUN, Sunlu, Eryone,
colorFabb, Elegoo, Amolen u. a.). Zwei Achsen, die sich frei kombinieren:
**wie die Farben im Strang verteilt sind** (Anordnung) und **was die Farbe unter
Einwirkung tut** (Wirkung). Dazu kommt die Oberfläche als dritte, schon
vorhandene Achse.

### Anordnung – wie mehrere Farben im Strang liegen

| Anordnung                           | Was es ist                                                                                                                                     | Handelsnamen (Beispiele)                                                         | Farben                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------- |
| **Einfarbig**                       | Der Normalfall, heute schon abgedeckt                                                                                                          | –                                                                                | 1                      |
| **Koextrudiert** (zwei-/dreifarbig) | Der Querschnitt ist geteilt – zwei Hälften bzw. drei Keile. Welche Farbe man sieht, hängt von der Wandrichtung und dem Blickwinkel ab („Flip“) | Dual Color, Tri Color, Silk Dual, Silk Tri, Magic, Silk Multi-Color, Coextrusion | 2–3 (selten 4)         |
| **Farbverlauf**                     | Das Pigment wechselt fließend über mehrere Meter; ein Druck wird in der Höhe verlaufend                                                        | Gradient, Rainbow Gradient, Silk Gradient, Farbverlauf                           | 2–6                    |
| **Segmentiert**                     | Harte Wechsel in festen Abschnitten entlang des Strangs – deutliche Streifen im Druck                                                          | Rainbow, Multicolor, Segmentfilament                                             | 2–8                    |
| **Meliert / marmoriert**            | Zwei oder mehr Farben im Strang verwirbelt, ergibt Adern oder Wolken                                                                           | Marble, Marmor, Granit (auch Oberfläche, siehe unten)                            | 2–3                    |
| **Basis mit Farbpartikeln**         | Einfarbige Basis mit andersfarbigen Einsprengseln                                                                                              | Terrazzo, Sprinkle, Konfetti, stoneFill, Speckled                                | 1 + 1–4 Partikelfarben |

**Folgerung:** Eine Liste von Farben plus **eine** Anordnung. Meliert und
Partikel sind eher Oberfläche als Anordnung (die Verteilung ist zufällig, nicht
geordnet) – sie brauchen aber **Farben für die Partikel bzw. Adern**. Deshalb
trägt das Farbbild zusätzlich optionale **Akzentfarben**, die ein Muster
benutzen darf.

### Wirkung – Farbe, die sich unter Einwirkung ändert

| Wirkung                               | Auslöser                                             | Typisches Verhalten                                                                           | Handelsnamen                                             |
| ------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Photochrom**                        | UV / Sonnenlicht                                     | Wechselt draußen auf eine zweite Farbe (oft Weiß → Violett/Blau), zurück im Haus              | UV Color Change, UV Shift, Sonnenlicht-Farbwechsel       |
| **Thermochrom**                       | Wärme                                                | Wechselt ab einer Schwelle (meist rund 30 °C, auch 22 °C, 45 °C) – Handwärme genügt           | Temperature Color Change, Temp Shift, Chameleon (thermo) |
| **Nachleuchtend** (phosphoreszierend) | Lädt unter Licht, leuchtet im Dunkeln nach           | Leuchtfarbe weicht oft von der Tagfarbe ab (weiß → grün, beige → aqua); Füllstoff ist abrasiv | Glow in the Dark, Luminous, Nachtleuchtend               |
| **Fluoreszierend**                    | UV-A / Schwarzlicht                                  | Leuchtet grell unter Schwarzlicht, am Tag „Neon“; leuchtet **nicht** nach                     | Neon, Fluorescent, UV Reactive, Blacklight               |
| **Blickwinkelabhängig**               | Blickwinkel (Interferenzpigment, nicht koextrudiert) | Farbton kippt mit dem Winkel (Violett ↔ Grün), meist mit Silk-Glanz                           | Chameleon, Iridescent, Color Shift, Perlmutt-Effekt      |
| **Infrarot**                          | IR-Strahlung                                         | Sichtbar dunkel, für IR durchlässig (Sensorfenster, Fernbedienungen) – oder IR-reflektierend  | IR-transparent, IR-durchlässig                           |
| **Sonstige**                          | z. B. Wasser (hydrochrom), Druck                     | Selten; freie Beschreibung                                                                    | –                                                        |

Mehrere Wirkungen zugleich kommen vor – etwa „Glow + UV Color Change“ oder
„Starlight“ (nachleuchtend **und** glitzernd).

**Wichtig für die Zuordnung:** Heute steht „Neon“ als Oberfläche bei `glow`
(`BUILTIN_TEXTURES`). Das ist fachlich falsch – Neon ist fluoreszierend, nicht
nachleuchtend – und wird in Phase C korrigiert (siehe dort).

### Oberflächen – was heute fehlt

| Neue Musterart            | Was es ist                                                                                             | Namen im Katalog (DE / EN)                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **`speckle`** gesprenkelt | Matte, deckende Einsprengsel – Steinmehl, Granulat, Farbpartikel                                       | Gesprenkelt, Stein, Steinoptik, Granit, Terrazzo, Konfetti / Speckled, Stone, Stonefill, Granite, Terrazzo, Sprinkle, Rock |
| **`sparkle`** glitzernd   | Reflektierende Plättchen (Glimmer, Glitter) – funkeln je nach Licht; Galaxy = dunkle Basis mit Glitter | Glitzer, Glitzernd, Funkelnd, Galaxy, Sternenstaub / Sparkle, Glitter, Galaxy, Starlight, Stardust                         |
| **`marble`** marmoriert   | Adern oder Wolken in einer zweiten Farbe                                                               | Marmor, Marmoriert / Marble, Marbled                                                                                       |

Dazu Namen, die heute auf `plain` fallen, obwohl eine vorhandene Art passt:

| Name                                        | Musterart                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| Satin, Seidenmatt (schon da)                | `silk` bzw. `matte` – Satin liegt zwischen beiden; Vorschlag `silk`    |
| Perlmutt, Pearl, Pearlescent                | `silk`                                                                 |
| Transluzent, Translucent, Kristall, Crystal | `transparent`                                                          |
| Glasfaser, GF, Glass fibre                  | `carbon` (Fasergewebe als Chiffre) – oder `matte`, siehe offene Fragen |
| Kork, Cork, Bambus, Bamboo                  | `wood`                                                                 |
| Bronzefill, Copperfill, Metallfüllung       | `metallic`                                                             |

Bewusst **keine** eigene Art für Glasfaser, Hanf, Aero/Schaum (LW-PLA): Auf 24
Pixeln unterscheidet sie niemand von Matt oder Carbon, und jede Art kostet eine
Zeichnung, eine Übersetzung und einen Enum-Wert, der nie mehr verschwindet.

### Materialarten

Die Varianten sind beim **Filament** am größten. Harz kennt vor allem klar,
getönt, thermochrom und nachleuchtend; Pulver ist meist natur/grau/schwarz. Das
Modell gilt für alle drei gleich – es gibt keine Einschränkung nach
Materialart, so wie `FORMS_BY_KIND` nur sortiert und nicht filtert.

## Begriffe und Namen

| Oberfläche DE / EN                | Code                | Bedeutung                                                                 |
| --------------------------------- | ------------------- | ------------------------------------------------------------------------- |
| **Farbbild** / colour scheme      | `ColorSpec`         | Anordnung, Farben, Akzentfarben, Wirkungen einer eigenen Farbe            |
| **Anordnung** / layout            | `ColorLayout`       | `solid`, `coextruded`, `gradient`, `segmented`                            |
| **Leitfarbe** / main colour       | `custom_colors.hex` | Die erste Farbe; trägt Kontrast, Freundesansicht, Rückwärtskompatibilität |
| **Akzentfarben** / accent colours | `ColorSpec.accents` | Farben für Partikel, Glitter, Adern                                       |
| **Wirkung** / effect              | `ColorEffect`       | Farbwechsel oder Leuchten unter Einwirkung                                |

## Architektur-Entscheidung: Wo das Farbbild steht

Zwei Wege waren denkbar:

**A. Am Katalogeintrag (`custom_colors`) – empfohlen.** Der Farbname eines
Materials („Gold/Silber Dual“) findet wie bisher über die Vergleichsform zu
einem Eintrag, und der Eintrag trägt statt eines Farbcodes ein Farbbild.

- Passt zu allem, was 2.7.0 entschieden hat: kein Fremdschlüssel, Name bleibt
  Freitext, ein gelöschter Eintrag beschädigt kein Material.
- `material_products` bekommt **keine** Spalte. Import, Export der Materialien,
  Zusammenführen (`productKey`), Suche und Formular bleiben unverändert.
- Die Freundesansicht löst schon heute serverseitig über den Katalog des
  Eigentümers auf (`findAppearanceCatalogsForUsers`) – sie muss nur mehr
  mitnehmen.
- Das Formular hat den Weg bereits: „Farbe für ‚X‘ anlegen“ direkt am Feld
  (`MaterialFormDialog`, `addColorFor`). Der wird zum Farbbild-Editor; für den
  Benutzer fühlt es sich an wie „die Farbe dieses Materials festlegen“.
- Preis: Zwei Materialien mit demselben Farbnamen teilen sich ein Farbbild.
  Das ist heute bei einfarbigen genauso und gewollt („Schwarz“ ist überall
  Schwarz). Wer zwei verschiedene „Rainbow“ hat, nennt sie verschieden.

**B. Am Material (`material_products.colorSpec jsonb`).** Verworfen:

- Eine zweite Wahrheit neben Name + Katalog – welche gilt, wenn beides da ist?
- Jeder Lesepfad, der Freundes-Projektion (`toFriendMaterial`,
  Schlüsselmenge in `api/friendVisibility.test.ts`), `productKey` beim
  Zusammenführen, Import-Schema und Export müssten mitziehen.
- Ein Farbbild würde je Material neu gepflegt statt einmal je Name.

### Leitfarbe bleibt `custom_colors.hex`

`hex` bleibt `NOT NULL` und ist bei einem Farbbild **die erste Farbe**.
Geschrieben wird sie nur vom Server, abgeleitet aus dem Farbbild – die
Eingabe nimmt **entweder** `hex` (einfarbig) **oder** `spec`, beides zugleich
ist `BAD_REQUEST` (dasselbe Muster wie `material.create` mit `productId`).
Damit gibt es keine zweite Wahrheit, und alles, was nur eine Farbe braucht,
arbeitet unverändert weiter:

- `overlayInk` für einfarbige Flächen,
- `FriendMaterial.colorHex` (alte Clients, Sortierung),
- das kleine Feld dort, wo für mehr kein Platz ist,
- ein möglicher späterer Filter „Farbfamilie“.

## Datenmodell

### `contracts/appearance.ts`

```ts
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
  // neu (Phase A) – nur anhängen, Enum-Werte verschwinden nie
  "speckle",
  "sparkle",
  "marble",
] as const;

export const COLOR_LAYOUTS = [
  "solid",
  "coextruded",
  "gradient",
  "segmented",
] as const;

export const COLOR_EFFECT_KINDS = [
  "photochromic", // UV / Sonnenlicht
  "thermochromic", // Wärme
  "phosphorescent", // nachleuchtend
  "fluorescent", // Schwarzlicht / Neon
  "goniochromic", // Blickwinkel (Chamäleon, Iridescent)
  "infrared", // IR-durchlässig / -reaktiv
  "other",
] as const;

/** Eine Farbe im Farbbild; der Name ist nur für die Beschriftung */
const specColorSchema = z.object({
  hex: hexSchema,
  name: z.string().trim().max(APPEARANCE_NAME_MAX).optional(),
});

const colorEffectSchema = z.object({
  kind: z.enum(COLOR_EFFECT_KINDS),
  /** Farbe unter Einwirkung; fehlt bei „infrared“ und darf bei „other“ fehlen */
  to: specColorSchema.optional(),
  /** Nur thermochrom: Schwelle in ganzen °C */
  thresholdC: z.number().int().min(-40).max(150).optional(),
  note: z.string().trim().max(200).optional(),
});

export const colorSpecSchema = z
  .object({
    schemaVersion: z.literal(1),
    layout: z.enum(COLOR_LAYOUTS),
    colors: z.array(specColorSchema).min(1).max(8),
    accents: z.array(specColorSchema).max(4).default([]),
    effects: z.array(colorEffectSchema).max(4).default([]),
  })
  .superRefine(/* solid: genau 1 Farbe; coextruded: 2–4; gradient und
     segmented: 2–8; jede Wirkungsart höchstens einmal; `to` Pflicht außer bei
     infrared/other; thresholdC nur bei thermochromic */);
```

- **Alles ganzzahlig bzw. als `#rrggbb`**, wie die übrigen Werte.
- **`schemaVersion`** wie bei den Druckeinstellungen; ein gespeichertes Farbbild,
  das nicht mehr passt, wird beim Lesen `null` (`parseStoredColorSpec`, Vorbild
  `parseStoredPrintSettings`) – das Feld fällt dann auf die Leitfarbe zurück,
  statt die Übersicht scheitern zu lassen.
- **Die Farbnamen im Farbbild sind nur Beschriftung** (Hilfstechnik: „wechselt
  unter UV zu Violett“ statt „zu #7b3fb8“). Sie werden **nicht** aufgelöst –
  sonst hinge ein Farbbild an anderen Katalogeinträgen, und ein Umbenennen
  dort änderte es still.

`ResolvedAppearance` wächst:

```ts
export type ResolvedAppearance = {
  hex: string | null; // Leitfarbe, wie bisher
  kind: TextureKind; // wie bisher
  spec: ColorSpec | null; // neu; null = einfarbig bzw. unbekannt
};
```

`AppearanceCatalog.colors` wird von `Map<string, string>` zu
`Map<string, { hex: string; spec: ColorSpec | null }>`. Die Aufrufer von
`resolveColorHex` bleiben dieselben; `resolveColorSpec` kommt dazu.

### Mitgelieferter Katalog

`BuiltinColor` bekommt ein optionales `spec`. Neu im Code, ohne Migration:

| Schlüssel    | Namen                           | Farbbild                                            |
| ------------ | ------------------------------- | --------------------------------------------------- |
| `rainbow`    | Regenbogen, Rainbow, Multicolor | segmentiert: Rot, Orange, Gelb, Grün, Blau, Violett |
| `neonYellow` | Neongelb, Neon yellow           | einfarbig, fluoreszierend                           |
| `neonGreen`  | Neongrün, Neon green            | einfarbig, fluoreszierend                           |
| `neonOrange` | Neonorange, Neon orange         | einfarbig, fluoreszierend                           |
| `neonPink`   | Neonpink, Neon pink             | einfarbig, fluoreszierend                           |
| `glowGreen`  | Nachtleuchtend, Glow green      | Natur, nachleuchtend grün                           |

Nicht mehr: Verläufe und Duals sind **Herstellerfarben** („Dawn Radiance“,
„Gold/Silber“) und gehören in den eigenen Katalog. Der mitgelieferte folgt
weiter dem, was auf Etiketten steht, nicht einer Farbenlehre.

### `db/schema.ts`

```ts
// custom_colors
spec: jsonb("spec").$type<unknown>(),   // NULL = einfarbig
```

- **Eine nullable Spalte, kein Backfill.** Bestehende Zeilen sind einfarbig und
  bleiben es; drizzle-kit erzeugt die Migration vollständig
  (`0027_color_spec.sql`, Phase B), keine Handarbeit.
- `texture_kind` bekommt drei Werte (`ALTER TYPE … ADD VALUE`, Phase A,
  `0026_texture_kinds.sql`). Achtung: Ein neuer Enum-Wert ist erst nach dem
  Commit benutzbar; die Migration darf ihn also nicht selbst verwenden.
- **Keine eigene Tabelle** für Farben im Farbbild: höchstens 16 Einträge je
  Farbbild, nie einzeln abgefragt, immer als Ganzes gelesen und geschrieben.

### Obergrenzen

`MAX_CUSTOM_COLORS_PER_SCOPE` (200) bleibt; ein Farbbild ist durch das Schema
auf wenige hundert Bytes begrenzt. Keine neue Zugriffsbegrenzung – die Router
tragen schon die ihren.

## Zeichnung

Alles in `src/components/textures.tsx` bzw. einer neuen Nachbardatei
`colorSpec.tsx` (Defs + Grundfläche), benutzt von `AppearanceSwatch` und
`Spool`. Weiter **eine Zeichnung je Art**, im 24×24-Raum.

### Grundfläche nach Anordnung

| Anordnung    | Feld (24 px)                                          | Spulenkern                                    |
| ------------ | ----------------------------------------------------- | --------------------------------------------- |
| `solid`      | wie heute                                             | wie heute                                     |
| `coextruded` | Tortenstücke (2 Hälften / 3 Keile) als Pfade          | dieselben Keile – der Querschnitt des Strangs |
| `gradient`   | `linearGradient` diagonal, weiche Stopps              | dasselbe                                      |
| `segmented`  | harte Stopps (je Farbe zwei gleiche Stopps), diagonal | dasselbe                                      |

SVG kennt keinen konischen Verlauf; die Keile sind Kreissektoren als `<path>`,
geschnitten auf das Feld. Bei mehr als sechs Farben werden im 24er-Feld die
ersten sechs gezeigt, die Beschriftung nennt alle.

### Musterfarbe auf mehrfarbigem Grund

`overlayInk` garantiert heute ≥ 4,5:1 auf **einer** Grundfarbe. Auf einem
Verlauf von Schwarz nach Weiß gibt es keine Tinte, die überall reicht. Deshalb:

- **Bei `coextruded` und `segmented`** wird das Muster je Teilfläche mit deren
  eigener Tinte gezeichnet (Clip-Pfad je Keil/Band) – die Zusicherung gilt
  weiter je Fläche.
- **Bei `gradient`** nimmt `overlayInkFor(colors)` die Tinte mit dem größten
  **kleinsten** Kontrast über alle Stopps, und das Muster bekommt einen feinen
  Rand im Gegenton (`counterInk`). Neue Zusicherung in
  `api/appearance.test.ts`: An jedem Stopp erreicht Tinte **oder** Rand
  mindestens 4,5:1 – über ein Raster aus Zweier- und Dreierverläufen.

### Neue Muster (Phase A)

- **`speckle`**: 20–30 kleine Punkte unterschiedlicher Größe an **festen**
  Positionen (Konstante, kein Zufall zur Laufzeit – sonst flackerte das Muster
  bei jedem Rendern und wäre in Tests nicht prüfbar). Farben: die Akzentfarben
  des Farbbilds reihum; ohne Farbbild Tinte und Gegenton wie bei `carbon`
  (stoneFill hat dunkle **und** helle Einsprengsel). Dazu leicht mattes
  Rauschen wie `matte`.
- **`sparkle`**: wenige vierstrahlige Funkelsterne plus feine Punkte in der
  Tinte, die Punkte in den Akzentfarben (Galaxy mit Gold- und Silberglitter).
  Unterschied zu `speckle`: hell und spitz statt rund und matt.
- **`marble`**: zwei bis drei geschwungene Adern (`path`, weiche Strichbreite)
  in der ersten Akzentfarbe, sonst in der Tinte.
- **Bewegung nur auf Wunsch**: Ein Funkeln wäre verlockend, bleibt aber aus –
  die Übersicht zeigt Dutzende Spulen. Höchstens im großen Kern der
  Material-Seite, und dann nur ohne `prefers-reduced-motion`.

### Wirkungen (Phase C)

Auf 24 px ist kein Platz für eine Wirkung; sie steht dort nur in der
Beschriftung. Ab der Spule:

- **Abzeichen** am Rand des Kerns, je Wirkung ein Symbol aus `lucide-react`:
  `Sun` (photochrom), `Thermometer` (thermochrom), `Moon` (nachleuchtend),
  `Lightbulb` bzw. `Zap` (fluoreszierend), `Eye` (Blickwinkel), `Radio`
  (Infrarot), `Sparkles` (sonstige). Höchstens zwei sichtbar, sonst „+n“.
- **Vorschau-Umschalter** auf Material- und Gebindeseite: „Normal · UV ·
  Wärme · Dunkel · Schwarzlicht“ – tauscht die Farben gegen die `to`-Farben der
  jeweiligen Wirkung. Bei „Dunkel“ wird die Fläche abgedunkelt und die
  Leuchtfarbe als Hof gezeichnet (die heutige `glow`-Zeichnung, jetzt in der
  echten Leuchtfarbe statt in der Tinte). Rein zum Ansehen, nichts wird
  gespeichert.
- `goniochromic` wird im Normalzustand als weicher Zweifarbverlauf gezeichnet
  (Farbe → `to`), das ist dem Eindruck am nächsten.

### Beschriftung

`useSwatchLabel` bleibt die eine Stelle. Beispiel:

> Farbe Gold/Silber Dual, zweifarbig: Gold und Silber, Oberfläche Silk

> Farbe Weiß UV, wechselt unter UV zu Violett, leuchtet im Dunkeln grün

Namen aus `ColorSpec.colors[].name`, sonst die Namen des mitgelieferten
Katalogs, deren Farbcode exakt passt, sonst „Farbe 2“ – **nie** der Hexwert.
Texte in `src/messages/de.ts`/`en.ts` unter `appearance.layouts`,
`appearance.effects`, `appearance.labelEffect…`.

## Oberfläche (Bedienung)

### `/farben` (`src/pages/Appearance.tsx`)

- Der Dialog „Eigene Farbe“ bekommt oben die **Anordnung** als
  Segment-Auswahl (Einfarbig · Zweifarbig/Dreifarbig · Verlauf ·
  Segmente). Darunter die Farbliste: je Zeile Farbwähler (`<input
type="color">` wie heute) plus optionaler Name, Ziehen zum Umordnen,
  „Farbe hinzufügen“ bis zur Grenze der Anordnung.
- Aufklappbar „Partikel/Adern“ (Akzentfarben) und „Wirkungen“ (je Wirkung:
  Art, Farbe danach, bei Wärme die Schwelle, Notiz).
- Eine **große Vorschau** (Spule, 120 px) mit dem Vorschau-Umschalter, dazu
  die neue Oberfläche wählbar – der Benutzer sieht vor dem Speichern, wie das
  Regal es zeigen wird.
- Die Liste zeigt je Eintrag das Feld; mehrfarbige mit einem kleinen Hinweis
  („3 Farben“, Wirkungssymbole).
- Mobile zuerst: Die Farbliste ist eine Spalte; der Dialog scrollt, die
  Vorschau bleibt oben stehen (`sticky`).

### Materialformular (`MaterialFormDialog`)

- Unverändert: Freitextfeld Farbe mit Vorschlägen, Feld daneben.
- „Farbe für ‚X‘ anlegen“ öffnet **denselben** Farbbild-Dialog statt nur eines
  Farbwählers (eine Komponente `ColorSpecEditor`, zweimal benutzt).
- Ist die Farbe schon hinterlegt, gibt es daneben „Farbbild bearbeiten“ – mit
  dem Hinweis, dass das alle Materialien mit diesem Farbnamen betrifft (die
  Zahl liefert schon `countMaterialsWithAppearanceName`).
- Oberflächen-Vorschläge (`COMMON_TEXTURES`) um „Gesprenkelt“, „Glitzer“,
  „Galaxy“, „Marmor“, „Stein“ ergänzen.

### Übersicht

- Regal, Kacheln, Panel, Tabelle, Telefonliste: nur die Zeichnung ändert sich.
- **Filter „Wirkung“** neben dem Oberflächenfilter (UV, Wärme, nachleuchtend,
  Schwarzlicht …) – aufgelöst im Browser über den Katalog, wie die Farben.
  Erscheint nur, wenn im Bestand mindestens ein Material eine Wirkung hat.

## Freunde

Die Auflösung geschieht weiter auf dem Server (`toFriendMaterial`).
`FriendMaterial` bekommt **ein** Feld:

```ts
colorSpec: ColorSpec | null; // aus dem Katalog des Eigentümers
```

- Bewusst geändert: die Schlüsselmenge in `api/friendVisibility.test.ts` wird
  erweitert, mit Kommentar wie 2.7.0 bei `colorHex`/`textureKind`.
- Das Farbbild ist **Darstellung**, kein Bestandsdetail – es verrät nichts,
  was der Farbname nicht schon sagt. Die Wirkungsnotiz (`note`) ist Freitext
  eines Katalogeintrags; sie geht **nicht** hinaus (vor dem Projizieren
  entfernen), aus demselben Grund, aus dem `notes` nie hinausgeht.
- `findAppearanceCatalogsForUsers` lädt `spec` mit.

## Import und Export

- **Materialimport** (`contracts/import.ts`): unverändert – `farbe` bleibt der
  Name. Ein Farbbild legt man einmal auf `/farben` an.
- **Export** (`api/queries/account.ts`): `customColors` enthält `spec`
  (additiv, Version bleibt 5); `customTextures.kind` kann die neuen Werte
  tragen.

## Phasen

Jede Phase ist eine eigene Version mit Release Note, unabhängig auslieferbar.

### Phase A – Neue Oberflächen (4.5.0)

Klein, ohne Farbbild, sofort nützlich.

1. `TEXTURE_KINDS` + `speckle`, `sparkle`, `marble`; Migration `ADD VALUE`.
2. `BUILTIN_TEXTURES` und `COMMON_TEXTURES` um die Namen oben (inkl. der
   Zuordnungen Satin, Perlmutt, Transluzent, Kork …). Die bestehende
   Zusicherung in `api/appearance.test.ts` (jeder Vorschlag wird gezeichnet)
   deckt die neuen Vorschläge ohne Änderung mit ab.
3. Zeichnungen in `textures.tsx` (Tinte/Gegenton, feste Punktlisten).
4. `appearance.kinds` in `de.ts`/`en.ts`.
5. Enum-Liste in `api/postgres.integration.test.ts` nachziehen.
6. Tests: jede Art hat Defs **oder** Overlay (Schutz gegen ein vergessenes
   `case`), die Namenszuordnung, Eindeutigkeit der Namen.

### Phase B – Farbbild: Anordnung, mehrere Farben, Akzentfarben (4.6.0)

1. `colorSpecSchema`, `parseStoredColorSpec`, `resolveColorSpec`,
   `overlayInkFor` in `contracts/appearance.ts` – mit Wirkungen schon im
   Schema (Version 1), damit Phase C keine Schemaversion braucht.
2. Spalte `custom_colors.spec`, Migration.
3. `appearance.createColor`/`updateColor`: **entweder** `hex` **oder** `spec`;
   Leitfarbe serverseitig abgeleitet. Stufe `editor` wie bisher.
4. Katalog im Client (`useAppearanceCatalog`) und für Freunde mit `spec`.
5. Grundflächen je Anordnung in Feld und Spule; Muster je Teilfläche.
6. `ColorSpecEditor` auf `/farben` und im Materialformular.
7. Beschriftung (`useSwatchLabel`), `FriendMaterial.colorSpec`,
   `api/friendVisibility.test.ts`, Export.
8. Mitgeliefert: `rainbow`.
9. Tests: Schema (Grenzen je Anordnung, `hex` xor `spec`), Rückfall bei
   unlesbarem Farbbild, Kontrastzusicherung für Verläufe, Integrationstest
   Anlegen/Ändern/Freundesansicht.

### Phase C – Wirkungen (4.7.0)

1. Editor-Abschnitt „Wirkungen“.
2. Abzeichen an der Spule, Vorschau-Umschalter auf Material- und
   Gebindeseite, `glow`-Hof in der Leuchtfarbe.
3. Filter „Wirkung“ in der Übersicht.
4. Mitgeliefert: die Neon- und Nachtleucht-Einträge.
5. **„Neon“ verlässt `glow`.** Als Oberfläche löst „Neon“ danach auf `plain`
   auf, als **Farbe** gibt es die fluoreszierenden Katalogeinträge. Das ändert
   die Darstellung bestehender Materialien mit Oberfläche „Neon“ (Hof
   verschwindet) – in der Release Note erwähnen. `COMMON_TEXTURES` führt
   „Neon“ nicht, die Zusicherung in `api/appearance.test.ts` bleibt grün.
6. `note` wird in der Freundes-Projektion entfernt – Test dafür.

### Phase D (optional) – Zwei Oberflächen zugleich

„Silk Glitter“, „Matt Galaxy“, „Marmor glänzend“ sind heute **eine** Art. Wenn
die Nachfrage kommt: `custom_textures.secondKind texture_kind NULL`, mit der
Regel „eine Glanz-Art (`matte`, `glossy`, `silk`, `metallic`, `transparent`)
plus eine Struktur-Art (`speckle`, `sparkle`, `marble`, `carbon`, `wood`)“.
Gezeichnet wird Struktur unter Glanz. `ResolvedAppearance.kind` wird zu
`kinds: TextureKind[]`. Nicht vorher – jede Stelle, die heute eine Art
nimmt, müsste mit.

## Was sonst mitzieht (leicht vergessen)

- `AGENTS.md`: Abschnitt „Farbe und Oberfläche als Darstellung“ um Farbbild,
  Leitfarbe, Wirkungen und die angepasste Kontrastregel ergänzen; Projektstruktur
  (`colorSpec.tsx`).
- `api/postgres.integration.test.ts`: Enum-Werte von `texture_kind`.
- `api/friendVisibility.test.ts`: Schlüsselmenge (Phase B), `note` (Phase C).
- `api/account.integration.test.ts`: nichts – keine neue Tabelle, keine neue
  Benutzerspalte.
- `COUNTED_TABLES`: nichts – keine neue Tabelle.
- `PRIVACY.md`: nichts Neues – Farbbilder sind Katalogdaten ohne Personenbezug
  über den Eigentümer hinaus.
- Release Notes (englisch) je Phase; Screenshots der neuen Spulen.

## Tests (Übersicht)

| Test                                 | Phase | Prüft                                                                                  |
| ------------------------------------ | ----- | -------------------------------------------------------------------------------------- |
| `api/appearance.test.ts`             | A–C   | neue Arten, Namen, Schema, Rückfall, Kontrast auf Verläufen, Label-Texte ohne Hexwerte |
| `api/friendVisibility.test.ts`       | B, C  | `colorSpec` drin, `note` draußen                                                       |
| `api/appearance.integration.test.ts` | B     | `hex` xor `spec`, abgeleitete Leitfarbe, Bereichsgrenze                                |
| `api/postgres.integration.test.ts`   | A     | Enum-Werte                                                                             |

## Offene Fragen

1. **Glasfaser (GF)** als `carbon` (Faser-Chiffre) oder `matte`? Vorschlag
   `carbon` – „Faser drin“ ist die Aussage, die jemand am Regal sucht.
2. **Zusammengesetzte Farbnamen** („Rot/Blau“) automatisch als zweifarbig
   auflösen, wenn jeder Teil bekannt ist? Kein Raten eines Farbtons, aber
   Raten der Anordnung – und „Blau-Grün“ meint meist Petrol, nicht zwei
   Farben. Vorschlag: nur mit „/“ als Trenner, Anordnung `coextruded`, und erst
   nach Phase B entscheiden.
3. **Satin** als `silk` oder eigene Art? Vorschlag `silk`; eine eigene Art erst,
   wenn jemand den Unterschied im Regal vermisst.
4. **Hinweis „abrasiv“** für nachleuchtende und Partikel-Filamente (gehärtete
   Düse) – gehört eher zu den Druckeinstellungen als zur Farbe. Außerhalb
   dieses Plans; als Idee festgehalten.
5. **Farbbild am Material statt am Katalog** (Weg B) – falls sich zeigt, dass
   Benutzer je Material ein eigenes Farbbild wollen, ohne sich einen Namen
   auszudenken. Dann als Überschreibung **zusätzlich** zum Katalog, nicht
   statt seiner.
