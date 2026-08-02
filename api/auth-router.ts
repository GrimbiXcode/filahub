import * as cookie from "cookie";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Session } from "@contracts/constants";
import { currencySchema, localeSchema } from "@contracts/locale";
import { getSessionCookieOptions } from "./lib/cookies";
import { env } from "./lib/env";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { redeemLoginCode } from "./telegram/bot";
import { signSessionToken } from "./telegram/session";
import { verifyTelegramWidgetData } from "./telegram/widget";
import { updateUserSettings, upsertUser } from "./queries/users";

function assertAllowed(telegramId: string) {
  if (env.telegramAllowedIds.length > 0 && !env.telegramAllowedIds.includes(telegramId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Dieses Konto ist für den Zugriff nicht freigeschaltet.",
    });
  }
}

function sessionCookie(token: string, headers: Headers) {
  const opts = getSessionCookieOptions(headers);
  return cookie.serialize(Session.cookieName, token, {
    httpOnly: opts.httpOnly,
    path: opts.path,
    sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
    secure: opts.secure,
    maxAge: Session.maxAgeMs / 1000,
  });
}

export const authRouter = createRouter({
  me: authedQuery.query((opts) => opts.ctx.user),

  /** Anzeige-Einstellungen des angemeldeten Benutzers ändern */
  updateSettings: authedQuery
    .input(
      z.object({
        currency: currencySchema.optional(),
        locale: localeSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await updateUserSettings(ctx.user.id, input);
      return { success: true };
    }),

  /** Öffentliche Login-Konfiguration (Bot-Username für die Login-Seite) */
  loginInfo: publicQuery.query(() => ({
    botUsername: env.telegramBotUsername,
    botConfigured: !!env.telegramBotToken,
    whitelistActive: env.telegramAllowedIds.length > 0,
  })),

  /** Code vom Telegram-Bot einlösen und Session setzen */
  login: publicQuery
    .input(z.object({ code: z.string().trim().regex(/^\d{6}$/, "Der Code besteht aus 6 Ziffern") }))
    .mutation(async ({ ctx, input }) => {
      const entry = await redeemLoginCode(input.code);
      if (!entry) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Code ungültig oder abgelaufen. Fordere beim Bot mit /login einen neuen an.",
        });
      }

      assertAllowed(entry.telegramId);

      await upsertUser({
        unionId: entry.telegramId,
        name: entry.telegramName ?? entry.telegramUsername,
        telegramUsername: entry.telegramUsername,
        lastSignInAt: new Date(),
      });

      const token = await signSessionToken({ unionId: entry.telegramId });
      ctx.resHeaders.append("set-cookie", sessionCookie(token, ctx.req.headers));
      return { success: true, name: entry.telegramName ?? entry.telegramUsername };
    }),

  /**
   * Login über das offizielle Telegram Login Widget.
   * Das Widget liefert signierte Nutzerdaten (inkl. Telegram-ID und Username);
   * auf Wunsch teilt der Nutzer im Dialog auch seine Telefonnummer mit Telegram.
   */
  loginWithWidget: publicQuery
    .input(
      z.object({
        id: z.number(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        username: z.string().optional(),
        photo_url: z.string().optional(),
        auth_date: z.number(),
        hash: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!env.telegramBotToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Telegram-Login ist nicht konfiguriert.",
        });
      }
      if (!verifyTelegramWidgetData(env.telegramBotToken, input)) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Die Telegram-Anmeldung konnte nicht verifiziert werden.",
        });
      }

      const telegramId = String(input.id);
      assertAllowed(telegramId);

      const name =
        [input.first_name, input.last_name].filter(Boolean).join(" ") ||
        input.username ||
        null;

      await upsertUser({
        unionId: telegramId,
        name,
        telegramUsername: input.username ?? null,
        avatar: input.photo_url ?? null,
        lastSignInAt: new Date(),
      });

      const token = await signSessionToken({ unionId: telegramId });
      ctx.resHeaders.append("set-cookie", sessionCookie(token, ctx.req.headers));
      return { success: true, name };
    }),

  logout: authedQuery.mutation(async ({ ctx }) => {
    const opts = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append(
      "set-cookie",
      cookie.serialize(Session.cookieName, "", {
        httpOnly: opts.httpOnly,
        path: opts.path,
        sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
        secure: opts.secure,
        maxAge: 0,
      }),
    );
    return { success: true };
  }),
});
