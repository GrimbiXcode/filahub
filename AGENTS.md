# Filament-Lager

Webapplikation zur Verwaltung eines 3D-Druck-Materiallagers: Filamente mit
Rollentypen (Spule/Verpackung) und Lagerboxen (Drybox) inkl. Leergewicht
(Tara), Wägungen mit automatischer Restmengenberechnung, Kurz-Kennungen zum
schnellen Wiederfinden, Login ausschließlich über Telegram.

## Tech-Stack

- **Frontend:** React 19, Vite 7, TypeScript (strict), Tailwind CSS v3,
  shadcn/ui (Radix-Primitives, siehe `src/components/ui/`), react-router 7,
  TanStack Query, react-hook-form + zod
- **Backend:** Hono 4 + tRPC 11 (Fetch-Adapter), `@hono/node-server`
- **Datenbank:** Drizzle ORM + MySQL (`mysql2`, `drizzle-kit`)
- **Auth:** Telegram Login Widget + Bot-Code-Login, JWT-Session-Cookie (`jose`, HS256)
- **Laufzeit:** Node.js 26 (siehe `.nvmrc`), ESM (`"type": "module"`), Port 3000 (via `PORT` änderbar)

## Projektstruktur

```
src/            React-Frontend
  pages/        Routen: Home, MaterialDetail, SpoolTypes, StorageBoxes, Import,
                Settings, AdminPresets, AdminProposals, Login, NotFound
  components/   App-Komponenten + ui/ (shadcn); AuthLayout (Seitenleiste,
                mobile Kopfzeile), PageHeader (Seitenkopf), QuickActions
                (Dialoge + Schnellsuche), ThemeToggle
  providers/    trpc.tsx (tRPC-Client, superjson, httpBatchLink auf /api/trpc),
                format.tsx (bindet die Formatierer an den angemeldeten Benutzer),
                theme.tsx (Farbschema über next-themes)
  hooks/        useAuth, use-mobile, useReleaseNotes
  lib/          formatContext.ts (useFormat), format.ts (Füllstandsfarben),
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
  router.ts     appRouter: ping, auth, spoolType, storageBox, material, preset, admin
  middleware.ts publicQuery / authedQuery / adminQuery (tRPC-Prozeduren)
  context.ts    TrpcContext: { req, resHeaders, user? } – Auth ist optional im Context
  lib/          env.ts (zentrale Env-Variablen), cookies.ts, http.ts, vite.ts (Static-Serving)
  telegram/     auth.ts (Session-Cookie → User), session.ts (JWT), widget.ts, bot.ts (Polling-Bot mit /id, /login)
  queries/      connection.ts (getDb, Drizzle-Instanz), users.ts, filament.ts,
                presets.ts (Preset-Katalog), presetSeed.ts (Startkatalog)
db/             schema.ts, relations.ts, seed.ts, presets/catalog.ts (Startkatalog),
                migrations/ (drizzle-kit-Output)
contracts/      Gemeinsamer Code für Client+Server: constants.ts (Session, Paths), errors.ts,
                types.ts, import.ts, presets.ts (Preset-Schemas + reine Hilfsfunktionen),
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
| `npm run test:integration`           | Vitest gegen eine echte MySQL-Datenbank (braucht `TEST_DATABASE_URL`)                                    |
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
- **Mandantenfähigkeit:** Alle Fachdaten (Rollentypen, Lagerboxen, Materialien,
  Wägungen) sind über `userId` einem Benutzer zugeordnet. Jede Abfrage muss
  `ctx.user.id` berücksichtigen (siehe Muster in `api/materialRouter.ts` mit
  `validateForeignKeys` und den `*BelongsToUser`-Hilfsfunktionen in
  `api/queries/filament.ts`).
  **Einzige Ausnahme:** die `preset_*`-Tabellen sind ein globaler, von
  Administratoren gepflegter Katalog und haben bewusst keine `userId`. Der
  Benutzerbezug steckt allein in `hidden_spool_presets` (Ausblenden) und
  `preset_proposals` (Einreicher).
- **Auth-Fluss:** `createContext` ruft `authenticateRequest` auf; nicht
  angemeldete Requests bekommen `user: undefined` statt eines Fehlers –
  die Prozedur-Middleware entscheidet. Session = JWT (HS256, 1 Jahr) im
  Cookie `filament_sid`. Außerhalb von localhost wird das Cookie als
  `Secure; SameSite=None` gesetzt → HTTPS ist im Produktivbetrieb Pflicht.

## Preset-Katalog

Global gepflegte Hersteller und Spulen, aus denen Benutzer auswählen können,
statt jedes Leergewicht selbst zu pflegen. Vier Ebenen:
`preset_manufacturers` → `preset_spool_series` → `preset_spool_versions` →
`preset_spool_variants` (eine Variante je Netto-Materialgewicht).

- **Rollenwahl am Material:** entweder `materials.spoolTypeId` (eigener
  Rollentyp) **oder** `materials.spoolPresetVariantId` – nie beides. Geprüft
  wird das an genau einer Stelle (`validateForeignKeys` in
  `api/materialRouter.ts`), und zwar immer der Zustand _nach_ dem Patch. Die
  Priorität beim Auflösen der Tara steht in `resolveSpoolTare`
  (`contracts/presets.ts`) und wird von Server und Client gemeinsam genutzt.
- **`displayName` auf der Variante** ist denormalisiert. Nach jeder Umbenennung
  auf Hersteller-, Serien- oder Versionsebene muss
  `refreshVariantDisplayNames` laufen (passiert in den `update*`-Funktionen in
  `api/queries/presets.ts`).
- **Materialarten** (`preset_series_material_types`) sind ein weicher
  Sortierhinweis, **kein Filter**: `materials.materialType` ist Freitext
  („PLA“, „PLA+“, „PLA Silk“), hartes Filtern würde passende Rollen
  verstecken. Siehe `materialTypeMatches`.
- **Ausblenden** (`hidden_spool_presets`) wirkt kaskadierend nach unten und
  betrifft nur die Auswahl; bereits zugewiesene Rollen bleiben gültig.
- **Löschen** ist nur ohne Untereinträge und ohne referenzierende Materialien
  erlaubt – es gibt keine Fremdschlüssel in der Datenbank, sonst ginge still
  die Tara verloren. Ansonsten `active: false` setzen.
- **Vorschläge** (`preset_proposals`) speichern einen vollständigen
  JSON-Schnappschuss, keinen Diff. Das Anwenden in `applyProposal`
  (`api/adminRouter.ts`) kommt ohne Transaktionen aus (planetscale-Modus):
  jeder Schritt ist ein find-or-create über einen Unique-Key, der
  Statuswechsel kommt zuletzt und wirkt über den `pending`-Filter als
  optimistische Sperre.
- **Startkatalog:** `db/presets/catalog.ts` (reine Daten) wird von
  `seedSpoolPresets()` eingespielt – beim Serverstart in Produktion und über
  `npm run db:seed` lokal. Bestehende Zeilen werden nur überschrieben, wenn
  `source = "seed"` und `seedRevision < PRESET_SEED_REVISION`. Änderungen von
  Administratoren (`admin`) und übernommene Vorschläge (`community`) bleiben
  dauerhaft unangetastet. Für inhaltliche Korrekturen am Startkatalog
  `PRESET_SEED_REVISION` erhöhen.

## Release Notes

Was sich pro Version geändert hat, steht als Markdown in `src/release-notes/`
(`release_vX.Y.Z.md`) und wird unter „Neuerungen" (`/neuerungen`) angezeigt.
Bilder liegen daneben in `images/` und werden über `import.meta.glob` mitgebaut.

- **Der Inhalt ist immer englisch** – die einzige Ausnahme von der
  Deutsch-Regel unter „Code-Stil". Die Oberfläche drumherum bleibt deutsch. Die
  genauen Regeln stehen in `src/release-notes/AGENTS.md`; wer dort Dateien
  anlegt, liest zuerst diese Datei.
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

## Konfiguration / Umgebungsvariablen

Zentrales Modul: `api/lib/env.ts` (liest via `dotenv` aus `.env`, Vorlage
`.env.example`). Erforderlich: `APP_SECRET` (Session-Signatur),
`DATABASE_URL` (MySQL), dazu `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`,
`TELEGRAM_ALLOWED_IDS` (kommagetrennte Whitelist; leer = offene Registrierung),
`OWNER_TELEGRAM_ID` (Admin). `drizzle.config.ts` benötigt ebenfalls
`DATABASE_URL`.

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
docker run -d --name filahub-test-db -p 127.0.0.1:3399:3306 \
  -e MYSQL_DATABASE=filahub_test -e MYSQL_USER=filahub \
  -e MYSQL_PASSWORD=filahub -e MYSQL_RANDOM_ROOT_PASSWORD=yes mysql:8.4

DATABASE_URL='mysql://filahub:filahub@127.0.0.1:3399/filahub_test' npm run db:migrate
```

Achtung: `npm run test:integration` löscht **alle Tabellen** dieser Datenbank –
die Sandbox ist bewusst wegwerfbar und nie die eigene Entwicklungsdatenbank.

## Code-Stil

- Sprache im Code, in Fehlermeldungen, Kommentaren und UI-Texten: **Deutsch**
  (z. B. zod-Validierungsmeldungen). Bitte beibehalten. Einzige Ausnahme: die
  Release Notes in `src/release-notes/` sind immer englisch und werden nie
  übersetzt (siehe Abschnitt „Release Notes").
- Prettier: doppelte Anführungszeichen, Semikolons, 2 Leerzeichen, `printWidth: 80`.
- ESLint: `js.configs.recommended`, `typescript-eslint`, react-hooks, react-refresh.
- UI-Komponenten aus shadcn nachnutzen: `import { Button } from "@/components/ui/button"` –
  keine neuen Basis-Komponenten erfinden. Styling über Tailwind + `cn()` aus `src/lib/utils.ts`.
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
  (`date(..., { mode: "string" })`).
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
  `materialStats`, `format` und `releaseNotes`. Alle laufen ohne Datenbank –
  reine zod- und Funktionstests. Bei neuen Backend-Features Tests in `api/`
  anlegen.
- `api/releaseNotes.test.ts` prüft zusätzlich die echten Dateien in
  `src/release-notes/` (Namen, Frontmatter, Bildverweise, Alternativtexte).
  Das ist Absicht: `vite build` führt die Module nicht aus, eine kaputte
  Release Note fiele sonst erst im Browser auf.
- `api/format.test.ts` testet die gemeinsamen Formatierer aus
  `contracts/format.ts` – Tests unterhalb von `src/` würde vitest nicht
  einsammeln.

### Integrationstests (`npm run test:integration`)

- `api/mysql.integration.test.ts`, konfiguriert in
  `vitest.integration.config.ts`; aus `vitest.config.ts` ausgeschlossen, damit
  `npm run test` ohne Datenbank lauffähig bleibt.
- Getestet wird gegen **MySQL 8.4** – dieselbe Version wie in
  `docker-compose.yml`. MariaDB weicht bei JSON-Spalten (dort nur ein
  `longtext`-Alias), Kollation (`utf8mb4_0900_ai_ci` ist akzentunempfindlich)
  und beim `sql_mode` ab; solche Unterschiede fallen nur hier auf.
- Abgedeckt: Migrationen, Idempotenz des Seedings, Katalog- und
  Vorschlagsfluss über die tRPC-Router, Unique-Keys, Enums, `$returningId`,
  die optimistische Sperre über `affectedRows`, Zeitstempel und Strict Mode.
- Die Verbindung kommt ausschließlich aus `TEST_DATABASE_URL` und darf nicht
  mit `DATABASE_URL` übereinstimmen: Jeder Lauf löscht **alle Tabellen** der
  Zieldatenbank und spielt die Migrationen neu ein (`api/test/`).

```bash
docker run -d --name filahub-test-db -p 127.0.0.1:3399:3306 \
  -e MYSQL_DATABASE=filahub_test -e MYSQL_USER=filahub \
  -e MYSQL_PASSWORD=filahub -e MYSQL_RANDOM_ROOT_PASSWORD=yes mysql:8.4

TEST_DATABASE_URL='mysql://filahub:filahub@127.0.0.1:3399/filahub_test' \
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
- `docker-compose.yml` ist eine Deployment-Vorlage (App-Image von GHCR + MySQL 8.4
  mit Volume); Anleitung im `README.md`. Beim Server-Start (Produktion) werden
  ausstehende SQL-Migrationen aus `db/migrations/` automatisch angewendet
  (`migrateDb` in `api/queries/connection.ts`) – frische Datenbanken
  initialisieren sich selbst. Nach Schema-Änderungen daher immer
  `npm run db:generate` ausführen und die erzeugten Dateien committen.
- Healthchecks: `GET /health` (in `api/boot.ts`) liefert `{ "status": "ok" }`;
  das Dockerfile definiert darauf einen `HEALTHCHECK`, die Compose-Vorlage
  ebenfalls.
- MySQL muss vom Container/Host aus erreichbar sein; Setup siehe `README.md`
  (Datenbank anlegen, `npm run db:push`).

## Sicherheit

- Nie Secrets committen: `.env` ist gitignored, nur `.env.example` pflegen.
- `DEV_LOGIN` gehört nur in lokale `.env`-Dateien. In Produktion wirkt es
  ohnehin nicht (siehe „Lokal anmelden ohne Telegram“), taucht aber trotzdem
  nicht in Deployment-Konfigurationen auf.
- `APP_SECRET` signiert alle Sessions – bei Kompromittierung rotieren.
- Whitelist `TELEGRAM_ALLOWED_IDS` begrenzt Registrierungen; `OWNER_TELEGRAM_ID`
  bekommt die Admin-Rolle.
- Body-Limit des Servers: 50 MB (`api/boot.ts`).
