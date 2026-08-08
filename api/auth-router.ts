import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { languageSchema } from "@contracts/i18n";
import { currencySchema, localeSchema } from "@contracts/locale";
import { releaseVersionSchema } from "@contracts/releaseNotes";
import { clearSessionCookie, sessionCookie } from "./lib/cookies";
import { env } from "./lib/env";
import {
  createRouter,
  authedQuery,
  publicQuery,
  rateLimited,
} from "./middleware";
import { redeemLoginCode } from "./telegram/bot";
import { signSessionToken } from "./telegram/session";
import { verifyTelegramWidgetData } from "./telegram/widget";
import {
  markReleaseNotesSeen,
  revokeSessions,
  updateUserSettings,
  upsertUser,
} from "./queries/users";

function assertAllowed(telegramId: string) {
  if (
    env.telegramAllowedIds.length > 0 &&
    !env.telegramAllowedIds.includes(telegramId)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Dieses Konto ist für den Zugriff nicht freigeschaltet.",
    });
  }
}

export const authRouter = createRouter({
  me: authedQuery.query(opts => opts.ctx.user),

  /** Anzeige-Einstellungen des angemeldeten Benutzers ändern */
  updateSettings: authedQuery
    .input(
      z.object({
        currency: currencySchema.optional(),
        locale: localeSchema.optional(),
        language: languageSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await updateUserSettings(ctx.user.id, input);
      return { success: true };
    }),

  /**
   * Merkt sich, bis zu welcher Version der Benutzer die Neuerungen kennt.
   * Bewusst keine Anzeige-Einstellung: der Wert wird nur nach vorne gesetzt
   * (siehe `markReleaseNotesSeen`).
   */
  markReleaseNotesSeen: authedQuery
    .input(z.object({ version: releaseVersionSchema }))
    .mutation(async ({ ctx, input }) => {
      await markReleaseNotesSeen(ctx.user.id, input.version);
      return { success: true };
    }),

  /** Öffentliche Login-Konfiguration (Bot-Username für die Login-Seite) */
  loginInfo: publicQuery.query(() => ({
    botUsername: env.telegramBotUsername,
    botConfigured: !!env.telegramBotToken,
    whitelistActive: env.telegramAllowedIds.length > 0,
    /** Steuert den Entwickler-Login auf der Anmeldeseite (siehe api/devLogin.ts) */
    devLoginAvailable: !env.isProduction && env.devLogin,
  })),

  /**
   * Code vom Telegram-Bot einlösen und Session setzen.
   *
   * Der Code hat sechs Stellen, also eine Million Möglichkeiten – ohne Sperre
   * ließe sich der Bestand gültiger Codes in überschaubarer Zeit durchprobieren,
   * und ein Treffer meldet als der betreffende Benutzer an. Die Einlösung ist
   * bewusst nicht an die Telegram-ID gebunden: Das Formular kennt sie nicht,
   * es gibt also nichts, wogegen sich prüfen ließe. Die Sperre ist damit die
   * einzige wirksame Bremse.
   */
  login: publicQuery
    .use(rateLimited({ key: "auth.login", limit: 10, windowMs: 10 * 60_000 }))
    .use(
      rateLimited({ key: "auth.login.hour", limit: 30, windowMs: 60 * 60_000 })
    )
    .input(
      z.object({
        code: z
          .string()
          .trim()
          .regex(/^\d{6}$/, "Der Code besteht aus 6 Ziffern"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const entry = await redeemLoginCode(input.code);
      if (!entry) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message:
            "Code ungültig oder abgelaufen. Fordere beim Bot mit /login einen neuen an.",
        });
      }

      assertAllowed(entry.telegramId);

      const user = await upsertUser({
        unionId: entry.telegramId,
        name: entry.telegramName ?? entry.telegramUsername,
        telegramUsername: entry.telegramUsername,
        lastSignInAt: new Date(),
      });

      const token = await signSessionToken({
        unionId: entry.telegramId,
        tokenVersion: user.tokenVersion,
      });
      ctx.resHeaders.append(
        "set-cookie",
        sessionCookie(token, ctx.req.headers)
      );
      return {
        success: true,
        name: entry.telegramName ?? entry.telegramUsername,
      };
    }),

  /**
   * Login über das offizielle Telegram Login Widget.
   * Das Widget liefert signierte Nutzerdaten (inkl. Telegram-ID und Username);
   * auf Wunsch teilt der Nutzer im Dialog auch seine Telefonnummer mit Telegram.
   */
  loginWithWidget: publicQuery
    .use(rateLimited({ key: "auth.widget", limit: 20, windowMs: 10 * 60_000 }))
    .input(
      z.object({
        id: z.number(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        username: z.string().optional(),
        photo_url: z.string().optional(),
        auth_date: z.number(),
        hash: z.string(),
      })
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

      /*
        `photo_url` wird bewusst nicht übernommen: Es zeigt auf Telegrams CDN,
        und jede Anzeige des Bildes wäre ein Abruf dort – bei jedem
        Seitenaufruf, für jeden angemeldeten Benutzer. Die Initialen aus
        `AvatarFallback` leisten dasselbe ohne Drittabruf. Das Feld bleibt in
        der Eingabe, weil Telegram es in die HMAC-Prüfsumme einrechnet.
      */
      const user = await upsertUser({
        unionId: telegramId,
        name,
        telegramUsername: input.username ?? null,
        lastSignInAt: new Date(),
      });

      const token = await signSessionToken({
        unionId: telegramId,
        tokenVersion: user.tokenVersion,
      });
      ctx.resHeaders.append(
        "set-cookie",
        sessionCookie(token, ctx.req.headers)
      );
      return { success: true, name };
    }),

  /**
   * Abmelden auf diesem Gerät. Entwertet bewusst **nur** das Cookie: Wer sich
   * am Telefon abmeldet, will nicht zugleich am Rechner hinausfliegen.
   */
  logout: authedQuery.mutation(async ({ ctx }) => {
    ctx.resHeaders.append("set-cookie", clearSessionCookie(ctx.req.headers));
    return { success: true };
  }),

  /**
   * Abmelden auf allen Geräten – der Weg für den Fall, dass ein Gerät
   * abhandengekommen ist. Erhöht `users.tokenVersion` und macht damit jedes
   * ausgestellte Token ungültig, auch das der eigenen Sitzung.
   */
  logoutAllDevices: authedQuery.mutation(async ({ ctx }) => {
    await revokeSessions(ctx.user.id);
    ctx.resHeaders.append("set-cookie", clearSessionCookie(ctx.req.headers));
    return { success: true };
  }),
});
