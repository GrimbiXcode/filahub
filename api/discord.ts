import { createHash, randomBytes, randomInt } from "node:crypto";
import type { Context, Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { parseCookie, stringifySetCookie } from "cookie";
import { and, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import {
  DISCORD_CALLBACK_PATH,
  DISCORD_CODE_PATH,
  DISCORD_HANDOFF_PAGE,
  DISCORD_START_PATH,
  type DiscordLinkResult,
  type DiscordLoginResult,
} from "@contracts/discord";
import { discordLoginRequests } from "@db/schema";
import { clientIpFrom } from "./lib/clientIp";
import { getSessionCookieOptions } from "./lib/cookies";
import { env } from "./lib/env";
import { DISCORD_ID_PATTERN } from "./lib/loginAccess";
import { consumeRateLimit } from "./lib/rateLimit";
import {
  assertLoginAllowed,
  completeSignIn,
  LOGIN_RATE_LIMITS,
  LoginRefused,
} from "./lib/signIn";
import { recordAudit } from "./queries/audit";
import { notify } from "./lib/notify";
import { getDb } from "./queries/connection";
import { purgeDiscordLoginRequests } from "./queries/discordLogin";
import {
  linkDiscord,
  upsertDiscordUser,
  type DiscordProfile,
} from "./queries/users";
import { authenticateRequest } from "./telegram/auth";

/**
 * Anmeldung über Discord (seit 4.8.0; Vorbild ist die Umsetzung im Dungeon
 * Buddy): OAuth2 Authorization Code mit PKCE, Scope `identify`.
 *
 * Das Client-Secret verlässt den Server nie. Gespeichert werden nur
 * Discord-ID und Benutzername; das Zugriffstoken wird gleich nach dem Abruf
 * des Profils widerrufen. Der Rücksprung endet immer auf einer Seite der App:
 * angemeldet auf `/`, sonst mit `?discord=<Grund>` aus einer festen Liste
 * (`contracts/discord.ts`), nie mit Text von Discord.
 *
 * **Einmal-Code.** Kommt der Rücksprung ohne passendes Bindungs-Cookie an –
 * iOS öffnet Discord aus der installierten App heraus in einem eigenen
 * Browser mit eigenem Cookie-Speicher –, meldet er diesen Browser nicht an,
 * sondern zeigt einen 6-stelligen Code. Einlösen kann ihn nur, wer das Cookie
 * des Starts hat; Durchprobieren nützt also nichts. Gegen Phishing (jemand
 * schickt seinen eigenen Discord-Link und lässt sich den Code geben) helfen
 * der Warnsatz auf der Code-Seite und der Eintrag im Protokoll.
 *
 * **Verbinden** in den Einstellungen: Start per tRPC (`auth.discordLinkStart`,
 * angemeldet), Zweck `link` mit dem Konto. Der Rücksprung meldet dann nie an,
 * sondern verbindet, wenn in diesem Browser genau dieses Konto angemeldet
 * ist. Kein Einmal-Code fürs Verbinden – er öffnete einen Weg für Phishing.
 */

export const DISCORD_REQUEST_TTL_MS = 10 * 60 * 1000;
export const DISCORD_HANDOFF_TTL_MS = 5 * 60 * 1000;
export const DISCORD_HANDOFF_TRIES = 5;
/** Start schreibt eine Zeile: eigene, großzügige Grenze je Anschluss */
export const DISCORD_START_LIMIT = { perIp: 30, windowMs: 15 * 60 * 1000 };

const COOKIE = "filahub_discord";
/** Steht auch in `src/const.ts`; der Server darf nichts aus `src/` laden. */
const SETTINGS_PATH = "/einstellungen";
const COOKIE_PATH = "/api/auth/discord";
const API = "https://discord.com/api";
const TIMEOUT_MS = 10_000;

/** Discord eingerichtet: Client-ID, Secret und feste öffentliche Adresse. */
export function discordConfigured(): boolean {
  return Boolean(
    env.discordClientId && env.discordClientSecret && env.appBaseUrl
  );
}

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
/** Verbinden bekommt einen eigenen Hash, damit es nie als Anmeldung gilt. */
const linkStateHash = (state: string) => hash(`link:${state}`);
const random = (bytes: number) => randomBytes(bytes).toString("base64url");

const redirectUri = () => `${env.appBaseUrl}${DISCORD_CALLBACK_PATH}`;

class DiscordError extends Error {
  readonly reason: "expired" | "unreachable" | "misconfigured";
  constructor(reason: "expired" | "unreachable" | "misconfigured") {
    super(reason);
    this.reason = reason;
  }
}

async function discordFetch(path: string, init: RequestInit) {
  try {
    return await fetch(`${API}${path}`, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new DiscordError("unreachable");
  }
}

const clientForm = (extra: Record<string, string>) =>
  new URLSearchParams({
    client_id: env.discordClientId,
    client_secret: env.discordClientSecret,
    ...extra,
  });

/** Code gegen Zugriffstoken tauschen: keine Wiederholung, Gründe statt Text. */
export async function exchangeCode(
  code: string,
  verifier: string
): Promise<string> {
  const resp = await discordFetch("/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: clientForm({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }),
  });
  const body = (await resp.json().catch(() => null)) as {
    access_token?: unknown;
    error?: unknown;
  } | null;
  if (resp.ok && typeof body?.access_token === "string") {
    return body.access_token;
  }
  if (resp.status === 400 && body?.error === "invalid_grant") {
    throw new DiscordError("expired");
  }
  if (resp.status === 401 || body?.error === "invalid_client") {
    throw new DiscordError("misconfigured");
  }
  throw new DiscordError("unreachable");
}

export async function fetchProfile(token: string): Promise<DiscordProfile> {
  const resp = await discordFetch("/users/@me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await resp.json().catch(() => null)) as {
    id?: unknown;
    username?: unknown;
    global_name?: unknown;
  } | null;
  if (
    !resp.ok ||
    typeof body?.id !== "string" ||
    !DISCORD_ID_PATTERN.test(body.id) ||
    typeof body.username !== "string"
  ) {
    throw new DiscordError("unreachable");
  }
  return {
    id: body.id,
    username: body.username.slice(0, 255),
    globalName:
      typeof body.global_name === "string" && body.global_name
        ? body.global_name.slice(0, 255)
        : null,
  };
}

/** Das Token brauchen wir nicht mehr: widerrufen, Fehler nur ins Log. */
function revoke(token: string) {
  void discordFetch("/oauth2/token/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: clientForm({ token, token_type_hint: "access_token" }),
  }).catch(() => console.warn("[discord] Token nicht widerrufen"));
}

async function profileFor(code: string, verifier: string) {
  const token = await exchangeCode(code, verifier);
  return fetchProfile(token).finally(() => revoke(token));
}

function bindingCookie(headers: Headers, value: string, maxAgeSeconds: number) {
  return stringifySetCookie({
    name: COOKIE,
    value,
    path: COOKIE_PATH,
    httpOnly: true,
    sameSite: "lax",
    secure: getSessionCookieOptions(headers).secure,
    maxAge: maxAgeSeconds,
  });
}

const clearBinding = (headers: Headers) => bindingCookie(headers, "", 0);

function readBinding(headers: Headers): string | undefined {
  return parseCookie(headers.get("cookie") || "")[COOKIE] || undefined;
}

/**
 * Neue Anfrage samt Bindungs-Cookie. `userId` gesetzt: Verbinden – dann
 * fragt Discord ausdrücklich nach Zustimmung, damit klar ist, welches
 * Discord-Konto verbunden wird. `null`, wenn die Grenze je Anschluss erreicht
 * ist.
 */
export async function beginDiscord(
  headers: Headers,
  userId: number | null
): Promise<{ url: string; cookie: string } | null> {
  const ip = clientIpFrom(headers);
  const limit = consumeRateLimit(
    `discord.start:${ip ?? "unbekannt"}`,
    DISCORD_START_LIMIT.perIp,
    DISCORD_START_LIMIT.windowMs
  );
  if (!limit.allowed) return null;
  await purgeDiscordLoginRequests();

  const state = random(32);
  const binding = random(32);
  const verifier = random(48);
  await getDb()
    .insert(discordLoginRequests)
    .values({
      stateHash: userId ? linkStateHash(state) : hash(state),
      bindingHash: hash(binding),
      verifier,
      purpose: userId ? "link" : "login",
      userId,
      expiresAt: new Date(Date.now() + DISCORD_REQUEST_TTL_MS),
    });

  const url = new URL("https://discord.com/oauth2/authorize");
  url.search = new URLSearchParams({
    client_id: env.discordClientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "identify",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    // Anmelden: Zustimmung nur beim ersten Mal; Verbinden: immer zeigen
    prompt: userId ? "consent" : "none",
  }).toString();

  return {
    url: url.toString(),
    // Bis der Einmal-Code abläuft: Rücksprung nach höchstens 10 Minuten,
    // dann 5 Minuten zum Eintippen.
    cookie: bindingCookie(
      headers,
      binding,
      (DISCORD_REQUEST_TTL_MS + DISCORD_HANDOFF_TTL_MS) / 1000
    ),
  };
}

const dropRequest = (stateHash: string) =>
  getDb()
    .delete(discordLoginRequests)
    .where(eq(discordLoginRequests.stateHash, stateHash));

type C = Context<{ Bindings: HttpBindings }>;

/** `keepCookie`: Rücksprung in einem anderen Browser – dessen Cookie bleibt. */
function toLogin(
  c: C,
  reason?: DiscordLoginResult,
  options: { fragment?: string; keepCookie?: boolean } = {}
) {
  if (!options.keepCookie) {
    c.header("set-cookie", clearBinding(c.req.raw.headers), { append: true });
  }
  return c.redirect(
    reason ? `/login?discord=${reason}${options.fragment ?? ""}` : "/",
    303
  );
}

function toSettings(c: C, result: DiscordLinkResult, keepCookie: boolean) {
  if (!keepCookie) {
    c.header("set-cookie", clearBinding(c.req.raw.headers), { append: true });
  }
  return c.redirect(`${SETTINGS_PATH}?discord=${result}`, 303);
}

async function currentUser(headers: Headers) {
  try {
    return await authenticateRequest(headers);
  } catch {
    return undefined;
  }
}

/**
 * Rücksprung beim Verbinden: nie anmelden. Verbunden wird nur, wenn in
 * diesem Browser genau das Konto angemeldet ist, das verbinden wollte.
 */
async function finishLink(
  c: C,
  request: { verifier: string; userId: number | null },
  code: string,
  sameBrowser: boolean
) {
  const keepCookie = !sameBrowser;
  const user = await currentUser(c.req.raw.headers);
  if (!user) {
    return toLogin(c, sameBrowser ? "link_signed_out" : "link_other_browser", {
      keepCookie,
    });
  }
  if (user.id !== request.userId) {
    return toSettings(
      c,
      sameBrowser ? "other_account" : "link_elsewhere",
      keepCookie
    );
  }
  // Gesperrt (etwa während des Verbindens): nichts verbinden
  if (user.blockedAt) return toSettings(c, "failed", keepCookie);
  try {
    const profile = await profileFor(code, request.verifier);
    const result = await linkDiscord(user.id, profile);
    if (result === "linked") {
      recordAudit({
        event: "login.discord_linked",
        actorUserId: user.id,
        ip: clientIpFrom(c.req.raw.headers),
        detail: { discordId: profile.id },
      });
      await notify(
        user.id,
        m => m.discordLinked({ username: profile.username }),
        SETTINGS_PATH
      ).catch(() => false);
    }
    return toSettings(c, result, keepCookie);
  } catch (error) {
    if (error instanceof DiscordError) {
      return toSettings(c, error.reason, keepCookie);
    }
    console.warn(
      "[discord] Verbinden fehlgeschlagen:",
      (error as Error).message
    );
    return toSettings(c, "failed", keepCookie);
  }
}

async function handleCallback(c: C) {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");
  const headers = c.req.raw.headers;
  const binding = readBinding(headers);
  const ip = clientIpFrom(headers);
  const db = getDb();
  let sameBrowser = false;

  try {
    if (error === "access_denied") {
      // Nur der eigene Ablauf endet hier; ein fremdes Cookie bleibt
      const [row] = state
        ? await db
            .delete(discordLoginRequests)
            .where(
              inArray(discordLoginRequests.stateHash, [
                hash(state),
                linkStateHash(state),
              ])
            )
            .returning({
              bindingHash: discordLoginRequests.bindingHash,
              purpose: discordLoginRequests.purpose,
            })
        : [];
      const keepCookie = !row || !binding || hash(binding) !== row.bindingHash;
      if (row?.purpose === "link") {
        return toSettings(c, "cancelled", keepCookie);
      }
      return toLogin(c, "cancelled", { keepCookie });
    }
    if (!discordConfigured()) return toLogin(c, "misconfigured");
    if (!state || !code) return toLogin(c, "failed", { keepCookie: true });

    // Einmalig und atomar: zwei Rücksprünge mit demselben state gelingen nie beide
    const [request] = await db
      .update(discordLoginRequests)
      .set({ usedAt: new Date() })
      .where(
        and(
          inArray(discordLoginRequests.stateHash, [
            hash(state),
            linkStateHash(state),
          ]),
          isNull(discordLoginRequests.usedAt),
          gt(discordLoginRequests.expiresAt, new Date())
        )
      )
      .returning();
    if (!request) return toLogin(c, "expired", { keepCookie: true });

    // Gestartet in einem anderen Browser bzw. Cookie-Speicher?
    sameBrowser = Boolean(binding) && hash(binding!) === request.bindingHash;

    if (request.purpose === "link") {
      await dropRequest(request.stateHash);
      return finishLink(c, request, code, sameBrowser);
    }

    // Im selben Browser wird die Zeile nicht mehr gebraucht
    if (sameBrowser) await dropRequest(request.stateHash);

    let discordId = "";
    try {
      const profile = await profileFor(code, request.verifier);
      discordId = profile.id;
      const identity = { provider: "discord" as const, id: profile.id };

      if (!sameBrowser) {
        // Nicht freigegeben gleich hier melden statt erst nach dem Eintippen
        await assertLoginAllowed(identity, ip);
        const handoff = String(randomInt(0, 1_000_000)).padStart(6, "0");
        await db
          .update(discordLoginRequests)
          .set({
            verifier: "",
            handoffCodeHash: hash(handoff),
            handoffExpiresAt: new Date(Date.now() + DISCORD_HANDOFF_TTL_MS),
            discordId: profile.id,
            discordUsername: profile.username,
            discordGlobalName: profile.globalName,
          })
          .where(eq(discordLoginRequests.stateHash, request.stateHash));
        /*
          Der Code steht nur im Fragment: Er erscheint in keinem Log und geht
          mit keiner Anfrage mit. Ein Cookie dieses Browsers gehört zu einem
          anderen Ablauf und bleibt.
        */
        return c.redirect(`${DISCORD_HANDOFF_PAGE}#code=${handoff}`, 303);
      }

      await assertLoginAllowed(identity, ip);
      const user = await upsertDiscordUser(profile);
      c.header(
        "set-cookie",
        await completeSignIn(user, identity, "discord", ip, headers),
        { append: true }
      );
      return toLogin(c);
    } catch (e) {
      if (!sameBrowser) await dropRequest(request.stateHash);
      // Nicht freigegeben: die ID für den Betreiber zeigen (nur im Fragment)
      if (e instanceof LoginRefused && e.code === "not_allowlisted") {
        return toLogin(c, "not_allowlisted", {
          fragment: `#id=${discordId}`,
          keepCookie: !sameBrowser,
        });
      }
      throw e;
    }
  } catch (e) {
    const keepCookie = !sameBrowser;
    if (e instanceof DiscordError) return toLogin(c, e.reason, { keepCookie });
    if (e instanceof LoginRefused) return toLogin(c, e.code, { keepCookie });
    console.warn("[discord] Anmeldung fehlgeschlagen:", (e as Error).message);
    return toLogin(c, "failed", { keepCookie });
  }
}

const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Der Code besteht aus 6 Ziffern"),
});

/**
 * Einmal-Code einlösen – nur mit dem Bindungs-Cookie des Starts.
 *
 * Dieselben Grenzen wie beim Telegram-Code (`LOGIN_RATE_LIMITS`, derselbe
 * Eimer, damit sich die Versuche nicht auf zwei Wege verteilen lassen); nach
 * fünf falschen Versuchen gilt der Code nicht mehr.
 */
async function handleCode(c: C) {
  const headers = c.req.raw.headers;
  const ip = clientIpFrom(headers);
  for (const limit of LOGIN_RATE_LIMITS) {
    const result = consumeRateLimit(
      `${limit.key}:${ip ?? "unbekannt"}`,
      limit.limit,
      limit.windowMs
    );
    if (!result.allowed) {
      recordAudit({
        event: "login.rate_limited",
        ip,
        detail: { key: limit.key },
      });
      return c.json(
        {
          code: "too_many",
          message:
            "Zu viele Versuche. Bitte in ein paar Minuten erneut versuchen.",
        },
        429
      );
    }
  }

  const parsed = codeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { code: "invalid", message: "Der Code besteht aus 6 Ziffern" },
      400
    );
  }
  const noCode = () =>
    c.json(
      {
        code: "no_code",
        message:
          "Hier wartet kein gültiger Code (abgelaufen, zu oft falsch oder in einem anderen Browser begonnen). Melde dich hier noch einmal mit Discord an.",
      },
      401
    );
  const binding = readBinding(headers);
  if (!binding) return noCode();

  const db = getDb();
  const result = await db.transaction(async tx => {
    const [row] = await tx
      .select()
      .from(discordLoginRequests)
      .where(
        and(
          eq(discordLoginRequests.bindingHash, hash(binding)),
          eq(discordLoginRequests.purpose, "login"),
          sql`${discordLoginRequests.handoffCodeHash} IS NOT NULL`,
          gt(discordLoginRequests.handoffExpiresAt, new Date()),
          lt(discordLoginRequests.handoffFailures, DISCORD_HANDOFF_TRIES)
        )
      )
      .for("update");
    if (!row) return null;
    if (row.handoffCodeHash !== hash(parsed.data.code)) {
      const left = DISCORD_HANDOFF_TRIES - row.handoffFailures - 1;
      if (left > 0) {
        await tx
          .update(discordLoginRequests)
          .set({
            handoffFailures: sql`${discordLoginRequests.handoffFailures} + 1`,
          })
          .where(eq(discordLoginRequests.stateHash, row.stateHash));
      } else {
        // Letzter Versuch verbraucht: Discord-Profil nicht länger aufbewahren
        await tx
          .delete(discordLoginRequests)
          .where(eq(discordLoginRequests.stateHash, row.stateHash));
      }
      return { ok: false as const, left };
    }
    await tx
      .delete(discordLoginRequests)
      .where(eq(discordLoginRequests.stateHash, row.stateHash));
    return { ok: true as const, row };
  });

  if (!result?.ok) {
    recordAudit({
      event: "login.failed",
      ip,
      detail: { method: "discord_code" },
    });
    if (result && result.left > 0) {
      return c.json(
        {
          code: "wrong_code",
          message:
            result.left === 1
              ? "Der Code stimmt nicht. Noch 1 Versuch."
              : `Der Code stimmt nicht. Noch ${result.left} Versuche.`,
        },
        401
      );
    }
    return noCode();
  }

  const { row } = result;
  const profile: DiscordProfile = {
    id: row.discordId!,
    username: row.discordUsername ?? "",
    globalName: row.discordGlobalName,
  };
  const identity = { provider: "discord" as const, id: profile.id };
  try {
    await assertLoginAllowed(identity, ip);
  } catch (e) {
    if (e instanceof LoginRefused) {
      return c.json({ code: e.code, message: e.message }, 403);
    }
    throw e;
  }
  const user = await upsertDiscordUser(profile);
  c.header("set-cookie", clearBinding(headers), { append: true });
  c.header(
    "set-cookie",
    await completeSignIn(user, identity, "discord_code", ip, headers),
    { append: true }
  );
  // Bestmöglich: angemeldet ist man schon, ein Fehler hier ändert nichts daran
  await notify(user.id, m => m.discordCodeSignIn(), SETTINGS_PATH).catch(
    () => false
  );
  return c.json({ success: true });
}

export function registerDiscordRoutes(app: Hono<{ Bindings: HttpBindings }>) {
  app.get(DISCORD_START_PATH, async c => {
    if (!discordConfigured()) return toLogin(c, "misconfigured");
    const started = await beginDiscord(c.req.raw.headers, null);
    if (!started) return toLogin(c, "too_many");
    c.header("set-cookie", started.cookie, { append: true });
    return c.redirect(started.url, 302);
  });
  app.get(DISCORD_CALLBACK_PATH, handleCallback);
  app.post(DISCORD_CODE_PATH, handleCode);
}
