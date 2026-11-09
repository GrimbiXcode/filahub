import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq } from "drizzle-orm";
import { Session } from "@contracts/constants";
import * as schema from "@db/schema";
import type { User } from "@db/schema";
import app from "./app";
import { appRouter } from "./router";
import { env } from "./lib/env";
import { discordUnionId } from "./lib/loginAccess";
import { getDb } from "./queries/connection";
import { exportUserData } from "./queries/account";
import { findUserByUnionId, upsertUser } from "./queries/users";
import { signSessionToken } from "./telegram/session";
import {
  callerFor,
  closeDb,
  countRows,
  resetSchema,
} from "./test/integration-db";

/**
 * Anmeldung über Discord (seit 4.8.0) – der ganze Ablauf über die echten
 * Routen und die echte Datenbank; nur discord.com ist nachgebaut.
 *
 * Die wichtigsten Zusicherungen sind die, die still schiefgingen: Ein
 * Rücksprung in einem fremden Browser meldet **nicht** an, ein `state` gilt
 * nur einmal, und Verbinden meldet nie an und verbindet nur das Konto, das in
 * diesem Browser angemeldet ist.
 */

const DISCORD_ID = "123456789012345678";
const OTHER_ID = "987654321098765432";
const TELEGRAM_ID = "424242";

const saved = { ...env };
let discordUser = { id: DISCORD_ID, username: "spulenfee", global_name: "Fee" };
const revoked: string[] = [];
const realFetch = globalThis.fetch;

function fakeDiscord(input: string | URL | Request, init?: RequestInit) {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith("https://discord.com/api/"))
    return realFetch(input, init);
  const path = url.slice("https://discord.com/api".length);
  if (path === "/oauth2/token") {
    const body = new URLSearchParams(String(init?.body));
    if (body.get("code") === "stale") {
      return Promise.resolve(
        Response.json({ error: "invalid_grant" }, { status: 400 })
      );
    }
    expect(body.get("code_verifier")).toBeTruthy();
    expect(body.get("client_secret")).toBe("secret");
    return Promise.resolve(Response.json({ access_token: "tok" }));
  }
  if (path === "/users/@me") return Promise.resolve(Response.json(discordUser));
  if (path === "/oauth2/token/revoke") {
    revoked.push(new URLSearchParams(String(init?.body)).get("token") ?? "");
    return Promise.resolve(new Response(null, { status: 200 }));
  }
  return Promise.resolve(new Response(null, { status: 404 }));
}

function setCookies(res: Response) {
  return res.headers.getSetCookie();
}

/** Wert des Bindungs-Cookies aus einer Antwort. */
function bindingFrom(res: Response) {
  const header = setCookies(res).find(c => c.startsWith("filahub_discord="));
  return header?.split(";")[0];
}

function hasSession(res: Response) {
  return setCookies(res).some(
    c => c.startsWith(`${Session.cookieName}=`) && !c.includes("Max-Age=0")
  );
}

async function sessionCookie(user: User) {
  const token = await signSessionToken({
    unionId: user.unionId,
    tokenVersion: user.tokenVersion,
  });
  return `${Session.cookieName}=${token}`;
}

/** Start wie im Browser: liefert `state` und das Bindungs-Cookie. */
async function start() {
  const res = await app.request("/api/auth/discord/start");
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get("location")!);
  expect(location.origin).toBe("https://discord.com");
  expect(location.searchParams.get("scope")).toBe("identify");
  expect(location.searchParams.get("code_challenge_method")).toBe("S256");
  return {
    state: location.searchParams.get("state")!,
    binding: bindingFrom(res)!,
  };
}

function callback(params: Record<string, string>, cookie?: string) {
  return app.request(
    `/api/auth/discord/callback?${new URLSearchParams(params)}`,
    { headers: cookie ? { cookie } : {} }
  );
}

beforeAll(async () => {
  await resetSchema();
}, 60_000);

afterAll(async () => {
  Object.assign(env, saved);
  await closeDb();
});

beforeEach(async () => {
  await resetSchema();
  Object.assign(env, saved, {
    discordClientId: "client",
    discordClientSecret: "secret",
    appBaseUrl: "https://filahub.test",
    discordOpenRegistration: true,
    discordAllowedIds: [],
    telegramAllowedIds: [],
    telegramOpenRegistration: false,
    ownerDiscordId: "",
  });
  discordUser = { id: DISCORD_ID, username: "spulenfee", global_name: "Fee" };
  revoked.length = 0;
  vi.stubGlobal("fetch", vi.fn(fakeDiscord));
}, 60_000);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Anmelden mit Discord", () => {
  it("legt im selben Browser ein Konto an und meldet an", async () => {
    const { state, binding } = await start();
    const res = await callback({ code: "ok", state }, binding);

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    expect(hasSession(res)).toBe(true);

    const user = await findUserByUnionId(discordUnionId(DISCORD_ID));
    expect(user?.discordId).toBe(DISCORD_ID);
    expect(user?.discordUsername).toBe("spulenfee");
    expect(user?.name).toBe("Fee");
    // Token sofort widerrufen, Anfrage gelöscht
    expect(revoked).toEqual(["tok"]);
    expect(await countRows("discord_login_requests")).toBe(0);
  });

  it("lässt denselben state kein zweites Mal gelten", async () => {
    const { state, binding } = await start();
    await callback({ code: "ok", state }, binding);
    const again = await callback({ code: "ok", state }, binding);
    expect(again.headers.get("location")).toBe("/login?discord=expired");
    expect(hasSession(again)).toBe(false);
  });

  it("meldet einen Abbruch bei Discord", async () => {
    const { state, binding } = await start();
    const res = await callback({ error: "access_denied", state }, binding);
    expect(res.headers.get("location")).toBe("/login?discord=cancelled");
    expect(await countRows("discord_login_requests")).toBe(0);
  });

  it("nimmt niemanden an, wenn Discord nicht geöffnet ist", async () => {
    env.discordOpenRegistration = false;
    // Auch eine offene Telegram-Registrierung öffnet Discord nicht mit
    env.telegramOpenRegistration = true;
    const { state, binding } = await start();
    const res = await callback({ code: "ok", state }, binding);
    expect(res.headers.get("location")).toBe(
      "/login?discord=registration_closed"
    );
    expect(hasSession(res)).toBe(false);
    expect(await countRows("users")).toBe(0);
  });

  it("zeigt Nicht-Freigegebenen ihre ID im Fragment", async () => {
    env.discordAllowedIds = [OTHER_ID];
    const { state, binding } = await start();
    const res = await callback({ code: "ok", state }, binding);
    expect(res.headers.get("location")).toBe(
      `/login?discord=not_allowlisted#id=${DISCORD_ID}`
    );
    expect(await countRows("users")).toBe(0);
  });

  it("macht den Discord-Betreiber zum Administrator", async () => {
    env.discordOpenRegistration = false;
    env.discordAllowedIds = [OTHER_ID];
    env.ownerDiscordId = DISCORD_ID;
    const { state, binding } = await start();
    await callback({ code: "ok", state }, binding);
    const user = await findUserByUnionId(discordUnionId(DISCORD_ID));
    expect(user?.role).toBe("admin");
  });

  it("meldet einen abgelaufenen Code von Discord", async () => {
    const { state, binding } = await start();
    const res = await callback({ code: "stale", state }, binding);
    expect(res.headers.get("location")).toBe("/login?discord=expired");
  });
});

describe("Einmal-Code bei Rücksprung in einem anderen Browser", () => {
  async function handoff() {
    const { state, binding } = await start();
    // Kein Bindungs-Cookie: Discord kam in einem anderen Browser zurück
    const res = await callback({ code: "ok", state });
    expect(res.status).toBe(303);
    expect(hasSession(res)).toBe(false);
    const location = res.headers.get("location")!;
    expect(location).toMatch(/^\/login\/discord-code#code=\d{6}$/);
    return { binding, code: location.split("=")[1] };
  }

  function redeem(code: string, cookie?: string) {
    return app.request("/api/auth/discord/code", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify({ code }),
    });
  }

  it("meldet erst dort an, wo die Anmeldung begann", async () => {
    const { binding, code } = await handoff();
    expect(await countRows("users")).toBe(0);

    const res = await redeem(code, binding);
    expect(res.status).toBe(200);
    expect(hasSession(res)).toBe(true);
    expect(await findUserByUnionId(discordUnionId(DISCORD_ID))).toBeDefined();
    expect(await countRows("discord_login_requests")).toBe(0);
  });

  it("nützt ohne das Bindungs-Cookie nichts", async () => {
    const { code } = await handoff();
    const res = await redeem(code);
    expect(res.status).toBe(401);
    expect(hasSession(res)).toBe(false);
  });

  it("verfällt nach fünf falschen Versuchen", async () => {
    const { binding, code } = await handoff();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 4; i >= 1; i--) {
      const res = await redeem(wrong, binding);
      expect(res.status).toBe(401);
      expect(((await res.json()) as { code: string }).code).toBe("wrong_code");
    }
    const last = await redeem(wrong, binding);
    expect(((await last.json()) as { code: string }).code).toBe("no_code");
    // Auch der richtige Code gilt danach nicht mehr
    const late = await redeem(code, binding);
    expect(late.status).toBe(401);
    expect(await countRows("users")).toBe(0);
  });
});

describe("Discord in den Einstellungen verbinden", () => {
  let tg: User;

  beforeEach(async () => {
    // Per Telegram freigegeben, Discord weder offen noch mit Liste
    env.telegramAllowedIds = [TELEGRAM_ID];
    env.discordOpenRegistration = false;
    await upsertUser({ unionId: TELEGRAM_ID, name: "Tilda" });
    tg = (await findUserByUnionId(TELEGRAM_ID))!;
  });

  /** `callerFor` legt eigene Kopfzeilen an; für das Cookie brauchen wir sie. */
  async function linkStart(user: User) {
    const resHeaders = new Headers();
    const { url } = await appRouter
      .createCaller({
        req: new Request("http://localhost/api/trpc"),
        resHeaders,
        user,
        language: "de",
        clientIp: "127.0.0.1",
      })
      .auth.discordLinkStart();
    const binding = resHeaders
      .getSetCookie()
      .find(c => c.startsWith("filahub_discord="))!
      .split(";")[0];
    return { state: new URL(url).searchParams.get("state")!, binding };
  }

  it("verbindet, ohne anzumelden, und Discord führt danach zum Konto", async () => {
    const { state, binding } = await linkStart(tg);
    const res = await callback(
      { code: "ok", state },
      `${binding}; ${await sessionCookie(tg)}`
    );
    expect(res.headers.get("location")).toBe("/einstellungen?discord=linked");
    expect(hasSession(res)).toBe(false);
    expect((await findUserByUnionId(TELEGRAM_ID))?.discordId).toBe(DISCORD_ID);

    // Anmelden über Discord trifft dasselbe Konto – obwohl Discord selbst
    // nicht geöffnet ist: Das Konto ist per Telegram freigegeben.
    const login = await start();
    const signIn = await callback(
      { code: "ok", state: login.state },
      login.binding
    );
    expect(signIn.headers.get("location")).toBe("/");
    expect(await countRows("users")).toBe(1);
  });

  it("verbindet nicht, wenn hier ein anderes Konto angemeldet ist", async () => {
    await upsertUser({ unionId: "777", name: "Otto" });
    const otto = (await findUserByUnionId("777"))!;
    const { state, binding } = await linkStart(tg);
    const res = await callback(
      { code: "ok", state },
      `${binding}; ${await sessionCookie(otto)}`
    );
    expect(res.headers.get("location")).toBe(
      "/einstellungen?discord=other_account"
    );
    expect((await findUserByUnionId(TELEGRAM_ID))?.discordId).toBeNull();
    expect((await findUserByUnionId("777"))?.discordId).toBeNull();
  });

  it("verbindet nicht, wenn hier niemand angemeldet ist", async () => {
    const { state, binding } = await linkStart(tg);
    const res = await callback({ code: "ok", state }, binding);
    expect(res.headers.get("location")).toBe("/login?discord=link_signed_out");
    expect(hasSession(res)).toBe(false);
  });

  it("hängt ein Discord-Konto nicht von einem anderen filahub-Konto um", async () => {
    await upsertUser({
      unionId: discordUnionId(DISCORD_ID),
      name: "Fee",
      discordId: DISCORD_ID,
    });
    const { state, binding } = await linkStart(tg);
    const res = await callback(
      { code: "ok", state },
      `${binding}; ${await sessionCookie(tg)}`
    );
    expect(res.headers.get("location")).toBe("/einstellungen?discord=taken");
    expect((await findUserByUnionId(TELEGRAM_ID))?.discordId).toBeNull();
  });

  it("trennt nur, solange ein anderer Weg bleibt", async () => {
    await getDb()
      .update(schema.users)
      .set({ discordId: DISCORD_ID })
      .where(eq(schema.users.id, tg.id));
    const linked = (await findUserByUnionId(TELEGRAM_ID))!;
    expect((await callerFor(linked).auth.loginMethods()).canUnlinkDiscord).toBe(
      true
    );
    await callerFor(linked).auth.discordUnlink();
    expect((await findUserByUnionId(TELEGRAM_ID))?.discordId).toBeNull();

    // Ein Konto nur mit Discord sperrte sich sonst selbst aus
    await upsertUser({
      unionId: discordUnionId(OTHER_ID),
      name: "Dora",
      discordId: OTHER_ID,
    });
    const dora = (await findUserByUnionId(discordUnionId(OTHER_ID)))!;
    await expect(callerFor(dora).auth.discordUnlink()).rejects.toThrow(
      /einzige Weg/
    );
  });

  it("führt laufende Verbindungen in der Auskunft und löscht sie mit", async () => {
    await linkStart(tg);
    const dump = await exportUserData(tg.id);
    const rows = dump.discordLoginRequests as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("verifier");
    expect(rows[0]).not.toHaveProperty("bindingHash");

    await callerFor(tg).account.delete({ confirmation: "Tilda" });
    expect(await countRows("discord_login_requests")).toBe(0);
  });
});
