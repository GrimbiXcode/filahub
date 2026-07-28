# filahub

Web application for managing a 3D-printing filament inventory: filaments with
spool/packaging types and storage boxes (dryboxes) including tare weight,
weigh-ins with automatic remaining-quantity calculation, short IDs for quick
retrieval, and Telegram-only login.

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

| Variable | Purpose |
|---|---|
| `APP_SECRET` | Random secret for signing session tokens |
| `DATABASE_URL` | MySQL connection string |
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather |
| `TELEGRAM_BOT_USERNAME` | Bot username without @ |
| `TELEGRAM_ALLOWED_IDS` | Allowed Telegram IDs (comma-separated); empty = open registration |
| `OWNER_TELEGRAM_ID` | Telegram ID of the admin |

## 3. Set up the database

Create a MySQL database and sync the schema:

```bash
mysql -u user -p -e "CREATE DATABASE filahub CHARACTER SET utf8mb4;"
npm install
npm run db:push
```

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
(`ghcr.io/<owner>/filahub`) whenever a version tag is pushed.

The MySQL database must be reachable from the container (e.g. via
Docker Compose with a MySQL service or an external database server).

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

## Useful commands

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run check` | TypeScript check |
| `npm run build` | Production build to `dist/` |
| `npm run lint` | ESLint |
| `npm run test` | Vitest |
| `npm run db:push` | Sync schema changes to the database |

## CI / CD

- **Push to `main`:** the Docker image is built (without pushing) to verify
  the build works.
- **Tag push (`v*`):** the image is built and pushed to GHCR, tagged with
  the version and `latest`.
