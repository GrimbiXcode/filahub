# Plan: Material und Gebinde, Druckeinstellungen, Druckhistorie

Stand: 4.0.0. Die Grundsatzfragen sind entschieden (siehe „Entscheidungen“ am
Ende). **Alle vier Phasen sind umgesetzt**: Phase 1 (4.0.0), Phase 2
(4.1.0), Phase 3 (4.2.0), Phase 4 (4.3.0); die Abweichungen vom Entwurf stehen
unter „Stand der Umsetzung“. Offen ist nur die Ausbaustufe „3MF auslesen“.

## Stand der Umsetzung

Phase 1 ist mit 4.0.0 umgesetzt. Abweichungen vom Entwurf weiter unten, jeweils
mit Grund:

- **Route des Gebindes:** `/materialien/gebinde/:id` statt `/gebinde/:id` –
  unter `/gebinde` liegen seit 2.2.0 die Gebindearten, und `/gebinde/42` sähe
  aus wie die Gebindeart 42. Die Pfade stehen in `src/const.ts`
  (`materialPath`, `gebindePath`), nicht in `contracts/constants.ts`: Nur der
  Client braucht sie.
- **Ein Material existiert nur mit Gebinde.** Daraus folgt: kein
  `product.create` und kein `product.delete` (ein Material entsteht mit dem
  ersten Gebinde und verschwindet mit dem letzten) und keine eigene
  `MAX_PRODUCTS_PER_SCOPE` – die Grenze der Gebinde begrenzt die Materialien
  mit. Materialart und Stärke eines Materials sind damit immer bekannt.
- **`archivedAt` ist verschoben** – an den Anfang von Phase 2. Erst die
  Druckeinstellungen und die Druckhistorie hängen etwas am Material bzw.
  Gebinde, das ein Löschen des letzten Gebindes nicht verlieren darf. Bis
  dahin ist Löschen dasselbe wie bis 3.1.0.
- **Die Lesesicht flacht auf.** `material.list` und `material.byId` liefern die
  Felder des Materials weiter an der Gebindezeile, und `material.create` /
  `material.update` nehmen sie flach statt als `product`-Objekt. Dadurch
  blieben Suche, Filter, Freundesansicht und die meisten Tests unverändert.
- **Der Bestand kommt vom Server mit** (`stock` je Gebindezeile), nicht aus
  dem Browser: Die Übersicht lädt nur das gewählte Lager, der Bestand muss
  aber die Gebinde in anderen Lagern mitzählen.
- **Lager wechselt Art oder Stärke** nur, solange keines seiner Materialien auch
  in einem anderen Lager liegt – die Gegenrichtung der Konsistenzregel, im
  Entwurf nicht bedacht.

**Phase 2 (4.1.0)** – Entscheidungen, die der Entwurf offenließ:

- **„Aufgebraucht“ kommt über `material.list` mit**, gefiltert wird im Client.
  Grund: Die nächste freie Kennung rechnet der Browser aus dieser Liste, und
  die Kennung eines aufgebrauchten Gebindes bleibt belegt (der Unique-Index je
  Lager gilt weiter). Eine gefilterte Liste hätte Nummern vorgeschlagen, die
  der Server als doppelt ablehnt.
- **Ein Material mit nur aufgebrauchten Gebinden warnt nicht.** Sein Bestand
  ist leer, aber es steht in keinem Regal mehr; die Material-Seite zeigt es.
  Eine Warnung „nachkaufen“ dafür gehört zum späteren Telegram-Hinweis (#17).
- **Die Drybox bleibt beim Aufbrauchen zugewiesen** – sie zu lösen änderte die
  Nettowerte des Verlaufs rückwirkend.
- **Eingabe in Slicer-Einheiten** (Rückzug in mm, Belichtung in s),
  gespeichert ganzzahlig (1/100 mm, ms).
- **Keine Druckeinstellungen je Drucker** – wie im Entwurf ausgeklammert.

**Phase 3 (4.2.0)** – Entscheidungen, die der Entwurf offenließ:

- **`productId` am Druck ist nullable**, anders als im Entwurf („NOT NULL“),
  dazu ein Namensschnappschuss `productName`. Grund: Ein Material verschwindet
  mit seinem letzten Gebinde (Phase 1), der Druck soll bleiben. Der Entwurf
  sah „ein Material mit Drucken lässt sich nur zusammenführen, nicht löschen“
  vor – das hätte das Löschen des letzten Gebindes blockiert, sobald je damit
  gedruckt wurde, und „aufgebraucht“ (Phase 2) ist ohnehin der bessere Weg.
- **Zusammenführen zieht die Drucke mit** (`carryTo`), Umordnen eines
  Gebindes nicht – wie im Entwurf.
- **Tags werden klein gespeichert.** Stichworte wie Hashtags; „Vase“ und
  „vase“ als zwei Tags hätten den Filter zerteilt.
- **Filter nach Hersteller und Farbe entfallen** in `print.list`. Beides
  liegt am Material; der Materialfilter und die Freitextsuche über den Namen
  decken den Bedarf, zwei weitere Joins lohnen sich erst mit Nachfrage.
  Dafür kam der Drucker in die Freitextsuche.
- **Ändern bucht nur um, wenn Material, Gebinde, Gramm oder Datum sich
  ändern.** Titel oder Notizen zu korrigieren soll die Verbräuche nicht neu
  anlegen – ihre IDs zählen für die Korrekturregel.
- **Löschen: „zurückbuchen“ ist vorausgewählt.** Ein gelöschter Druck ist
  meistens ein Versehen, und bei einem alten Druck ändert das Zurückbuchen
  nichts mehr: Verbräuche vor der jüngsten Wägung zählen ohnehin nicht.
- **Im Panel der Übersicht nur ein Link** statt „Letzte Drucke“: Das Panel
  wechselt mit jedem Klick ins Regal, eine Abfrage je Auswahl wäre Last ohne
  Blick. Material- und Gebindeseite zeigen die Liste.
- **Die Filter stehen in der Adresse** (`?material=`, `?gebinde=`, `?tag=` …),
  damit „alle Drucke mit diesem Material“ ein gewöhnlicher Link ist.

**Phase 4 (4.3.0)** – Entscheidungen, die der Entwurf offenließ:

- **Nur Fotos und 3MF, keine Art `other`.** Jede weitere Dateiart wäre ein
  Typ, dessen Inhalt niemand prüft – und genau das ist der riskante Teil.
  Wer PDF-Anleitungen braucht, verlinkt sie.
- **Metadaten ganz ablehnen statt nur GPS zu suchen.** Die Position steht auch
  in XMP oder als Text; der eigene Client schreibt nie Metadaten. Eine Datei
  mit Metadaten ist also am Browser vorbei gekommen und wird abgewiesen.
- **Eine Vorschau je Foto** (480 px, im Browser erzeugt) neben dem Original
  (2048 px). Sonst lüde die Druckliste für jede Kachel das volle Foto – 30
  Drucke wären auf dem Telefon mehrere MB.
- **3MF höchstens 45 MB statt 50**: Das Body-Limit von 50 MB umfasst die
  Multipart-Hülle; eine 50-MB-Datei scheiterte mit einem nackten 413 statt
  einer Meldung.
- **`/health` meldet die Ablage nicht.** Ohne Ablage läuft alles andere
  weiter; ein Container, der deshalb neu startet, hilft niemandem. Die Meldung
  steht im Log beim Start und auf `/verwaltung/system`.
- **Keine Vorschau vor dem Hochladen (`blob:`)**: Die Datei geht sofort nach
  der Auswahl hinaus, ein Platzhalter zeigt den Fortschritt. Die CSP bleibt
  damit unverändert eng.
- **Hochladen darf `weigher`**, Löschen nur `editor` bzw. `weigher` direkt
  danach – wie bei Wägungen. Wer einen Druck erfassen darf, soll ihn auch
  fotografieren dürfen.
- **Eine Organisation mit Drucken ist nicht „leer“.** Seit Phase 3 überleben
  Drucke ihr Material; ohne diese Zählung hätte das Löschen einer
  „leeren“ Organisation Jahre an Drucken samt Fotos mitgenommen.
- **Die Ausbaustufe „3MF auslesen“ ist nicht umgesetzt** – wie in der
  Release-Tabelle für „später“ vorgesehen. `zipEntryNames` und `fflate` sind
  die Vorarbeit.

Die Einzelheiten stehen in `AGENTS.md` unter „Material und Gebinde“.

## Ziel

Heute ist eine Zeile in `materials` beides zugleich: das **Produkt** („Polymaker
PolyTerra PLA, Charcoal Black“) und das **physische Stück** (diese eine Rolle
mit Kennung, Waage, Drybox). Daraus folgen die vier Wünsche nicht:

1. Zwei Rollen vom selben Material: Die fast leere warnt, obwohl die volle
   daneben liegt – die Warnung (`LOW_STOCK_PERCENT`, 25 %) rechnet je Rolle.
2. Bei einer gewählten Rolle die weiteren Rollen vom selben Material zeigen –
   es gibt kein „vom selben“.
3. Druckinformationen je Material (Hersteller + Materialart + Farbe) – müssten
   heute an jeder Rolle einzeln stehen.
4. Druckhistorie mit Fotos, Modell-Links, 3MF-Dateien, Notizen, Suche und
   Filter – es gibt weder Druckaufträge noch Dateiablage.

Kern des Plans ist deshalb eine neue Ebene über den bestehenden Zeilen: das
**Material** als Produkt, darunter die **Gebinde** als physische Stücke.

## Begriffe und Namen

Die Oberfläche spricht künftig so, wie man es sagt: „zwei Rollen vom selben
Material“. Im Datenmodell heißt die bestehende Tabelle aber weiter `materials`
und meint das Gebinde – eine Umbenennung kostet eine Handmigration über alle
Indizes und Constraints (Vorbild `0010_container_rename.sql`), die drei
Namenslisten und jede Abfrage, ohne dass ein Benutzer etwas davon hat.

Damit laufen UI-Wort und Code-Name **gegeneinander**. Das ist die größte
Stolperfalle dieses Plans und wird deshalb als Tabelle in `AGENTS.md`
festgehalten, dazu je ein Kopfkommentar in `db/schema.ts`:

| Oberfläche DE / EN                                     | Bedeutung                                                     | Tabelle                           | Router       | Typ               |
| ------------------------------------------------------ | ------------------------------------------------------------- | --------------------------------- | ------------ | ----------------- |
| **Material** / _Material_                              | Das kaufbare Produkt: Hersteller, Materialart, Farbe, Oberfl. | neu: `material_products`          | `product.*`  | `MaterialProduct` |
| **Gebinde** (**Rolle**, Flasche …) / _Spool, Bottle …_ | Das physische Stück: Kennung, Wägungen, Verbräuche            | bestehend: `materials`            | `material.*` | `Material`        |
| **Druck** / _Print_                                    | Ein Druckauftrag mit Dateien, Links, Notizen, Verbrauch       | neu: `print_jobs` + Nebentabellen | `print.*`    | `PrintJob`        |

- **Gebinde oder Rolle?** Wo die Gebindeform bekannt ist, nennt die Oberfläche
  sie („Rolle“, „Flasche“, „Beutel“ – `CONTAINER_FORMS`); wo nicht, allgemein
  „Gebinde“. Ein Harzlager, das von „Rollen“ spricht, wäre falsch.
- **Texte:** `src/messages/de.ts` führt „Material“ heute rund 94-mal, fast
  immer im Sinn von Gebinde. Jede Stelle wird einzeln geprüft (Wiegen und
  Abbuchen betreffen ein **Gebinde**, der Filter „Materialart“ ein
  **Material**); `en.ts` zieht über den Typ mit.
- **Routen:** `/material/:id` zeigt heute das Gebinde. Neu:
  `/materialien/:id` (Material) und `/gebinde/:id` (Gebinde);
  `/material/:id` leitet dauerhaft auf `/gebinde/:id` um – Muster
  `LEGACY_DRYBOXES_PATH`, damit gespeicherte Lesezeichen weiter gehen. Die
  Pfade wandern dabei in Konstanten (`contracts/constants.ts`), statt wie heute
  an sieben Stellen als Text zu stehen.

---

## Phase 1 – Material über den Gebinden, Warnung je Material (Wünsche 1 + 2)

### Datenmodell

Neue Tabelle `material_products` (Eigentum wie überall: `ownerXor`):

| Spalte                             | Herkunft             | Bemerkung                                           |
| ---------------------------------- | -------------------- | --------------------------------------------------- |
| `id`, `userId`, `organizationId`   | neu                  | `ownerXor("material_products_owner_xor")`           |
| `name`                             | aus `materials.name` | Anzeigename des Materials                           |
| `materialType`                     | aus `materials`      | weiter über `canonicalMaterialType` (#36)           |
| `manufacturer`, `color`, `texture` | aus `materials`      | Freitext wie bisher, Auflösung über den Farbkatalog |
| `densityGramsPerLiter`             | aus `materials`      | Eigenschaft des Produkts, nicht der Rolle           |
| `notes`                            | neu                  | Notizen zum Material (das Gebinde behält eigene)    |
| `createdAt`, `updatedAt`           |                      |                                                     |

`materials` (Gebinde) bekommt `productId bigint NOT NULL` + Index
`materials_product_idx` und **verliert** `name`, `materialType`, `manufacturer`,
`color`, `texture`, `densityGramsPerLiter`. Keine Kopie am Gebinde – dieselbe
Regel wie bei Materialart/Stärke am Lager: eine zweite Wahrheit läuft
auseinander.

Am Gebinde bleiben: `lagerId`, `identifier`, `priceCents`, `purchaseDate`,
`nominalWeight` (1-kg-Rolle und 250-g-Probe desselben Materials sind möglich),
Gebindeart/Preset, Drybox, `notes`, Wägungen, Verbräuche.

Neu am Gebinde: `archivedAt` (nullable) – „aufgebraucht“. Mit Druckhistorie will
man eine leere Rolle nicht mehr löschen, weil Drucke auf sie verweisen;
archivierte Gebinde fallen aus Regal und Summen, bleiben aber in Historie und
Suche. _(Umgesetzt wird das am Anfang von Phase 2, siehe „Stand der
Umsetzung“.)_

Neu am Lager: `lowStockGrams` (nullable) – die Warnschwelle, siehe
„Warnung je Material“.

**Material und Lager.** Das Material gehört dem Bereich (wie Gebindearten),
nicht einem Lager – eine Rolle darf das Lager wechseln, ohne das Material zu
wechseln. Ein Material darf aber nur Gebinde in Lagern **gleicher** Materialart
und Filamentstärke haben (eine 2,85-mm-Rolle ist ein anderes Produkt). Geprüft
in `validateForeignKeys` (`api/materialRouter.ts`), im Zustand nach dem Patch,
per Abfrage über die Lager der übrigen Gebinde des Materials. Das ist die erste
Konsistenzregel zwischen Gebinde und Lager – im AGENTS.md-Abschnitt „Lager“
entsprechend nachtragen (dort steht heute, es gebe keine).

### Migration `0022_material_products.sql` (von Hand ergänzt)

drizzle-kit erzeugt `CREATE TABLE`, `ADD COLUMN … NOT NULL` und `DROP COLUMN`,
aber keinen Backfill – dasselbe Muster wie `0009_lager.sql` und
`0012_lager_shares.sql`, alles in einer Transaktion, `DROP COLUMN` zuletzt.

Backfill-Regel (konservativ – falsch zusammengelegte Rollen sind schlimmer als
nicht zusammengelegte, weil die Warnung dann zu spät kommt):

- Zu einem Material zusammengefasst werden Gebinde nur, wenn im selben Bereich
  **alle** gleich sind: Materialart des Lagers, Filamentstärke,
  Materialart-Bezeichnung (Vergleichsform), Hersteller, Farbe, Oberfläche (je
  `lower(trim())`) – **und** Hersteller und Farbe nicht leer. „PLA“ ohne
  Hersteller und Farbe ist zu vage.
- Alles andere wird 1:1 zu einem eigenen Material.
- Name und Dichte stammen vom ältesten Gebinde der Gruppe.

Abgesichert wie `0019`: `api/materialProducts.integration.test.ts` spielt die
Datei auf einen von Hand angelegten Altbestand ein zweites Mal ein. Danach muss
`npm run db:generate` eine leere Migration liefern.

Für die Fälle, die der Backfill bewusst nicht zusammenlegt:

- **„Materialien zusammenführen“** (Stufe `editor`): Gebinde des einen wandern
  zum anderen, das leere wird gelöscht; Druckeinstellungen (Phase 2) nur, wenn
  das Ziel keine hat, sonst Rückfrage.
- **„Gebinde einem anderen Material zuordnen“** im Gebindeformular.
- **Vorschläge** in der Übersicht („3 Rollen sehen gleich aus –
  zusammenführen?“): dieselbe Vergleichsform wie der Backfill, zusätzlich
  gleicher Name bei leerem Hersteller/Farbe – nur als Vorschlag, nie
  automatisch. Reine Funktion `mergeCandidates` in `contracts/materials.ts`.

### Warnung je Material

Die Schwelle steht in **Gramm am Lager** (`lager.lowStockGrams`), gepflegt auf
der Lager-Seite – wie Materialart, Stärke und Kennungsvorlage. Im
Organisationslager also Stufe `admin`, wie jede Lagerkonfiguration. Das deckt
Issue #17 ab.

Neue reine Funktion `productStock(...)` in `contracts/materials.ts`, getestet in
`api/productStock.test.ts`:

- **Bestand** = Summe der `remainingAmount` aller nicht archivierten Gebinde des
  Materials, **über alle Lager**. Wer die zweite Rolle im Keller hat, hat sie.
- **Schwelle:**
  - Ist in mindestens einem Lager, in dem das Material liegt, eine Schwelle
    gesetzt, gilt die **höchste** davon. Die strengere Zahl, weil eine zu frühe
    Warnung einen Klick kostet, eine zu späte einen abgebrochenen Druck.
  - Ist keine gesetzt, gilt die Vorgabe: `LOW_STOCK_PERCENT` % der **größten**
    Nennmenge unter den Gebinden. So gewählt, dass ein Material mit genau einer
    Rolle **exakt** wie heute warnt – der Test nagelt diese Gleichheit über eine
    Fixture-Tabelle fest (Muster: `api/consumption.test.ts`).
- **Knapp**, wenn Bestand ≤ Schwelle.
- Beispiel: Lager „Filament“ mit 300 g; Rolle A 80 g, Rolle B 1000 g → 1080 g >
  300 g → keine Warnung. Der Ring der Rolle A bleibt rot – der Füllstand je
  Rolle bleibt ehrlich, nur die **Warnung** rechnet je Material.

`LOW_STOCK_PERCENT` wandert dafür von `src/components/StockTiles.tsx` nach
`contracts/materials.ts`. Die Kachel „Knapp“, der Filter „nur knapp“ und die
Übersichtszahlen zählen künftig **Materialien**. Die Restmengenrechnung selbst
bleibt unverändert an genau einer Stelle (`remainingAmount`).

Eine abweichende Schwelle für ein einzelnes Material ist bewusst **nicht**
vorgesehen; wenn sie gebraucht wird, kommt sie als nullable Spalte an
`material_products` dazu und schlägt die des Lagers – eine Zeile in
`productStock`.

Später (eigene Stufe, #17): Telegram-Hinweis, wenn ein Material die Schwelle
unterschreitet – `notify.ts` ist vorhanden, der Aufbewahrungslauf zeigt, wie ein
periodischer Lauf aussieht.

### API

- Neuer Router `api/productRouter.ts`, Abfragen in `api/queries/products.ts`:
  `product.list` / `byId` / `create` / `update` / `delete` (nur ohne Gebinde, wie
  Lager und Dryboxen) / `merge`. Alles über `Scope`/`resolveScope`, Stufen wie
  bisher beim Material (`viewer` lesen, `editor` schreiben).
- `material.list` liefert je Gebinde sein Material mit (ein Join); die Summen je
  Material rechnet der Browser aus derselben Liste – die Übersicht lädt ohnehin
  alles, dieselbe Begründung wie bei den Kennungen. Die Schwellen kommen aus
  `lager.list`, das ebenfalls schon geladen ist.
- `material.create` nimmt **entweder** `productId` **oder** ein
  `product`-Objekt (neues Material im selben Zug) – geprüft an einer Stelle.
- `material.importMany`: Material je Zeile über dieselbe Vergleichsform wie der
  Backfill finden oder anlegen. Die JSON-Schlüssel in `contracts/import.ts`
  bleiben deutsch und flach; die Aufteilung ist Sache des Servers.
- `lager.update` nimmt `lowStockGrams` (≥ 0, ganze Gramm, `null` = Vorgabe).
- ~~Mengenobergrenze `MAX_PRODUCTS_PER_SCOPE`~~ – entfällt, siehe „Stand der
  Umsetzung“.

### Oberfläche

- **Panel und Gebinde-Detail:** Abschnitt „Weitere Rollen von diesem Material“
  – je Gebinde Spule, Kennung, Lager, Drybox, Restmenge; darüber die Summe und
  die geltende Schwelle. Klick wählt das Gebinde im Regal. (Wunsch 2)
- **Knopf „Weitere Rolle anlegen“** auf Material und Gebinde: öffnet das
  Formular mit vorbelegtem Material, nur noch Lager, Nennmenge, Gebindeart,
  Kennung (aus der Vorlage), Preis, Kaufdatum. Das wird der häufigste Handgriff
  beim Einkaufen.
- **Formular:** oben Materialwahl (Autocomplete über Name, Hersteller, Farbe)
  oder „Neues Material“ mit den bisherigen Feldern. Die Vorschlagslisten für
  Materialart, Farbe, Oberfläche ziehen um, ihre Logik nicht.
- **Neue Seite `/materialien/:id`:** Stammdaten, Gebindeliste, summierter
  Verlauf; später Druckeinstellungen und Drucke.
- **Übersicht:** Das Regal bleibt je Gebinde (Spulen sind physisch); neue
  Gruppierung „nach Material“ neben „nach Drybox“ (`src/lib/shelf.ts`). Tabelle
  und Telefon-Kartenliste bekommen eine aufklappbare Materialzeile.
- **Lager-Seite:** Feld „Warnen unter … g“ mit Hinweis auf die Vorgabe.
- Die Kennungssuche findet weiter Gebinde.

### Was sonst mitzieht (leicht vergessen)

- **Freunde:** `FRIEND_MATERIAL_WITH` lädt Name, Materialart, Hersteller, Farbe,
  Oberfläche jetzt über `material_products` – **nur** diese Spalten, nicht
  `notes`. Die Schlüsselmenge von `FriendMaterial` bleibt unverändert,
  `api/friendVisibility.test.ts` muss grün bleiben, ohne dass man ihn anfasst.
  Die serverseitige Freundessuche joint das Material. Eine Warnschwelle geht
  nicht hinaus.
- **Ausleih-Anfragen** hängen am Gebinde – unverändert richtig.
- **Namenslisten:** `material_products` in `COUNTED_TABLES` und die Tabellenliste
  von `api/postgres.integration.test.ts`; der DSGVO-Wächter findet `userId`
  selbst.
- **Export:** neuer Abschnitt `materialProducts`; weil Spalten aus `materials`
  wegfallen, ist das **nicht** additiv → `ACCOUNT_EXPORT_VERSION` 5.
- **Löschkaskaden** (Material, Konto, Organisation): Materialien nach ihren
  Gebinden löschen.
- **Organisationen:** Matrix in `api/organizations.integration.test.ts` um die
  neuen Prozeduren erweitern, positiv und negativ.

---

## Phase 2 – Druckeinstellungen am Material (Wunsch 3)

**Zuerst `archivedAt` am Gebinde** (aus Phase 1 verschoben): Sobald am Material
Druckeinstellungen hängen, darf das Löschen der letzten, leeren Rolle sie nicht
mitnehmen. „Aufgebraucht“ statt „löschen“ hält das Material am Leben; ein
Material ohne aktive Gebinde erscheint dann nicht im Regal, aber auf seiner
Seite und in der Materialwahl des Formulars.

Mit dem Material als Produkt ist „hersteller- und materialtypspezifisch“ kein
Scope-Problem mehr, sondern genau die Ebene, an der die Einstellungen hängen.

### Datenmodell

**Eigene Tabelle** `material_print_settings` (1:1 zum Material, `productId`
eindeutig), nicht eine Spalte an `material_products`:

| Spalte          | Bemerkung                                 |
| --------------- | ----------------------------------------- |
| `productId`     | eindeutig; Eigentum über das Material     |
| `schemaVersion` | für spätere Änderungen am Schema          |
| `settings`      | jsonb, Form je Materialart (siehe unten)  |
| `notes`         | Markdown, gerendert mit `MarkdownContent` |
| `updatedAt`     |                                           |

Die eigene Tabelle ist die Vorbereitung für Freunde (Entscheidung 4): siehe
unten.

Schema in neuem `contracts/printSettings.ts`, **je Materialart** eine zod-Form
(discriminated union über die Materialart des Lagers):

- **Filament:** Düse min/max °C, Bett min/max °C, Bauraum °C, Lüfter %,
  Geschwindigkeit max mm/s, Flow %, Retract in 1/100 mm, Trocknen °C + Minuten,
  „geschlossener Bauraum nötig“.
- **Harz:** Belichtung Normal-/Bodenschicht in ms, Anzahl Bodenschichten,
  Schichthöhe µm, Nachhärten min.
- **Pulver:** Schichthöhe µm, Auffrischrate %, sonst Notizen.
- Alles ganzzahlig – Projektregel „keine Gleitkommawerte“.

jsonb statt Spalten, weil die Felder je Materialart völlig verschieden sind;
Vorbild für jsonb mit zod ist `nameI18n`.

### Oberfläche

Karte „Druckeinstellungen“ auf der Material-Seite (bearbeitbar, `editor`), in
Gebinde-Detail und Panel kompakt (Düse / Bett / Trocknen) – das, was man am
Drucker stehend nachschaut.

### Freunde: nicht sichtbar, aber vorbereitet

Freunde sehen die Druckeinstellungen vorerst **nicht**. Damit ein späteres
Freigeben ein kleiner, geprüfter Schritt bleibt und kein Umbau wird:

- **Eigene Tabelle.** `FRIEND_MATERIAL_WITH` joint `material_products` für Name
  und Farbe; stünden die Einstellungen dort als Spalte, trennte sie nur die
  Spaltenauswahl von der Datenpanne. In einer eigenen Tabelle muss man sie
  ausdrücklich laden – nach der Regel „Was nicht in der Zeile steht, kann keine
  Projektion durchlassen“.
- **Eigene Projektion, eigener Pfad.** Kommt die Freigabe, dann als eigene
  Lesefunktion in `api/queries/friends.ts` (`findFriendPrintSettings(viewerId,
materialId)`) mit `resolveShare` und einer handgeschriebenen Projektion
  `toFriendPrintSettings` samt festgenagelter Schlüsselmenge – nicht als Feld in
  `FriendMaterial`. `notes` bleibt draußen (Freitext, wie überall bei Freunden).
- **Freigabe je Lager.** Der Schalter gehört dann an `lager_shares`
  (`sharePrintSettings boolean default false`) – dieselbe Achse wie die
  bestehende Stufe, eine fehlende Zeile bleibt „nichts“.
- **Riegel schon jetzt:** `api/friendVisibility.test.ts` bekommt eine
  Zusicherung, dass `api/queries/friends.ts` `materialPrintSettings` nicht
  referenziert. Wer das später bewusst ändert, ändert den Test mit – und
  schreibt die Projektion dazu.

Ausblick, bewusst **nicht** Teil dieses Plans: Herstellerempfehlungen im
globalen Preset-Katalog („Empfehlung übernehmen“, Community-Vorschläge),
Einstellungen je Drucker.

---

## Phase 3 – Druckhistorie ohne Dateien (Wunsch 4, Teil 1)

Erst Struktur, Suche und Verbrauchskopplung – Dateiablage ist ein eigenes,
sicherheitsrelevantes Thema (Phase 4).

### Datenmodell

`print_jobs` (`ownerXor`): `id`, `userId`/`organizationId`, `title`,
`printedAt`, `status` (`success` | `failed` | `cancelled`, Enum),
`durationMinutes`, `printer` (Freitext mit Vorschlagsliste wie
`materialType`), `notes` (Markdown), `tags text[]`, `createdAt`, `updatedAt`.

`print_job_materials` – ein Druck kann mehrere Materialien nutzen (AMS/MMU):
`printJobId`, `productId` (NOT NULL), `materialId` (Gebinde, nullable),
`grams`, `consumptionId` (nullable).

- `productId` **und** Gebinde-ID, weil „Drucke mit diesem Material“ das
  Material meint und auch gelöschte Gebinde überleben soll. Bewusst ein
  Schnappschuss „zum Zeitpunkt des Drucks“: Ordnet man ein Gebinde später einem
  anderen Material zu, zieht der Druck **nicht** nach. So dokumentieren.
- Gebinde-ID nullable ist zugleich die Vorarbeit für Issue #41 (Prusa): Drucke
  mit Grammzahl, aber noch ohne zugewiesene Rolle, die man später zuordnet.

`print_job_links`: `printJobId`, `url`, `label` (nullable), `position`. Nur
`https://`, Anzeige mit Host („printables.com“), `rel="noopener noreferrer"`.

### Kopplung an Verbräuche

„Druck erfassen“ bucht je Zeile mit Gebinde einen **Verbrauch** ab (derselbe
Pfad wie `material.addConsumption`, eine Transaktion) und merkt sich dessen ID.
Der Verbrauch bleibt die einzige Wahrheit für die Restmenge; der Druck erzeugt
keine eigene.

- `consumptions` bekommt dafür **keine** Spalte – die Verbindung steht allein in
  `print_job_materials.consumptionId`.
- Druck löschen: Rückfrage „Verbrauch zurückbuchen?“ – ja löscht die
  verknüpften Verbräuche mit (dieselbe Löschregel wie beim Verbrauch), nein
  lässt sie stehen und löst nur die Verknüpfung.
- Verbrauch einzeln löschen: setzt `consumptionId` auf `NULL`, der Druck bleibt.
- Im bestehenden `ConsumptionDialog`: Schalter „Als Druck speichern“ mit Titel
  und Link – der schnellste Weg, ohne einen zweiten Dialog zu lernen.
- Einer offenen Zeile nachträglich eine Rolle zuordnen (#41) erzeugt den
  Verbrauch dann.

### Rechte

| Vorgang                                             | Stufe     |
| --------------------------------------------------- | --------- |
| Drucke ansehen, suchen                              | `viewer`  |
| Druck erfassen (bucht ab), eigenen kurz korrigieren | `weigher` |
| Beliebige Drucke bearbeiten/löschen                 | `editor`  |

Die Korrekturregel für `weigher` wie `mayDeleteWeighing` (zuletzt erfasst,
`createdAt` < 15 min) – Alias in `contracts/organizations.ts`, Identität in
`api/weighingCorrection.test.ts` geprüft.

### Suche und Filter

Anders als die Gebindeliste wächst die Druckhistorie unbegrenzt →
**serverseitig und seitenweise** (Cursor über `printedAt desc, id desc`).

- `print.list({ organizationId, query?, productId?, materialId?, materialType?,
manufacturer?, color?, printer?, status?, tag?, from?, to?, cursor })`
- Freitext: `ILIKE` über Titel, Notizen, Tags, Link-URLs; `%`/`_` maskieren
  (wie in `findFriendMaterialsForSearch`). Mindestens zwei Zeichen. Volltext
  (`tsvector` mit Konfiguration `simple`, zweisprachig) oder `pg_trgm` erst,
  wenn es langsam wird.
- Indizes: `(userId, printedAt)`, `(organizationId, printedAt)`,
  `print_job_materials(productId)`, `(materialId)`, GIN auf `tags`.

### Oberfläche

- Neue Seite **`/drucke`** (Navigation): Filterleiste, Liste als Karten
  (Titel, Datum, Status, Spulen der Materialien, Gramm, Link-Hosts), mobil
  zuerst.
- **`/drucke/:id`**: Detail mit Notizen, Links, Materialien, Bearbeiten.
- Auf Material-Seite, Gebinde-Detail und im Panel: „Letzte Drucke“ mit Link auf
  die gefilterte Liste – der Weg „über das Material wiederfinden“.
- Schnellaktion „Druck erfassen“ in `quickActions`; die Schnellsuche
  (Strg/⌘ + K) findet Drucke nach Titel.

### Grenzen, Protokoll, Registrierung

- `MAX_PRINT_JOBS_PER_SCOPE` (z. B. 20 000), `MAX_MATERIALS_PER_PRINT_JOB` (16),
  `MAX_LINKS_PER_PRINT_JOB` (10); Zugriffsbegrenzung auf `print.create`.
- **Kein Audit-Ereignis** – Nutzung, nicht Sicherheit.
- Neue Tabellen in alle drei Namenslisten; `print_job_materials` und
  `print_job_links` in die Ausnahmeliste des DSGVO-Wächters (Personenbezug über
  den Druck); Export-Abschnitte `printJobs` (+ Unterlisten, additiv zu v5);
  alle Löschkaskaden (Konto, Organisation; ein gelöschtes Gebinde setzt seine
  ID im Druck auf NULL, ein Material mit Drucken lässt sich nur zusammenführen,
  nicht löschen).
- Freunde sehen keine Drucke.

---

## Phase 4 – Fotos und 3MF-Dateien (Wunsch 4, Teil 2)

Die App hat heute **keine** Dateiablage. Das ist der riskanteste Teil.

### Ablage: Volume mit Verweis in der Datenbank

Dateien liegen in einem **Verzeichnis auf einem Volume**, die Metadaten in der
Datenbank. Zugriff nur über eine kleine Schnittstelle
(`api/lib/fileStorage.ts`: `put`, `get`, `delete`), damit später ein S3-Treiber
möglich bleibt.

- Neue Umgebungsvariable `UPLOAD_DIR` (Vorgabe `/data/uploads`), in
  `api/lib/env.ts` und `.env.example`; neues Volume in `docker-compose.yml`,
  Verzeichnis im `Dockerfile` mit passendem Eigentümer; `README.md`: Sicherung
  betrifft jetzt **zwei** Orte.
- `/health` bzw. `/verwaltung/system` meldet, ob das Verzeichnis beschreibbar
  ist – ein vergessenes Volume soll beim Start auffallen, nicht beim ersten
  Upload.
- Dateiname auf der Platte ist ein zufälliger Schlüssel, nie der hochgeladene
  Name (kein Pfad-Traversal, keine Kollisionen).

Tabelle `print_job_files`: `id`, `printJobId`, `kind` (`image` | `model_3mf` |
`other`), `originalName`, `mimeType`, `sizeBytes`, `sha256`, `storageKey`,
`width`/`height` bei Bildern, `createdAt`. Ein Bild kann Titelbild sein
(`coverFileId` am Druck).

### Upload und Auslieferung

tRPC mit superjson ist für Binärdaten ungeeignet → eigene Hono-Routen:

- `POST /api/files/print-jobs/:id` (multipart), `GET /api/files/:id`; Löschen
  über tRPC.
- Anmeldung aus dem Session-Cookie wie `createContext`, Bereich über
  `resolveScope` (Nicht-Mitglied → 404), Sperre prüfen wie `authedQuery`.
  Zugriffsbegrenzung mit `api/lib/rateLimit.ts` direkt (by user).
- Typ nach **Magic Bytes**, nicht nach Endung oder `Content-Type`: JPEG, PNG,
  WebP; 3MF = ZIP. **Kein SVG, kein HTML** (Skript im eigenen Ursprung).
- Auslieferung mit `X-Content-Type-Options: nosniff`, `Cache-Control: private`,
  3MF als `Content-Disposition: attachment`. `img-src 'self'` reicht; für die
  Vorschau vor dem Hochladen kommt `blob:` dazu (`api/securityHeaders.test.ts`).
- Das bestehende Body-Limit von 50 MB bleibt die Obergrenze je Datei.

### Datenschutz

- **Fotos werden im Browser verkleinert und neu kodiert** (Canvas → WebP/JPEG,
  lange Kante 2048 px). Das entfernt EXIF samt **GPS-Position** – ein
  Handyfoto vom Drucker verriete sonst die Wohnadresse. Der Server prüft
  zusätzlich, dass kein EXIF-GPS-Block ankommt.
- `PRIVACY.md` / `COMPLIANCE.md`: neue Datenkategorie „hochgeladene Dateien“.
- Export (Art. 15/20): Dateien als eigener ZIP-Download neben dem JSON-Export,
  weil sie das JSON sprengen würden; das JSON verweist per `sha256`. Läuft wie
  `account.export` über `blockedQuery`.
- Konto- und Org-Löschung: erst die Zeilen in der Transaktion, danach die
  Dateien; ein Aufräumlauf (neben dem Aufbewahrungslauf) löscht Dateien ohne
  Zeile – verwaiste Dateien sind sonst Daten, die niemand mehr löschen kann.

### Grenzen

- `MAX_FILES_PER_PRINT_JOB` (20), `MAX_FILE_BYTES` (Bild 10 MB nach
  Verkleinerung, 3MF 50 MB), neu: **Speicherkontingent je Bereich**
  `MAX_STORAGE_BYTES_PER_SCOPE` (z. B. 1 GB) als Summe über `sizeBytes`.
  Derselbe Vorbehalt wie bei allen Grenzen (keine DB-Garantie).
- `/verwaltung/system`: belegter Speicher gesamt.

### Oberfläche

Galerie auf `/drucke/:id` (shadcn `carousel`), Titelbild als Kachel in der
Liste, Hochladen per Drag & Drop bzw. Kamera auf dem Telefon
(`<input type="file" accept="image/*" capture>`).

### Ausbaustufe: 3MF auslesen

Eine 3MF ist ein ZIP. Slicer legen Vorschaubild und Metadaten hinein
(`Metadata/thumbnail.png`, bei Bambu Studio/OrcaSlicer `slice_info.config` mit
Filamentgewicht je Slot und Druckzeit, bei PrusaSlicer unter `Metadata/`).
Daraus lassen sich beim Hochladen **Titelbild, Dauer und Gramm vorbelegen** –
der größte Komfortgewinn der ganzen Funktion und die Brücke zu Issue #41.
Braucht eine ZIP-Bibliothek (z. B. `fflate`), Grenzen gegen ZIP-Bomben
(entpackte Größe, Anzahl Einträge) und je Slicer einen eigenen Leser mit Tests
gegen echte Beispieldateien.

---

## Reihenfolge und Releases

| Release | Inhalt                                                                                      | Risiko                                  |
| ------- | ------------------------------------------------------------------------------------------- | --------------------------------------- |
| 4.0.0   | Phase 1: Material/Gebinde, Backfill, Warnung je Material, Schwelle je Lager, weitere Rollen | hoch – Datenmodell, Begriffe, Export v5 |
| 4.1.0   | Phase 2: Druckeinstellungen                                                                 | gering                                  |
| 4.2.0   | Phase 3: Druckhistorie mit Verbrauchskopplung, Suche, Filter                                | mittel                                  |
| 4.3.0   | Phase 4: Fotos und 3MF                                                                      | hoch – Dateien, Datenschutz             |
| später  | 3MF auslesen, Telegram-Warnung (#17), Prusa-Anbindung (#41), Druckeinstellungen für Freunde |                                         |

Major-Version für Phase 1, weil sich Export-Format, Import-Semantik und die
Bedeutung von „Material“ in der Oberfläche ändern. Jede Stufe mit englischer
Release Note (`src/release-notes/AGENTS.md` beachten) und Versionssprung in
derselben Änderung; die Note zu 4.0.0 erklärt den Begriffswechsel und die
Zusammenführen-Vorschläge.

Phase 2 und 3 hängen nur an Phase 1, Phase 4 an Phase 3.

### Phase 1 in Schritten

Phase 1 ist groß; auf dem Branch in dieser Reihenfolge, jeder Schritt mit
grünem `check`/`lint`/`test`:

1. `contracts/`: `productStock`, `mergeCandidates`, Pfadkonstanten, Schemas –
   mit Unit-Tests.
2. Schema + Migration `0022` inkl. Backfill, Integrationstest auf Altbestand,
   leere `db:generate`-Probe.
3. Server: `api/queries/products.ts`, `productRouter`, Anpassung von
   `materialRouter` (create/update/import, `validateForeignKeys`), `lager.update`,
   Freundes-Join, Export v5, Kaskaden, Namenslisten, Org-Matrix.
4. Client: Routen und Umleitung, Formular mit Materialwahl, Material-Seite,
   Panel-Abschnitt, Übersicht (Warnung, Gruppierung), Lager-Feld,
   Zusammenführen samt Vorschlägen.
5. Texte: Durchgang durch `de.ts`/`en.ts` (Material ↔ Gebinde/Rolle).
6. `AGENTS.md` (Namensabbildung, Konsistenzregel am Lager, neue Tests),
   Release Note, Version 4.0.0.

## Tests (Übersicht)

- **Unit:** `productStock` (Gleichheit mit heute bei einer Rolle; höchste
  Schwelle über mehrere Lager; archivierte zählen nicht), `mergeCandidates`,
  `printSettings`-Schemas je Materialart, Link-Validierung, Magic-Byte-Erkennung,
  Korrektur-Alias für Drucke; `friendVisibility` unverändert grün plus die neue
  Zusicherung zu `materialPrintSettings`.
- **Integration:** Backfill auf Altbestand (zweimal eingespielt),
  Konsistenz Material ↔ Lager (Art/Stärke), Zusammenführen, Scope-Matrix aller
  neuen Prozeduren, Schwelle nur mit `admin` im Org-Lager, Druck erfassen bucht
  ab / Löschen bucht optional zurück, Löschkaskaden inkl. Dateien, Obergrenzen
  an der Grenze, Datei-Route: fremder Bereich → 404, gesperrt → 403, falscher
  Typ abgelehnt.
- **Namenslisten:** `postgres.integration` gegen `information_schema`,
  DSGVO-Wächter.

## Entscheidungen

| #   | Frage                          | Entscheidung                                                                                             |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 1   | Begriff in der Oberfläche      | **„Material“** für das Produkt, **„Gebinde“/„Rolle“** für das einzelne Stück                             |
| 2   | Backfill                       | Konservativ zusammenlegen, Rest 1:1; Zusammenführen samt Vorschlägen in der App                          |
| 3   | Dateiablage                    | Verzeichnis auf einem Volume, Verweis in der Datenbank                                                   |
| 4   | Druckeinstellungen für Freunde | Vorerst nicht sichtbar; eigene Tabelle und eigener Freundespfad sind vorgesehen                          |
| 5   | Warnschwelle                   | Gramm, **je Lager** konfigurierbar; über mehrere Lager gilt die höchste, ohne Angabe die heutige Vorgabe |

## Protokoll: Reviews und Entscheidungen

Der Auftrag lautete, alle Phasen nacheinander umzusetzen, Rückfragen selbst zu
entscheiden und die Entscheidung zu dokumentieren. Das geschieht hier, je
Phase: was das Review zwischen den Phasen gefunden hat und was daraus wurde.

### Review nach Phase 1

| Befund                                                                                                  | Entscheidung                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wiegen, Abbuchen, Löschen, Lager- und Importänderungen ließen `product.*` veraltet stehen               | **Behoben**: Jede Stelle, die `material.list` neu lädt, lädt auch `product.*` neu.                                                                                           |
| Wettlauf: Gebinde für ein Material, dessen letztes Gebinde gleichzeitig gelöscht wird → verwaiste Zeile | **Behoben**: `lockProductInScope` (`FOR UPDATE`) beim Anlegen, Umordnen, Zusammenführen und Leerlöschen; der Lesepfad überspringt ein verwaistes Gebinde statt abzustürzen.  |
| Bearbeiten eines Gebindes schrieb alle Materialfelder zurück und überschrieb fremde Änderungen          | **Behoben**: Das Formular schickt beim Bearbeiten nur geänderte Materialfelder.                                                                                              |
| `material.update` lud alle Gebinde des Materials nur zur Existenzprüfung                                | **Behoben**: `findMaterialRowInScope` für Schreibpfade.                                                                                                                      |
| Freundessuche durchsuchte `material_products` der ganzen Instanz                                        | **Behoben**: Unterabfrage auf die Besitzer eingegrenzt.                                                                                                                      |
| Knapp-Kachel: Farbe der einzelnen Rolle neben dem Bestand des Materials                                 | **Behoben**: Warnsymbol immer in der Warnfarbe.                                                                                                                              |
| Hinweis „sieht gleich aus“ ließ sich nicht ausblenden                                                   | **Behoben**: ausblendbar je Bereich; erscheint wieder, sobald eine neue Gruppe dazukommt.                                                                                    |
| `compareForm` doppelte `tidyMaterialType`                                                               | **Behoben**.                                                                                                                                                                 |
| Panel lädt je gewählter Rolle `product.byId`                                                            | **Belassen**: Die Rollen in anderen Lagern stehen nicht in `material.list`; eine eigene leichte Abfrage wäre eine zweite Wahrheit für den Bestand. Grundlast 600/min reicht. |
| Herleitung von Art und Stärke doppelt (`findProductsInScope`, `product.byId`)                           | **Belassen**: zwei Zeilen über verschiedene Eingaben; eine Hilfsfunktion gewönne nichts.                                                                                     |

### Review nach Phase 2

| Befund                                                                                    | Entscheidung                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Material mit nur aufgebrauchten Gebinden meldete „0 g, ausreichend“                       | **Behoben**: `productStock` kennt `archived`; alles aufgebraucht heißt `usedUp` und knapp. Die Übersicht meldet ausgegangene Materialien eigens. Revidiert damit die Entscheidung aus Phase 2 („warnt nicht“) – das Review hatte recht: Genau dann soll die Warnung kommen. |
| Umordnen des letzten Gebindes löschte die Druckeinstellungen, Zusammenführen nahm sie mit | **Behoben**: dieselbe Regel für beide Wege (`carryTo`).                                                                                                                                                                                                                     |
| Einstellungen der alten Art nach Lagerwechsel; Art-Prüfung außerhalb der Sperre           | **Behoben**: Prüfung unter der Sperre; `product.byId` blendet Werte fremder Art aus.                                                                                                                                                                                        |
| Server nahm Wägungen und Verbräuche auf aufgebrauchten Gebinden an                        | **Behoben**: `assertGebindeInUse`.                                                                                                                                                                                                                                          |
| Aufgebrauchte Gebinde weder über Schnellsuche noch Kennung auffindbar                     | **Behoben**: Schnellsuche zeigt sie zum Ansehen; die Kennungssuche führt auf ihre Seite.                                                                                                                                                                                    |
| Bereichsfehler „bis < von“ als „ungültig“ gemeldet                                        | **Behoben**: eigene Meldung.                                                                                                                                                                                                                                                |
| Zweites „aufgebraucht“ überschrieb den Zeitpunkt                                          | **Behoben**: `coalesce`.                                                                                                                                                                                                                                                    |
| Einheiten doppelt (Code und Katalog)                                                      | **Behoben**: Anzeige nimmt die Einheiten aus dem Katalog.                                                                                                                                                                                                                   |
| `product.byId` lud Einstellungen nacheinander; unbenutzte Relation                        | **Behoben**: `Promise.all`; Relation entfernt – sie lud geradezu ein, die Einstellungen per `with` nebenbei mitzuladen.                                                                                                                                                     |
| `activeCount` ungenutzt                                                                   | **Genutzt** für den Hinweis „ausgegangen“.                                                                                                                                                                                                                                  |

### Review nach Phase 3

Zwei getrennte Durchgänge, Server und Oberfläche.

| Befund                                                                                                | Entscheidung                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Umdatieren holte einen einzeln gelöschten Verbrauch still zurück                                      | **Behoben**: Jede Zeile behält beim Umbuchen ihren Zustand, solange Material, Gebinde und Gramm gleich bleiben (`planRows`); nur geänderte Zeilen buchen neu.                                    |
| Nach dem Umordnen eines Gebindes ließ sich der Druck nicht mehr ändern                                | **Behoben**: Eine unveränderte Zeile darf beim Material von damals bleiben (Schnappschuss); neu zuordnen lässt sich das fremd gewordene Gebinde nicht.                                           |
| Verbrauchsgrenze vor der Bereichsprüfung – verriet fremde Gebinde                                     | **Behoben**: geprüft in der Transaktion nach `checkMaterialRows`, nur für Zeilen, die wirklich abbuchen, und nach dem Zurücknehmen der eigenen alten Buchungen.                                  |
| Dieselbe Grenze blockierte reine Titeländerungen                                                      | **Behoben** mit demselben Umbau.                                                                                                                                                                 |
| Mehr als 20 Tags wurden gespeichert                                                                   | **Behoben**: `normalizeTags` kappt; das Formular meldet es vorher (`tagsOverLimit`).                                                                                                             |
| Suche fand ein umbenanntes Material nicht                                                             | **Behoben**: gesucht wird im aktuellen Namen und im Schnappschuss.                                                                                                                               |
| Wettlauf: Druck bucht auf ein Gebinde, das gerade gelöscht wird                                       | **Behoben**: `deleteMaterial` sperrt das Gebinde zuerst; Druck, Wägung und Verbrauch halten es mit `FOR SHARE`. Die Lücke bestand für Wägung und Verbrauch schon vorher und ist mit geschlossen. |
| Bearbeiten eines Drucks aus dem Verbrauchsdialog buchte jedes Mal um (Sekunden fehlten im Datumsfeld) | **Behoben**: Unveränderte Minute → der gespeicherte Zeitpunkt geht zurück.                                                                                                                       |
| Warnung „aufgebraucht“ auch für ein Gebinde, von dem der Druck schon abgebucht hatte                  | **Behoben**: Die Warnung gilt nur für neu hinzukommende Buchungen – wie der Server.                                                                                                              |
| Rohes zod-JSON in der Fehlermeldung bei Grenzwerten                                                   | **Behoben**: Das Formular prüft Titel, Gramm, Dauer, Linklänge und Tags vorher mit eigenen Texten.                                                                                               |
| Markdown: `//host` galt als interner Link; deutscher Text „Bild nicht gefunden“ im Englischen         | **Behoben**: interne Links nur `/` ohne zweiten Schrägstrich; Text aus dem Katalog.                                                                                                              |
| „Druck erfassen“ auf der Liste eines aufgebrauchten Gebindes belegte es vor                           | **Behoben**: dann nur das Material.                                                                                                                                                              |
| Letzte Drucke veralteten nach Löschen, Aufbrauchen, Zusammenführen                                    | **Behoben**: `print.*` wird mit neu geladen.                                                                                                                                                     |

### Review nach Phase 4

Zwei Durchgänge: Sicherheit und Server, Oberfläche. Kein Weg gefunden, auf
dem ein Foto mit Standort unverändert hinausgeht, und kein Zugriff über
Bereichsgrenzen.

| Befund                                                                                          | Entscheidung                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ZIP-Export hing für immer, wenn eine Datei in der Ablage fehlte                                 | **Behoben**: `pull` läuft weiter bis zur nächsten vorhandenen Datei; fehlende stehen mit `path: null` im Verzeichnis.                                                   |
| Ausliefern las jede Datei ganz in den Speicher – hundert Abrufe einer 3MF füllten ihn           | **Behoben**: Originale als Strom; eigene, engere Zugriffsbegrenzung für Originale (120/min) neben den Vorschauen (1200/min).                                            |
| Uploads liegen bis zu 50 MB im Speicher, ohne Grenze für gleichzeitige                          | **Behoben**: höchstens 8 je Instanz, 2 je Benutzer (503 mit Kennung `busy`).                                                                                            |
| Metadatenprüfung: EXIF zwischen Scans, Daten hinter dem Bildende, XMP in APP2, Text hinter IEND | **Behoben**: ganze Datei geprüft, APP2 nur als Farbprofil, alles hinter dem Ende zählt.                                                                                 |
| Titelbild konnte gleichzeitig mit dem Löschen auf ein gelöschtes Foto zeigen                    | **Behoben**: `setPrintJobCover` in einer Transaktion unter Sperre des Drucks.                                                                                           |
| PNG mit Kante über 2³¹ scheiterte an der Spalte mit 500                                         | **Behoben**: höchstens 65 535 px je Kante, sonst „Typ nicht angenommen“.                                                                                                |
| ZIP ohne ZIP64 ab 65 535 Dateien kaputt                                                         | **Behoben**: Export über 65 000 Dateien lehnt mit eigener Meldung ab – erreichbar nur mit Zehntausenden Kleinstdateien.                                                 |
| Parallele Uploads kamen an der Grenze je Druck vorbei                                           | **Behoben**: zweite Prüfung unter Sperre in `insertPrintFile`. Beim Speicher je Bereich bleibt die übliche Lücke über verschiedene Drucke – benannt, nicht geschlossen. |
| Safari schreibt beim JPEG-Kodieren einen EXIF-Block – jedes iPhone-Foto wäre abgelehnt worden   | **Behoben**: `stripJpegMetadata` im Browser nach dem Kodieren; getestet an Fixtures, auf einem echten iPhone noch nicht.                                                |
| Canvas wurden nicht freigegeben (Safari-Grenze für Canvas-Speicher)                             | **Behoben**: nach jedem Kodieren auf 0×0 gesetzt.                                                                                                                       |
| Großansicht ohne Pfeiltasten; Anzeige nach Stelle statt ID; Zahlen roh                          | **Behoben**: Pfeiltasten, ID, `formatNumber`.                                                                                                                           |
| Serverfehler beim Hochladen nur deutsch                                                         | **Behoben**: Kennung je Ablehnung, Text aus dem Katalog. Fehler der tRPC-Prozeduren bleiben deutsch wie überall in der App.                                             |
| Stapel lief nach „voll“ weiter, Galerie erst am Ende aktualisiert                               | **Behoben**: Stapel bricht bei 403/404/429 ab, vorab auf freie Plätze gekürzt, jede Datei erscheint sofort.                                                             |
| HEIC in der Auswahl, das Chrome nicht öffnen kann                                               | **Behoben**: nicht mehr angeboten; iOS wandelt bei der Auswahl selbst in JPEG.                                                                                          |
| Laufende Uploads ohne Status für Screenreader; 3MF im Fotoraster                                | **Behoben**: `role="status"`, 3MF in der Projektliste.                                                                                                                  |
| ZIP-Download meldet 429/401 nur als gescheiterten Download                                      | **Bewusst so gelassen**: Ein gewöhnlicher Link lädt gestreamt; ein Vorab-Abruf verbrauchte selbst eines der fünf Exporte je Stunde. Der Fall ist selten.                |
