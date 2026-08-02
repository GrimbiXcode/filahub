import * as cookie from "cookie";
import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { env } from "./lib/env";
import { upsertUser } from "./queries/users";
import { signSessionToken } from "./telegram/session";

/** Telegram-ID des Entwickler-Kontos – bewusst kein gültiges Telegram-Format */
export const DEV_LOGIN_UNION_ID = "dev-login";

/**
 * Anmeldung ohne Telegram für die lokale Entwicklung.
 *
 * Ein GET auf `/api/dev-login` legt ein Admin-Konto an (bzw. meldet das
 * bestehende an), setzt das Session-Cookie und leitet auf die Startseite –
 * damit lässt sich die Oberfläche ohne Bot-Token und ohne Telefon prüfen.
 *
 * Zwei Sperren, beide müssen offen sein: `NODE_ENV` darf nicht `production`
 * sein **und** `DEV_LOGIN=1` muss gesetzt sein. Ist eine davon zu, wird die
 * Route gar nicht erst registriert und läuft in den 404 von `/api/*`.
 */
export function registerDevLogin(app: Hono<{ Bindings: HttpBindings }>): boolean {
  if (env.isProduction || !env.devLogin) return false;

  app.get("/api/dev-login", async (c) => {
    await upsertUser({
      unionId: DEV_LOGIN_UNION_ID,
      name: env.devLoginName,
      telegramUsername: "devlogin",
      role: "admin",
      lastSignInAt: new Date(),
    });

    const token = await signSessionToken({ unionId: DEV_LOGIN_UNION_ID });
    const opts = getSessionCookieOptions(c.req.raw.headers);
    c.header(
      "set-cookie",
      cookie.serialize(Session.cookieName, token, {
        httpOnly: opts.httpOnly,
        path: opts.path,
        sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
        secure: opts.secure,
        maxAge: Session.maxAgeMs / 1000,
      }),
    );
    return c.redirect("/");
  });

  console.warn(
    "DEV_LOGIN ist aktiv: /api/dev-login meldet ohne Telegram als Admin an.",
  );
  return true;
}
