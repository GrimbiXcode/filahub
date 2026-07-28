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
- **Laufzeit:** Node.js 20, ESM (`"type": "module"`), Port 3000 (via `PORT` änderbar)

## Projektstruktur

```
src/            React-Frontend
  pages/        Routen: Home, MaterialDetail, SpoolTypes, StorageBoxes, Login, NotFound
  components/   App-Komponenten + ui/ (shadcn)
  providers/    trpc.tsx (tRPC-Client, superjson, httpBatchLink auf /api/trpc)
  hooks/        useAuth, use-mobile
  lib/          format.ts, utils.ts (cn-Helfer)
api/            Hono/tRPC-Backend
  boot.ts       Server-Einstieg: tRPC unter /api/trpc, in Prod statische Files + Telegram-Bot
  router.ts     appRouter: ping, auth, spoolType, storageBox, material
  middleware.ts publicQuery / authedQuery / adminQuery (tRPC-Prozeduren)
  context.ts    TrpcContext: { req, resHeaders, user? } – Auth ist optional im Context
  lib/          env.ts (zentrale Env-Variablen), cookies.ts, http.ts, vite.ts (Static-Serving)
  telegram/     auth.ts (Session-Cookie → User), session.ts (JWT), widget.ts, bot.ts (Polling-Bot mit /id, /login)
  queries/      connection.ts (getDb, Drizzle-Instanz), users.ts, filament.ts (DB-Zugriff)
db/             schema.ts, relations.ts, seed.ts (Stub), migrations/ (drizzle-kit-Output)
contracts/      Gemeinsamer Code für Client+Server: constants.ts (Session, Paths), errors.ts, types.ts
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
| `npm run test` | Vitest (`vitest run`) |
| `npm run lint` | ESLint (Flat-Config) |
| `npm run format` | Prettier über das ganze Repo |
| `npm run db:push` | Drizzle-Schema direkt in die DB synchronisieren |
| `npm run db:generate` / `db:migrate` | Migrationen erzeugen / anwenden (Output: `db/migrations/`) |

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
- **Auth-Fluss:** `createContext` ruft `authenticateRequest` auf; nicht
  angemeldete Requests bekommen `user: undefined` statt eines Fehlers –
  die Prozedur-Middleware entscheidet. Session = JWT (HS256, 1 Jahr) im
  Cookie `filament_sid`. Außerhalb von localhost wird das Cookie als
  `Secure; SameSite=None` gesetzt → HTTPS ist im Produktivbetrieb Pflicht.

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
- Preise in Cent (`priceCents`), Gewichte in Gramm, Kaufdatum als
  `YYYY-MM-DD`-String (`date(..., { mode: "string" })`).

## Tests

- Runner: Vitest, Umgebung `node`, konfiguriert in `vitest.config.ts`.
- Nur Server-Tests sind vorgesehen: `api/**/*.test.ts` / `api/**/*.spec.ts`.
- Aktuell existieren noch keine Testdateien – bei neuen Backend-Features
  Tests in `api/` anlegen.
- Vor einem Commit mindestens `npm run check` (und `npm run lint`) laufen lassen.

## Deployment

- Multi-Stage-`Dockerfile` (node:20-alpine): Build-Stage mit `npm run build`,
  Runtime-Stage mit `npm ci --omit=dev`, `CMD ["node", "dist/boot.js"]`.
  Achtung: Das Image kopiert zusätzlich `drizzle.config.ts` und `db/`
  (für Migrationen zur Laufzeit).
- Die App lauscht auf Port 3000; empfohlen ist ein Reverse Proxy mit HTTPS
  (Caddy: `reverse_proxy 127.0.0.1:3000`). Ohne HTTPS funktioniert das
  Session-Cookie in Produktion nicht.
- MySQL muss vom Container/Host aus erreichbar sein; Setup siehe `README.md`
  (Datenbank anlegen, `npm run db:push`).

## Sicherheit

- Nie Secrets committen: `.env` ist gitignored, nur `.env.example` pflegen.
- `APP_SECRET` signiert alle Sessions – bei Kompromittierung rotieren.
- Whitelist `TELEGRAM_ALLOWED_IDS` begrenzt Registrierungen; `OWNER_TELEGRAM_ID`
  bekommt die Admin-Rolle.
- Body-Limit des Servers: 50 MB (`api/boot.ts`).
