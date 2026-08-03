import { createHash, createHmac, timingSafeEqual } from "crypto";

export type TelegramWidgetAuthData = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

/** Maximales Alter der Login-Daten in Sekunden (Schutz gegen Replay). */
const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

/**
 * Verifiziert die Login-Daten des offiziellen Telegram Login Widgets.
 * Vorgehen laut Telegram-Doku:
 * 1. Alle Felder außer "hash" alphabetisch sortieren und als
 *    "key=value" mit "\n" verbinden (leere Werte auslassen)
 * 2. secret = SHA256(botToken)
 * 3. HMAC_SHA256(dataCheckString, secret) als Hex mit "hash" vergleichen
 */
export function verifyTelegramWidgetData(
  botToken: string,
  data: TelegramWidgetAuthData
): boolean {
  if (!botToken || !data.hash || !data.id || !data.auth_date) return false;

  const now = Math.floor(Date.now() / 1000);
  if (now - data.auth_date > MAX_AUTH_AGE_SECONDS) return false;

  const fields: Record<string, string> = {
    auth_date: String(data.auth_date),
    first_name: data.first_name ?? "",
    id: String(data.id),
    last_name: data.last_name ?? "",
    photo_url: data.photo_url ?? "",
    username: data.username ?? "",
  };

  const dataCheckString = Object.keys(fields)
    .sort()
    .filter(key => fields[key] !== "")
    .map(key => `${key}=${fields[key]}`)
    .join("\n");

  const secret = createHash("sha256").update(botToken).digest();
  const computed = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(data.hash, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
