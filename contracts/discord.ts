/**
 * Anmeldung über Discord (seit 4.8.0) – was Client und Server gemeinsam
 * kennen müssen.
 *
 * Der Rücksprung von Discord endet immer auf einer Seite der App, mit einem
 * Grund als Suchparameter (`?discord=<Grund>`). Der Grund stammt **immer** aus
 * diesen festen Listen und nie aus einem Text von Discord: So kann niemand
 * über einen präparierten Link beliebigen Text in die Anmeldeseite schreiben,
 * und jede Meldung ist übersetzbar.
 */

/** Pfade der Server-Routen (`api/discord.ts`). */
export const DISCORD_START_PATH = "/api/auth/discord/start";
export const DISCORD_CALLBACK_PATH = "/api/auth/discord/callback";
export const DISCORD_CODE_PATH = "/api/auth/discord/code";

/** Seite für den Einmal-Code, wenn der Rücksprung im falschen Browser landet. */
export const DISCORD_HANDOFF_PAGE = "/login/discord-code";

/** Gründe auf der Anmeldeseite (`/login?discord=…`). */
export const DISCORD_LOGIN_RESULTS = [
  "cancelled",
  "expired",
  "registration_closed",
  "not_allowlisted",
  "rate_limited_instance",
  "rate_limited_ip",
  "too_many",
  "unreachable",
  "misconfigured",
  "failed",
  /** Verbinden begonnen, inzwischen abgemeldet – nichts verbunden */
  "link_signed_out",
  /** Verbinden begonnen, Discord kam in einem anderen Browser zurück */
  "link_other_browser",
] as const;
export type DiscordLoginResult = (typeof DISCORD_LOGIN_RESULTS)[number];

/** Ergebnisse auf der Einstellungsseite (`/einstellungen?discord=…`). */
export const DISCORD_LINK_RESULTS = [
  "linked",
  "already_linked",
  /** Diese Discord-ID gehört schon zu einem anderen Konto */
  "taken",
  /** In diesem Browser ist ein anderes Konto angemeldet */
  "other_account",
  /** Rücksprung in einem anderen Browser, dort aber angemeldet */
  "link_elsewhere",
  "cancelled",
  "expired",
  "unreachable",
  "misconfigured",
  "failed",
] as const;
export type DiscordLinkResult = (typeof DISCORD_LINK_RESULTS)[number];

export function parseDiscordLoginResult(
  value: string | null
): DiscordLoginResult | null {
  return (DISCORD_LOGIN_RESULTS as readonly string[]).includes(value ?? "")
    ? (value as DiscordLoginResult)
    : null;
}

export function parseDiscordLinkResult(
  value: string | null
): DiscordLinkResult | null {
  return (DISCORD_LINK_RESULTS as readonly string[]).includes(value ?? "")
    ? (value as DiscordLinkResult)
    : null;
}
