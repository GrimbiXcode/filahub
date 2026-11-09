# Plan: Prusa-Anbindung (#41)

Stand: Phase A ist mit 4.7.0 umgesetzt (siehe `AGENTS.md`, „G-Code
auslesen“); B bis E sind Entwurf. 4.5.0 und 4.6.0 sind anderweitig vergeben.

Issue #41: „Verbrauchsdaten direkt ab Prusa einbinden. Verbräuche könnten
geloggt und im Nachhinein den Materialien zugewiesen werden.“

## Ziel und Abgrenzung

Was ein Prusa-Drucker oder PrusaSlicer über einen Druck weiß – Gramm je
Filament, Druckzeit, Drucker, Ergebnis –, soll filahub erreichen, ohne dass
jemand es abtippt. Zugeordnet wird in filahub: Erst dort steht fest, von
welcher Rolle das Filament kam.

**Nicht im Plan:**

- **Prusa Connect (Cloud).** Keine dokumentierte Schnittstelle für Dritte; eine
  Anbindung hieße, eine nachgebaute API gegen gespeicherte Prusa-Zugangsdaten
  zu fahren. Ausdrücklich ausgeschlossen.
- **Der filahub-Server fragt den Drucker ab.** Eine gehostete Instanz erreicht
  `192.168.x.x` nicht, und eine vom Benutzer eingetragene Adresse, die der
  Server abruft, ist ein SSRF-Loch in das Netz des Betreibers. Auch nicht aus
  dem Browser: Die App läuft über HTTPS, PrusaLink über HTTP (Mixed Content),
  CORS-Kopfzeilen schickt PrusaLink nicht. Daten kommen deshalb **immer von
  innen nach außen** – aus einer Datei, die jemand wählt, oder von einem
  Absender im eigenen Netz, der filahub anruft.
- **Prusament-QR-Code auswerten.** Der Code enthält nur eine Adresse auf
  prusament.com; die Daten dahinter stehen auf einer Webseite ohne
  zugesicherte Form. Das Leergewicht der Prusament-Spulen steht ohnehin im
  Startkatalog (`db/presets/catalog.ts`).
- **Automatisches Abbuchen ohne Bestätigung.** Ein Import bucht nie selbst ab;
  erst die Zuordnung zu einem Gebinde erzeugt den Verbrauch (siehe Phase B,
  „Warum ein Eingangsfach“).

## Was schon da ist

- `print_job_materials.materialId` ist nullable (Phase 3 der Druckhistorie,
  ausdrücklich als Vorarbeit für #41). Ein Druck kann Gramm eines Materials
  nennen, ohne Rolle; erst mit Gebinde wird abgebucht.
- `print_job_materials.productId` ist in der **Datenbank** nullable (für
  verschwundene Materialien), das **Eingabeschema**
  (`printJobMaterialInputSchema`) verlangt es aber. Ein Druck, dessen Material
  noch gar nicht feststeht, passt also nicht in `print_jobs` – das ist der
  Grund für das Eingangsfach in Phase B.
- `PRINT_JOB_STATUSES` kennt `success`, `failed`, `cancelled` – genau die
  Zustände, die PrusaLink am Ende eines Drucks meldet.
- `fflate` ist schon Abhängigkeit (ZIP-Export) und kann `deflate` entpacken.

## Überblick

| Phase | Inhalt                                          | Risiko                        | Abhängig von |
| ----- | ----------------------------------------------- | ----------------------------- | ------------ |
| A     | G-Code/bgcode im Druckformular auslesen (4.7.0) | gering – keine Schemaänderung | –            |
| B     | Eingangsfach, API-Schlüssel, PrusaSlicer-Skript | hoch – neue Zugangsart        | A            |
| C     | LAN-Brücke für PrusaLink                        | mittel – eigene Komponente    | B            |
| D     | Filamentprofile ↔ Druckeinstellungen            | gering                        | –            |
| E     | OpenPrintTag (NFC) – Prototyp                   | offen – Spezifikation prüfen  | –            |

Phase A und D können sofort beginnen. Phase B ist der eigentliche Inhalt von
#41; C ist der zweite Absender für dasselbe Fach.

---

## Phase A – Slicer-Datei im Druckformular auslesen

Im `PrintJobDialog` ein Knopf „Aus G-Code übernehmen“ (auf dem Telefon:
Dateiauswahl). Die Datei wird **im Browser** gelesen und **nicht** hochgeladen;
sie belegt die Felder vor, der Mensch prüft und speichert wie bisher.

### Was PrusaSlicer in die Datei schreibt

- **ASCII-G-Code (`.gcode`):** Kennzahlen und die vollständige Konfiguration
  als Kommentare am **Ende** der Datei – `; filament used [g] = 12.34, 3.10`
  (ein Wert je Extruder/Slot), `; estimated printing time (normal mode) =
1h 2m 3s`, `; filament_type = PLA;PETG`, `; filament_colour = #FF8000;…`,
  `; filament_settings_id = "Prusament PLA";…`, `; printer_model = MK4S`.
- **Binär-G-Code (`.bgcode`, Vorgabe für MK4/Core One/XL seit PrusaSlicer
  2.7):** Kopf `GCDE`, danach Blöcke mit Typ, Größe und Kompression. Die
  Metadaten stehen in eigenen Blöcken (Datei-, Drucker-, Druck- und
  Slicer-Metadaten), die Vorschaubilder in Thumbnail-Blöcken, der G-Code in
  den übrigen.
- **Projekt-3MF aus PrusaSlicer enthält keine Gramm** – sie ist nicht geslict.
  Das unterscheidet PrusaSlicer von Bambu Studio/OrcaSlicer
  (`slice_info.config`), wovon der Plan der Druckhistorie ausging. Die 3MF
  bleibt Anhang (4.3.0), Datenquelle ist der G-Code.

### Lesen, ohne die Datei ganz zu laden

G-Code-Dateien sind schnell 50–200 MB. Gelesen wird über `File.slice`:

- ASCII: die ersten 64 KB (seit PrusaSlicer 2.6 stehen die Kennzahlen dort)
  und die letzten 512 KB (Konfigurationsblock mit Farbe, Profil, Hersteller).
- bgcode: Block für Block bis zum **ersten G-Code-Block** – laut
  Spezifikation stehen alle Metadaten davor. Höchstens 256 Blöcke, je
  Metadaten-Block höchstens 1 MB gepackt und entpackt – eine kaputte oder
  böswillige Datei darf das Formular nicht einfrieren. Prüfsummen (CRC32)
  werden geprüft. _(Umgesetzt; der Entwurf sah vor, über G-Code-Blöcke zu
  springen – unnötig.)_

### Code

- `contracts/slicerMetadata.ts` – rein, ohne DOM: `parseGcodeComments(text)`,
  `parseBgcodeBlocks(reader)` (über eine kleine Lese-Schnittstelle
  `{ size, read(offset, length) }`, damit Test und Browser denselben Code
  nutzen) und das gemeinsame Ergebnis:

  ```ts
  type SlicerJob = {
    source: "prusaslicer" | "unknown";
    fileName: string;
    title: string; // Dateiname ohne Endung und ohne Slicer-Suffix
    durationMinutes: number | null;
    printerModel: string | null;
    filaments: {
      slot: number;
      grams: number; // gerundet; Slots mit 0 g entfallen
      filamentType: string | null;
      colorHex: string | null;
      profileName: string | null;
    }[];
  };
  ```

- `matchProductsForSlicer(filament, products)` in derselben Datei: schlägt
  Materialien vor – gleiche Materialart über `normalizeMaterialType`, dann
  Profilname gegen Hersteller + Name, dann Farbabstand zum aufgelösten
  Farbcode. **Nur ein Vorschlag**; ein Gebinde wird nur vorausgewählt, wenn
  das Material genau eines in Gebrauch hat. Dieselbe Funktion nutzt Phase B.
- `src/lib/slicerFile.ts` – der Browser-Teil (File → Lese-Schnittstelle,
  Entpacken über `fflate`).
- Ergänzung in `PrintJobDialog.tsx`: Felder füllen, Hinweis „aus
  _datei.bgcode_ übernommen“, abweichende Materialart markieren.

### Entscheidungen

- **Kein Upload, kein neuer Dateityp.** `detectPrintFile` bleibt bei
  JPEG/PNG/WebP/3MF. G-Code ist groß, enthält die vollständige Konfiguration
  (inklusive Post-Processing-Zeilen, siehe Phase B) und hat als Anhang keinen
  Wert, den die 3MF nicht schon hat.
- **Vorschaubild als Titelbild – noch offen.** Das größte PNG-Thumbnail
  könnte als Foto angeboten werden – aber nur über den bestehenden Weg
  (`prepareImage` kodiert neu, der Server prüft auf Metadaten). QOI-Vorschauen
  würden übersprungen. In 4.7.0 nicht enthalten: Fotos hängen an einem
  gespeicherten Druck, das Formular legt ihn erst an.
- **`printedAt` bleibt „jetzt“.** Der Slicer kennt den Druckzeitpunkt nicht.

### Tests

`api/slicerMetadata.test.ts` gegen echte Beispieldateien unter
`api/test/fixtures/slicer/` (ASCII und bgcode, Einzel- und Mehrfarbdruck,
eine abgeschnittene und eine manipulierte Datei). Die Fixtures werden gekürzt
(G-Code-Blöcke durch leere ersetzt), damit das Repo nicht wächst.

---

## Phase B – Eingangsfach und API-Schlüssel

### Warum ein Eingangsfach statt direkt `print_jobs`

- Ein eingelieferter Druck kennt Gramm und Filamentart, aber kein Material
  aus filahub. Ihn als Druck mit Platzhalter-Material anzulegen, verunreinigte
  Historie, Suche und „Drucke mit diesem Material“.
- Eingelieferte Daten kommen von einer Maschine und sind nicht geprüft. Ein
  Fach, aus dem der Mensch übernimmt oder verwirft, hält die Historie sauber.
- Ein Slicer meldet „geslict“, nicht „gedruckt“. Erst die Bestätigung macht
  daraus einen Druck.

Übernehmen öffnet den `PrintJobDialog`, vorbelegt mit derselben Abbildung wie
in Phase A (`SlicerJob` → Formular). Gespeichert wird über den bestehenden
Pfad `createPrintJob` – samt Verbrauchskopplung, Grenzen und Stufen. Es gibt
keinen zweiten Schreibweg in `print_jobs`.

### Tabelle `print_imports`

| Spalte                       | Bedeutung                                                 |
| ---------------------------- | --------------------------------------------------------- |
| `id`                         | bigserial                                                 |
| `userId` / `organizationId`  | `ownerXor` wie alle Fachzeilen                            |
| `source`                     | Enum `slicer`, `printer`                                  |
| `externalKey`                | vom Absender, zum Entdoppeln (max. 200 Zeichen)           |
| `title`                      | Dateiname bzw. Anzeigename des Jobs                       |
| `printedAt`                  | Ende des Drucks bzw. Zeitpunkt des Slicens                |
| `status`                     | `print_job_status` (wiederverwendet)                      |
| `progressPercent`            | bei Abbruch, sonst `NULL`                                 |
| `durationMinutes`, `printer` | wie am Druck                                              |
| `filaments`                  | jsonb, Form wie `SlicerJob.filaments`, zod-geprüft        |
| `gramsEstimated`             | `true`, wenn die Gramm aus dem Fortschritt geschätzt sind |
| `apiTokenId`                 | welcher Schlüssel eingeliefert hat (Anzeige, Widerruf)    |
| `printJobId`                 | gesetzt beim Übernehmen                                   |
| `resolvedAt`                 | übernommen oder verworfen; `NULL` = offen                 |
| `createdAt`                  |                                                           |

- **Unique je Bereich auf `externalKey`** (partieller Index, von Hand in der
  Migration wie `loan_requests_open_unique`). Eine Brücke, die nach einem
  Netzfehler erneut sendet, erzeugt keinen zweiten Eintrag; die Antwort ist
  dann `200` mit der bestehenden ID statt `201`.
- **Erledigte Zeilen bleiben 30 Tage** (für das Entdoppeln) und gehen dann im
  Aufbewahrungslauf (`runRetentionSweep`).
- Übernehmen setzt `printJobId` und `resolvedAt` in **derselben** Transaktion
  wie `createPrintJob`; die Zeile wird mit `FOR UPDATE` gesperrt, damit zwei
  Klicks nicht zwei Drucke erzeugen.

### Tabelle `api_tokens`

| Spalte           | Bedeutung                                                        |
| ---------------- | ---------------------------------------------------------------- |
| `id`             | bigserial                                                        |
| `userId`         | **immer gesetzt** – ein Schlüssel ist die Vollmacht einer Person |
| `organizationId` | Zielbereich; `NULL` = privat                                     |
| `name`           | „MK4 Werkstatt“, „PrusaSlicer Laptop“                            |
| `tokenHash`      | SHA-256 des Schlüssels, Unique-Index                             |
| `tokenPrefix`    | die ersten 8 Zeichen zur Anzeige                                 |
| `lastUsedAt`     | höchstens einmal je Stunde geschrieben                           |
| `createdAt`      |                                                                  |

- **Kein `ownerXor`.** Anders als Fachzeilen gehört ein Schlüssel immer einer
  Person; der Bereich ist das Ziel, nicht der Besitzer. Der DSGVO-Wächter
  findet `userId` selbst.
- **Schlüssel:** `fh_` + 32 zufällige Bytes base64url. Er wird **einmal**
  angezeigt und nur als Hash gespeichert; SHA-256 genügt bei 256 Bit Zufall
  (kein Passwort, kein Salz nötig).
- **Ein Recht: einliefern.** Der Schlüssel kann nichts lesen, nichts ändern,
  nichts abbuchen. Ein verlorener Schlüssel füllt höchstens das Eingangsfach.
  Erweiterungen (Lesen für Home-Assistant o. ä.) bekämen eigene Rechte am
  Schlüssel, nicht stillschweigend mehr.
- **Bei jedem Aufruf neu geprüft:** Konto nicht gesperrt (`blockedAt`), und
  `resolveScope(userId, organizationId, "weigher")`. Wer aus der Organisation
  austritt oder herabgestuft wird, dessen Schlüssel wirkt damit sofort nicht
  mehr – ohne Kaskade. Aufgeräumt wird trotzdem: Austritt, Entfernen und
  Organisationslöschung löschen die betroffenen Schlüssel mit.
- **Kein Ablaufdatum in der ersten Fassung.** Widerruf ist Löschen. Ein
  Ablauf, der eine Brücke im Keller still stilllegt, ist schlimmer als ein
  Schlüssel, den man in der Liste sieht.
- **`tokenVersion` gilt nicht.** „Überall abmelden“ betrifft Sitzungen, nicht
  Schlüssel; die Einstellungsseite sagt das neben dem Knopf.

### Route

`POST /api/ingest/print-imports` als **Hono-Route**, nicht tRPC – wie
`api/fileRoutes.ts`: Absender sind Skripte, die kein superjson und kein
Batching sprechen sollen.

- `Authorization: Bearer fh_…`; **Cookies werden ignoriert.** Damit gibt es
  keine CSRF-Fläche, und keine CORS-Kopfzeilen (kein Browser als Absender).
- Körper JSON, höchstens 64 KB, geprüft **vor** dem Parsen; Schema
  `printImportInputSchema` in `contracts/printImports.ts`.
- Antworten `201 { id }`, `200 { id, duplicate: true }`, `401`, `403`
  (gesperrt, Stufe), `413`, `422` (Schema), `429` – mit `code` wie bei den
  Dateirouten.
- **Ungültige Schlüssel:** Zugriffsbegrenzung **je Adresse** (vor der
  Anmeldung gibt es nichts anderes) und Protokolleintrag
  `api_token.invalid` nur beim Zuschlagen der Begrenzung – dieselbe Regel wie
  überall: protokolliert wird die Abweisung, nicht der Versuch.

### Grenzen (`contracts/limits.ts`)

- `MAX_API_TOKENS_PER_USER` = 10
- `MAX_OPEN_PRINT_IMPORTS_PER_SCOPE` = 500 – darüber `429 inbox_full`; das
  Fach soll geleert werden, nicht wachsen.
- Einliefern 120/min je Schlüssel, ungültige Schlüssel 20/min je Adresse.
- Je Einlieferung höchstens `MAX_MATERIALS_PER_PRINT_JOB` Filamente.

### Stufen

| Vorgang                                       | Stufe                              |
| --------------------------------------------- | ---------------------------------- |
| Eingangsfach ansehen                          | `viewer`                           |
| Schlüssel für den Bereich anlegen             | `weigher`                          |
| Eintrag übernehmen                            | `weigher` (bucht ab wie ein Druck) |
| Eintrag verwerfen                             | `weigher`                          |
| eigene Schlüssel ansehen, widerrufen          | jeder                              |
| alle Schlüssel des Bereichs sehen, widerrufen | `admin`                            |

Verwerfen darf `weigher`, weil nichts verloren geht, was nicht im Drucker oder
Slicer noch stünde, und weil ein Fach, das nur `editor` leeren darf, voll
läuft.

### Audit

`api_token.created`, `api_token.revoked` (mit `reason`: `user`, `admin`,
`membership_ended`, `account_deleted`), `api_token.invalid`. Die
Einlieferungen selbst nicht – Nutzung, nicht Sicherheit.

### Absender 1: PrusaSlicer-Skript

`tools/prusaslicer/filahub-import.py`, Python 3 nur mit Standardbibliothek,
eingetragen unter Druckeinstellungen → Ausgabeoptionen →
Post-Processing-Skripte. PrusaSlicer ruft es mit dem Pfad der G-Code-Datei auf;
es liest die Kennzahlen (dieselben Zeilen wie Phase A) und schickt sie.

- **Der Schlüssel steht nicht in der Skriptzeile.** PrusaSlicer schreibt die
  vollständige Konfiguration – inklusive `post_process` – in jeden G-Code und
  jede Projekt-3MF. Ein Schlüssel dort ginge mit jeder geteilten Datei hinaus.
  Das Skript liest Adresse und Schlüssel aus einer Datei
  (`~/.config/filahub/import.json`, unter Windows `%APPDATA%\filahub\…`) oder
  aus Umgebungsvariablen.
- `externalKey` = SHA-256 aus Ausgabename und Zeitpunkt des Slicens.
- Scheitert die Einlieferung, bricht das Skript den Export **nicht** ab
  (Exit-Code 0, Meldung auf stderr) – ein Slicer, der wegen filahub nicht
  exportiert, wäre ein Fehler am falschen Ort.
- Die Einstellungsseite zeigt nach dem Anlegen eines Schlüssels die fertige
  Konfigurationsdatei zum Kopieren und die Skriptzeile je Betriebssystem.

### Oberfläche

- `/drucke/eingang` (`PrintImports.tsx`): Liste mit Titel, Zeitpunkt, Quelle,
  Gramm je Filament samt Farbfeld und Vorschlag; „Übernehmen“ öffnet den
  vorbelegten `PrintJobDialog`, „Verwerfen“ einzeln und für alle markierten.
  Kartenliste auf dem Telefon.
- Zähler offener Einträge auf „Drucke“ in der Navigation und auf der
  Übersicht.
- Einstellungen → „Verbindungen“: Schlüssel anlegen (Name, Bereich),
  einmalige Anzeige, Liste mit Präfix und „zuletzt benutzt“, widerrufen.

### Registrieren

Beide Tabellen in `COUNTED_TABLES`, den Tabellen- und Enum-Listen in
`api/postgres.integration.test.ts`, dem Export (`printImports`, `apiTokens`
**ohne** `tokenHash`; additiv, Version bleibt 5) und den Kaskaden: Konto
(Schlüssel und Fach), Organisation (Fach und Schlüssel mit dieser
`organizationId`). Eine Organisation mit offenem Fach ist nicht „leer“
(`deleteOrganizationIfEmpty`). `api/blocking.test.ts`: Die Route prüft die
Sperre selbst; der Test bekommt einen Fall dafür.

### Tests

- Unit: `printImportInputSchema`, Schlüsselerzeugung und -vergleich, die
  Abbildung `SlicerJob` → Formular, das Python-Skript gegen die Fixtures aus
  Phase A (eigener kleiner Testlauf in der CI, `python3 -m unittest`).
- Integration `api/printImports.integration.test.ts`: Einliefern mit
  gültigem, widerrufenem, fremdem und gesperrtem Schlüssel; Stufenmatrix
  positiv und negativ; Entdoppeln über `externalKey`; Austritt aus der
  Organisation macht den Schlüssel wirkungslos; gleichzeitiges Übernehmen
  erzeugt genau einen Druck; Obergrenze an der Grenze; Kaskaden.

---

## Phase C – LAN-Brücke für PrusaLink

Ein kleiner Dienst im eigenen Netz, der PrusaLink abfragt und fertige Drucke
in das Fach aus Phase B einliefert. Er meldet, was **gedruckt** wurde, auch
Abbrüche – das, was das Slicer-Skript nicht kann.

### Form

- Verzeichnis `bridge/` im Repo, eigenes `package.json`, **keine
  Abhängigkeiten** außer Node (`fetch`, Digest-Auth von Hand). Ausgeliefert
  als eigenes Container-Abbild (`ghcr.io/…/filahub-bridge`) und als einzelne
  Datei für einen Raspberry Pi.
- Konfiguration als JSON/Umgebung: filahub-Adresse, Schlüssel, Liste der
  Drucker (Adresse, API-Key bzw. Benutzer/Passwort, Anzeigename).
- Drucker-Zugangsdaten und -Adressen **verlassen das Netz nicht**; filahub
  erfährt nur den Anzeigenamen.

### Ablauf

1. Alle 10 s `GET /api/v1/status` je Drucker; während eines Drucks
   zusätzlich `GET /api/v1/job` (Job-ID, Datei, Fortschritt, Druckzeit) und
   einmal die Metadaten der Datei.
2. Wechsel von `PRINTING`/`PAUSED` nach `FINISHED`, `STOPPED` oder `ERROR` →
   Einlieferung mit `status` `success`, `cancelled` bzw. `failed`.
3. Gramm aus den Metadaten der Datei; bei Abbruch Gramm × Fortschritt,
   `gramsEstimated: true` – das Fach zeigt „geschätzt“, der Mensch korrigiert.
4. `externalKey` = Drucker-Seriennummer (sonst Anzeigename) + Job-ID +
   Startzeit.
5. Ist filahub nicht erreichbar, landet die Einlieferung in einer
   Warteschlange auf der Platte und wird mit wachsendem Abstand wiederholt;
   das Entdoppeln auf dem Server macht Wiederholungen harmlos.

### Zielgeräte

Zuerst Drucker mit Buddy-Firmware (MK4/MK4S, MK3.9, Core One, XL, MINI+) und
PrusaLink-API v1. MK3S/+ mit PrusaLink auf dem Raspberry Pi hat eine ältere
Schnittstelle – später, wenn jemand ein Gerät zum Testen hat.

### Tests

Gegen einen Nachbau der PrusaLink-Antworten (`bridge/test/fakePrusaLink.ts`,
nach dem Vorbild `api/test/fakeS3.ts`) mit aufgezeichneten echten Antworten
als Fixtures: normaler Druck, Abbruch bei 40 %, Pause, Neustart der Brücke
mitten im Druck, filahub kurz weg.

---

## Phase D – Filamentprofile ↔ Druckeinstellungen

Unabhängig von B und C. Auf der Material-Seite, Karte „Druckeinstellungen“:
„Aus PrusaSlicer importieren“ und „Für PrusaSlicer exportieren“.

- **Import** einer Filament-`.ini` (Benutzerprofil aus dem
  Konfigurationsverzeichnis oder ein Config-Bundle mit
  `[filament:…]`-Abschnitt), im Browser gelesen. Abbildung:

  | PrusaSlicer                                      | filahub                          |
  | ------------------------------------------------ | -------------------------------- |
  | `temperature`, `first_layer_temperature`         | `nozzleMinC` / `nozzleMaxC`      |
  | `bed_temperature`, `first_layer_bed_temperature` | `bedMinC` / `bedMaxC`            |
  | `chamber_temperature`                            | `chamberC`                       |
  | `max_fan_speed`                                  | `fanPercent`                     |
  | `extrusion_multiplier`                           | `flowPercent`                    |
  | `filament_retract_length` (nicht `nil`)          | `retractionHundredthsMm`         |
  | `filament_density` (g/cm³)                       | Dichte am Material (× 1000, g/L) |

  `filament_max_volumetric_speed` (mm³/s) hat kein Gegenstück in
  `speedMaxMmS` und wird nicht umgerechnet – das bräuchte Linienbreite und
  Schichthöhe. Die Dichte wird nur **angeboten**, nicht still überschrieben.
  Nur für Lager der Art `filament`.

- **Export** als Config-Bundle mit einem Abschnitt
  `[filament:filahub – <Name>]`, nur mit den Schlüsseln oben; PrusaSlicer
  übernimmt den Rest aus dem Systemprofil, von dem man es ableitet.
- Code in `contracts/prusaProfile.ts`, Tests in
  `api/prusaProfile.test.ts` gegen echte Profile (Prusament PLA, PETG, ein
  Benutzerprofil mit `nil`-Werten).

---

## Phase E – OpenPrintTag (Prototyp)

OpenPrintTag ist das offene NFC-Format von Prusa für Filamentspulen. Die Daten
– Hersteller, Materialart, Farbe, Nennmenge, Dichte – passen fast eins zu eins
auf `material_products` und die Nennmenge am Gebinde.

- **Erst prüfen, dann bauen:** genaues Datenformat (NDEF-Record, Kodierung),
  ob die Prusament-Tags beschreibbare Bereiche haben, ob die Drucker den
  Verbrauch auf das Tag zurückschreiben.
- **Lesen:** „Spule antippen“ im Materialformular belegt die Felder vor und
  sucht über `productKey` ein bestehendes Material.
- **Spule wiederfinden:** Die Tag-UID als zweite Kennung am Gebinde, damit
  Antippen den Wiegen-Dialog öffnet wie die Kennungssuche. Eigene Spalte mit
  Unique je Lager, nicht in `identifier` (die steht auf Etiketten).
- **Grenze:** Web NFC gibt es nur in Chrome auf Android. Der Knopf erscheint
  nur, wenn `"NDEFReader" in window`; auf iOS bleibt alles wie bisher. Vor der
  Umsetzung prüfen, ob `permissionsPolicy` in `api/app.ts` einen Eintrag
  braucht.

---

## Vor der Umsetzung zu prüfen

Annahmen über die Prusa-Seite, die gegen echte Dateien und Geräte geprüft
werden müssen, bevor Code entsteht:

| Annahme                                                                         | Phase | Wie prüfen                                                       |
| ------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------- |
| bgcode-Metadaten sind unkomprimiert oder `deflate` (Heatshrink nur im G-Code)   | A     | **bestätigt** (Spezifikation, Beispiele PrusaSlicer 2.6 und 2.8) |
| `filament used [g]` steht bei bgcode in den Druck-Metadaten                     | A     | **bestätigt**, auch MMU3 (echte Datei, PrusaSlicer 2.9.7)        |
| Post-Processing-Skripte bekommen ASCII-G-Code, auch wenn bgcode exportiert wird | B     | PrusaSlicer 2.9 ausprobieren                                     |
| PrusaLink v1 liefert die Gramm in den Metadaten der Datei                       | C     | `GET /api/v1/files/…` an MK4S und Core One                       |
| Job-Endzustände und Seriennummer im Status                                      | C     | Mitschnitt eines Drucks und eines Abbruchs                       |
| OpenPrintTag-Format und Schreibbarkeit                                          | E     | Spezifikation, ein Prusament-Tag auslesen                        |

Wo eine Annahme nicht stimmt, ändert sich der Leser, nicht das Eingangsfach:
Phase B hängt an keiner davon.

## Versionen

| Version  | Inhalt                                            |
| -------- | ------------------------------------------------- |
| 4.7.0    | Phase A (umgesetzt)                               |
| folgende | Phase D, Phase B (Fach, Schlüssel, Slicer-Skript) |
| danach   | Phase C (Brücke)                                  |
| später   | Phase E, je nach Prüfung                          |

Feste Nummern erst bei der Umsetzung: 4.5.0 und 4.6.0 waren schon vergeben,
als Phase A fertig wurde.

Je Version eine Release Note (englisch, nur für Benutzer; die Brücke und das
Skript bekommen ihre Anleitung im README, nicht in der Note) und der
zugehörige Abschnitt in `AGENTS.md`.
