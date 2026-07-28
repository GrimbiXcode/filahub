import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const env = {
  /** Secret für die Signierung der Session-Tokens (JWT) */
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  /** Bot-Token von @BotFather, z. B. "123456:ABC-DEF..." */
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  /** Bot-Username ohne @, z. B. "FilamentLagerBot" */
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME ?? "",
  /** Kommagetrennte Liste erlaubter Telegram-User-IDs; leer = jeder darf sich registrieren */
  telegramAllowedIds: (process.env.TELEGRAM_ALLOWED_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /** Telegram-User-ID des ersten Admins (optional, sonst: erster registrierte Nutzer) */
  ownerTelegramId: process.env.OWNER_TELEGRAM_ID ?? "",
};
