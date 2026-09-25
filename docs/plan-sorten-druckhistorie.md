# Plan: Sorten, Druckeinstellungen und Druckhistorie

Stand: 3.1.0. Entwurf zur Abstimmung, noch nichts davon ist umgesetzt.

## Ziel

Heute ist eine Zeile in `materials` beides zugleich: das **Produkt** („Polymaker
PolyTerra PLA, Charcoal Black“) und das **physische Gebinde** (diese eine Rolle
mit Kennung, Waage, Drybox). Daraus folgen die vier Wünsche nicht:

1. Zwei Rollen desselben Materials: Die fast leere warnt, obwohl die volle
   daneben liegt – die Warnung (`LOW_STOCK_PERCENT`, 25 %) rechnet je Rolle.
2. Bei einer gewählten Rolle die weiteren Rollen desselben Materials zeigen –
   es gibt kein „desselben“.
3. Druckinformationen je Material (Hersteller + Materialart + Farbe) – müssten
   heute an jeder Rolle einzeln stehen.
4. Druckhistorie mit Fotos, Modell-Links, 3MF-Dateien, Notizen, Suche und
   Filter – es gibt weder Druckaufträge noch Dateiablage.

Kern des Plans ist deshalb eine neue Ebene **Sorte** über den bestehenden
Materialzeilen. Alles Weitere baut darauf auf.

## Begriffe

| Begriff (UI DE / EN)          | Bedeutung                                                     | Tabelle                           |
| ----------------------------- | ------------------------------------------------------------- | --------------------------------- |
| **Sorte** / _Product_         | Das kaufbare Produkt: Hersteller, Materialart, Farbe, Oberfl. | neu: `material_products`          |
| **Gebinde** / _Spool, Bottle_ | Das physische Stück im Lager: Kennung, Wägungen, Verbräuche   | bestehend: `materials`            |
| **Druck** / _Print_           | Ein Druckauftrag mit Dateien, Links, Notizen, Verbrauch       | neu: `print_jobs` + Nebentabellen |

**Keine Umbenennung von `materials`.** Sie wäre semantisch sauberer (`materials`
= Gebinde ist künftig ein irreführender Name), kostet aber eine Handmigration
über alle Indizes und Constraints (Vorbild `0010_container_rename.sql`), die
drei Namenslisten und jede Abfrage – ohne dass ein Benutzer etwas davon hat. Der
Name wird in `db/schema.ts` am Tabellenkopf erklärt; im Code heißt der Typ
weiterhin `Material`, die Oberfläche spricht von „Gebinde“ bzw. „Rolle“.

Offene Entscheidung (siehe unten): ob die Oberfläche „Material“ künftig für die
Sorte verwendet („zwei Rollen vom selben Material“) oder „Sorte“ als neues Wort
einführt.

---

## Phase 1 – Sorten und bestandsweite Warnung (Wünsche 1 + 2)

### Datenmodell

Neue Tabelle `material_products` (Eigentum wie überall: `ownerXor`):

| Spalte                             | Herkunft             | Bemerkung                                           |
| ---------------------------------- | -------------------- | --------------------------------------------------- |
| `id`, `userId`, `organizationId`   | neu                  | `ownerXor("material_products_owner_xor")`           |
| `name`                             | aus `materials.name` | Anzeigename der Sorte                               |
| `materialType`                     | aus `materials`      | weiter über `canonicalMaterialType` (#36)           |
| `manufacturer`, `color`, `texture` | aus `materials`      | Freitext wie bisher, Auflösung über den Farbkatalog |
| `densityGramsPerLiter`             | aus `materials`      | Eigenschaft des Produkts, nicht der Rolle           |
| `lowStockGrams`                    | neu, nullable        | eigene Warnschwelle (Issue #17), `NULL` = Vorgabe   |
| `notes`                            | neu                  | Notizen zum Produkt (die Rolle behält ihre eigenen) |
| `createdAt`, `updatedAt`           |                      |                                                     |

`materials` bekommt `productId bigint NOT NULL` + Index `materials_product_idx`
und **verliert** `name`, `materialType`, `manufacturer`, `color`, `texture`,
`densityGramsPerLiter`. Keine Kopie am Gebinde – dieselbe Regel wie bei
Materialart/Stärke am Lager: eine zweite Wahrheit läuft auseinander.

Am Gebinde bleiben: `lagerId`, `identifier`, `priceCents`, `purchaseDate`,
`nominalWeight` (1-kg-Rolle und 250-g-Probe derselben Sorte sind möglich),
Gebindeart/Preset, Drybox, `notes`, Wägungen, Verbräuche.

Neu am Gebinde: `archivedAt` (nullable) – „aufgebraucht“. Mit Sorten und
Druckhistorie will man eine leere Rolle nicht mehr löschen, weil Drucke auf sie
verweisen; archivierte Gebinde fallen aus Regal und Summen, bleiben aber in
Historie und Suche.

**Sorte und Lager.** Die Sorte gehört dem Bereich (wie Gebindearten), nicht
einem Lager – eine Rolle darf das Lager wechseln, ohne die Sorte zu wechseln.
Eine Sorte darf aber nur Gebinde in Lagern **gleicher** Materialart und
Filamentstärke haben (eine 2,85-mm-Rolle ist ein anderes Produkt). Geprüft in
`validateForeignKeys` (`api/materialRouter.ts`), im Zustand nach dem Patch, per
Abfrage über die Lager der übrigen Gebinde der Sorte. Das ist die erste
Konsistenzregel zwischen Material und Lager – im AGENTS.md-Abschnitt „Lager“
entsprechend nachtragen.

### Migration `0022_material_products.sql` (von Hand ergänzt)

drizzle-kit erzeugt `CREATE TABLE`, `ADD COLUMN … NOT NULL` und `DROP COLUMN`,
aber keinen Backfill – dasselbe Muster wie `0009_lager.sql` und
`0012_lager_shares.sql`, alles in einer Transaktion, `DROP COLUMN` zuletzt.

Backfill-Regel (konservativ, weil falsch zusammengelegte Rollen schlimmer sind
als nicht zusammengelegte):

- Zusammengefasst werden Gebinde nur, wenn im selben Bereich **alle** gleich
  sind: Materialart des Lagers, Filamentstärke, Materialart-Bezeichnung
  (Vergleichsform), Hersteller, Farbe, Oberfläche (je `lower(trim())`) – **und**
  Hersteller und Farbe nicht leer. „PLA“ ohne Hersteller und Farbe ist zu vage.
- Alles andere wird 1:1 zur eigenen Sorte.
- Name und Dichte der Sorte stammen vom ältesten Gebinde der Gruppe.

Abgesichert wie `0019`: `api/materialProducts.integration.test.ts`
spielt die Datei auf einen von Hand angelegten Altbestand ein zweites Mal ein.
Danach muss `npm run db:generate` eine leere Migration liefern.

Für die Fälle, die der Backfill bewusst nicht zusammenlegt: **„Sorten
zusammenführen“** (Stufe `editor`) und „Gebinde in andere Sorte verschieben“.
Die Übersicht kann Kandidaten vorschlagen („3 Gebinde sehen gleich aus“) –
dieselbe Vergleichsform, nur als Vorschlag statt automatisch.

### Bestandsweite Warnung

Neue reine Funktion `productStock(...)` in `contracts/materials.ts`, getestet in
`api/productStock.test.ts`:

- Summe der `remainingAmount` aller nicht archivierten Gebinde der Sorte.
- Knapp, wenn die Summe ≤ `lowStockGrams`, oder – ohne eigene Schwelle – ≤
  `LOW_STOCK_PERCENT` % der **größten** Nennmenge unter den Gebinden.
- Die Vorgabe ist so gewählt, dass eine Sorte mit genau einer Rolle **exakt**
  wie heute warnt. Der Test nagelt diese Gleichheit über eine Fixture-Tabelle
  fest (Muster: `api/consumption.test.ts`).
- Beispiel: Rolle A 80 g von 1000 g, Rolle B 1000 g → 1080 g > 250 g → keine
  Warnung. Ring der Rolle A bleibt rot – der Füllstand je Rolle bleibt ehrlich.

`LOW_STOCK_PERCENT` wandert dafür von `src/components/StockTiles.tsx` nach
`contracts/materials.ts`. Die Kachel „Knapp“, der Filter „nur knapp“ und die
Übersichtszahlen zählen künftig **Sorten**. Die Restmengenrechnung selbst bleibt
unverändert an genau einer Stelle (`remainingAmount`).

Später (eigene Phase, Issue #17): Telegram-Hinweis, wenn eine Sorte die Schwelle
unterschreitet – `notify.ts` ist vorhanden, der Aufbewahrungslauf zeigt, wie ein
periodischer Lauf aussieht.

### API

- `product.list` / `product.byId` / `product.create` / `product.update` /
  `product.delete` (nur leer, wie Lager und Dryboxen) / `product.merge`.
  Neuer Router `api/productRouter.ts`, Abfragen in `api/queries/products.ts`,
  alles über `Scope`/`resolveScope`, Stufen wie Material (`viewer` lesen,
  `editor` schreiben).
- `material.list` liefert je Gebinde die Sorte mit (ein Join) und `productId`;
  die Sortensummen rechnet der Browser aus derselben Liste (die Übersicht lädt
  ohnehin alles – dieselbe Begründung wie bei den Kennungen).
- `material.create` nimmt **entweder** `productId` **oder** ein
  `product`-Objekt (neue Sorte im selben Zug) – geprüft an einer Stelle.
- `material.importMany`: Sorte je Zeile über dieselbe Vergleichsform wie der
  Backfill finden oder anlegen. Die JSON-Schlüssel in `contracts/import.ts`
  bleiben deutsch und flach; die Aufteilung ist Sache des Servers.
- Mengenobergrenze `MAX_PRODUCTS_PER_SCOPE` nach dem Muster in AGENTS.md.

### Oberfläche

- **MaterialPanel / Detailseite:** Abschnitt „Weitere Gebinde dieser Sorte“ –
  je Gebinde Spule, Kennung, Lager, Drybox, Restmenge; darüber die Summe. Klick
  wählt das Gebinde im Regal. (Wunsch 2)
- **Knopf „Weitere Rolle anlegen“** auf Sorte und Gebinde: öffnet das Formular
  mit vorbelegter Sorte, nur noch Lager, Nennmenge, Gebindeart, Kennung (aus der
  Vorlage), Preis, Kaufdatum. Das ist der häufigste neue Handgriff.
- **Materialformular:** oben Sortenwahl (Autocomplete über Name, Hersteller,
  Farbe) oder „Neue Sorte“ mit den bisherigen Feldern. Die Vorschlagslisten für
  Materialart, Farbe, Oberfläche ziehen um, ihre Logik nicht.
- **Neue Seite `/sorten/:id`:** Stammdaten, Gebindeliste, summierter
  Verlauf, später Druckeinstellungen und Drucke.
- **Übersicht:** Regal bleibt je Gebinde (Spulen sind physisch); neue
  Gruppierung „nach Sorte“ neben „nach Drybox“ (`src/lib/shelf.ts`). Tabelle
  und Telefon-Kartenliste bekommen eine aufklappbare Sortenzeile.
- Kennungssuche findet weiter Gebinde.

### Was sonst mitzieht (leicht vergessen)

- **Freunde:** `FRIEND_MATERIAL_WITH` lädt Name, Materialart, Hersteller,
  Farbe, Oberfläche jetzt über die Sorte – **nur** diese Spalten, nicht
  `notes` und nicht `lowStockGrams`. Die Schlüsselmenge von `FriendMaterial`
  bleibt unverändert, `api/friendVisibility.test.ts` muss grün bleiben, ohne
  dass man ihn anfasst. Die serverseitige Freundessuche joint die Sorte.
- **Ausleih-Anfragen** hängen am Gebinde – unverändert richtig.
- **Namenslisten:** `material_products` in `COUNTED_TABLES`, in die Tabellenliste
  von `api/postgres.integration.test.ts`; der DSGVO-Wächter findet `userId`
  selbst.
- **Export:** neuer Abschnitt `materialProducts`; weil Spalten aus `materials`
  wegfallen, ist das **nicht** additiv → `ACCOUNT_EXPORT_VERSION` 5.
- **Löschkaskaden** (Konto, Organisation): Sorten nach den Gebinden löschen.
- **Organisationen:** Matrix in `api/organizations.integration.test.ts` um die
  neuen Prozeduren erweitern, positiv und negativ.

---

## Phase 2 – Druckeinstellungen an der Sorte (Wunsch 3)

Mit der Sorte ist „hersteller- und materialtypspezifisch“ kein Scope-Problem
mehr, sondern genau die Ebene, an der die Einstellungen hängen.

- Spalte `material_products.printSettings jsonb` (nullable), Schema in neuem
  `contracts/printSettings.ts`, **je Materialart** eine zod-Form (discriminated
  union über die Materialart des Lagers):
  - Filament: Düse min/max °C, Bett min/max °C, Bauraum °C, Lüfter %,
    Geschwindigkeit max mm/s, Flow %, Retract mm, Trocknen °C + Minuten,
    „geschlossener Bauraum nötig“.
  - Harz: Belichtung Normal-/Bodenschicht s, Anzahl Bodenschichten,
    Schichthöhe µm, Nachhärten min.
  - Pulver: Freitext + wenige Felder (Schichthöhe, Auffrischrate %).
  - Temperaturen in ganzen °C, Zeiten in Sekunden/Minuten, Längen in µm bzw.
    Hundertstel-mm als Integer – Projektregel „keine Gleitkommawerte“.
- Dazu `printNotes` (Markdown, gerendert mit `MarkdownContent`).
- jsonb statt Spalten, weil die Felder je Materialart völlig verschieden sind;
  Vorbild für jsonb mit zod ist `nameI18n`. Das Schema trägt eine Version.
- Anzeige: Karte „Druckeinstellungen“ auf Sorte, Gebinde-Detail und im Panel
  (kompakt: Düse/Bett/Trocknen) – das, was man am Drucker stehend nachschaut.
- Freunde sehen sie in Phase 2 **nicht**. Teilen wäre ein eigener Beschluss
  (neue Freigabestufe oder eigenes Feld in der Projektion).

Ausblick, bewusst **nicht** Teil dieses Plans: Herstellerempfehlungen im
globalen Preset-Katalog (`preset_container_series` kennt schon Materialarten),
„Empfehlung übernehmen“ und Community-Vorschläge dazu; Einstellungen je Drucker.

---

## Phase 3 – Druckhistorie ohne Dateien (Wunsch 4, Teil 1)

Erst Struktur, Suche und Verbrauchskopplung – Dateiablage ist ein eigenes,
sicherheitsrelevantes Thema (Phase 4).

### Datenmodell

`print_jobs` (`ownerXor`):
`id`, `userId`/`organizationId`, `title`, `printedAt`, `status`
(`success` | `failed` | `cancelled`, Enum), `durationMinutes`, `printer`
(Freitext mit Vorschlagsliste wie `materialType`), `notes` (Markdown),
`tags text[]`, `createdAt`, `updatedAt`.

`print_job_materials` – ein Druck kann mehrere Materialien nutzen (AMS/MMU):
`printJobId`, `productId` (NOT NULL), `materialId` (nullable), `grams`,
`consumptionId` (nullable).

- `productId` **und** `materialId`, weil „Drucke mit diesem Material“ die Sorte
  meint und auch gelöschte Gebinde überleben soll; es ist bewusst ein
  Schnappschuss „zum Zeitpunkt des Drucks“ und wird beim Verschieben eines
  Gebindes in eine andere Sorte **nicht** nachgezogen. So dokumentieren.
- `materialId` nullable ist zugleich die Vorarbeit für Issue #41 (Prusa):
  Drucke mit Grammzahl, aber noch ohne zugewiesene Rolle, die man später
  zuordnet.

`print_job_links`: `printJobId`, `url`, `label` (nullable), `position`.
Nur `https://`, Anzeige mit Host („printables.com“), `rel="noopener noreferrer"`.

### Kopplung an Verbräuche

„Druck erfassen“ bucht je Materialzeile einen **Verbrauch** ab (derselbe Pfad
wie `material.addConsumption`, eine Transaktion) und merkt sich dessen ID. Der
Verbrauch bleibt die einzige Wahrheit für die Restmenge; der Druck erzeugt
keine eigene.

- `consumptions` bekommt dafür **keine** Spalte – die Verbindung steht allein in
  `print_job_materials.consumptionId`.
- Druck löschen: Rückfrage „Verbrauch zurückbuchen?“ – ja löscht die
  verknüpften Verbräuche mit (dieselbe Löschregel wie beim Verbrauch), nein
  lässt sie stehen und löst nur die Verknüpfung.
- Verbrauch einzeln löschen: setzt `consumptionId` auf `NULL`, der Druck bleibt.
- Im bestehenden `ConsumptionDialog`: Schalter „Als Druck speichern“ mit Titel
  und Link – der schnellste Weg, ohne einen zweiten Dialog zu lernen.
- Zuordnung einer Rolle zu einer offenen Zeile (#41) erzeugt den Verbrauch
  nachträglich.

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

Anders als die Materialliste wächst die Druckhistorie unbegrenzt → **serverseitig
und seitenweise** (Cursor über `printedAt desc, id desc`).

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
  (Titel, Datum, Status, Materialspulen, Gramm, Link-Hosts), mobil zuerst.
- **`/drucke/:id`**: Detail mit Notizen, Links, Materialien, Bearbeiten.
- Auf Sorte, Gebinde-Detail und im Panel: „Letzte Drucke“ mit Link auf die
  gefilterte Liste – der Weg „über das Material wiederfinden“.
- Schnellaktion „Druck erfassen“ in `quickActions`, auch in der Schnellsuche
  (Strg/⌘ + K findet Drucke nach Titel).

### Grenzen, Protokoll, Registrierung

- `MAX_PRINT_JOBS_PER_SCOPE` (z. B. 20 000), `MAX_MATERIALS_PER_PRINT_JOB` (16),
  `MAX_LINKS_PER_PRINT_JOB` (10); Zugriffsbegrenzung auf `print.create`.
- **Kein Audit-Ereignis** – Nutzung, nicht Sicherheit.
- Neue Tabellen in alle drei Namenslisten; `print_job_materials` und
  `print_job_links` in die Ausnahmeliste des DSGVO-Wächters (Personenbezug über
  den Druck); Export-Abschnitte `printJobs` (+ Unterlisten, additiv zu v5);
  alle Löschkaskaden (Konto, Organisation; Gebinde setzt `materialId` NULL,
  Sorte löschen nur ohne Drucke oder mit Rückfrage).
- Freunde sehen keine Drucke.

---

## Phase 4 – Fotos und 3MF-Dateien (Wunsch 4, Teil 2)

Die App hat heute **keine** Dateiablage. Das ist der riskanteste Teil.

### Ablage

Empfehlung: **Dateisystem-Verzeichnis** mit Metadaten in der Datenbank, hinter
einer kleinen Schnittstelle (`api/lib/fileStorage.ts`: `put`, `get`, `delete`),
damit später ein S3-Treiber möglich ist.

- Neue Umgebungsvariable `UPLOAD_DIR` (Vorgabe `/data/uploads`), neues Volume in
  `docker-compose.yml` und im `README.md` (Backup betrifft jetzt zwei Orte).
- Verworfen: `bytea` in Postgres – eine Sicherung statt zwei, aber 3MF-Dateien
  von 20–50 MB blähen jeden `pg_dump` auf. S3 als Pflicht – zusätzlicher Dienst
  für Selbsthoster.

Tabelle `print_job_files`: `id`, `printJobId`, `kind` (`image` | `model_3mf` |
`other`), `originalName`, `mimeType`, `sizeBytes`, `sha256`, `storageKey`
(zufällig, nie aus dem Dateinamen), `width`/`height` bei Bildern, `createdAt`.
Ein Bild kann als Titelbild markiert werden (`coverFileId` am Druck).

### Upload und Auslieferung

tRPC mit superjson ist für Binärdaten ungeeignet → eigene Hono-Routen:

- `POST /api/files/print-jobs/:id` (multipart), `GET /api/files/:id`,
  `DELETE` über tRPC.
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
  weil sie das JSON sprengen würden; das JSON verweist per `sha256`.
- Kontolöschung/Org-Löschung: erst die Zeilen in der Transaktion, danach die
  Dateien; ein Aufräumlauf (neben dem Aufbewahrungslauf) löscht Dateien ohne
  Zeile – verwaiste Dateien sind sonst Daten, die niemand mehr löschen kann.

### Grenzen

- `MAX_FILES_PER_PRINT_JOB` (20), `MAX_FILE_BYTES` (Bild 10 MB nach
  Verkleinerung, 3MF 50 MB), neu: **Speicherkontingent je Bereich**
  `MAX_STORAGE_BYTES_PER_SCOPE` (z. B. 1 GB) als Summe über `sizeBytes`.
  Dasselbe Vorbehalt wie bei allen Grenzen (keine DB-Garantie).
- `/verwaltung/system`: belegter Speicher gesamt.

### Oberfläche

- Galerie auf `/drucke/:id` (shadcn `carousel`), Titelbild als Kachel in der
  Liste, Hochladen per Drag & Drop bzw. Kamera auf dem Telefon
  (`<input type="file" accept="image/*" capture>`).

### Ausbaustufe: 3MF auslesen

Eine 3MF ist ein ZIP. Slicer legen Vorschaubild und Metadaten hinein
(`Metadata/thumbnail.png`, bei Bambu Studio/OrcaSlicer `slice_info.config` mit
Filamentgewicht je Slot und Druckzeit, bei PrusaSlicer in `Metadata/`). Daraus
lassen sich beim Hochladen **Titelbild, Dauer und Gramm vorbelegen** – der
größte Komfortgewinn der ganzen Funktion und die Brücke zu Issue #41. Braucht
eine ZIP-Bibliothek (z. B. `fflate`), Grenzen gegen ZIP-Bomben (entpackte
Größe, Anzahl Einträge) und je Slicer eigene Leser mit Tests gegen echte
Beispieldateien.

---

## Reihenfolge und Releases

| Release | Inhalt                                                       | Risiko                        |
| ------- | ------------------------------------------------------------ | ----------------------------- |
| 4.0.0   | Phase 1: Sorten, Backfill, Warnung je Sorte, weitere Gebinde | hoch – Datenmodell, Export v5 |
| 4.1.0   | Phase 2: Druckeinstellungen                                  | gering                        |
| 4.2.0   | Phase 3: Druckhistorie mit Verbrauchskopplung, Suche, Filter | mittel                        |
| 4.3.0   | Phase 4: Fotos und 3MF                                       | hoch – Dateien, Datenschutz   |
| später  | 3MF auslesen, Telegram-Warnung (#17), Prusa-Anbindung (#41)  |                               |

Major-Version für Phase 1, weil sich Export-Format und Import-Semantik ändern.
Jede Stufe mit englischer Release Note (`src/release-notes/AGENTS.md` beachten)
und Versionssprung in derselben Änderung.

Jede Phase ist für sich nutzbar; Phase 3 hängt an Phase 1 (`productId`),
Phase 4 an Phase 3, Phase 2 nur an Phase 1.

## Tests (Übersicht)

- Unit: `productStock` (inkl. Gleichheit mit heute bei einer Rolle),
  `printSettings`-Schemas je Materialart, Link-Validierung, Magic-Byte-Erkennung,
  Korrektur-Alias für Drucke, `friendVisibility` unverändert grün.
- Integration: Backfill auf Altbestand (zweimal eingespielt), Sorten-Konsistenz
  (Lager gleicher Art/Stärke), Zusammenführen, Scope-Matrix aller neuen
  Prozeduren, Druck erfassen bucht ab / Löschen bucht optional zurück,
  Löschkaskaden inkl. Dateien, Obergrenzen an der Grenze, Datei-Route:
  fremder Bereich → 404, gesperrt → 403, falscher Typ abgelehnt.
- Namenslisten: `postgres.integration` gegen `information_schema`, DSGVO-Wächter.

## Offene Entscheidungen

1. **Begriff in der Oberfläche:** „Sorte“ + „Gebinde/Rolle“ (Plan) oder
   „Material“ für die Sorte und „Rolle“ für das Stück? Letzteres entspricht
   dem Sprachgebrauch („zwei Rollen vom selben Material“), ändert aber die
   Bedeutung jedes heutigen „Material“-Textes.
2. **Backfill:** konservativ wie oben, oder zusätzlich gleiche Namen
   zusammenlegen? Empfehlung: konservativ plus Vorschläge zum Zusammenführen.
3. **Dateiablage:** Dateisystem-Volume (Empfehlung) oder Postgres/S3?
4. **Druckeinstellungen für Freunde sichtbar?** Empfehlung: vorerst nein.
5. **Warnschwelle:** Gramm je Sorte (Plan) oder zusätzlich „Anzahl voller
   Rollen“ („warne, wenn weniger als 1 volle Reserverolle da ist“)?
