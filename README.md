# Filament-Lager

Webapplikation zur Verwaltung eines 3D-Druck-Materiallagers: Filamente mit
Rollentypen und Lagerboxen (Drybox) inkl. Leergewicht, Wägungen mit
automatischer Restmengenberechnung, Kennungen zum schnellen Wiederfinden,
Telegram-Login.

**Stack:** React + Vite + Tailwind (Frontend) · Hono + tRPC (Backend) ·
Drizzle ORM + MySQL (Datenbank)

---

## 1. Telegram-Bot anlegen

1. In Telegram [@BotFather](https://t.me/BotFather) öffnen
2. `/newbot` senden, Name und Username wählen (z. B. `DeinFilamentLagerBot`)
3. Den **Token** notieren (sieht aus wie `123456789:ABCdeFG…`)
4. **Domain hinterlegen (wichtig für das Login-Widget):** Bei @BotFather
   `/setdomain` senden, den Bot wählen und deine Domain eintragen
   (z. B. `filament.deinedomain.at` – ohne https://, ohne Pfad)
5. Dem neuen Bot `/id` schreiben → er antwortet mit deiner **Telegram-User-ID**
   (die brauchst du für die Whitelist und die Admin-Rolle)

> Hinweis: `/id` ist eine eingebaute Funktion dieser App – sobald der Bot
> läuft, antwortet er darauf mit deiner ID.

## 2. Konfiguration

```bash
cp .env.example .env
# .env ausfüllen: APP_SECRET (z. B. `openssl rand -hex 32`), DATABASE_URL,
# TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_ALLOWED_IDS, OWNER_TELEGRAM_ID
```

| Variable | Bedeutung |
|---|---|
| `APP_SECRET` | Zufalls-Secret für Session-Tokens |
| `DATABASE_URL` | MySQL-Verbindungsstring |
| `TELEGRAM_BOT_TOKEN` | Token von @BotFather |
| `TELEGRAM_BOT_USERNAME` | Bot-Username ohne @ |
| `TELEGRAM_ALLOWED_IDS` | Erlaubte Telegram-IDs (kommagetrennt); leer = offene Registrierung |
| `OWNER_TELEGRAM_ID` | Telegram-ID des Admins |

## 3. Datenbank einrichten

MySQL-Datenbank anlegen und Schema synchronisieren:

```bash
mysql -u benutzer -p -e "CREATE DATABASE filament_lager CHARACTER SET utf8mb4;"
npm install
npm run db:push
```

## 4. Starten

### Ohne Docker

```bash
npm install
npm run build
npm start          # läuft auf Port 3000 (PORT in .env änderbar)
```

### Mit Docker

```bash
docker build -t filament-lager .
docker run -d --name filament-lager \
  --env-file .env \
  -p 3000:3000 \
  --restart unless-stopped \
  filament-lager
```

Die MySQL-Datenbank muss vom Container aus erreichbar sein (z. B. Docker-Compose
mit MySQL-Service oder externer Datenbankserver).

## 5. Domain & HTTPS (empfohlen: Caddy als Reverse Proxy)

Die App lauscht auf Port 3000. Für deine Domain davor einen Reverse Proxy mit
HTTPS schalten. Mit [Caddy](https://caddyserver.com) genügt eine Zeile in der
`Caddyfile`:

```
filament.deinedomain.at {
    reverse_proxy 127.0.0.1:3000
}
```

DNS: A-Record der Domain auf die IP des VPS zeigen lassen. Caddy holt sich das
TLS-Zertifikat automatisch. Alternativ geht natürlich auch nginx + Certbot.

> Das Session-Cookie wird außerhalb von localhost als `Secure; SameSite=None`
> gesetzt – HTTPS ist daher im Produktivbetrieb erforderlich.

## 6. Login-Ablauf

**Primär: offizielles Telegram Login Widget** (Knopf auf der Login-Seite)

1. Auf „Log in with Telegram“ klicken
2. Telegram öffnet den offiziellen Bestätigungsdialog – Identität wird dabei
   auch über die hinterlegte Telefonnummer bestätigt
3. Bestätigen → angemeldet

> Voraussetzung: Die Domain muss per `/setdomain` bei @BotFather hinterlegt
> sein (siehe Schritt 1). Das Widget benötigt außerdem Third-Party-Cookies;
> in Browsern mit strikter Blockierung ggf. die Alternative nutzen.

**Alternativ: Code-Login über den Bot**

1. Bot-Link auf der Login-Seite anklicken
2. Dem Bot `/login` schreiben → 6-stelligen Code erhalten (10 Min. gültig)
3. Code auf der Website eingeben → angemeldet

Bei aktiver Whitelist (`TELEGRAM_ALLOWED_IDS`) können sich nur die
hinterlegten IDs anmelden. Die `OWNER_TELEGRAM_ID` erhält die Admin-Rolle.

## Nützliche Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver mit HMR |
| `npm run check` | TypeScript-Prüfung |
| `npm run build` | Produktions-Build nach `dist/` |
| `npm run db:push` | Schema-Änderungen in die DB synchronisieren |
