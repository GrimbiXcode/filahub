# Plan: Farbbild und neue Oberflächen

Stand: 4.5.0. Die Grundsatzfragen sind entschieden (siehe „Entscheidungen“ am
Ende); offen sind nur noch die Punkte unter „Offene Fragen“. **Phase A ist
umgesetzt** (4.5.0), **Phase B ohne RAL** (4.6.0), **Phase C** (4.7.0); RAL,
D und E stehen aus.

## Stand der Umsetzung

**Phase A (4.5.0)** – Abweichungen vom Entwurf und was er offenließ:

- **`TEXTURE_KIND_CHOICES`** für die Auswahl auf `/farben`: `TEXTURE_KINDS`
  folgt dem Postgres-Enum, und dort hängen neue Werte hinten an – Satin stünde
  sonst hinter Marmor statt zwischen Matt und Silk.
- **Die Enum-Werte prüft `api/appearance.integration.test.ts`**, nicht
  `api/postgres.integration.test.ts`: Letzterer führt nur Enum-**Namen**. Der
  neue Test vergleicht die Werte der Datenbank mit `TEXTURE_KINDS` und legt
  vor 0026 eine `carbon`-Zeile an. Gegengeprüft: Mit der von drizzle-kit
  erzeugten Fassung scheitert er an `invalid input value for enum
texture_kind: "carbon"`.
- **`textureOverlay` bekommt den Gegenton** als vierten Parameter – der
  Sprenkel zeichnet dunkle und helle Punkte zugleich.
- **Die Sterne von `sparkle` liegen im Ring zwischen Nabe und Kernrand** –
  der erste Entwurf hatte einen Stern in der Mitte, den die Nabe verdeckte.
- **Test „jede Art hat Defs oder Overlay“ entfällt.** Er müsste
  `src/components/textures.tsx` aus `api/` laden, das dortige TypeScript-Projekt
  kennt kein JSX. Ersatz: Jede Art außer `plain` hat mindestens einen
  Katalognamen (Unit-Test), und die Zeichnungen wurden für alle 13 Arten auf
  sieben Grundfarben in beiden Farbschemata angesehen.
- `COMMON_TEXTURES` führt „Faserverstärkt“ statt „Carbon“, dazu Satin,
  Gesprenkelt, Stein, Glitzer, Galaxy und Marmor.

**Phase B (4.6.0), ohne RAL** – RAL (Stufe 3) kommt als eigener Schritt,
sobald die Quelle der Farbwerte geklärt ist (Entscheidung vom 27.09.2026:
„erst ohne RAL“). Abweichungen und was der Entwurf offenließ:

- **Wortschatz in eigener Datei** `contracts/colorNames.ts`;
  `contracts/appearance.ts` reicht `BUILTIN_COLORS` weiter. 27 → 150 Einträge.
- **Schwache Farbwörter** (`weak`), im Entwurf nicht bedacht: Transparent,
  Klar und Natur stehen auf Etiketten auch als Beschreibung. Ohne die Regel
  wäre „Red Transparent“ klar statt rot.
- **Eigene Einträge vor mitgelieferten bei gleicher Länge**, vor der Regel
  „hinterstes Wort“: Wer „Savanne“ selbst angelegt hat, meint in „Savanne
  Gelb“ seinen Eintrag.
- **Deckt ein Teilausdruck den ganzen Namen ab** („Dark-Green“), gilt er als
  ganzer Name (`builtin`/`custom`) und löst keine Rückfrage aus.
- **Das Formular sagt „‚X‘ genau festlegen“** statt „hinterlegen“, wenn der
  Ton erkannt wurde; der Farbwähler steht auf dem erkannten Ton. Gespeichert
  wird wie bisher eine eigene Farbe – Stufe 1 schlägt danach die Wortsuche.
- **Bis Phase C** ergab „Rot/Blau“ über die Wortsuche Blau (hinterstes Wort),
  nicht zwei Farben.

**Phase C (4.7.0)** – Abweichungen und was der Entwurf offenließ:

- **Katalog mit zweiter Map** (`AppearanceCatalog.colorSpecs`) statt
  `colors: Map<string, {hex, spec}>`: Alles, was nur die Leitfarbe braucht,
  blieb unverändert.
- **Trenner nach Sicherheit gestaffelt**, im Entwurf nicht bedacht: Zeichen
  (`/ + & |`) mit einem bekannten Teil, Wörter und Bindestrich nur mit lauter
  bekannten. Sonst wurden „Dark-Green“, „Black, matte“, „Back to Black“ und
  „Green Glow in the Dark“ mehrfarbig. Zeichen nur mit gleichem Abstand auf
  beiden Seiten („PLA+ Black“). Oberflächenwörter fallen als Teil weg. „ in “
  und „ x “ sind **keine** Trenner (Glow in the Dark, 1 x 1 kg), „bis“ schon.
- **Die erste Farbe links bzw. oben links** – in der ersten Fassung begann
  der erste Keil oben und lief nach rechts, „Rot/Blau“ stand als Blau/Rot da.
- **Die Spule verteilt Streifen und Verläufe über ihren sichtbaren Kern**
  (`inset`); vorher zeigte sie vom Regenbogen zwei Farben.
- **Der Rand im Gegenton nur bei Mustern aus einzelnen Formen**; bei
  Flächenmustern (Rauschen, Glanz, Schachbrett) machte er aus Glanz Grau.
- **Wirkungsnotizen verlassen den Server schon jetzt nicht** (der Entwurf sah
  das für Phase D vor): Das Schema kennt `note` seit 4.7.0, also gilt der
  Riegel ab da.
- **Beschriftung ohne Namenssuche im Katalog über den Farbcode** (Entwurf:
  „Namen des mitgelieferten Katalogs, deren Farbcode exakt passt“): Die
  Namen dort sind deutsch und englisch gemischt, und die Sprache wäre
  geraten. Statt dessen „Farbe 2“, und ohne einen einzigen Namen „6 Farben“.
- **Editor im Formular eingebettet**, kein zweiter Dialog über dem ersten
  (dieselbe Begründung wie beim Farbwähler bis 4.6.0); Reihenfolge per Knopf
  statt Ziehen.
- **Der Regenbogen hört auf „Regenbogen“ und „Rainbow“**, nicht auf
  „Multicolor“ – das ist ein Schlüsselwort der Anordnung.

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
3. **Beschreibende Farbnamen erkennen** – „Savanna Yellow“, „Earth Brown“,
   „Charcoal Black“ sollen ohne eigenen Katalogeintrag als Gelb, Braun, Schwarz
   erscheinen, und „Rot/Blau“ als zweifarbig.

Was bleibt, wie es ist – das sind die tragenden Entscheidungen aus 2.7.0
(siehe `AGENTS.md`, „Farbe und Oberfläche als Darstellung“):

- `material_products.color` und `.texture` bleiben **Freitext**. Suche, Filter,
  Import, automatische Bezeichnung und Freundesansicht arbeiten weiter mit dem
  Namen.
- Die Darstellung entsteht beim **Anzeigen** über die Vergleichsform
  (`normalizeAppearanceName`), eigene Einträge schlagen den Katalog.
- **Ohne Farbwort wird nicht geraten.** Bis 4.4.0 hieß die Regel „ohne
  Farbcode“; mit Wunsch 3 wird sie präziser: Ein Farbton entsteht nur aus einem
  Farbwort, das **im Namen steht** („Yellow“ in „Savanna Yellow“). Ein Name
  ohne bekanntes Farbwort („Dawn Radiance“) bleibt schraffiert – kein Hash,
  kein Zufall.
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

| Anordnung                               | Was es ist                                                                                                                                                   | Handelsnamen (Beispiele)                                                                                | Farben                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------- |
| **Einfarbig**                           | Der Normalfall, heute schon abgedeckt                                                                                                                        | –                                                                                                       | 1                      |
| **Koextrudiert** (zwei- bis vierfarbig) | Der Querschnitt ist geteilt – zwei Hälften, drei Keile oder vier Viertel. Welche Farbe man sieht, hängt von der Wandrichtung und dem Blickwinkel ab („Flip“) | Dual Color, Tri Color, Quad Color, Silk Dual, Silk Tri, Silk Quad, Magic, Silk Multi-Color, Coextrusion | 2–4                    |
| **Farbverlauf**                         | Das Pigment wechselt fließend über mehrere Meter; ein Druck wird in der Höhe verlaufend                                                                      | Gradient, Rainbow Gradient, Silk Gradient, Farbverlauf                                                  | 2–6                    |
| **Segmentiert**                         | Harte Wechsel in festen Abschnitten entlang des Strangs – deutliche Streifen im Druck                                                                        | Rainbow, Multicolor, Segmentfilament                                                                    | 2–8                    |
| **Meliert / marmoriert**                | Zwei oder mehr Farben im Strang verwirbelt, ergibt Adern oder Wolken                                                                                         | Marble, Marmor, Granit (auch Oberfläche, siehe unten)                                                   | 2–3                    |
| **Basis mit Farbpartikeln**             | Einfarbige Basis mit andersfarbigen Einsprengseln                                                                                                            | Terrazzo, Sprinkle, Konfetti, stoneFill, Speckled                                                       | 1 + 1–4 Partikelfarben |

**Folgerung:** Eine Liste von Farben plus **eine** Anordnung. Meliert und
Partikel sind eher Oberfläche als Anordnung (die Verteilung ist zufällig, nicht
geordnet) – sie brauchen aber **Farben für die Partikel bzw. Adern**. Deshalb
trägt das Farbbild zusätzlich optionale **Akzentfarben**, die ein Muster
benutzen darf.

### Wirkung – Farbe, die sich unter Einwirkung ändert

| Wirkung                               | Auslöser                                             | Typisches Verhalten                                                                          | Handelsnamen                                             |
| ------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Photochrom**                        | UV / Sonnenlicht                                     | Wechselt draußen auf eine zweite Farbe (oft Weiß → Violett/Blau), zurück im Haus             | UV Color Change, UV Shift, Sonnenlicht-Farbwechsel       |
| **Thermochrom**                       | Wärme                                                | Wechselt ab einer Schwelle (meist rund 30 °C, auch 22 °C, 45 °C) – Handwärme genügt          | Temperature Color Change, Temp Shift, Chameleon (thermo) |
| **Nachleuchtend** (phosphoreszierend) | Lädt unter Licht, leuchtet im Dunkeln nach           | Leuchtfarbe weicht oft von der Tagfarbe ab (weiß → grün, beige → aqua)                       | Glow in the Dark, Luminous, Nachtleuchtend               |
| **Fluoreszierend**                    | UV-A / Schwarzlicht                                  | Leuchtet grell unter Schwarzlicht, am Tag „Neon“; leuchtet **nicht** nach                    | Neon, Fluorescent, UV Reactive, Blacklight               |
| **Blickwinkelabhängig**               | Blickwinkel (Interferenzpigment, nicht koextrudiert) | Farbton kippt mit dem Winkel (Violett ↔ Grün), meist mit Silk-Glanz                          | Chameleon, Iridescent, Color Shift, Perlmutt-Effekt      |
| **Infrarot**                          | IR-Strahlung                                         | Sichtbar dunkel, für IR durchlässig (Sensorfenster, Fernbedienungen) – oder IR-reflektierend | IR-transparent, IR-durchlässig                           |
| **Sonstige**                          | z. B. Wasser (hydrochrom), Druck                     | Selten; freie Beschreibung                                                                   | –                                                        |

Mehrere Wirkungen zugleich kommen vor – etwa „Glow + UV Color Change“ oder
„Starlight“ (nachleuchtend **und** glitzernd).

**Wichtig für die Zuordnung:** Heute steht „Neon“ als Oberfläche bei `glow`
(`BUILTIN_TEXTURES`). Das ist fachlich falsch – Neon ist fluoreszierend, nicht
nachleuchtend – und wird in Phase D korrigiert (siehe dort).

### Oberflächen – was heute fehlt

| Neue Musterart            | Was es ist                                                                                             | Namen im Katalog (DE / EN)                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **`speckle`** gesprenkelt | Matte, deckende Einsprengsel – Steinmehl, Granulat, Farbpartikel                                       | Gesprenkelt, Stein, Steinoptik, Granit, Terrazzo, Konfetti / Speckled, Stone, Stonefill, Granite, Terrazzo, Sprinkle, Rock |
| **`sparkle`** glitzernd   | Reflektierende Plättchen (Glimmer, Glitter) – funkeln je nach Licht; Galaxy = dunkle Basis mit Glitter | Glitzer, Glitzernd, Funkelnd, Galaxy, Sternenstaub / Sparkle, Glitter, Galaxy, Starlight, Stardust                         |
| **`marble`** marmoriert   | Adern oder Wolken in einer zweiten Farbe                                                               | Marmor, Marmoriert / Marble, Marbled                                                                                       |
| **`satin`** Satin         | Weicher, breiter Schimmer ohne harte Kante – zwischen Matt und Silk                                    | Satin, Seidenmatt, Satiniert / Satin, Satin finish                                                                         |

**`carbon` wird zu `fiber` – „Faserverstärkt“.** Kohlefaser ist nur eine von
mehreren Verstärkungen; Glas-, Aramid-(Kevlar-), Basalt- und Aluminiumfasern
sehen im Regal gleich aus und sind dieselbe Aussage („Faser drin“). Die Art heißt in der Oberfläche **Faserverstärkt / Fibre
reinforced** und findet:

| Namen (DE / EN)                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------- |
| Faserverstärkt, Faser, Carbon, Karbon, Kohlefaser, Carbonfaser, Glasfaser, Aramid, Kevlar, Basaltfaser, Aluminiumfaser, CF, GF, AF |
| Fibre reinforced, Fiber reinforced, Fibre, Fiber, Carbon fibre, Carbon fiber, Glass fibre, Glass fiber, Aramid fibre, Basalt fibre |

Dazu Namen, die heute auf `plain` fallen, obwohl eine vorhandene Art passt:

| Name                                        | Musterart     |
| ------------------------------------------- | ------------- |
| Perlmutt, Pearl, Pearlescent                | `silk`        |
| Transluzent, Translucent, Kristall, Crystal | `transparent` |
| Kork, Cork, Bambus, Bamboo                  | `wood`        |
| Bronzefill, Copperfill, Metallfüllung       | `metallic`    |

**„Seidenmatt“ wandert von `matte` zu `satin`** – es ist die wörtliche
Übersetzung. Bestehende Materialien mit dieser Oberfläche zeigen danach den
Schimmer statt des Rauschens; das gehört in die Release Note.

Bewusst **keine** eigene Art für Hanf oder Aero/Schaum (LW-PLA): Auf 24 Pixeln
unterscheidet sie niemand von Matt oder Faserverstärkt, und jede Art kostet
eine Zeichnung, eine Übersetzung und einen Enum-Wert, der nie mehr
verschwindet.

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
| **Farbwort** / colour word        | `COLOR_WORDS`       | Bekannter Farbname, der in einem längeren Namen gefunden wird             |
| **Herkunft** / source             | `ColorSource`       | Wie die Farbe gefunden wurde: eigen, Katalog, Farbwort, zusammengesetzt   |

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

## Farbnamen erkennen

Heute findet `resolveColorHex` nur den **ganzen** Namen: „Gelb“ ja, „Savanna
Yellow“ nein – obwohl das Farbwort darin steht. Herstellerfarben sind fast
immer so gebaut: ein Bild plus ein Farbwort („Earth Brown“, „Charcoal Black“,
„Jade White“, „Sky Blue“, „Mandarin Orange“, „Tannengrün“, „Signalrot“).

### Die Auflösung in Stufen

Eine Funktion, `resolveColor(name, catalog)` in `contracts/appearance.ts`, die
erste Stufe mit Treffer gewinnt:

| Stufe | Was                                                  | Beispiel                                     | Herkunft   |
| ----- | ---------------------------------------------------- | -------------------------------------------- | ---------- |
| 1     | Ganzer Name, eigener Katalog                         | „Savanne“ → eigener Eintrag                  | `custom`   |
| 2     | Ganzer Name, mitgelieferter Katalog samt Farbwörtern | „Charcoal“, „Oliv“, „Petrol“, „Verkehrsrot“  | `builtin`  |
| 3     | RAL-Nummer im Namen (siehe „RAL-Farben“)             | „RAL 9005“, „Signalgelb RAL 1003“            | `ral`      |
| 4     | Zusammengesetzter Name (siehe unten)                 | „Rot/Blau“, „Savanna Yellow & Earth Brown“   | `compound` |
| 5     | Längster bekannter Teilausdruck                      | „Savanna **Yellow**“, „Matte **Dark Green**“ | `word`     |
| 6     | Deutsches Kompositum über die Endung                 | „Himmel**blau**“, „Signal**rot**“            | `word`     |
| –     | nichts gefunden                                      | „Dawn Radiance“                              | `null`     |

- **Stufe 3 vor 4:** Eine RAL-Nummer ist eine genaue Angabe und schlägt jede
  Wortsuche („Rot RAL 5002“ ist Blau). Stufe 3 greift aber nur, wenn der Name
  **genau eine** Nummer enthält; bei zwei und mehr („RAL 9005 / RAL 1003“)
  übernimmt Stufe 4 und löst jeden Teil einzeln über Stufe 3 auf – sonst
  gewänne die erste Nummer, und das Filament wäre einfarbig.
- **Stufe 5:** Der Name wird in Wörter zerlegt (Leerraum, Bindestrich, Punkt,
  Klammern); gesucht wird über alle zusammenhängenden Wortfolgen, **die
  längste gewinnt**, bei Gleichstand die **hinterste** – im Deutschen wie im
  Englischen steht das Farbwort am Ende („Earth Brown“, nicht „Brown Earth“).
  Eigene Einträge gehen bei gleicher Länge vor. So findet „Matte Dark Green“
  den Katalogeintrag „Dark green“ und nicht bloß „Green“.
- **Stufe 6:** Ein einzelnes Wort, das in keiner Stufe passt, wird auf das
  längste bekannte Farbwort am **Ende** geprüft; der Rest muss mindestens drei
  Buchstaben haben. „Himmelblau“ → Blau, „Weinrot“ → Rot. Steht davor ein
  Helligkeitswort („Pastellgrün“, „Dunkeltürkis“), gilt es wie unten.
- **Helligkeitswörter** (Hell/Light/Pale/Pastell/Pastel, Dunkel/Dark/Deep/Tief)
  verschieben den Grundton, wenn es keinen eigenen Eintrag für die Kombination
  gibt: hell = 40 % zu Weiß gemischt, dunkel = 35 % zu Schwarz. Eine feste
  Rechnung, kein Raten – und nur, wenn das Farbwort selbst gefunden wurde.
- **Keine Oberflächenwörter als Farbe.** „Stone“, „Galaxy“, „Silk“, „Marble“,
  „Glow“, „Matte“ stehen nicht im Farbwortschatz, sonst würde „Stone Grey“ zu
  einem Steinton statt zu Grau. Metallwörter (Gold, Silber, Kupfer, Bronze)
  bleiben Farben – sie sind beides.
- **Zwischengespeichert** je Vergleichsform (eine `Map` im Resolver des
  Clients bzw. je Anfrage auf dem Server); die Übersicht fragt je Zeile.

### Wortschatz

`BUILTIN_COLORS` wächst von 27 auf rund 150 Einträge, weiter mit deutschem und
englischem Namen je Eintrag. Quellen:

- **Die benannten Farben aus CSS** (W3C, frei verwendbar): Olive, Teal, Navy,
  Coral, Salmon, Khaki, Ivory, Lavender, Crimson, Indigo, Plum, Chocolate …
  Nicht alle 148 – „PapayaWhip“ steht auf keiner Rolle; die Auswahl folgt wie
  bisher den Etiketten.
- **Typische Wörter von Filament-Etiketten**, die in CSS fehlen: Charcoal,
  Anthracite, Graphite, Slate, Ash, Nardo, Titanium, Gunmetal, Bone, Cream,
  Champagne, Sand, Desert, Latte, Caramel, Mocha, Coffee, Terracotta, Rust,
  Brick, Wine, Burgundy, Cherry, Ruby, Scarlet, Sakura, Blush, Peach, Apricot,
  Mandarin, Mustard, Lemon, Mint, Sage, Jade, Emerald, Forest, Army, Moss,
  Petrol, Aqua, Ice, Sky, Ocean, Marine, Cobalt, Royal, Midnight, Lilac,
  Violet, Grape …
- **Deutsche Gegenstücke**: Oliv, Petrol, Koralle, Lachs, Elfenbein, Creme,
  Champagner, Schiefer, Graphit, Titan, Schokolade, Mokka, Karamell,
  Terrakotta, Rost, Ziegelrot, Weinrot, Kirschrot, Rubin, Karmin, Purpur,
  Pfirsich, Aprikose, Senf, Ocker, Zitronengelb, Minze, Salbei, Jade,
  Smaragd, Moosgrün, Olivgrün, Himmelblau, Eisblau, Königsblau, Kobaltblau,
  Mitternachtsblau, Flieder, Lavendel, Pflaume, Blaugrün (Petrol) …
- **Nur Deutsch und Englisch.** Weitere Sprachen bleiben vorerst offen (siehe
  „Offene Fragen“); die Einträge sind so gebaut, dass eine dritte Sprache nur
  Namen anhängt.
- **Eine Zusicherung** in `api/appearance.test.ts`: eine Tabelle echter
  Herstellerfarben (Bambu, Polymaker, Prusament, eSUN, Sunlu, Elegoo, Extrudr,
  colorFabb) mit dem erwarteten Katalogschlüssel – „Savanna Yellow“ →
  `yellow`, „Earth Brown“ → `brown`, „Charcoal Black“ → `black` … – und eine
  zweite mit Namen, die **nichts** finden dürfen („Dawn Radiance“, „Galaxy“,
  „Stone“). Wer den Wortschatz erweitert, sieht dort, was sich verschiebt.

### RAL-Farben (Stufe 3)

Einige Hersteller benennen nach RAL (Extrudr, Filamentworld, Formfutura bei
Industriefarben), und wer Teile zu einem Gehäuse oder einer Maschine druckt,
sucht genau danach. Zwei Register, beide im Code, ohne Migration:

- **RAL Classic** (rund 215 Farben, vierstellig: „RAL 3020“). Eine Tabelle
  `RAL_CLASSIC` in eigener Datei `contracts/ral.ts`: Nummer, deutscher und
  englischer Name, sRGB-Näherung. Die Namen („Verkehrsrot“ / „Traffic red“)
  gehen zusätzlich in den Farbwortschatz – „Verkehrsrot“ ohne Nummer findet
  damit Stufe 2.
- **RAL Design System+** (siebenstellig, „RAL 210 50 15“ = Farbton, Helligkeit,
  Buntheit). Braucht **keine Tabelle**: Die drei Zahlen sind die CIE-LCh-Werte
  der Farbe, der Farbcode wird gerechnet (LCh → Lab → XYZ → sRGB, D65).
  `ralDesignToHex` samt Test gegen eine Handvoll veröffentlichter Werte.
- **RAL Effect** (Metallic-Farbtöne, dreistellig + Zusatz) bleibt draußen –
  auf Filament kaum anzutreffen, und die Werte gibt es nur als Tabelle.
- **Erkennung:** `RAL` (Groß/klein egal) gefolgt von vier Ziffern bzw. drei
  Dreiergruppen, mit oder ohne Leerraum („RAL9005“, „ral 9005“, „RAL
  210-50-15“), irgendwo im Namen. Eine unbekannte Classic-Nummer findet
  nichts und läuft weiter in die Wortsuche – „RAL 3020 Verkehrsrot“ trifft
  dann eben über „Verkehrsrot“ oder „rot“.
- **Näherung, und das wird gesagt.** RAL-Farben sind als Farbmuster
  definiert, jeder sRGB-Wert ist eine Umrechnung. Das Formular zeigt „RAL
  3020 Verkehrsrot“ ohne „ungefähr“ – genauer als die Tabelle geht es am
  Bildschirm nicht –, die Verwaltung erklärt es in einem Satz.
- **Rechtslage vor der Umsetzung prüfen:** „RAL“ ist eine Marke der RAL
  gGmbH. Nummern und Farbnamen als Bezeichnung zu verwenden ist üblich
  (Lackhersteller, Wikipedia führt die Tabelle); die sRGB-Werte stammen aus
  frei verfügbaren Umrechnungen, nicht aus lizenzierten RAL-Daten. Die Quelle
  steht als Kommentar über der Tabelle. Pantone bleibt draußen – dort sind
  die Werte selbst lizenziert.
- **Im Farb-Dialog** ein Feld „RAL-Nummer“: Eingabe „3020“ füllt Farbcode und
  Vorschlag für den Namen. Die eigene Farbe speichert wie immer nur Name und
  Farbcode – die Nummer ist Eingabehilfe, keine Spalte.

### Zusammengesetzte Namen (Stufe 4)

„Sofern möglich“ heißt konkret:

- **Trenner:** `/`, `+`, `&`, `|`, `,`, „ und “, „ and “, „ x “. Ein
  **Bindestrich** trennt nur, wenn der ganze Name vorher in Stufe 1/2 nicht
  gefunden wurde – „Blau-Grün“ steht als Petrol im Katalog und kommt deshalb
  nie hier an, „Rot-Blau“ schon.
- **Verlaufswörter:** „ zu “, „ to “, „→“, „ in “ („Red to Blue“, „Blau in
  Violett“) trennen ebenfalls und ergeben einen **Verlauf**.
- **Jeder Teil** wird über die Stufen 1, 2, 3, 5 und 6 aufgelöst („Savanna
  Yellow / Earth Brown“ und „RAL 9005 / RAL 1003“ gehen also).
- **Anordnung** aus Schlüsselwörtern in Farb- **oder** Oberflächenname:
  - koextrudiert: Dual, Zweifarbig, Bicolor, Tri, Dreifarbig, Tricolor,
    Quad, Vierfarbig, Quadcolor, Tetra, Magic, Coextrusion, „2-Color“,
    „3-Color“, „4-Color“ (auch „2-farbig“ usw.)
  - Verlauf: Gradient, Verlauf, Farbverlauf, Ombre
  - segmentiert: Segment, Multicolor

  Ohne Schlüsselwort: **zwei bis vier Teile → koextrudiert**, fünf und mehr →
  segmentiert. Die Schlüsselwörter werden vor dem Zerlegen entfernt („Dual
  Rot/Blau“ hat zwei Teile, nicht drei).

- **Passt die Zahl nicht zum Schlüsselwort** („Tri“ mit zwei Teilen), gilt die
  Zahl der Teile – das Schlüsselwort bestimmt nur die Anordnung, nicht wie
  viele Farben es gibt.
- **Mindestens ein Teil muss bekannt sein.** Ein unbekannter Teil erscheint
  als schraffiertes Stück im Feld – die ehrliche Lücke wie bisher, nur
  kleiner. Kein Teil bekannt → weiter mit Stufe 5.
- Das Ergebnis ist ein **berechnetes Farbbild** (`ColorSpec` ohne Namen,
  Leitfarbe = erster bekannter Teil). Es wird nie gespeichert; wer es anders
  will, legt den Namen als eigene Farbe an und schlägt damit Stufe 4.

### Oberfläche

- Das Feld zeigt eine über Farbwort erkannte Farbe **wie jede andere** – die
  Übersicht soll nicht mit Hinweisen übersät sein.
- **Im Materialformular** steht bei Herkunft `word` oder `compound` unter dem
  Feld: „Erkannt aus ‚Yellow‘ – ungefähr. **Genau festlegen**“. Der Knopf
  öffnet den Farb-Dialog, vorbelegt mit dem erkannten Ton (ab Phase C den
  Farbbild-Dialog, vorbelegt mit dem berechneten Farbbild).
  Bisher erschien „Farbe anlegen“ nur ohne Farbcode (`MaterialFormDialog`,
  `appearance.hex == null`); diese Bedingung wird zu „Herkunft ist `word`,
  `compound` oder keine“. Bei `ral` steht statt dessen die Nummer samt Namen
  („RAL 3020 Verkehrsrot“), ohne Aufforderung.
- Die Beschriftung für Hilfstechnik bleibt beim Namen („Farbe Savanna
  Yellow“); dass der Ton geschätzt ist, sagt nur das Formular.
- Freunde: Der Server löst mit derselben Funktion auf, `colorHex` kommt also
  auch dort gefüllt an; `FriendMaterial` braucht dafür kein neues Feld.

## Datenmodell

### `contracts/appearance.ts`

```ts
export const TEXTURE_KINDS = [
  "plain",
  "matte",
  "glossy",
  "silk",
  "metallic",
  "fiber", // bis 4.4.0 „carbon“, umbenannt in Phase A
  "transparent",
  "glow",
  "wood",
  // neu (Phase A) – nur anhängen, Enum-Werte verschwinden nie
  "speckle",
  "sparkle",
  "marble",
  "satin",
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
  .superRefine(
    /* solid: genau 1 Farbe; coextruded: 2–4; gradient und
     segmented: 2–8; jede Wirkungsart höchstens einmal; `to` Pflicht außer bei
     infrared/other; thresholdC nur bei thermochromic */
  );
```

- **Drei- und vierfarbig sind gleichwertig zu zweifarbig**: `coextruded`
  nimmt zwei bis vier Farben, Verlauf und Segmente bis acht. Die Grenzen stehen
  an genau einer Stelle (`COLOR_LAYOUT_LIMITS`), Schema, Editor und
  Namensauflösung lesen sie von dort; ein Test prüft je Anordnung die
  Untergrenze, die Obergrenze und eins darüber.
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
export type ColorSource = "custom" | "builtin" | "ral" | "compound" | "word";

export type ResolvedAppearance = {
  hex: string | null; // Leitfarbe, wie bisher
  kind: TextureKind; // wie bisher
  spec: ColorSpec | null; // neu; null = einfarbig bzw. unbekannt
  source: ColorSource | null; // neu; null = nichts gefunden
  matched: string | null; // neu; das gefundene Farbwort („Yellow“)
};
```

`AppearanceCatalog.colors` wird von `Map<string, string>` zu
`Map<string, { hex: string; spec: ColorSpec | null }>`. Die Aufrufer von
`resolveColorHex` bleiben dieselben (die Funktion wird zur dünnen Hülle um
`resolveColor`); `resolveColorSpec` kommt dazu.

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

Nicht mehr: Verläufe und Duals sind **Herstellerfarben** („Dawn Radiance“)
und gehören in den eigenen Katalog – oder sie ergeben sich aus dem Namen
(„Gold/Silber“, Stufe 4). Der mitgelieferte folgt weiter dem, was auf
Etiketten steht, nicht einer Farbenlehre; dazu kommt der Farbwortschatz aus
„Farbnamen erkennen“.

### `db/schema.ts`

```ts
// custom_colors
spec: jsonb("spec").$type<unknown>(),   // NULL = einfarbig
```

- **Eine nullable Spalte, kein Backfill.** Bestehende Zeilen sind einfarbig und
  bleiben es; drizzle-kit erzeugt die Migration vollständig
  (`0027_color_spec.sql`, Phase C), keine Handarbeit.
- **`0026_texture_kinds.sql` (Phase A) ist von Hand ergänzt.** Vier neue Werte
  (`ALTER TYPE … ADD VALUE`) und eine Umbenennung:
  `ALTER TYPE "texture_kind" RENAME VALUE 'carbon' TO 'fiber'`. drizzle-kit
  erkennt die Umbenennung nicht und würde den Typ entfernen und neu anlegen
  (Spalten über `text` umgießen) – dieselbe Falle wie bei Tabellen (`AGENTS.md`,
  „Umbenennungen werden von Hand migriert“). `RENAME VALUE` ändert die
  gespeicherten Zeilen in `custom_textures.kind` mit, ohne sie anzufassen. Die
  Probe: `npm run db:generate` erzeugt danach eine **leere** Migration.
  Achtung: Ein neuer Enum-Wert ist erst nach dem Commit benutzbar; die
  Migration darf ihn also nicht selbst verwenden.
- Nach außen sichtbar ändert sich der Wert `carbon` → `fiber` an zwei Stellen:
  `FriendMaterial.textureKind` (der Client lädt beim Versionssprung ohnehin
  neu, siehe „Aktualisierung der installierten App“) und der Export
  (`customTextures.kind`) – alte Exporte behalten `carbon`, es gibt keinen
  Rückimport, der daran scheitern könnte.
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

| Anordnung    | Feld (24 px)                                             | Spulenkern                                    |
| ------------ | -------------------------------------------------------- | --------------------------------------------- |
| `solid`      | wie heute                                                | wie heute                                     |
| `coextruded` | Tortenstücke (2 Hälften / 3 Keile / 4 Viertel) als Pfade | dieselben Keile – der Querschnitt des Strangs |
| `gradient`   | `linearGradient` diagonal, weiche Stopps                 | dasselbe                                      |
| `segmented`  | harte Stopps (je Farbe zwei gleiche Stopps), diagonal    | dasselbe                                      |

SVG kennt keinen konischen Verlauf; die Keile sind Kreissektoren als `<path>`,
geschnitten auf das Feld. Auch vier Viertel bleiben auf 24 px lesbar (je
Viertel 12 × 12 px); ein Test rendert zwei-, drei- und vierfarbig und prüft
die Zahl der Sektoren. Bei mehr als sechs Farben werden im 24er-Feld die
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
  des Farbbilds reihum; ohne Farbbild Tinte und Gegenton wie bei `fiber`
  (stoneFill hat dunkle **und** helle Einsprengsel). Dazu leicht mattes
  Rauschen wie `matte`.
- **`satin`**: ein breites, flaches Schimmerband wie `silk`, aber mit halber
  Deckkraft und ohne helle Mitte, darunter ein Hauch Rauschen – die Mitte
  zwischen `matte` und `silk`, und von beiden auf 24 px unterscheidbar
  (Prüfung am Bildschirm in beiden Farbschemata, wie beim Silk-Band in 2.7.0).
- **`fiber`** (bisher `carbon`): Das Köpergewebe zeigt ein Laminat, im
  Filament stecken aber **Kurzfasern**. Neu: 10–14 kurze Striche in wenigen
  Richtungen an festen Positionen, Tinte mit leichtem Gegenton – liest sich als
  „Fasern drin“, egal ob Kohle, Glas oder Aluminium. Das Gewebe entfällt.
- **`sparkle`**: wenige vierstrahlige Funkelsterne plus feine Punkte in der
  Tinte, die Punkte in den Akzentfarben (Galaxy mit Gold- und Silberglitter).
  Unterschied zu `speckle`: hell und spitz statt rund und matt.
- **`marble`**: zwei bis drei geschwungene Adern (`path`, weiche Strichbreite)
  in der ersten Akzentfarbe, sonst in der Tinte.
- **Bewegung nur auf Wunsch**: Ein Funkeln wäre verlockend, bleibt aber aus –
  die Übersicht zeigt Dutzende Spulen. Höchstens im großen Kern der
  Material-Seite, und dann nur ohne `prefers-reduced-motion`.

### Wirkungen (Phase D)

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
  Segment-Auswahl (Einfarbig · Mehrfarbig (2–4) · Verlauf · Segmente). Darunter die Farbliste: je Zeile Farbwähler (`<input
type="color">` wie heute) plus optionaler Name, Ziehen zum Umordnen,
  „Farbe hinzufügen“ bis zur Grenze der Anordnung (mehrfarbig: vier). Die
  Anzeige nennt die Zahl („dreifarbig“, „vierfarbig“), keine eigene Auswahl je
  Zahl.
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
- Oberflächen-Vorschläge (`COMMON_TEXTURES`) um „Satin“, „Gesprenkelt“,
  „Glitzer“, „Galaxy“, „Marmor“, „Stein“ ergänzen; „Carbon“ wird
  „Faserverstärkt“ (der Name „Carbon“ findet die Art weiterhin).

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
A und B brauchen kein Farbbild und bringen den größten Teil des sichtbaren
Gewinns; deshalb stehen sie vorn.

### Phase A – Neue Oberflächen (4.5.0)

Klein, ohne Farbbild, sofort nützlich.

1. `TEXTURE_KINDS` + `speckle`, `sparkle`, `marble`, `satin`; `carbon` →
   `fiber`. Migration `0026_texture_kinds.sql` von Hand (siehe oben), Probe mit
   leerem `db:generate`.
2. `BUILTIN_TEXTURES` und `COMMON_TEXTURES` um die Namen oben, „Seidenmatt“ zu
   `satin`, die Faser-Namen zu `fiber`. Die bestehende Zusicherung in
   `api/appearance.test.ts` (jeder Vorschlag wird gezeichnet) deckt die neuen
   Vorschläge ohne Änderung mit ab.
3. Zeichnungen in `textures.tsx` (Tinte/Gegenton, feste Punkt- und
   Strichlisten); `fiber` bekommt die Kurzfasern statt des Gewebes.
4. `appearance.kinds` in `de.ts`/`en.ts` („Faserverstärkt“ / „Fibre
   reinforced“, „Satin“, „Gesprenkelt“ / „Speckled“, „Glitzernd“ / „Sparkle“,
   „Marmoriert“ / „Marbled“).
5. Enum-Liste in `api/postgres.integration.test.ts` nachziehen; ein
   Integrationstest legt vor `0026` eine eigene Oberfläche mit `carbon` an und
   prüft danach `fiber` (Vorbild `migrateUntil`, wie bei `0022`).
6. Tests: jede Art hat Defs **oder** Overlay (Schutz gegen ein vergessenes
   `case`), die Namenszuordnung, Eindeutigkeit der Namen.
7. Release Note: neue Oberflächen, „Carbon“ heißt jetzt „Faserverstärkt“,
   „Seidenmatt“ sieht anders aus.

### Phase B – Farbnamen erkennen (4.6.0)

Ohne Schema, ohne Migration – reine Logik in `contracts/appearance.ts`.

1. Farbwortschatz in `BUILTIN_COLORS` (rund 150 Einträge, DE + EN).
2. `resolveColor` mit den Stufen 1, 2, 3, 5 und 6 samt Helligkeitswörtern;
   `ResolvedAppearance.source`/`matched`. Stufe 4 (zusammengesetzt) folgt in
   Phase C, weil sie das Farbbild zum Zeichnen braucht.
3. RAL: `contracts/ral.ts` mit `RAL_CLASSIC` (Quelle als Kommentar),
   `ralDesignToHex`, Erkennung im Namen, RAL-Namen im Farbwortschatz, Feld
   „RAL-Nummer“ im Farb-Dialog.
4. Zwischenspeicher je Vergleichsform im Resolver (Client) und je Anfrage
   (Server, Freundesliste).
5. Materialformular: Hinweis „Erkannt aus ‚…‘ – ungefähr“ mit „Genau
   festlegen“, bei RAL die Nummer samt Namen.
6. Tests: die Tabelle echter Herstellerfarben, die Negativliste, längster und
   hinterster Treffer, Komposita samt Mindestrest, Helligkeitswörter, eigene
   Einträge schlagen Farbwörter, Oberflächenwörter finden keine Farbe; RAL:
   jede Tabellennummer eindeutig und mit gültigem Farbcode, Schreibweisen der
   Nummer, unbekannte Nummer fällt durch, `ralDesignToHex` gegen
   veröffentlichte Werte, Nummer schlägt Farbwort („Rot RAL 5002“ → Blau).
7. `AGENTS.md`: „Ohne Farbcode wird nicht geraten“ wird „Ohne Farbwort wird
   nicht geraten“, mit Begründung.

### Phase C – Farbbild und zusammengesetzte Namen (4.7.0)

1. `colorSpecSchema`, `parseStoredColorSpec`, `resolveColorSpec`,
   `overlayInkFor` in `contracts/appearance.ts` – mit Wirkungen schon im
   Schema (Version 1), damit Phase D keine Schemaversion braucht.
2. Spalte `custom_colors.spec`, Migration `0027_color_spec.sql`.
3. `appearance.createColor`/`updateColor`: **entweder** `hex` **oder** `spec`;
   Leitfarbe serverseitig abgeleitet. Stufe `editor` wie bisher.
4. Katalog im Client (`useAppearanceCatalog`) und für Freunde mit `spec`.
5. Grundflächen je Anordnung in Feld und Spule; Muster je Teilfläche;
   schraffiertes Stück für einen unbekannten Teil.
6. **Stufe 4** der Namensauflösung: Trenner, Verlaufswörter,
   Anordnungs-Schlüsselwörter, „mindestens ein Teil bekannt“.
7. `ColorSpecEditor` auf `/farben` und im Materialformular („Genau festlegen“
   übernimmt ein berechnetes Farbbild als Vorlage).
8. Beschriftung (`useSwatchLabel`), `FriendMaterial.colorSpec`,
   `api/friendVisibility.test.ts`, Export.
9. Mitgeliefert: `rainbow`.
10. Tests: Schema (Grenzen je Anordnung, `hex` xor `spec`), Rückfall bei
    unlesbarem Farbbild, Kontrastzusicherung für Verläufe, zusammengesetzte
    Namen („Rot/Blau“, „Rot/Gelb/Blau“, „Rot/Gelb/Grün/Blau“, „Quad
    Rot/Gelb/Grün/Blau“, fünf Teile → Segmente, „Dual Rot/Blau“, „Red to
    Blue“, „Rot-Blau“ gegen „Blau-Grün“, „Savanna Yellow / Earth Brown“, „RAL
    9005 / RAL 1003“, „Rot/Xyz“), Integrationstest
    Anlegen/Ändern/Freundesansicht.

### Phase D – Wirkungen (4.8.0)

1. Editor-Abschnitt „Wirkungen“.
2. Abzeichen an der Spule, Vorschau-Umschalter auf Material- und
   Gebindeseite, `glow`-Hof in der Leuchtfarbe.
3. Filter „Wirkung“ in der Übersicht.
4. Mitgeliefert: die Neon- und Nachtleucht-Einträge.
5. **„Neon“ verlässt `glow`.** Als Oberfläche löst „Neon“ danach auf `plain`
   auf, als **Farbe** gibt es die fluoreszierenden Katalogeinträge (und über
   Stufe 5 findet „Neon Green“ den Eintrag „Neongrün“). Das ändert die
   Darstellung bestehender Materialien mit Oberfläche „Neon“ (Hof
   verschwindet) – in der Release Note erwähnen. `COMMON_TEXTURES` führt
   „Neon“ nicht, die Zusicherung in `api/appearance.test.ts` bleibt grün.
6. `note` wird in der Freundes-Projektion entfernt – Test dafür.

### Phase E – Zwei Oberflächen zugleich (4.9.0)

„Silk Glitter“, „Matt Galaxy“, „Marmor glänzend“, „Satin Faserverstärkt“ sind
bis dahin **eine** Art – die zweite fällt unter den Tisch. Fest eingeplant.

**Zwei Ebenen, je höchstens eine Art:**

| Ebene    | Arten                                                              | Gezeichnet        |
| -------- | ------------------------------------------------------------------ | ----------------- |
| Struktur | `speckle`, `sparkle`, `marble`, `fiber`, `wood`                    | unten             |
| Glanz    | `matte`, `satin`, `glossy`, `silk`, `metallic`, `transparent`      | darüber           |
| –        | `glow` (bis Phase D Oberfläche, danach Rückfall für alte Einträge) | wie eine Glanzart |

Die Zuordnung steht als `TEXTURE_LAYER` in `contracts/appearance.ts`, eine
Stelle; ein Test prüft, dass jede Art genau eine Ebene hat.

1. **Datenmodell:** `custom_textures.secondKind texture_kind NULL`, Prüfung im
   Schema „zwei verschiedene Ebenen“ (zwei Glanzarten zugleich ergeben keinen
   Sinn). Nullable, kein Backfill, drizzle-kit erzeugt die Migration.
2. **Auflösung:** `ResolvedAppearance.kind` wird zu `kinds: TextureKind[]`
   (null bis zwei, sortiert Struktur vor Glanz). Ohne ganzen Treffer sucht die
   Oberfläche wie die Farbe nach bekannten Teilausdrücken (Stufe 5 der
   Farben, gleiche Regeln) und nimmt je Ebene den längsten, hintersten:
   „Silk Glitter“ → `sparkle` + `silk`, „Matte Galaxy“ → `sparkle` + `matte`.
3. **Mitgeliefert:** Kombinationsnamen, die Hersteller wörtlich führen –
   „Galaxy“ allein bleibt `sparkle`, „Silk Galaxy“ entsteht aus der Suche.
4. **Zeichnung:** `textureDefs`/`textureOverlay` je Art unverändert, die Spule
   und das Feld zeichnen die Liste in Ebenenreihenfolge. Die Kontrastregel gilt
   je Ebene; die Glanzebene wird über einer Struktur etwas zurückgenommen,
   damit die Partikel sichtbar bleiben (Prüfung am Bildschirm, beide Schemata).
5. **Verwaltung** `/farben`: zweites, optionales Auswahlfeld „Struktur“ neben
   „Glanz“; die Vorschau zeigt beides.
6. **Freunde:** `FriendMaterial.textureKind` bleibt (erste Art, für alte
   Clients während des Neuladens), dazu `textureKinds`; Schlüsselmenge in
   `api/friendVisibility.test.ts` erweitern.
7. **Filter „Oberfläche“** in der Übersicht vergleicht weiter den Freitext –
   unverändert.
8. **Export:** `customTextures.secondKind` (additiv, Version bleibt 5).
9. **Tests:** Ebenenzuordnung vollständig, Kombinationen aus der Suche, keine
   zwei Arten derselben Ebene, Rückfall bei nur einer Art wie bisher,
   Integrationstest Anlegen/Ändern mit `secondKind`.

Jede Stelle, die heute eine Art nimmt (`Spool`, `AppearanceSwatch`,
`useTextureKindLabel`, `toFriendMaterial`, `api/appearance.test.ts`), zieht
mit – der Grund, warum die Phase zuletzt kommt und nicht in A.

## Was sonst mitzieht (leicht vergessen)

- `AGENTS.md`: Abschnitt „Farbe und Oberfläche als Darstellung“ um Farbwörter,
  Farbbild, Leitfarbe, Wirkungen und die angepasste Kontrastregel ergänzen;
  Projektstruktur (`colorSpec.tsx`, `contracts/ral.ts`); die Handmigration `0026` unter den
  Umbenennungen erwähnen.
- `api/postgres.integration.test.ts`: Enum-Werte von `texture_kind`.
- `api/friendVisibility.test.ts`: Schlüsselmenge (Phase C und E), `note`
  (Phase D).
- `api/account.integration.test.ts`: nichts – keine neue Tabelle, keine neue
  Benutzerspalte.
- `COUNTED_TABLES`: nichts – keine neue Tabelle.
- `PRIVACY.md`: nichts Neues – Farbbilder sind Katalogdaten ohne Personenbezug
  über den Eigentümer hinaus.
- Release Notes (englisch) je Phase; Screenshots der neuen Spulen.

## Tests (Übersicht)

| Test                                 | Phase   | Prüft                                                                                                                                  |
| ------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `api/appearance.test.ts`             | A–E     | neue Arten, Namen, Farbwörter (Herstellertabelle + Negativliste), RAL, zusammengesetzte Namen mit 2–5 Teilen, Schema, Kontrast, Ebenen |
| `api/friendVisibility.test.ts`       | C, D, E | `colorSpec` und `textureKinds` drin, `note` draußen                                                                                    |
| `api/appearance.integration.test.ts` | A, C, E | `carbon` → `fiber` über die Migration; `hex` xor `spec`, abgeleitete Leitfarbe, Bereichsgrenze; `secondKind`                           |
| `api/postgres.integration.test.ts`   | A       | Enum-Werte                                                                                                                             |

## Nicht Teil dieses Plans

- **Abrasiv.** Ob ein Material die Düse angreift (Fasern, Nachleuchtpigment,
  Metall- und Steinfüllung), wird später eine **eigene Eigenschaft** am
  Material – gepflegt, nicht abgeleitet. Oberfläche und Farbe sagen darüber
  bewusst nichts aus: „Faserverstärkt“ ist die Darstellung, nicht die
  Warnung, und ein Material mit Oberfläche „Matt“ kann trotzdem abrasiv sein.
  Nichts in diesem Plan darf aus einer Musterart eine solche Aussage machen.
- **Weitere Sprachen** im Farbwortschatz – siehe „Offene Fragen“.
- **RAL Effect** und **Pantone** – siehe „RAL-Farben“.

## Entscheidungen

Getroffen am 27.09.2026:

1. **Glasfaser zählt zu „Faserverstärkt“.** `carbon` wird in `fiber`
   umbenannt, in der Oberfläche „Faserverstärkt“; Kohle-, Glas-, Aramid-,
   Basalt- und Aluminiumfasern gehören dazu.
2. **Zusammengesetzte Farbnamen werden automatisch mehrfarbig**, sofern
   mindestens ein Teil bekannt ist; Regeln unter „Zusammengesetzte Namen“.
3. **Satin bekommt eine eigene Art** (`satin`); „Seidenmatt“ wandert dorthin.
4. **Beschreibende Farbnamen werden erkannt** („Savanna Yellow“ → Gelb) –
   über einen größeren Farbwortschatz und die Suche nach dem Farbwort im
   Namen, nie über einen geratenen Ton.
5. **Das Farbbild steht am Katalogeintrag**, nicht am Material (Weg A).
6. **Phase E ist fest eingeplant** (zwei Oberflächen zugleich, 4.9.0).
7. **Drei- und vierfarbige Filamente** sind vollwertig: Koextrudiert nimmt
   zwei bis vier Farben, zusammengesetzte Namen mit bis zu vier Teilen werden
   koextrudiert, Schlüsselwörter wie „Tri“ und „Quad“ werden erkannt.
8. **RAL-Farben werden erfasst**: RAL Classic als Tabelle, RAL Design
   gerechnet, erkannt im Namen und wählbar im Farb-Dialog (Phase B).
9. **Weitere Sprachen bleiben vorerst offen.**
10. **„Abrasiv“ gehört nicht in diesen Plan**, sondern wird später eine
    eigene Eigenschaft.

## Offene Fragen

1. **Weitere Sprachen im Farbwortschatz** (Französisch, Italienisch,
   Spanisch) – vorerst offen; Etiketten sind überwiegend englisch.
2. **Rechtslage RAL** kurz prüfen, bevor die Tabelle in den Code geht (siehe
   „RAL-Farben“) – keine Frage des Ob, nur der Quelle.
3. **Farbbild am Material statt am Katalog** (Weg B) – falls sich zeigt, dass
   Benutzer je Material ein eigenes Farbbild wollen, ohne sich einen Namen
   auszudenken. Dann als Überschreibung **zusätzlich** zum Katalog, nicht
   statt seiner.
