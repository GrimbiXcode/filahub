/**
 * Wer darf sich anmelden – über Telegram oder (seit 4.8.0) über Discord?
 *
 * Reine Funktionen ohne Umgebungszugriff, damit sich die Regeln mit einer
 * Wahrheitstabelle prüfen lassen (`api/loginAccess.test.ts`). Es geht um den
 * Zugang zur Instanz, da ist ein Test mehr wert als eine Zeile weniger. Die
 * Werte aus der Umgebung reicht `accessConfigFromEnv` herein.
 *
 * Die Regeln gelten **je Weg** und sind für Telegram dieselben wie vor 4.8.0:
 *
 *  - Ist für einen Weg eine Freigabeliste gesetzt (`TELEGRAM_ALLOWED_IDS`
 *    bzw. `DISCORD_ALLOWED_IDS`), kommt über ihn nur herein, wer darauf steht
 *    oder als Betreiber benannt ist (`OWNER_*`).
 *  - Ohne Liste nur, wenn der Weg ausdrücklich geöffnet ist
 *    (`TELEGRAM_OPEN_REGISTRATION` bzw. `DISCORD_OPEN_REGISTRATION`).
 *  - Ohne Liste und ohne Öffnung niemand: Eine übersehene Variable ergibt
 *    keine offene Instanz. Darum öffnet die offene Telegram-Registrierung
 *    Discord auch nicht mit – wer Discord anbietet, sagt eigens, für wen.
 *
 * Ein **bestehendes** Konto darf sich anmelden, wenn einer seiner
 * Anmeldewege zugelassen ist – gleich, über welchen es gerade kommt. Genau
 * dafür verbindet man Discord in den Einstellungen: Wer per Telegram
 * freigegeben ist, soll sich danach auch per Discord anmelden können, ohne
 * dass der Betreiber eine zweite Liste pflegt.
 */

export type LoginProvider = "telegram" | "discord";

export type LoginIdentity = { provider: LoginProvider; id: string };

export type AccessConfig = {
  telegramAllowedIds: readonly string[];
  discordAllowedIds: readonly string[];
  telegramOpenRegistration: boolean;
  discordOpenRegistration: boolean;
  ownerTelegramId: string;
  ownerDiscordId: string;
};

/** Die Anmeldewege eines bestehenden Kontos. */
export type AccountMethods = {
  telegramId: string | null;
  discordId: string | null;
};

export type LoginAccess =
  | { ok: true }
  | { ok: false; reason: "registration_closed" | "not_allowlisted" };

export function accessConfigFromEnv(env: AccessConfig): AccessConfig {
  return {
    telegramAllowedIds: env.telegramAllowedIds,
    discordAllowedIds: env.discordAllowedIds,
    telegramOpenRegistration: env.telegramOpenRegistration,
    discordOpenRegistration: env.discordOpenRegistration,
    ownerTelegramId: env.ownerTelegramId,
    ownerDiscordId: env.ownerDiscordId,
  };
}

/** Präfix der `unionId` von Konten, die über Discord entstanden sind. */
export const DISCORD_UNION_PREFIX = "discord:";

/** Discord-IDs sind Snowflakes: 17 bis 20 Ziffern. */
export const DISCORD_ID_PATTERN = /^\d{17,20}$/;

export function discordUnionId(discordId: string): string {
  return `${DISCORD_UNION_PREFIX}${discordId}`;
}

/**
 * Die Telegram-Chat-ID eines Kontos – oder `null`, wenn es keine hat.
 *
 * Die einzige Stelle, die das entscheidet: Bis 4.6.0 war `unionId` immer die
 * Telegram-ID, seither kann es auch `discord:<ID>` sein (oder `dev-login`).
 * Wer Telegram-Nachrichten verschickt, fragt hier und schickt nichts an eine
 * Kennung, die Telegram gar nicht kennt.
 */
export function telegramChatId(unionId: string): string | null {
  return /^\d+$/.test(unionId) ? unionId : null;
}

export function accountMethods(user: {
  unionId: string;
  discordId: string | null;
}): AccountMethods {
  return {
    telegramId: telegramChatId(user.unionId),
    discordId: user.discordId,
  };
}

function allowedIds(cfg: AccessConfig, provider: LoginProvider) {
  return provider === "telegram"
    ? cfg.telegramAllowedIds
    : cfg.discordAllowedIds;
}

export function isOwner(cfg: AccessConfig, identity: LoginIdentity): boolean {
  const owner =
    identity.provider === "telegram" ? cfg.ownerTelegramId : cfg.ownerDiscordId;
  return owner !== "" && owner === identity.id;
}

/** Ob überhaupt eine Freigabeliste gesetzt ist – für die Ersteinrichtung. */
export function hasAnyAllowlist(cfg: AccessConfig): boolean {
  return cfg.telegramAllowedIds.length > 0 || cfg.discordAllowedIds.length > 0;
}

/** Ob ein Weg ohne Liste ausdrücklich geöffnet ist. */
export function providerOpen(
  cfg: AccessConfig,
  provider: LoginProvider
): boolean {
  if (allowedIds(cfg, provider).length > 0) return false;
  return provider === "telegram"
    ? cfg.telegramOpenRegistration
    : cfg.discordOpenRegistration;
}

/** Lässt dieser Weg diese Kennung herein? */
export function providerAccepts(
  cfg: AccessConfig,
  identity: LoginIdentity
): boolean {
  const list = allowedIds(cfg, identity.provider);
  if (list.length === 0) return providerOpen(cfg, identity.provider);
  return list.includes(identity.id) || isOwner(cfg, identity);
}

/**
 * Entscheidet über eine Anmeldung.
 *
 * `existing` ist das Konto, zu dem die Kennung führt (oder `null` für ein
 * neues). Bei einem bestehenden Konto genügt **ein** zugelassener Weg, bei
 * einem neuen zählt allein der, mit dem es entsteht.
 */
export function loginAccess(
  cfg: AccessConfig,
  identity: LoginIdentity,
  existing: AccountMethods | null
): LoginAccess {
  const candidates: LoginIdentity[] = [identity];
  if (existing?.telegramId) {
    candidates.push({ provider: "telegram", id: existing.telegramId });
  }
  if (existing?.discordId) {
    candidates.push({ provider: "discord", id: existing.discordId });
  }
  if (candidates.some(c => providerAccepts(cfg, c))) return { ok: true };

  const closed =
    allowedIds(cfg, identity.provider).length === 0 &&
    !providerOpen(cfg, identity.provider);
  return {
    ok: false,
    reason: closed ? "registration_closed" : "not_allowlisted",
  };
}

/**
 * Ob die instanzweite Tagesgrenze für neue Konten greift.
 *
 * Nur auf offenen Wegen: Bei einer Freigabeliste entscheidet der Betreiber
 * über jeden einzelnen Zugang, eine Tagesgrenze träfe dort nur den Fall, dass
 * er viele auf einmal freischaltet – eine Bremse gegen den eigenen Willen.
 */
export function registrationThrottled(
  cfg: AccessConfig,
  provider: LoginProvider
): boolean {
  return providerOpen(cfg, provider);
}
