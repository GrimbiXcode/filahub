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
                AdminPresets, AdminProposals, Login, NotFound
  components/   App-Komponenten + ui/ (shadcn)
  providers/    trpc.tsx (tRPC-Client, superjson, httpBatchLink auf /api/trpc)
  hooks/        useAuth, use-mobile
  lib/          format.ts, utils.ts (cn-Helfer)
api/            Hono/tRPC-Backend
  boot.ts       Server-Einstieg: tRPC unter /api/trpc, in Prod statische Files + Telegram-Bot
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
                types.ts, import.ts, presets.ts (Preset-Schemas + reine Hilfsfunktionen)
```

## Pfad-Aliase

In Vite, allen tsconfigs und vitest konfiguriert:

- `@/*` → `src/*`
- `@contracts/*` → `contracts/*`
- `@db/*` → `db/*` (zusätzlich `"db"` in der Vite-Config)

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Vite-Dev-Server mit HMR auf Port 3000; das Backend läuft via `@hono/vite-dev-server` mit (`api/boot.ts`) |
| `npm run check` | TypeScript-Prüfung (`tsc -b`, Projekt-Referenzen) |
| `npm run build` | `vite build` → `dist/public`, dann esbuild-Bundle von `api/boot.ts` → `dist/boot.js` |
| `npm start` | Produktionsstart: `NODE_ENV=production node dist/boot.js` |
| `npm run test` | Vitest ohne Datenbank (`vitest run`) |
| `npm run test:integration` | Vitest gegen eine echte MySQL-Datenbank (braucht `TEST_DATABASE_URL`) |
| `npm run lint` | ESLint (Flat-Config) |
| `npm run format` | Prettier über das ganze Repo |
| `npm run db:push` | Drizzle-Schema direkt in die DB synchronisieren |
| `npm run db:generate` / `db:migrate` | Migrationen erzeugen / anwenden (Output: `db/migrations/`) |
| `npm run db:seed` | Startkatalog der Presets einspielen (idempotent) |

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
  `api/materialRouter.ts`), und zwar immer der Zustand *nach* dem Patch. Die
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

## Konfiguration / Umgebungsvariablen

Zentrales Modul: `api/lib/env.ts` (liest via `dotenv` aus `.env`, Vorlage
`.env.example`). Erforderlich: `APP_SECRET` (Session-Signatur),
`DATABASE_URL` (MySQL), dazu `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`,
`TELEGRAM_ALLOWED_IDS` (kommagetrennte Whitelist; leer = offene Registrierung),
`OWNER_TELEGRAM_ID` (Admin). `drizzle.config.ts` benötigt ebenfalls
`DATABASE_URL`.

## Code-Stil

- Sprache im Code, in Fehlermeldungen, Kommentaren und UI-Texten: **Deutsch**
  (z. B. zod-Validierungsmeldungen). Bitte beibehalten.
- Prettier: doppelte Anführungszeichen, Semikolons, 2 Leerzeichen, `printWidth: 80`.
- ESLint: `js.configs.recommended`, `typescript-eslint`, react-hooks, react-refresh.
- UI-Komponenten aus shadcn nachnutzen: `import { Button } from "@/components/ui/button"` –
  keine neuen Basis-Komponenten erfinden. Styling über Tailwind + `cn()` aus `src/lib/utils.ts`.
- DB-Schema nur in `db/schema.ts` (+ `relations.ts`) pflegen; Typen über
  `$inferSelect` / `$inferInsert` ableiten, nicht manuell duplizieren.
- Preise in Cent (`priceCents`), Gewichte in Gramm, Abmessungen in ganzen
  Millimetern, Kaufdatum als `YYYY-MM-DD`-String
  (`date(..., { mode: "string" })`).

## Tests

Zwei getrennte Suiten – Unit-Tests laufen immer, Integrationstests nur mit
Datenbank.

### Unit-Tests (`npm run test`)

- Runner: Vitest, Umgebung `node`, konfiguriert in `vitest.config.ts`.
- Nur Server-Tests sind vorgesehen: `api/**/*.test.ts` / `api/**/*.spec.ts`.
- Vorhanden: `importSchema`, `presetSchema`, `presetHelpers`, `presetCatalog`
  und `materialStats`. Alle laufen ohne Datenbank – reine zod- und
  Funktionstests. Bei neuen Backend-Features Tests in `api/` anlegen.

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

- Vor einem Commit mindestens `npm run check` (und `npm run lint`) laufen lassen.

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
- `APP_SECRET` signiert alle Sessions – bei Kompromittierung rotieren.
- Whitelist `TELEGRAM_ALLOWED_IDS` begrenzt Registrierungen; `OWNER_TELEGRAM_ID`
  bekommt die Admin-Rolle.
- Body-Limit des Servers: 50 MB (`api/boot.ts`).
