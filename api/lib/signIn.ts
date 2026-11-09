import {
  MAX_REGISTRATIONS_PER_DAY,
  MAX_REGISTRATIONS_PER_IP_PER_DAY,
} from "@contracts/limits";
import type { User } from "@db/schema";
import { recordAudit } from "../queries/audit";
import {
  countUsersCreatedSince,
  findUserByDiscordId,
  findUserByUnionId,
} from "../queries/users";
import { signSessionToken } from "../telegram/session";
import { sessionCookie } from "./cookies";
import { env } from "./env";
import {
  accessConfigFromEnv,
  accountMethods,
  loginAccess,
  registrationThrottled,
  type LoginIdentity,
} from "./loginAccess";
import { consumeRateLimit } from "./rateLimit";

/**
 * Was jede Anmeldung gemeinsam hat – über Telegram (Widget, Bot-Code) wie
 * über Discord (seit 4.8.0): Freigabe prüfen, den Zustrom neuer Konten
 * bremsen, protokollieren und das Session-Cookie ausstellen.
 *
 * Stand bis 4.6.0 in `api/auth-router.ts`. Der Discord-Rücksprung ist eine
 * gewöhnliche Hono-Route und kein tRPC-Aufruf; zwei Fassungen derselben
 * Prüfung wären zwei Stellen, an denen die Freigabe auseinanderlaufen kann.
 * Deshalb wirft diese Datei keine `TRPCError`, sondern `LoginRefused` – jeder
 * Aufrufer übersetzt sie in seine Antwortform.
 */

export type LoginRefusedCode =
  | "registration_closed"
  | "not_allowlisted"
  | "rate_limited_instance"
  | "rate_limited_ip";

export class LoginRefused extends Error {
  readonly code: LoginRefusedCode;
  constructor(code: LoginRefusedCode, message: string) {
    super(message);
    this.code = code;
  }
}

const REFUSED_MESSAGES: Record<LoginRefusedCode, string> = {
  registration_closed:
    "Diese Instanz nimmt keine Anmeldungen an. Der Betreiber muss eine Freigabeliste setzen oder die Registrierung ausdrücklich öffnen.",
  not_allowlisted: "Dieses Konto ist für den Zugriff nicht freigeschaltet.",
  rate_limited_instance:
    "Diese Instanz nimmt heute keine neuen Anmeldungen mehr an. Bitte morgen erneut versuchen.",
  rate_limited_ip:
    "Von diesem Anschluss wurden heute schon mehrere Konten angelegt. Bitte morgen erneut versuchen.",
};

/** Protokollfelder je Weg: Telegram hat eine eigene Spalte, Discord nicht. */
function auditIdentity(identity: LoginIdentity) {
  return identity.provider === "telegram"
    ? { telegramId: identity.id, detail: {} }
    : { telegramId: null, detail: { discordId: identity.id } };
}

/** Das Konto, zu dem diese Kennung führt – oder `undefined` für ein neues. */
export function findAccount(identity: LoginIdentity) {
  return identity.provider === "telegram"
    ? findUserByUnionId(identity.id)
    : findUserByDiscordId(identity.id);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Grenzen für das Einlösen eines 6-stelligen Codes – Telegram-Bot-Code wie
 * Discord-Einmal-Code. Derselbe Eimer für beide: Sonst ließen sich die
 * Versuche auf zwei Wege verteilen und die Grenze verdoppeln.
 */
export const LOGIN_RATE_LIMITS = [
  { key: "auth.login", limit: 10, windowMs: 10 * 60_000 },
  { key: "auth.login.hour", limit: 30, windowMs: 60 * 60_000 },
] as const;

/**
 * Prüft, ob sich diese Kennung anmelden darf, und bremst neue Konten.
 *
 * Ohne Freigabeliste **und** ohne ausdrückliche Öffnung des Wegs kommt
 * niemand herein (Regeln in `api/lib/loginAccess.ts`). Das ist die Umkehr des
 * Verhaltens bis 1.1.1, wo eine leere Liste „jeder darf“ bedeutete: Wer die
 * Variable übersah, betrieb unbemerkt eine offene Instanz und wurde damit
 * ungewollt Verantwortlicher für die Daten Fremder.
 *
 * Danach, nur bei **neuen** Konten, die Bremse gegen den Zustrom. Zwei Achsen,
 * und beide braucht es: Die Instanzgrenze fängt den Ansturm aus vielen
 * Richtungen, die Adressgrenze verhindert, dass ein einzelner Aufrufer das
 * Tageskontingent ausschöpft und damit alle anderen aussperrt – die Abwehr
 * wäre sonst selbst der Angriff. Wer schon ein Konto hat, wird nicht
 * ausgesperrt, weil andere sich gerade anmelden.
 *
 * Gibt das bestehende Konto zurück (oder `undefined`), damit der Aufrufer es
 * nicht ein zweites Mal lädt.
 */
export async function assertLoginAllowed(
  identity: LoginIdentity,
  ip: string | null
): Promise<User | undefined> {
  const cfg = accessConfigFromEnv(env);
  const existing = await findAccount(identity);
  const access = loginAccess(
    cfg,
    identity,
    existing ? accountMethods(existing) : null
  );
  const audit = auditIdentity(identity);

  if (!access.ok) {
    recordAudit({
      event: "login.blocked",
      telegramId: audit.telegramId,
      ip,
      detail: { ...audit.detail, reason: access.reason },
    });
    throw new LoginRefused(access.reason, REFUSED_MESSAGES[access.reason]);
  }
  if (existing) return existing;

  if (registrationThrottled(cfg, identity.provider)) {
    const since = new Date(Date.now() - DAY_MS);
    if ((await countUsersCreatedSince(since)) >= MAX_REGISTRATIONS_PER_DAY) {
      recordAudit({
        event: "registration.rate_limited",
        telegramId: audit.telegramId,
        ip,
        detail: { ...audit.detail, reason: "instance" },
      });
      throw new LoginRefused(
        "rate_limited_instance",
        REFUSED_MESSAGES.rate_limited_instance
      );
    }
  }

  const perIp = consumeRateLimit(
    `auth.register:${ip ?? "unbekannt"}`,
    MAX_REGISTRATIONS_PER_IP_PER_DAY,
    DAY_MS
  );
  if (!perIp.allowed) {
    recordAudit({
      event: "registration.rate_limited",
      telegramId: audit.telegramId,
      ip,
      detail: { ...audit.detail, reason: "ip" },
    });
    throw new LoginRefused("rate_limited_ip", REFUSED_MESSAGES.rate_limited_ip);
  }
  return undefined;
}

/**
 * Protokolliert die gelungene Anmeldung und liefert das Session-Cookie.
 *
 * Ein gesperrtes Konto wird **nicht** abgewiesen, und das ist Absicht: Der
 * Gesperrte soll erfahren, woran er ist, und seinen Entsperr-Antrag stellen
 * können (`api/unblockRouter.ts`). Fachlich erreicht er nichts – dafür sorgt
 * `authedQuery`. Wer sich trotz Sperre regelmäßig anmeldet, ist aber genau
 * das, was ein Betreiber sehen will, wenn er einen Vorfall aufklärt.
 */
export async function completeSignIn(
  user: User,
  identity: LoginIdentity,
  method: "code" | "widget" | "discord" | "discord_code",
  ip: string | null,
  headers: Headers
): Promise<string> {
  const audit = auditIdentity(identity);
  recordAudit({
    event: "login.success",
    actorUserId: user.id,
    telegramId: audit.telegramId,
    ip,
    detail: { ...audit.detail, method },
  });
  if (user.blockedAt) {
    recordAudit({
      event: "login.blocked",
      actorUserId: user.id,
      telegramId: audit.telegramId,
      ip,
      detail: { ...audit.detail, reason: "user_blocked" },
    });
  }
  const token = await signSessionToken({
    unionId: user.unionId,
    tokenVersion: user.tokenVersion,
  });
  return sessionCookie(token, headers);
}
