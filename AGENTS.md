# filahub

Webapplikation zur Verwaltung eines 3D-Druck-Materiallagers: Filament, Pulver
und Harz in **Lagern** (bis fünf je Benutzer, je Lager eine Materialart),
Gebindearten (Rolle, Beutel, Flasche, Eimer, Kartusche) und Dryboxen inkl.
Leergewicht (Tara), Wägungen mit automatischer Restmengenberechnung,
Kurz-Kennungen zum schnellen Wiederfinden, Login ausschließlich über Telegram. Benutzer können sich als
Freunde verbinden, ihr Lager abgestuft freigeben und Material untereinander
anfragen. Seit 2.5.0 kann ein Lager statt einer Person auch einer
**Organisation** gehören – gemeinsamer Bestand mehrerer Personen mit vier
Stufen. Die Oberfläche spricht Deutsch und Englisch (umschaltbar pro
Benutzer).

## Tech-Stack

- **Frontend:** React 19, Vite 8, TypeScript (strict), Tailwind CSS v4,
  shadcn/ui (Radix-Primitives, siehe `src/components/ui/`), react-router 7,
  TanStack Query, react-hook-form + zod
- **Backend:** Hono 4 + tRPC 11 (Fetch-Adapter), `@hono/node-server`
- **Datenbank:** Drizzle ORM + PostgreSQL (`pg`, `drizzle-kit`)
- **Auth:** Telegram Login Widget + Bot-Code-Login, JWT-Session-Cookie (`jose`, HS256)
- **Laufzeit:** Node.js 26 (siehe `.nvmrc`), ESM (`"type": "module"`), Port 3000 (via `PORT` änderbar)

## Projektstruktur

```
src/            React-Frontend
  pages/        Routen: Home, MaterialDetail, Lager, ContainerTypes, StorageBoxes,
                Appearance (eigene Farben und Oberflächen),
                Import, Friends, FriendInventory, Organizations,
                OrganizationDetail, Settings, AdminPresets,
                AdminProposals, AdminSystem, Login, NotFound
  components/   App-Komponenten + ui/ (shadcn); AuthLayout (Seitenleiste,
                mobile Kopfzeile), PageHeader (Seitenkopf), QuickActions
                (Dialoge + Schnellsuche), ThemeToggle
  providers/    trpc.tsx (tRPC-Client, superjson, httpBatchLink auf /api/trpc),
                format.tsx (bindet die Formatierer an den angemeldeten Benutzer),
                theme.tsx (Farbschema über next-themes)
  hooks/        useAuth, use-mobile, useReleaseNotes
  lib/          activeScope.ts (aktiver Bereich: privat oder Organisation),
                activeLager.ts (gewähltes Lager, je Bereich getrennt),
                organizationRole.ts (Stufen-Beschriftungen),
                formatContext.ts (useFormat), format.ts (Füllstandsfarben),
                appearance.ts (Katalog-Hook, Auflösung und Feld-Beschriftung),
                theme.ts (Farbschema-Konstanten + useAppTheme),
                quickActions.ts (Store der Schnellaktionen),
                releaseNotes.ts (lädt src/release-notes/ per import.meta.glob),
                appVersion.ts, importPrompt.ts, utils.ts (cn-Helfer)
  release-notes/ Inhalt der Seite „Neuerungen": release_vX.Y.Z.md + images/.
                **Englisch**, eigene AGENTS.md im Verzeichnis
  types/        index.ts (Router-Typen), global.d.ts (__APP_VERSION__)
api/            Hono/tRPC-Backend
  boot.ts       Server-Einstieg: tRPC unter /api/trpc, in Prod statische Files + Telegram-Bot
  devLogin.ts   /api/dev-login – Anmeldung ohne Telegram, nur lokal mit DEV_LOGIN=1
  router.ts     appRouter: ping, auth, lager, containerType, storageBox, material,
                appearance, friend, organization, preset, admin
                (admin: preset, proposal, system)
  scope.ts      resolveScope / scopeWhere / scopeOwner – die einzige Stelle, die
                eine `organizationId` aus einer Eingabe auflöst und übersetzt
  middleware.ts publicQuery / authedQuery / adminQuery (tRPC-Prozeduren)
  context.ts    TrpcContext: { req, resHeaders, user? } – Auth ist optional im Context
  lib/          env.ts (zentrale Env-Variablen), cookies.ts, http.ts, vite.ts (Static-Serving)
  telegram/     auth.ts (Session-Cookie → User), session.ts (JWT), widget.ts, bot.ts (Polling-Bot mit /id, /login),
                send.ts (ausgehende Nachrichten – ohne die Polling-Schleife importierbar)
  queries/      connection.ts (getDb/getPool, Drizzle-Instanz), users.ts, filament.ts,
                lager.ts (Lager-CRUD, Obergrenze, Belegung, Löschkaskade),
                friends.ts (Lager-Freigaben, Projektion, Ausleih-Vorgänge),
                organizations.ts (Mitglieder, Einladungen, Löschkaskade),
                appearance.ts (eigene Farben und Oberflächen, Katalog je Besitzer),
                patch.ts (leerer Änderungssatz), presets.ts (Preset-Katalog),
                presetSeed.ts (Startkatalog),
                systemStatus.ts (Zustand für /verwaltung/system)
db/             schema.ts, relations.ts, seed.ts, presets/catalog.ts (Startkatalog),
                migrations/ (drizzle-kit-Output)
contracts/      Gemeinsamer Code für Client+Server: constants.ts (Session, Paths), errors.ts,
                types.ts, import.ts, friends.ts (Freigabestufen, Freundescode),
                codes.ts (Alphabet und Normalform beider Codes),
                organizations.ts (Stufen, Beitrittscode, Obergrenzen),
                materials.ts (Materialarten, Gebindeformen, Dichte, Zweiteinheiten),
                appearance.ts (Farbkatalog, Musterarten, Auflösung, Kontrastfarbe),
                notifications.ts (Texte der Telegram-Nachrichten),
                presets.ts (Preset-Schemas + reine Hilfsfunktionen),
                locale.ts (Währungs-/Locale-Listen + Schemas), format.ts (Formatierer),
                releaseNotes.ts (Frontmatter, Versionsvergleich, Ungelesen-Logik)
```

## Pfad-Aliase

In Vite, allen tsconfigs und vitest konfiguriert:

- `@/*` → `src/*`
- `@contracts/*` → `contracts/*`
- `@db/*` → `db/*` (zusätzlich `"db"` in der Vite-Config)

## Befehle

| Befehl                               | Zweck                                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `npm run dev`                        | Vite-Dev-Server mit HMR auf Port 3000; das Backend läuft via `@hono/vite-dev-server` mit (`api/boot.ts`) |
| `npm run check`                      | TypeScript-Prüfung (`tsc -b`, Projekt-Referenzen)                                                        |
| `npm run build`                      | `vite build` → `dist/public`, dann esbuild-Bundle von `api/boot.ts` → `dist/boot.js`                     |
| `npm start`                          | Produktionsstart: `NODE_ENV=production node dist/boot.js`                                                |
| `npm run test`                       | Vitest ohne Datenbank (`vitest run`)                                                                     |
| `npm run test:integration`           | Vitest gegen eine echte Postgres-Datenbank (braucht `TEST_DATABASE_URL`)                                 |
| `npm run lint`                       | ESLint (Flat-Config)                                                                                     |
| `npm run format`                     | Prettier über das Repo – ohne generierte und upstream-nahe Dateien, siehe `.prettierignore`              |
| `npm run format:check`               | Prüft dieselben Dateien, ohne sie zu ändern (läuft in der CI)                                            |
| `npm run db:push`                    | Drizzle-Schema direkt in die DB synchronisieren                                                          |
| `npm run db:generate` / `db:migrate` | Migrationen erzeugen / anwenden (Output: `db/migrations/`)                                               |
| `npm run db:seed`                    | Startkatalog der Presets einspielen (idempotent)                                                         |

TypeScript ist in drei Projekte aufgeteilt (`tsconfig.json` mit Referenzen):
`tsconfig.app.json` (`src/`), `tsconfig.server.json` (`api/`, `contracts/`,
`db/`), `tsconfig.node.json`. Alle mit `strict: true`.

## Architektur im Detail

- **Dev vs. Prod:** In der Entwicklung bettet `@hono/vite-dev-server` das
  Backend in Vite ein (`vite.config.ts`). In Produktion baut esbuild das
  Backend als einzelnes ESM-Bundle (`dist/boot.js`), das die statischen
  Frontend-Dateien aus `dist/public` ausliefert (`api/lib/vite.ts`) und den
  Telegram-Bot startet (`api/telegram/bot.ts`).
- **tRPC-Konventionen:** Router in `api/*Router.ts` über `createRouter`;
  Eingabevalidierung mit zod; Transformer ist `superjson` (Client und Server).
  Geschützte Prozeduren mit `authedQuery` bzw. `adminQuery` (trotz des Namens
  sind beide generische Prozeduren für Query **und** Mutation).
- **Mandantenfähigkeit:** Seit 2.5.0 gehört jede Fachzeile (`lager`,
  `materials`, `container_types`, `storage_boxes`) **entweder** einer Person
  (`userId`) **oder** einer Organisation (`organizationId`) – erzwungen durch
  `CHECK (num_nonnulls("userId","organizationId") = 1)`. Keine Abfrage nimmt
  eine `organizationId` aus der Eingabe an; aufgelöst wird sie an genau einer
  Stelle (`resolveScope` in `api/scope.ts`), übersetzt an genau einer weiteren
  (`scopeWhere`). Jede Abfragefunktion nimmt einen `Scope` dort, wo bis 2.4.1
  die `userId` stand – siehe den Abschnitt „Organisationen“ unten.
  **Zwei Ausnahmen:** die `preset_*`-Tabellen sind ein globaler, von
  Administratoren gepflegter Katalog und haben bewusst keine `userId`. Der
  Benutzerbezug steckt allein in `hidden_container_presets` (Ausblenden) und
  `preset_proposals` (Einreicher); beide bleiben persönlich, auch im
  Org-Kontext. Die zweite sind die Freundes-Lesepfade – siehe den eigenen
  Abschnitt unten.
- **Auth-Fluss:** `createContext` ruft `authenticateRequest` auf; nicht
  angemeldete Requests bekommen `user: undefined` statt eines Fehlers –
  die Prozedur-Middleware entscheidet. Session = JWT (HS256, 1 Jahr) im
  Cookie `filament_sid`. Außerhalb von localhost wird das Cookie als
  `Secure; SameSite=None` gesetzt → HTTPS ist im Produktivbetrieb Pflicht.

## Lager, Materialarten und Zweiteinheiten

Seit 2.2.0 liegt jedes Material in genau einem **Lager** (`materials.lagerId`,
`NOT NULL`). Das Lager trägt die Konfiguration, die für alles darin gilt.

- **Materialart und Filamentstärke stehen am Lager, nicht am Material.** Eine
  Kopie am Material wäre eine zweite Wahrheit; wer sie braucht, liest sie über
  `lagerId` – die Materialabfragen laden das Lager ohnehin mit. Folge: Ein
  Lagerwechsel verändert die Zweitanzeige eines Materials, und das ist richtig
  so. Deshalb gibt es in `validateForeignKeys` auch **keine** Konsistenzregel
  zwischen Material und Lager – es kann nichts auseinanderlaufen.
- **`filamentDiameterUm` in Mikrometern** (1750/2850), nicht in Millimetern:
  1,75 mm ist als Integer-Millimeter nicht darstellbar, und ein Gleitkommawert
  für eine Größe, die in die Längenrechnung eingeht, wäre die schlechtere Wahl.
  Ein Wert je Lager, keine Liste – wer beide Stärken führt, legt zwei Lager an.
  Geprüft wird das in `lagerConfigIsValid` (`contracts/materials.ts`).
- **Die Obergrenze von fünf (`MAX_LAGER_PER_USER`) ist die einzige Zusicherung
  dieser Funktion, die nicht die Datenbank garantiert.** Ein Zähler ist weder
  als Unique- noch als partieller Index ausdrückbar; geprüft wird in
  `lager.create`. Zwei gleichzeitige Anfragen können ein Lager zu viel erzeugen.
  Der Wert gilt vorerst global für alle Konten; soll er später pro Konto
  steigen, wird aus der Konstante eine Vorgabe.
- **Löschen nur, wenn leer** – wie bei den Dryboxen. Sonst hinge Material an
  einer neu vergebenen ID; es gibt keine Fremdschlüssel.
- **Zweiteinheit je Materialart:** Filament → Meter, Harz → Liter, Pulver →
  nichts. Gerechnet wird in `secondaryAmount` (`contracts/materials.ts`),
  serverseitig in `computeMaterialStats`, weil die Rechnung Materialart und
  Stärke braucht. **Gramm bleiben die gespeicherte und die eingegebene
  Einheit**; die Zweitanzeige geht nie in die Restmengenrechnung ein.
- **Dichte**: optional am Material, sonst Vorgabe nach Materialart-Bezeichnung
  („PLA Silk" trifft „PLA"), sonst nach Materialart. Die Priorität steht an
  genau einer Stelle: `resolveDensity`. Bei Pulver gibt es bewusst keinen Wert –
  Schüttdichte wäre geraten, und eine falsche Zahl ist schlimmer als keine.
- **`materials.texture`** ist Freitext mit Vorschlagsliste (`COMMON_TEXTURES`),
  kein Enum – aus demselben Grund wie `materialType`. Bis 2.1.0 wurde die
  Oberfläche in `materialType` geschmuggelt („PLA Silk"), was den
  Materialart-Filter zersplitterte: Er vergleicht exakt, also fanden sich „PLA"
  und „PLA Silk" gegenseitig nie.
- **Die Migration `0009_lager.sql` ist von Hand ergänzt.** drizzle-kit erzeugt
  ein nacktes `ADD COLUMN ... NOT NULL`, das auf jeder Datenbank mit Daten
  scheitert. Der Backfill legt je Benutzer ein Lager „Mein Lager" an, füllt
  `lagerId` und zieht die Spalte erst danach fest. Er läuft in Produktion genau
  einmal; abgedeckt ist er in `api/lager.integration.test.ts`.
- **Gebindeformen seit 2.3.0** (`CONTAINER_FORMS`, `contracts/materials.ts`):
  Rolle, Beutel, Flasche, Eimer, Kartusche, Sonstiges. `container_types.form` ist
  Pflicht mit Vorgabe `rolle` – bis 2.2.0 konnte dort nichts anderes stehen, der
  Backfill ist also der tatsächliche Stand. `preset_container_versions.form`
  bleibt dagegen `NULL` für Altbestand: Der Startkatalog führt nur Spulen, aber
  Einträge von Administratoren und aus der Community können alles sein, und eine
  geratene Form würde später als gepflegt gelesen.
- **`FORMS_BY_KIND` ordnet Formen den Materialarten zu und ist eine
  Sortierhilfe, kein Filter.** Der Startkatalog hat noch keine Harz- oder
  Pulvereinträge; gefüllt wird er über Administration und Community-Vorschläge.
- **Die Migration `0012_lager_shares.sql` ist ebenfalls von Hand ergänzt** – aus
  dem umgekehrten Grund: drizzle-kit erzeugt `CREATE TABLE` und `DROP COLUMN`
  richtig, kennt aber die **Übertragung** der Stufen aus `friendships` nach
  `lager_shares` nicht. Ohne sie verlöre jeder Freund still, was er sehen durfte.
  Der `DROP COLUMN` steht bewusst am Ende und in derselben Transaktion; er ist
  nicht umkehrbar, der Backfill muss beim ersten Mal stimmen.

## Farbe und Oberfläche als Darstellung

Seit 2.7.0 zeigt die Übersicht Farbe und Oberfläche nicht nur als Text, sondern
als ein Feld: die Farbe als Fläche, die Oberfläche als Muster darüber
(`src/components/AppearanceSwatch.tsx`, Spalte `appearance`).

- **`materials.color` und `materials.texture` bleiben Freitext.** Es gibt keinen
  Fremdschlüssel auf einen Katalog; die Auflösung Name → Farbcode passiert beim
  Anzeigen über die Vergleichsform (`normalizeAppearanceName`). Der Preis: Ein
  umbenannter Katalogeintrag zieht nichts nach. Der Gewinn: Ein gelöschter
  Eintrag beschädigt kein Material, und Farbnamen bleiben frei eintippbar.
- **Zwei Quellen, eine Rangfolge.** Der mitgelieferte Katalog steht im Code
  (`BUILTIN_COLORS`, `BUILTIN_TEXTURES` in `contracts/appearance.ts`) – für alle
  gleich, versionierbar, ohne Migration. Eigene Einträge liegen in
  `custom_colors` / `custom_textures` (Benutzer **oder** Organisation, `ownerXor`
  wie die Gebindearten) und **schlagen** den Katalog.
- **Der Name ist offen, die Zeichnung nicht.** `custom_textures.kind` ist eine
  Aufzählung (`TEXTURE_KINDS`). Eine eigene Oberfläche ordnet ihren Namen einer
  mitgelieferten Musterart zu; alles andere hieße, Zeichenanweisungen aus der
  Datenbank zu laden.
- **`COMMON_TEXTURES` und `BUILTIN_TEXTURES` dürfen nicht auseinanderlaufen** –
  sonst schlägt ausgerechnet der Wert fehl, den das Formular selbst
  vorgeschlagen hat. `api/appearance.test.ts` nagelt das fest.
- **Das Muster hat keine feste Farbe.** `overlayInk` nimmt die kontrastreichere
  von Schwarz und Weiß zur Grundfarbe; damit bleiben rechnerisch immer
  mindestens 4,5:1, und es gibt keine Grundfarbe, auf der die Zeichnung
  verschwindet (weißer Glanzstrich auf weißem Filament). Abgesichert über ein
  Raster durch den ganzen Farbraum, ebenfalls in `api/appearance.test.ts`.
- **Ohne Farbcode wird nicht geraten**, sondern ein schraffiertes Feld gezeigt.
  Ein aus dem Namen gehashter Ton machte aus „Feuerrot“ irgendwann Grün.
- **Bei Freunden löst der Server auf** (`toFriendMaterial`), weil der Katalog des
  Betrachters die Farben des Freundes nicht kennt. `FriendMaterial` trägt dafür
  `colorHex` und `textureKind`; die festgenagelte Schlüsselmenge in
  `api/friendVisibility.test.ts` wurde dafür bewusst erweitert. Überall sonst
  löst der Browser auf – ein Katalogaufruf je Seite, nicht zwei Felder je Zeile.

## Namenslisten, die kein Compiler prüft

Drei Stellen führen Tabellennamen **wörtlich**. Beim Umbenennen einer Tabelle
müssen alle drei mit:

| Ort                                                            | Folge eines Versehens                          |
| -------------------------------------------------------------- | ---------------------------------------------- |
| `api/postgres.integration.test.ts` (Tabellen- und Enum-Listen) | roter Test                                     |
| `api/account.integration.test.ts` (DSGVO-Wächter, zwei Listen) | roter Test                                     |
| `api/queries/systemStatus.ts` → `COUNTED_TABLES`               | **500 auf `/verwaltung/system`, zur Laufzeit** |

Seit 2.5.0 stehen `organizations`, `organization_members` und
`organization_invitations` in allen dreien. Der DSGVO-Wächter findet dabei
`organization_members.userId` sowie `invitedUserId` und `invitedByUserId`;
`organizations` selbst hat bewusst **keine** Benutzerspalte.

`COUNTED_TABLES` ist der gefährliche Fall: Die Namen gehen über
`sql.identifier()` ins SQL, `tsc` sieht dort nichts. Zwei Fehlerrichtungen, beide
schon vorgekommen – ein **veralteter** Name (500 zur Laufzeit) und eine
**fehlende** Tabelle (die Seite zeigt weiter etwas, nur nicht alles: `lager`
fehlte seit 2.2.0, `friendships` und `loan_requests` seit 2.1.0). Seit 2.4.0
vergleicht `api/postgres.integration.test.ts` die Liste gegen
`information_schema`; beide Richtungen sind damit rot statt still.

Der DSGVO-Wächter prüft `column_name ILIKE '%userid%'` und nicht `= 'userId'` –
sonst wäre er eine Benennungsvorschrift statt einer Prüfung, und eine Tabelle,
die ihre Empfänger-Spalte ehrlich `sharedWithUserId` nennt, rutschte durch. Was
er selbst findet, muss niemand pflegen; die handgeführte Ausnahmeliste umfasst
nur noch `profile` (über `users.id`), `weighings` (über das Material) und
`loginCodes` (über die Telegram-ID).

**Umbenennungen werden von Hand migriert.** drizzle-kit erkennt sie nicht und
gibt `DROP TABLE` + `CREATE TABLE` aus – das löscht Daten. Und
`ALTER TABLE … RENAME TO` benennt Indizes, Constraints, Primärschlüssel und
Sequenzen **nicht** mit; weil `db/schema.ts` sie namentlich führt, will
drizzle-kit sie danach neu anlegen. Vorbild ist `0010_container_rename.sql` (23
Objekte, gegen `pg_class` und `pg_constraint` abgeglichen). Die Probe, dass
nichts fehlt: `npm run db:generate` muss danach eine **leere** Migration
erzeugen.

## Freunde und geteiltes Lager

Die einzige Funktion, die die Mandantengrenze absichtlich überschreitet. Ein
Fehler hier ist keine kaputte Ansicht, sondern eine Datenpanne – entsprechend
eng sind die Regeln. Alles davon steckt in `api/queries/friends.ts`.

- **Die Freigabe hängt am Lager, nicht an der Freundschaft** (`lager_shares`,
  seit 2.4.0): eine Stufe je Lager **und** Empfänger. `friendships` trägt nur
  noch Status und Richtung der Anfrage. Wer sein Filament gern teilt, sein teures
  Harz aber nicht, kann das damit ausdrücken; vorher gab es nur „alles“ oder
  „nichts“. Jede Seite entscheidet allein über ihre eigenen Lager – ein Lager hat
  genau einen Eigentümer, und der steht am Lager.
- **Eine fehlende Zeile ist `none`.** Es gibt keine `none`-Zeilen; wer eine
  Freigabe zurücknimmt, löscht sie. „Nicht freigegeben“ ist damit der
  Grundzustand und kein Wert, den erst jemand schreiben muss – ein neu angelegtes
  Lager ist ohne Zutun privat, und es gibt keine Voreinstellung beim Annehmen
  einer Freundschaft (die Begründung steht dort, wo bis 2.3.0
  `DEFAULT_FRIEND_VISIBILITY` stand).
- **Ob eine Freigabe gilt, entscheidet genau eine Funktion:** `resolveShare`.
  Freigabe und Freundschaftsstatus stehen in **zwei Tabellen**, deshalb nimmt sie
  beides. Die Statusprüfung darf **nicht** ins SQL wandern: Sonst behielte eine
  abgelehnte oder aufgelöste Freundschaft ihren Zugriff. Ein Unit- und ein
  Integrationstest halten genau das fest.
- **Zwei Kaskaden, beide unverzichtbar.** `deleteFriendship` löscht die Freigaben
  **beider Richtungen** – sonst weckt eine erneut geschlossene Freundschaft alten
  Zugriff wieder auf, ohne dass jemand etwas freigegeben hätte. `deleteLager`
  löscht die Freigaben dieses Lagers – sonst zeigt eine `lagerId` mangels
  Fremdschlüssel später auf ein neu vergebenes Lager. Dieselbe Reihenfolge gilt
  bei der Kontolöschung: Freigaben **vor** den Lagern.
- **Jede Lesefunktion nimmt `viewerId` als ersten Parameter** und ermittelt die
  freigegebenen Lager selbst (`listVisibleLager`, `shareLevelFor`). Keine nimmt
  eine Lager- oder Besitzerliste von außen an – sonst wäre die Prüfung eine Frage
  der Disziplin am Aufrufort. Der Suchpfad filtert zusätzlich auf
  `materials.userId`: redundant, solange kein Material in einem fremden Lager
  liegt, und genau deshalb billig.
- **Der Lagername geht nie hinaus, auch nicht als Kennung.** Die Liste eines
  Freundes bleibt flach und wird nicht nach Lagern gruppiert; der Empfänger
  erfährt nicht, aus wie vielen Lagern seine Treffer kommen. Ein Lagername ist
  Freitext und kann einen Ort verraten – dieselbe Erwägung, die die Drybox
  ausschließt.
- **`FriendMaterial` ist handgeschrieben**, nicht aus dem Schema abgeleitet, und
  `toFriendMaterial` ist die einzige Stelle, die es erzeugt. Wer `materials` um
  eine Spalte erweitert, muss sie hier eintragen – `api/friendVisibility.test.ts`
  nagelt die Schlüsselmenge fest. Draußen bleiben: `priceCents` (immer),
  `notes`, `purchaseDate`, alles zur Drybox, der Wägungsverlauf, `lagerId` und
  der Lagername (Freitext, kann einen Ort verraten) sowie
  `densityGramsPerLiter`.
- **Die Zweitanzeige rechnet der Server, auch für Freunde.** Sie braucht
  Materialart und Filamentstärke, und beide hängen am Lager; im Browser
  gerechnet müsste die Projektion sie einzeln herausgeben – zwei Felder mehr für
  eine Division. Deshalb lädt `FRIEND_MATERIAL_WITH` vom Lager **nur**
  `materialKind` und `filamentDiameterUm`: Was nicht in der Zeile steht, kann
  keine Projektion durchlassen.
- **Die Drybox ist unsichtbar, ihr Leergewicht zählt trotzdem.** Wird ein
  Gebinde in seiner Drybox gewogen, ist die Restmenge
  `grossWeight − Gebindetara − Boxtara`. Wer den Box-Join weglässt, „weil Freunde
  die Box nicht sehen dürfen“, meldet eine zu hohe Restmenge – also genau die
  Zahl falsch, um die es geht.
- **Die Suche bei Freunden läuft serverseitig**, anders als die im eigenen Lager
  (`Home.tsx`, `QuickActions.tsx`). Das ist der Kern der Stufe `search`: Läge
  die Liste im Browser, wäre die Stufe mit einem Blick in die
  Entwicklerwerkzeuge ausgehebelt. Der Pflicht-Suchbegriff (zwei Zeichen) steht
  deshalb an **zwei** Stellen – im Router und in
  `findFriendMaterialsForSearch` –, und `%`/`_` werden maskiert. `notes` wird
  nicht durchsucht: keine Treffer über Text, den man nicht sehen darf.
- **Zwei Riegel liegen in der Datenbank** und nur in der Migration
  `0008_friends.sql`, weil drizzle-kit sie nicht erzeugen kann: ein
  Ausdrucks-Index über `LEAST/GREATEST` gegen die gespiegelte Freundschaft und
  ein partieller Unique-Index für „höchstens eine _offene_ Anfrage je Person und
  Material“. Bei künftigen Schema-Änderungen in die neue Migration übernehmen;
  `api/friends.integration.test.ts` prüft, dass beide existieren.
- **Freundschaften werden protokolliert, Ausleih-Anfragen nicht** (`friend.*` in
  `contracts/audit.ts`). Erstere ändern Zugriffsrechte, letztere sind Nutzung –
  die Grenze zieht der Kommentar in `contracts/audit.ts`.
  `friend.visibility_changed` trägt `{ lagerId, visibility }`; ohne die Lager-ID
  beantwortete der Eintrag nicht, wer Zugriff auf **was** bekam. Ein gelöschtes
  Lager schreibt je betroffenem Freund denselben Eintrag mit
  `visibility: "none"` und `reason: "lager_deleted"` – ein eigenes
  `lager.deleted` sagte nicht, wessen Zugriff endete.
- **`sendTelegramMessage` gibt `boolean` zurück** (`api/telegram/send.ts`).
  Telegram lässt einen Bot nur schreiben, wenn der Empfänger den Chat einmal
  geöffnet hat; wer nur das Login-Widget benutzt hat, ist unerreichbar. Der
  Vorgang liegt trotzdem in der App, und die Oberfläche sagt das (`notified`).

## Organisationen

Seit 2.5.0. Gemeinsamer Bestand mehrerer Personen – Firmen, 3D-Druck-Hubs von
Hochschulen, Bastelwerkstätten. Die zweite Stelle nach den Freundes-Lesepfaden,
an der die Mandantengrenze absichtlich überschritten wird, und die
weitreichendere: Ein Mitglied sieht nicht eine gefilterte Projektion, sondern
den Bestand selbst, und je nach Stufe darf es ihn ändern.

- **Eigentum ist ein Entweder-oder.** `userId` **oder** `organizationId`, nie
  beides und nie keines (`CHECK num_nonnulls(…) = 1`). Bei einer Org-Zeile ist
  `userId` **NULL** – das ist die tragende Entscheidung: Jede Abfrage, die noch
  auf `eq(tabelle.userId, ctx.user.id)` filtert, schließt Org-Daten damit
  automatisch aus. Eine vergessene Bedingung fällt **zu**, nicht auf. Stünde
  dort der Ersteller, lieferte jede noch nicht angepasste Abfrage still
  Org-Daten in die private Ansicht, und ein ausgetretenes Mitglied behielte
  Zugriff auf alles, was es selbst angelegt hat. Aus demselben Grund bleibt die
  Löschkaskade in `deleteUserAccount` unverändert richtig.
- **Kein `createdByUserId` auf Org-Zeilen.** Wer was eingebucht hat, wäre ein
  Nutzungsprotokoll – dieselbe Grenze, die `contracts/audit.ts` schon zieht. Der
  Verzicht hält die Org-Daten frei von Personenbezug: Beim Kontolöschen ist
  nichts zu anonymisieren, und der Datenexport muss keinen fremden Bestand
  mitliefern. Auch `organizations` selbst hat keine `ownerUserId` – wer
  verwaltet, steht in der Mitgliedschaft, und eine zweite Spalte wäre eine
  zweite Wahrheit.
- **Genau eine Stelle entscheidet.** `resolveScope(viewerId, organizationId,
required)` in `api/scope.ts` löst die Behauptung aus der Eingabe gegen die
  Mitgliedschaft auf und prüft die Stufe. Ein `Scope` entsteht **nur** dort.
  Jede Abfragefunktion nimmt ihn als ersten Parameter, an der Stelle, an der bis
  2.4.1 die `userId` stand; wer die Auflösung vergisst, bekommt einen
  Compile-Fehler. Übersetzt wird er an genau einer weiteren Stelle
  (`scopeWhere`). Was der Typ **nicht** fängt, ist eine zu niedrig angesetzte
  Stufe – dafür ist die Matrix in `api/organizations.integration.test.ts` da,
  positiv **und** negativ.
- **Nicht-Mitglied → `NOT_FOUND`, zu niedrige Stufe → `FORBIDDEN`.** Die
  Existenz einer fremden Organisation geht niemanden an; wer Mitglied ist, kennt
  sie ohnehin, und „nicht gefunden“ wäre dort eine Lüge, die beim Suchen des
  Fehlers kostet.

Die vier Stufen (`contracts/organizations.ts`, `roleAllows` nach dem Vorbild von
`visibilityAllows`):

| Vorgang                                                                                             | Stufe     |
| --------------------------------------------------------------------------------------------------- | --------- |
| Bestand, Lager, Gebindearten, Dryboxen ansehen; suchen                                              | `viewer`  |
| Wägung erfassen (**abbuchen**); die eigene gerade eben korrigieren                                  | `weigher` |
| Material anlegen/ändern/löschen, Import, Gebindearten und Dryboxen pflegen; **jede** Wägung löschen | `editor`  |
| Lager anlegen/ändern/löschen, Mitglieder und Stufen, Beitrittscode, Org selbst                      | `admin`   |

Ein Lager ist Struktur und sein Löschen wirkt auf alle – deshalb `admin`, obwohl
das Material darin schon `editor` darf.

**`weigher` darf korrigieren, nicht aufräumen.** Eine Wägung löschen darf diese
Stufe nur, wenn es die **zuletzt erfasste** des Materials ist und ihr
`createdAt` weniger als `WEIGHING_CORRECTION_MINUTES` (15) zurückliegt.
Andernfalls braucht es `editor`. Der Grund: `weigher` ist die Stufe, die man
freigebig vergibt – ohne diese Grenze könnte sie die gesamte Wägungsgeschichte
der Organisation abräumen, unwiderruflich und ohne Spur, weil Wiegen bewusst
nicht protokolliert wird. Die Regel steht als `mayDeleteWeighing` in
`contracts/organizations.ts` und wird von **beiden** Seiten aufgerufen, vom
Riegel in `material.deleteWeighing` und von der Sichtbarkeit des Knopfes in
`MaterialDetail.tsx`; zwei Fassungen liefen auseinander. Verglichen wird
`createdAt` und nicht `weighedAt` – letzteres ist eine Eingabe und ließe sich
auf „jetzt“ setzen. „Zuletzt erfasst“ heißt höchste `id`, nicht jüngstes
`weighedAt`.

**`admin` heißt zweierlei, und die beiden haben nichts miteinander zu tun.**
`users.role = "admin"` ist der Betreiber der Instanz (Preset-Katalog,
`/verwaltung/system`, `adminQuery`) und gewährt **keinen** Zugriff auf den
Bestand irgendeiner Organisation. Wer eine Organisation verwaltet, steht
ausschließlich in `organization_members.role`.

Weiteres, das beim Umbau leicht kippt:

- **Es bleibt immer mindestens ein Administrator.** `setMemberRole`,
  `removeMember` und `leave` verweigern den Schritt – geprüft **in** der
  Transaktion und mit `FOR UPDATE`, sonst kämen zwei gleichzeitig
  Zurücktretende beide durch. Einzige Ausnahme ist die Kontolöschung nach
  Art. 17 DSGVO (`handleAdminAccountDeletion`): Sie befördert das am längsten
  dabei befindliche Mitglied oder löscht die Organisation samt Bestand, wenn es
  keines mehr gibt.
- **Eine Einladung gilt nur, solange ihr Urheber verwaltet.** Sonst überlebte
  die Vollmacht ihren Träger. Beantworten und Aufnehmen laufen in **einer**
  Transaktion; scheitert das Aufnehmen, bleibt die Einladung offen, statt
  verbraucht und wegen des partiellen Unique-Index auf `pending` nicht einmal
  neu ausstellbar zu sein.
- **Ein Org-Lager lässt sich nicht an Freunde freigeben.** Semantisch dürfte ein
  einzelner Administrator nicht den Bestand aller nach außen öffnen; technisch
  hängt die ganze Freigabe an `lager.userId`. Der Riegel steht trotzdem
  ausdrücklich in `friendRouter.setLagerVisibility` – „fällt von selbst zu“ ist
  kein Riegel. Die erklärende Meldung bekommt nur, wer Mitglied der besitzenden
  Organisation ist; sonst wäre sie ein Orakel über fremde Lager-IDs.
- **`hidden_container_presets` und `preset_proposals` bleiben persönlich.**
  Beides betrifft den globalen Katalog, nicht den Bestand – ein Eintrag, den ein
  Kollege ausblendet, soll nicht bei allen verschwinden. `preset.copyToOwn` legt
  dagegen im **aktiven** Bereich an: Die Kopie ist eine `container_types`-Zeile.
- **Die Obergrenzen garantiert die Datenbank nicht** (`MAX_LAGER_PER_ORGANIZATION`
  10, `MAX_ORGANIZATIONS_PER_USER` 3, `MAX_MEMBERS_PER_ORGANIZATION` 100) –
  derselbe Vorbehalt wie bei `MAX_LAGER_PER_USER`.
- **Im Client** liegt der aktive Bereich in `src/lib/activeScope.ts`
  (`useSyncExternalStore` über `localStorage`, kein Context – die Seiten rendern
  `AuthLayout` selbst und liegen im Baum darüber). `organizationId` ist Teil
  jedes Query-Keys; ein Wechsel lädt alles Betroffene nach, ganz ohne
  `invalidate`. Genau dafür ist das Feld serverseitig **Pflicht** und nicht
  optional. `useScopeRole` liefert während des Ladens `viewer` – ein Knopf, der
  kurz fehlt, ist besser als einer, der kurz da ist und `FORBIDDEN` liefert.

## Preset-Katalog

Global gepflegte Hersteller und Gebinde, aus denen Benutzer auswählen können,
statt jedes Leergewicht selbst zu pflegen. Vier Ebenen:
`preset_manufacturers` → `preset_container_series` → `preset_container_versions`
→ `preset_container_variants` (eine Variante je Netto-Materialgewicht).

- **Gebindewahl am Material:** entweder `materials.containerTypeId` (eigene
  Gebindeart) **oder** `materials.containerPresetVariantId` – nie beides. Geprüft
  wird das an genau einer Stelle (`validateForeignKeys` in
  `api/materialRouter.ts`), und zwar immer der Zustand _nach_ dem Patch. Die
  Priorität beim Auflösen der Tara steht in `resolveContainerTare`
  (`contracts/presets.ts`) und wird von Server und Client gemeinsam genutzt.
- **Der Anzeigename einer Variante wird nicht gespeichert**, sondern beim Lesen
  aus Hersteller + Serie + Ausführung + Nenngewicht erzeugt (Einzelheiten unter
  „Sprachen"). Es gibt keine `displayName`-Spalte und keinen Auffrisch-Helfer:
  Nach einer Umbenennung ist nichts nachzuziehen.
- **Materialarten** (`preset_series_material_types`) und **Gebindeform**
  (`preset_container_versions.form`) sind weiche Sortierhinweise, **kein
  Filter**: `materials.materialType` ist Freitext („PLA“, „PLA+“, „PLA Silk“),
  und die Form ist eine Angabe des Benutzers. Hartes Filtern würde ein Gebinde
  verstecken, das jemand bewusst so angelegt hat.

  Zusammengesetzt wird das in `containerFits` (`contracts/presets.ts`), und dort
  liegt eine Falle: `materialTypeMatches` hält eine leere Schlagwortliste für
  passend, `formFitsKind` eine unbekannte Form. Einzeln ist beides richtig –
  zusammen ergaben sie „passt zu allem“, sodass eine unverschlagwortete
  Filamentspule ohne Formangabe unter „Passend zu Harz“ stand. `containerFits`
  verlangt deshalb einen **positiven Beleg** und nicht bloß das Fehlen eines
  Widerspruchs: Ein widersprechendes Merkmal schließt aus, sonst muss mindestens
  eines zustimmen, und zwei unbekannte heißen „weiß nicht“.

- **Ausblenden** (`hidden_container_presets`) wirkt kaskadierend nach unten und
  betrifft nur die Auswahl; bereits zugewiesene Gebinde bleiben gültig.
- **Löschen** ist nur ohne Untereinträge und ohne referenzierende Materialien
  erlaubt – es gibt keine Fremdschlüssel in der Datenbank, sonst ginge still
  die Tara verloren. Ansonsten `active: false` setzen.
- **Vorschläge** (`preset_proposals`) speichern einen vollständigen
  JSON-Schnappschuss, keinen Diff. Das Anwenden in `applyProposal`
  (`api/adminRouter.ts`) kommt bewusst ohne Transaktion aus:
  jeder Schritt ist ein find-or-create über einen Unique-Key, der
  Statuswechsel kommt zuletzt und wirkt über den `pending`-Filter als
  optimistische Sperre.
- **Startkatalog:** `db/presets/catalog.ts` (reine Daten) wird von
  `seedContainerPresets()` eingespielt – beim Serverstart in Produktion und über
  `npm run db:seed` lokal. Bestehende Zeilen werden nur überschrieben, wenn
  `source = "seed"` und `seedRevision < PRESET_SEED_REVISION`. Änderungen von
  Administratoren (`admin`) und übernommene Vorschläge (`community`) bleiben
  dauerhaft unangetastet. Für inhaltliche Korrekturen am Startkatalog
  `PRESET_SEED_REVISION` erhöhen.

## Sprachen (i18n)

Die Oberfläche gibt es auf Deutsch und Englisch. Umgeschaltet wird pro
**Benutzer** in den Einstellungen (`users.language`, `NULL` = Sprache des
Browsers) – bewusst getrennt von `users.locale`, das nur Zahlen-, Gewichts-
und Datumsformate steuert. Wer die Oberfläche englisch will, will nicht
zwangsläufig auch US-Datumsformate.

- `contracts/i18n.ts` – Sprachliste, zod-Schema, `languageFromTag()`
- `src/messages/de.ts` – **Leitsprache**; `Messages = typeof de`
- `src/messages/en.ts` – als `Messages` typisiert, also ein Abbild von `de.ts`
- `src/providers/i18n.tsx` – liest `users.language`, setzt `<html lang>`
- `src/lib/i18nContext.ts` – `useT()` (nur Texte) bzw. `useI18n()`
  (zusätzlich `language`), plus `TextKey<S>`

Zugriff läuft über Objektpfade statt Schlüsselstrings:

```tsx
const t = useT();
<h1>{t.home.title}</h1>
<p>{t.home.statMaterialsLow({ count: 3 })}</p>
```

Damit ist ein Tippfehler oder ein in `en.ts` vergessener Eintrag ein
**Compile-Fehler**, kein leeres Feld zur Laufzeit. Werte werden nur dort über
Funktionen eingesetzt, wo es nötig ist.

Regeln:

- Keine Zeichenkette direkt ins JSX – auch nicht in `aria-label`, `title`,
  `placeholder` oder `toast.*`.
- Tabellen wie Navigations- oder Sortierlisten führen den **Schlüssel**
  (`label: "overview"`), nicht den fertigen Text – sonst wäre die Sprache beim
  Modulladen eingefroren. Typ dafür: `TextKey<"nav">`.
- Zahlen, Gewichte, Preise und Datumsangaben kommen weiter aus `useFormat()`.
- Währungs- und Locale-Namen in den Einstellungen liefert `Intl.DisplayNames`
  (`currencyLabel`/`localeLabel` in `contracts/locale.ts`), nicht der Katalog.
- Der Produktname `filahub` steht als `APP_NAME` in `src/const.ts` und wird
  nicht übersetzt.
- Der Massenimport-Prompt existiert in beiden Sprachen
  (`src/lib/importPrompt.ts`); die **JSON-Schlüssel bleiben deutsch**, sie sind
  Teil des Vertrags in `contracts/import.ts`.
- Der Telegram-Bot antwortet zweisprachig – beim `/login` existiert der
  Benutzer oft noch gar nicht, seine Spracheinstellung ist also unbekannt.

## Release Notes

Was sich pro Version geändert hat, steht als Markdown in `src/release-notes/`
(`release_vX.Y.Z.md`) und wird unter „Neuerungen" (`/neuerungen`) angezeigt.
Bilder liegen daneben in `images/` und werden über `import.meta.glob` mitgebaut.

- **Der Inhalt ist immer englisch** – die einzige Ausnahme von der
  Deutsch-Regel unter „Code-Stil". Die Oberfläche drumherum bleibt deutsch. Die
  genauen Regeln stehen in `src/release-notes/AGENTS.md`; wer dort Dateien
  anlegt, liest zuerst diese Datei.
- **Zielgruppe ist ausschließlich, wer die App benutzt.** Neue Funktionen,
  spürbare Verbesserungen, behobene Fehler – und sonst nichts. Was Hoster,
  Administratoren oder Entwickler angeht, gehört in `README.md`, `PRIVACY.md`,
  `COMPLIANCE.md` oder hierher, nicht in eine Release Note; es gibt dort keinen
  Abschnitt „For operators". Die Prüffrage und die Grenzfälle stehen in
  `src/release-notes/AGENTS.md`.
- Die Version kommt aus dem **Dateinamen**. Beim Versionssprung gehören die
  Version in `package.json` und die neue Release Note in dieselbe Änderung.
- Der Ungelesen-Stand hängt am Benutzer (`users.lastSeenReleaseVersion`,
  NULL = noch nichts gelesen) und wird nur nach vorne gesetzt
  (`markReleaseNotesSeen` in `api/queries/users.ts`).
- Reine Logik in `contracts/releaseNotes.ts`, das Einlesen in
  `src/lib/releaseNotes.ts` – nur dort steckt Vite-spezifischer Code.
- `vite.config.ts` reicht die Version aus `package.json` als `__APP_VERSION__`
  ins Frontend; benutzt wird sie ausschließlich über `APP_VERSION` aus
  `src/lib/appVersion.ts`. In `api/` und `contracts/` gibt es den Wert nicht.

## Mehrsprachige Katalognamen

Serien und Ausführungen im Preset-Katalog tragen neben dem Grundnamen (`name`,
deutsch) eine jsonb-Spalte `nameI18n` mit den Übersetzungen. Hersteller haben
keine – „Polymaker“ ist ein Eigenname.

- `resolveName(entry, language)` in `contracts/presets.ts` löst auf und fällt
  auf den Grundnamen zurück; `missingTranslations()` liefert die Lücken.
- Der **Anzeigename einer Variante wird nicht gespeichert**, sondern beim Lesen
  aus Hersteller + Serie + Ausführung + Nenngewicht erzeugt. Damit kann er
  weder veralten noch an einer Sprache kleben. Die früheren Helfer
  `buildDisplayNameForVersion` und `refreshVariantDisplayNames` sind entfallen.
- Wer die Sprache braucht, nimmt `ctx.language` (siehe `api/context.ts`): erst
  `users.language`, sonst die Kopfzeile `x-filahub-language`, sonst die
  Grundsprache. Die Kopfzeile ist nötig, weil bei der Einstellung
  „automatisch“ nur der Browser die Sprache kennt.
- `preset.tree` liefert bewusst die Rohdaten (`name` + `nameI18n`) – die
  Verwaltung muss beide Sprachen bearbeiten können. `preset.options` und die
  Materialabfragen liefern dagegen fertige Namen.
- Im Client löst `usePresetNames()` (`src/lib/presetNames.ts`) auf.

Neue Sprache: Eintrag in `contracts/i18n.ts`, Schlüssel in `nameI18nSchema`
(`contracts/presets.ts`), Katalogdatei unter `src/messages/`. Die Verwaltung
und der Vorschlagsdialog erzeugen ihre Felder aus `SUPPORTED_LANGUAGES` und
ziehen automatisch nach.

## Konfiguration / Umgebungsvariablen

Zentrales Modul: `api/lib/env.ts` (liest via `dotenv` aus `.env`, Vorlage
`.env.example`). Erforderlich: `APP_SECRET` (Session-Signatur),
`DATABASE_URL` (PostgreSQL), dazu `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`,
`TELEGRAM_ALLOWED_IDS` (kommagetrennte Whitelist; leer = offene Registrierung),
`OWNER_TELEGRAM_ID` (Admin). Optional `APP_BASE_URL` – die öffentliche Adresse
der Instanz, nur für Links in Telegram-Nachrichten; fehlt sie, nennen die
Nachrichten bloß den Ort in der App. Bewusst konfiguriert und nicht aus den
Anfrage-Kopfzeilen abgeleitet: Die kann ein Aufrufer setzen, und daraus einen
Link zu bauen, den wir an Dritte verschicken, wäre eine offene Weiterleitung.
`drizzle.config.ts` benötigt ebenfalls `DATABASE_URL`.

## Lokal anmelden ohne Telegram (DEV_LOGIN)

Für die Entwicklung und für automatisierte Oberflächenprüfungen gibt es eine
Anmeldung ohne Bot-Token und ohne Telefon: `DEV_LOGIN=1` setzen, dann legt
`GET /api/dev-login` das Konto `dev-login` als **Admin** an, setzt das
Session-Cookie und leitet auf `/`. Auf der Anmeldeseite erscheint zusätzlich
der Knopf „Ohne Telegram anmelden“.

Zwei Sperren, beide müssen offen sein: `NODE_ENV` darf nicht `production` sein
**und** `DEV_LOGIN` muss gesetzt sein. Trifft eines nicht zu, wird die Route in
`registerDevLogin` (`api/devLogin.ts`) gar nicht erst registriert und läuft in
den 404 von `/api/*`. `auth.loginInfo` meldet den Zustand als
`devLoginAvailable` an die Anmeldeseite.

Fertige Startkonfigurationen liegen in `.claude/launch.json`:

- **`filahub-dev`** – `npm run dev` mit `DEV_LOGIN=1`, alles Weitere aus der
  eigenen `.env`.
- **`filahub-dev-sandbox`** – dasselbe gegen eine Wegwerf-Datenbank, ganz ohne
  `.env`. Voraussetzung ist derselbe Container wie für die Integrationstests:

```bash
docker run -d --name filahub-test-db -p 127.0.0.1:5433:5432 \
  -e POSTGRES_DB=filahub_test -e POSTGRES_USER=filahub \
  -e POSTGRES_PASSWORD=filahub postgres:17-alpine

DATABASE_URL='postgres://filahub:filahub@127.0.0.1:5433/filahub_test' npm run db:migrate
```

Achtung: `npm run test:integration` löscht **das gesamte Schema** dieser
Datenbank – die Sandbox ist bewusst wegwerfbar und nie die eigene
Entwicklungsdatenbank.

## Code-Stil

- Sprache im Code, in Fehlermeldungen, Kommentaren und UI-Texten: **Deutsch**
  (z. B. zod-Validierungsmeldungen). Bitte beibehalten. Einzige Ausnahme: die
  Release Notes in `src/release-notes/` sind immer englisch und werden nie
  übersetzt (siehe Abschnitt „Release Notes").
- Prettier: doppelte Anführungszeichen, Semikolons, 2 Leerzeichen, `printWidth: 80`.
- ESLint: `js.configs.recommended`, `typescript-eslint`, react-hooks, react-refresh.
- UI-Komponenten aus shadcn nachnutzen: `import { Button } from "@/components/ui/button"` –
  keine neuen Basis-Komponenten erfinden. Styling über Tailwind + `cn()` aus `src/lib/utils.ts`.
  Seit Tailwind 4 passt die Upstream-Fassung wieder ohne Übersetzung – v4-Syntax
  wie `--spacing(n)` oder `size-(--cell-size)` darf so bleiben, wie sie kommt.
- **Mobile zuerst denken:** Das Layout gibt den Seitenrand vor (`AuthLayout`),
  Seiten fangen mit `<PageHeader …>` an und bringen kein eigenes Padding mit.
  Tabellen sind auf dem Telefon unbedienbar – ab drei Spalten daneben eine
  Kartenliste stellen (`sm:hidden` / `hidden sm:block`, siehe `Home.tsx`).
- **Farbschema:** hell/dunkel/System über `useAppTheme()` (`src/lib/theme.ts`).
  Die Auswahl liegt in `localStorage` unter `theme` und wird zusätzlich vom
  Inline-Skript in `index.html` vor dem ersten Paint angewendet – Schlüssel und
  Farbwerte dort und in `src/index.css` müssen zusammenpassen. Keine festen
  Farben schreiben, sondern die Tokens (`bg-card`, `text-muted-foreground` …).
- **Häufige Aktionen** hängen am Layout, nicht an einzelnen Seiten: Wiegen,
  Material anlegen und die Schnellsuche (Strg/⌘ + K) werden über
  `quickActions` (`src/lib/quickActions.ts`) von überall geöffnet.
- DB-Schema nur in `db/schema.ts` (+ `relations.ts`) pflegen; Typen über
  `$inferSelect` / `$inferInsert` ableiten, nicht manuell duplizieren.
- Preise in Cent (`priceCents`), Gewichte in Gramm, Abmessungen in ganzen
  Millimetern, Kaufdatum als `YYYY-MM-DD`-String
  (`date(..., { mode: "string" })`). **Eine Ausnahme:**
  `lager.filamentDiameterUm` steht in Mikrometern, weil 1,75 mm sonst nicht
  ganzzahlig wäre – Begründung im Abschnitt „Lager, Materialarten und
  Zweiteinheiten".
- **Währung und Regionalformat hängen am Benutzer**, nicht an der App:
  `users.currency` (ISO-4217) und `users.locale` (BCP-47, `NULL` = Locale des
  Browsers). `priceCents` bleibt währungsneutral – ein Währungswechsel ändert
  nur die Beschriftung, es wird nichts umgerechnet und nichts pro Material
  gespeichert.
- Zahlen, Gewichte, Prozente, Geldbeträge und Daten **nie roh rendern**,
  sondern über `useFormat()` (`src/lib/formatContext.ts`). Die reinen
  Funktionen dahinter stehen in `contracts/format.ts` und bekommen die Locale
  als Argument. Ausnahme: `formatNominalWeight` in `contracts/presets.ts` ist
  bewusst locale-frei, weil der Wert serverseitig in den denormalisierten
  `displayName` der Preset-Varianten fließt.

## Tests

Zwei getrennte Suiten – Unit-Tests laufen immer, Integrationstests nur mit
Datenbank.

### Unit-Tests (`npm run test`)

- Runner: Vitest, Umgebung `node`, konfiguriert in `vitest.config.ts`.
- Nur Server-Tests sind vorgesehen: `api/**/*.test.ts` / `api/**/*.spec.ts`.
- Vorhanden: `importSchema`, `presetSchema`, `presetHelpers`, `presetCatalog`,
  `materialStats`, `materialUnits`, `format`, `releaseNotes`, `friendVisibility`
  und `friendCode`. Alle laufen ohne Datenbank – reine zod- und Funktionstests. Bei
  neuen Backend-Features Tests in `api/` anlegen.
- `api/friendVisibility.test.ts` ist mehr als ein Funktionstest: Die Zusicherung
  über die Schlüsselmenge von `toFriendMaterial` ist der Riegel dagegen, dass
  eine später zu `materials` ergänzte Spalte still bei Freunden landet.
- `api/releaseNotes.test.ts` prüft zusätzlich die echten Dateien in
  `src/release-notes/` (Namen, Frontmatter, Bildverweise, Alternativtexte).
  Das ist Absicht: `vite build` führt die Module nicht aus, eine kaputte
  Release Note fiele sonst erst im Browser auf.
- `api/format.test.ts` testet die gemeinsamen Formatierer aus
  `contracts/format.ts` – Tests unterhalb von `src/` würde vitest nicht
  einsammeln.

### Integrationstests (`npm run test:integration`)

- `api/postgres.integration.test.ts`, `api/account.integration.test.ts`,
  `api/friends.integration.test.ts`, `api/lager.integration.test.ts` und
  `api/organizations.integration.test.ts`, konfiguriert in
  `vitest.integration.config.ts`; aus `vitest.config.ts` ausgeschlossen, damit
  `npm run test` ohne Datenbank lauffähig bleibt.
- Getestet wird gegen **PostgreSQL 17** – dieselbe Version wie in
  `docker-compose.yml`.
- Abgedeckt: Migrationen, Enum-Typen, `jsonb`, `timestamptz`, Idempotenz des
  Seedings, Katalog- und Vorschlagsfluss über die tRPC-Router, Unique-Keys,
  `RETURNING`, die optimistische Sperre, Zeitstempel und der Systemzustand für
  `/verwaltung/system`. Dazu der ganze Freundes-Fluss: beide
  Freigaberichtungen, alle drei Stufen **je Lager**, die Abwesenheit der
  verbotenen Felder in **jeder** Antwort, die zwei handgeschriebenen Indizes und
  die Löschung in beiden Richtungen.
- **Zwei dieser Tests sichern Fehler ab, die still schiefgehen** und deshalb
  keinen Nutzer erreichen würden: „weckt nach dem Auflösen und Neuschließen
  keinen Zugriff“ (die Kaskade in `deleteFriendship`) und „gewährt nichts, wenn
  die Freundschaft nicht angenommen ist“ (der Status wird in `resolveShare`
  geprüft, nicht im SQL). Beide wurden gegengeprüft, indem der jeweilige Riegel
  entfernt wurde – sie werden dann rot.
- Die Verbindung kommt ausschließlich aus `TEST_DATABASE_URL` und darf nicht
  mit `DATABASE_URL` übereinstimmen: Jeder Lauf löscht **das gesamte Schema**
  der Zieldatenbank und spielt die Migrationen neu ein (`api/test/`).

```bash
docker run -d --name filahub-test-db -p 127.0.0.1:5433:5432 \
  -e POSTGRES_DB=filahub_test -e POSTGRES_USER=filahub \
  -e POSTGRES_PASSWORD=filahub postgres:17-alpine

TEST_DATABASE_URL='postgres://filahub:filahub@127.0.0.1:5433/filahub_test' \
  npm run test:integration
```

- Vor einem Commit mindestens `npm run check`, `npm run lint` und
  `npm run format` laufen lassen – die CI prüft alle drei (`format:check`
  schlägt bei unformatierten Dateien fehl).

## Deployment

- Multi-Stage-`Dockerfile` (node:26-alpine): Build-Stage mit `npm run build`,
  Runtime-Stage mit `npm ci --omit=dev`, `CMD ["node", "dist/boot.js"]`.
  Achtung: Das Image kopiert zusätzlich `drizzle.config.ts` und `db/`
  (für Migrationen zur Laufzeit).
- Die App lauscht auf Port 3000; empfohlen ist ein Reverse Proxy mit HTTPS
  (Caddy: `reverse_proxy 127.0.0.1:3000`). Ohne HTTPS funktioniert das
  Session-Cookie in Produktion nicht.
- `docker-compose.yml` ist eine Deployment-Vorlage (App-Image von GHCR +
  PostgreSQL 17 mit Volume); Anleitung im `README.md`. Beim Server-Start
  (Produktion) werden ausstehende SQL-Migrationen aus `db/migrations/`
  automatisch angewendet (`migrateDb` in `api/queries/connection.ts`) – frische
  Datenbanken initialisieren sich selbst. Nach Schema-Änderungen daher immer
  `npm run db:generate` ausführen und die erzeugten Dateien committen.
- Healthchecks: `GET /health` (in `api/boot.ts`) liefert `{ "status": "ok" }`;
  das Dockerfile definiert darauf einen `HEALTHCHECK`, die Compose-Vorlage
  ebenfalls.
- PostgreSQL muss vom Container/Host aus erreichbar sein; Setup siehe
  `README.md` (Datenbank anlegen, `npm run db:push`).

## Sicherheit

- Nie Secrets committen: `.env` ist gitignored, nur `.env.example` pflegen.
- `DEV_LOGIN` gehört nur in lokale `.env`-Dateien. In Produktion wirkt es
  ohnehin nicht (siehe „Lokal anmelden ohne Telegram“), taucht aber trotzdem
  nicht in Deployment-Konfigurationen auf.
- `APP_SECRET` signiert alle Sessions – bei Kompromittierung rotieren.
- Whitelist `TELEGRAM_ALLOWED_IDS` begrenzt Registrierungen; `OWNER_TELEGRAM_ID`
  bekommt die Admin-Rolle.
- Body-Limit des Servers: 50 MB (`api/boot.ts`).
