# filahub

Web application for managing a 3D-printing filament inventory: filaments with
spool/packaging types and storage boxes (dryboxes) including tare weight,
weigh-ins with automatic remaining-quantity calculation, short IDs for quick
retrieval, a shared preset catalogue of manufacturers and spools, and
Telegram-only login.

**Stack:** React + Vite + Tailwind (frontend) · Hono + tRPC (backend) ·
Drizzle ORM + MySQL (database)

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
```

| Variable                | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `APP_SECRET`            | Random secret for signing session tokens                          |
| `DATABASE_URL`          | MySQL connection string                                           |
| `TELEGRAM_BOT_TOKEN`    | Token from @BotFather                                             |
| `TELEGRAM_BOT_USERNAME` | Bot username without @                                            |
| `TELEGRAM_ALLOWED_IDS`  | Allowed Telegram IDs (comma-separated); empty = open registration |
| `OWNER_TELEGRAM_ID`     | Telegram ID of the admin                                          |

## 3. Set up the database

Create a MySQL database:

```bash
mysql -u user -p -e "CREATE DATABASE filahub CHARACTER SET utf8mb4;"
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

The MySQL database must be reachable from the container (e.g. via
Docker Compose with a MySQL service or an external database server).

### With Docker Compose (deployment template)

`docker-compose.yml` is a ready-to-use deployment template: the app image from GHCR
plus a MySQL 8.4 service with a persistent volume.

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
- MySQL is published on `127.0.0.1:3306` in case you want to inspect the
  database or run drizzle commands from the host; remove that port mapping
  if you don't need it.
- Updating to a new release: `docker compose pull && docker compose up -d`.
- Put a reverse proxy with HTTPS in front of port 3000 (see section 5).

## 5. Domain & HTTPS (recommended: Caddy as reverse proxy)

The app listens on port 3000. Put a reverse proxy with HTTPS in front of it
for your domain. With [Caddy](https://caddyserver.com), one line in the
`Caddyfile` is enough:

```
filahub.yourdomain.at {
    reverse_proxy 127.0.0.1:3000
}
```

DNS: point an A record of the domain to your server's IP. Caddy obtains the
TLS certificate automatically. nginx + Certbot works too, of course.

> Outside of localhost, the session cookie is set as `Secure; SameSite=None`
> – HTTPS is therefore required in production.

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
2. Send `/login` to the bot → receive a 6-digit code (valid for 10 min)
3. Enter the code on the website → logged in

When the whitelist (`TELEGRAM_ALLOWED_IDS`) is active, only the listed IDs
can sign in. The `OWNER_TELEGRAM_ID` receives the admin role.

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

| Command                    | Purpose                                          |
| -------------------------- | ------------------------------------------------ |
| `npm run dev`              | Dev server with HMR                              |
| `npm run check`            | TypeScript check                                 |
| `npm run build`            | Production build to `dist/`                      |
| `npm run lint`             | ESLint                                           |
| `npm run test`             | Vitest (no database needed)                      |
| `npm run test:integration` | Vitest against a real MySQL database (see below) |
| `npm run db:push`          | Sync schema changes to the database              |
| `npm run db:seed`          | Seed the preset catalogue (idempotent)           |

## Integration tests

`npm run test` runs the unit tests, which need no database. The integration
tests run the real chain – migrations, seeding, tRPC routers – against
**MySQL 8.4**, the same version as in `docker-compose.yml`. This matters:
MariaDB behaves differently for JSON columns, collation and `sql_mode`, so
those differences only surface here.

```bash
docker run -d --name filahub-test-db -p 127.0.0.1:3399:3306 \
  -e MYSQL_DATABASE=filahub_test -e MYSQL_USER=filahub \
  -e MYSQL_PASSWORD=filahub -e MYSQL_RANDOM_ROOT_PASSWORD=yes mysql:8.4

TEST_DATABASE_URL='mysql://filahub:filahub@127.0.0.1:3399/filahub_test' \
  npm run test:integration
```

> Every run **drops all tables** of the target database and re-applies the
> migrations. The connection therefore comes from `TEST_DATABASE_URL` only and
> must differ from `DATABASE_URL` – use a dedicated test database.

## CI / CD

- **Push to `main` and pull requests:** TypeScript check, unit tests and the
  integration tests against a `mysql:8.4` service container.
- **Push to `main`:** the Docker image is built (without pushing) to verify
  the build works.
- **Tag push (`v*`):** the image is built and pushed to GHCR, tagged with
  the version and `latest`.
