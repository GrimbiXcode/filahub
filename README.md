# filahub

Web application for managing a 3D-printing filament inventory: filaments with
spool/packaging types and storage boxes (dryboxes) including tare weight,
weigh-ins with automatic remaining-quantity calculation, short IDs for quick
retrieval, a shared preset catalogue of manufacturers and spools, and
Telegram-only login.

**Stack:** React + Vite + Tailwind (frontend) · Hono + tRPC (backend) ·
Drizzle ORM + PostgreSQL (database)

[Product page](https://grimbixcode.github.io/filahub/) ·
[Live instance](https://filahub.weblabor.io) ·
[Container images](https://github.com/GrimbiXcode/filahub/pkgs/container/filahub)

---

## 1. Create a Telegram bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram
2. Send `/newbot`, choose a name and username (e.g. `YourFilahubBot`)
3. Note the **token** (looks like `123456789:ABCdeFG…`)
4. **Set a domain (required for the login widget):** send `/setdomain` to
   @BotFather, select your bot and enter your domain
   (e.g. `filahub.yourdomain.at` – no https://, no path)
5. Message your new bot with `/id` → it replies with your **Telegram user ID**
   (needed for the whitelist and the admin role)

> Note: `/id` is a built-in feature of this app – once the bot is running,
> it replies to it with your ID.

## 2. Configuration

```bash
cp .env.example .env
# fill in .env: APP_SECRET (e.g. `openssl rand -hex 32`), DATABASE_URL,
# TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_ALLOWED_IDS, OWNER_TELEGRAM_ID
# and, if anyone but you will use it, the LEGAL_OPERATOR_* values
```

| Variable                     | Purpose                                                                     |
| ---------------------------- | --------------------------------------------------------------------------- |
| `APP_SECRET`                 | Random secret for signing session tokens                                    |
| `DATABASE_URL`               | PostgreSQL connection string                                                |
| `TELEGRAM_BOT_TOKEN`         | Token from @BotFather                                                       |
| `TELEGRAM_BOT_USERNAME`      | Bot username without @                                                      |
| `TELEGRAM_ALLOWED_IDS`       | Allowed Telegram IDs (comma-separated); empty = nobody, unless opened below |
| `TELEGRAM_OPEN_REGISTRATION` | Set to `1` to let any Telegram account register                             |
| `OWNER_TELEGRAM_ID`          | Telegram ID of the admin                                                    |
| `APP_BASE_URL`               | Public address of this instance — links in Telegram messages; optional      |
| `LEGAL_OPERATOR_NAME`        | Who runs this instance — shown in the imprint and privacy policy            |
| `LEGAL_OPERATOR_ADDRESS`     | Postal address of the operator — multi-line, see below                      |
| `LEGAL_OPERATOR_EMAIL`       | Contact address for data protection requests                                |
| `LEGAL_OPERATOR_HOSTING`     | Who provides the servers (processor under Art. 28 GDPR)                     |
| `TRUST_PROXY_HOPS`           | Trusted reverse proxies in front of the app (default `1`)                   |

### Multi-line values

`LEGAL_OPERATOR_ADDRESS` and `LEGAL_OPERATOR_HOSTING` may span several lines.
**Write the line breaks as `\n`:**

```bash
LEGAL_OPERATOR_ADDRESS=Example Street 1\n1234 Town\nSwitzerland
```

That form survives every route the value can take — an unquoted config line,
`environment:` in Compose, `docker run -e`, and deployment platforms that feed
the variables into a build.

A genuinely quoted multi-line value works too where the format allows it:

```bash
LEGAL_OPERATOR_ADDRESS="Example Street 1
1234 Town
Switzerland"
```

But **do not paste raw line breaks into a deployment UI**. Platforms that build
the image themselves (Coolify, for instance) pass the variables into the build,
where a real newline ends the line and the rest is read as the next
instruction — the build fails. `\n` avoids that entirely.

Windows line endings, blank lines and stray spaces are cleaned up either way.
So is a value that got escaped a second time on its way in — some platforms
turn `\n` into `\\n` when they write the variables into the build.

Do **not** use `<br>`: the legal pages are Markdown and raw HTML is discarded
by design, so it would show up as visible text.

## 3. Set up the database

Create a PostgreSQL database:

```bash
createdb filahub
```

The app applies pending SQL migrations (`db/migrations/`) automatically on
startup, so a fresh database initializes itself. For local development you
can alternatively sync the schema directly with `npm run db:push`; after
schema changes, regenerate the migration files with `npm run db:generate`.

On startup the app also seeds a small preset catalogue of manufacturers and
spools (Polymaker, Prusament, Bambu Lab, eSUN). Seeding is idempotent and
never overwrites entries an administrator edited or that came from an
accepted community suggestion. Locally you can run it with `npm run db:seed`.

## 4. Run

### Without Docker

```bash
npm install
npm run build
npm start          # runs on port 3000 (PORT in .env)
```

### With Docker

```bash
docker build -t filahub .
docker run -d --name filahub \
  --env-file .env \
  -p 3000:3000 \
  --restart unless-stopped \
  filahub
```

Prebuilt images are published to the GitHub Container Registry
(`ghcr.io/grimbixcode/filahub`) whenever a version tag is pushed.

The PostgreSQL database must be reachable from the container (e.g. via
Docker Compose with a Postgres service or an external database server).

### With Docker Compose (deployment template)

`docker-compose.yml` is a ready-to-use deployment template: the app image from GHCR
plus a PostgreSQL 17 service with a persistent volume.

```bash
# 1. prepare configuration (see section 2)
cp .env.example .env   # fill in APP_SECRET + Telegram values

# 2. set a database password: replace "change-me" in both places in docker-compose.yml

# 3. start app + database – pending DB migrations are applied automatically
docker compose up -d
```

Notes:

- `DATABASE_URL` from `.env` is overridden by `docker-compose.yml` so the app talks
  to the bundled `db` service – you can ignore that variable for Compose.
- Postgres is published on `127.0.0.1:5432` in case you want to inspect the
  database or run drizzle commands from the host; remove that port mapping
  if you don't need it.
- Updating to a new release: `docker compose pull && docker compose up -d`.
- Put a reverse proxy with HTTPS in front of port 3000 (see section 5).

## 5. Domain & HTTPS (recommended: Caddy as reverse proxy)

The app listens on port 3000. Put a reverse proxy with HTTPS in front of it
for your domain. With [Caddy](https://caddyserver.com):

```
filahub.yourdomain.at {
    reverse_proxy 127.0.0.1:3000

    # HTTPS only, including subdomains. Caddy redirects HTTP to HTTPS on its
    # own; this tells the browser to stop asking. Start with a short max-age
    # while you are still moving things around — the value is hard to take
    # back once browsers have seen it.
    header Strict-Transport-Security "max-age=31536000; includeSubDomains"
}
```

The app sets its own Content-Security-Policy, `X-Frame-Options`,
`Referrer-Policy` and `Permissions-Policy` (see `api/app.ts`), so the proxy
does not have to. Do not strip or overwrite them.

Caddy sets `X-Forwarded-For` by default, which is what the sign-in rate limit
keys on. If you have a second proxy in front of Caddy — Cloudflare, say — set
`TRUST_PROXY_HOPS=2`, otherwise the limit counts the wrong address.

DNS: point an A record of the domain to your server's IP. Caddy obtains the
TLS certificate automatically. nginx + Certbot works too, of course.

> Outside of localhost the session cookie is `Secure; SameSite=Lax` – HTTPS is
> therefore required in production.

## 6. Login flow

**Primary: official Telegram Login Widget** (button on the login page)

1. Click "Log in with Telegram"
2. Telegram opens the official confirmation dialog – your identity is also
   verified via your registered phone number
3. Confirm → logged in

> Prerequisite: the domain must be registered via `/setdomain` at @BotFather
> (see step 1). The widget also requires third-party cookies; in browsers
> with strict blocking, use the alternative below.

**Alternative: code login via the bot**

1. Click the bot link on the login page
2. Send `/login` to the bot → receive a 6-digit code (valid for 5 min)
3. Enter the code on the website → logged in

### Who may sign in

Only the IDs in `TELEGRAM_ALLOWED_IDS` can sign in. **An empty list means
nobody** — set `TELEGRAM_OPEN_REGISTRATION=1` if you really want any Telegram
account to be able to register.

That default is deliberate. Open registration makes you the data controller for
however many strangers show up, with everything that follows from it — see
[PRIVACY.md](PRIVACY.md). Nobody should end up there by overlooking a variable.

`OWNER_TELEGRAM_ID` gets the admin role and keeps it on every sign-in. If it is
unset, the very first account to register becomes admin — but only while a
whitelist is in place. With open registration there is no such shortcut, or the
first stranger to find a fresh instance would take it over.

## 7. Preset catalogue

Administrators maintain a shared catalogue of manufacturers and spools so
users can pick a spool instead of looking up and entering its empty weight
themselves. It has four levels:

**Manufacturer → series → version → size.** A series is a product line
(e.g. _PolyTerra PLA_), a version is a revision of its spool (e.g. the switch
from plastic to cardboard, with a validity period), and a size is the spool
for one net filament weight (500 g / 1 kg / 3 kg) with its empty weight and
dimensions. A series can be tagged with material types so the right spools
are offered first for PLA, PETG and so on.

For users, under **Rollentypen**:

- **Preset-Katalog** – browse the catalogue, hide manufacturers, series,
  versions or single sizes you don't need (hiding only affects your own
  selection; spools already assigned to a filament stay valid), copy a preset
  into your own editable spool type, or suggest a correction.
- **Meine Rollentypen** – your own spool types, with an action to suggest one
  for the shared catalogue.
- **Meine Vorschläge** – the status of your suggestions, including the
  moderator's reason if one was rejected.

For administrators, under **Verwaltung**:

- **Preset-Katalog** (`/verwaltung/presets`) – maintain all four levels.
  Entries that are still in use can only be deactivated, not deleted.
- **Vorschläge** (`/verwaltung/vorschlaege`) – accept a suggestion (it is
  applied to the catalogue and becomes visible to everyone) or reject it with
  a reason.

## Useful commands

| Command                    | Purpose                                         |
| -------------------------- | ----------------------------------------------- |
| `npm run dev`              | Dev server with HMR                             |
| `npm run check`            | TypeScript check                                |
| `npm run build`            | Production build to `dist/`                     |
| `npm run lint`             | ESLint                                          |
| `npm run test`             | Vitest (no database needed)                     |
| `npm run test:integration` | Vitest against a real Postgres database (below) |
| `npm run db:push`          | Sync schema changes to the database             |
| `npm run db:seed`          | Seed the preset catalogue (idempotent)          |

## Integration tests

`npm run test` runs the unit tests, which need no database. The integration
tests run the real chain – migrations, seeding, tRPC routers – against
**PostgreSQL 17**, the same version as in `docker-compose.yml`.

```bash
docker run -d --name filahub-test-db -p 127.0.0.1:5433:5432 \
  -e POSTGRES_DB=filahub_test -e POSTGRES_USER=filahub \
  -e POSTGRES_PASSWORD=filahub postgres:17-alpine

TEST_DATABASE_URL='postgres://filahub:filahub@127.0.0.1:5433/filahub_test' \
  npm run test:integration
```

> Every run **drops the whole schema** of the target database and re-applies
> the migrations. The connection therefore comes from `TEST_DATABASE_URL` only
> and must differ from `DATABASE_URL` – use a dedicated test database.

## CI / CD

- **Push to `main` and pull requests:** TypeScript check, unit tests and the
  integration tests against a `postgres:17-alpine` service container.
- **Push to `main`:** the Docker image is built (without pushing) to verify
  the build works.
- **Tag push (`v*`):** the image is built and pushed to GHCR, tagged with
  the version and `latest`.

## Acknowledgements

The empty weights in the starter catalogue (`db/presets/catalog.ts`) are not
our own measurements. They come from work other people did and share:

- **[SpoolmanDB](https://github.com/Donkie/SpoolmanDB)** (MIT) – the filament
  database behind [Spoolman](https://github.com/Donkie/Spoolman). It records
  the empty weight per product line and spool size and is kept current by its
  contributors. This is the main source for the catalogue.
- **[SpoolVault – Empty Spool Weights by Brand](https://www.spoolvault.com/guides/empty-spool-weights.html)**
  – a cross-check per brand and spool material.
- **[MatterHackers – Empty Spool Weights](https://help.matterhackers.com/article/129-empty-spool-weights)**
  – a long-standing reference list, useful for older spools.

Manufacturers change spools without saying so, and cardboard spools take on
water, so treat every catalogue value as a starting point rather than a
measurement of the spool in your hand. Weigh the empty spool once and the
number is yours – that is what the custom spool types are for.

## Security

Found a vulnerability? Please report it privately – see
[SECURITY.md](SECURITY.md). Don't open a public issue for it.

## Running it for other people

The moment someone other than you signs in, you are the data controller for
their data — not the author of this software.

- **[PRIVACY.md](PRIVACY.md)** — what the app stores, who else receives data,
  which variables you must set, and how the built-in export and erasure work.
- **[COMPLIANCE.md](COMPLIANCE.md)** — where the project stands on the Cyber
  Resilience Act and the rest, plus templates for a record of processing
  activities and the technical measures.

Users of your instance see an imprint at `/impressum`, a privacy policy at
`/datenschutz` and terms at `/nutzungsbedingungen`, filled from your
`LEGAL_OPERATOR_*` configuration. Without it, those pages say so.

## License

filahub is free software under the **GNU Affero General Public License,
version 3 or later** ([LICENSE](LICENSE)).

You may run, study, modify and redistribute it. If you distribute it, or run a
**modified** version and let other people use it over a network, you have to
offer those people the corresponding source under the same license (AGPL
§ 13). Running an unmodified copy for yourself carries no such obligation.

The software comes with **no warranty and no liability** to the extent
permitted by law (AGPL §§ 15–17).
