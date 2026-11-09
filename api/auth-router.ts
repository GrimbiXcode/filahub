import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { languageSchema } from "@contracts/i18n";
import { currencySchema, localeSchema } from "@contracts/locale";
import { hiddenMaterialColumnsSchema } from "@contracts/materialColumns";
import { releaseVersionSchema } from "@contracts/releaseNotes";
import { clearSessionCookie } from "./lib/cookies";
import { env } from "./lib/env";
import {
  assertLoginAllowed,
  completeSignIn,
  LOGIN_RATE_LIMITS,
  LoginRefused,
} from "./lib/signIn";
import { recordAudit } from "./queries/audit";
import {
  createRouter,
  authedQuery,
  blockedQuery,
  publicQuery,
  rateLimited,
} from "./middleware";
import { beginDiscord, discordConfigured } from "./discord";
import {
  accessConfigFromEnv,
  hasAnyAllowlist,
  loginAccess,
  telegramChatId,
} from "./lib/loginAccess";
import { redeemLoginCode } from "./telegram/bot";
import { verifyTelegramWidgetData } from "./telegram/widget";
import {
  markReleaseNotesSeen,
  unlinkDiscord,
  revokeSessions,
  updateUserSettings,
  upsertUser,
} from "./queries/users";

/**
 * Darf dieses Konto Discord trennen? Nur, wenn es Telegram hat **und** sich
 * über Telegram auch anmelden darf – ein Konto, das nur über Discord
 * freigegeben ist, sperrte sich sonst selbst aus.
 */
function canUnlinkDiscord(user: {
  unionId: string;
  discordId: string | null;
}): "ok" | "not_linked" | "only_way" {
  if (!user.discordId) return "not_linked";
  const telegramId = telegramChatId(user.unionId);
  if (!telegramId) return "only_way";
  const access = loginAccess(
    accessConfigFromEnv(env),
    { provider: "telegram", id: telegramId },
    { telegramId, discordId: null }
  );
  return access.ok ? "ok" : "only_way";
}

/** Übersetzt eine abgewiesene Anmeldung in die tRPC-Antwort. */
function asTrpcError(error: unknown): never {
  if (error instanceof LoginRefused) {
    throw new TRPCError({
      code: error.code.startsWith("rate_limited")
        ? "TOO_MANY_REQUESTS"
        : "FORBIDDEN",
      message: error.message,
    });
  }
  throw error;
}

/**
 * Gemeinsamer Abschluss beider Telegram-Wege: Freigabe, Konto, Cookie.
 * Die Prüfungen selbst stehen in `api/lib/signIn.ts` – geteilt mit Discord.
 */
async function signInWithTelegram(
  ctx: { clientIp: string | null; req: Request; resHeaders: Headers },
  telegram: { id: string; name: string | null; username: string | null },
  method: "code" | "widget"
) {
  const identity = { provider: "telegram" as const, id: telegram.id };
  await assertLoginAllowed(identity, ctx.clientIp).catch(asTrpcError);
  const user = await upsertUser({
    unionId: telegram.id,
    name: telegram.name,
    telegramUsername: telegram.username,
    lastSignInAt: new Date(),
  });
  ctx.resHeaders.append(
    "set-cookie",
    await completeSignIn(user, identity, method, ctx.clientIp, ctx.req.headers)
  );
  return user;
}

export const authRouter = createRouter({
  /*
    `blockedQuery` und nicht `authedQuery`: Ohne diese Prozedur wüsste die
    Oberfläche nicht, dass das Konto gesperrt ist – sie zeigte dem Betroffenen
    die Anmeldeschranke statt seiner Sperrseite. Aus demselben Grund stehen
    Sprachwahl und beide Abmeldewege weiter unten ebenfalls darauf: Eine Sperre
    darf niemanden an sein Gerät fesseln, und die Sperrseite soll lesbar sein.
  */
  me: blockedQuery.query(opts => opts.ctx.user),

  /** Anzeige-Einstellungen des angemeldeten Benutzers ändern */
  updateSettings: blockedQuery
    .input(
      z.object({
        currency: currencySchema.optional(),
        locale: localeSchema.optional(),
        language: languageSchema.optional(),
        hiddenMaterialColumns: hiddenMaterialColumnsSchema.optional(),
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
    whitelistActive: hasAnyAllowlist(env),
    /** Seit 4.8.0: Knopf „Mit Discord anmelden“ (siehe api/discord.ts) */
    discordConfigured: discordConfigured(),
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
    .use(rateLimited({ ...LOGIN_RATE_LIMITS[0], event: "login.rate_limited" }))
    .use(rateLimited({ ...LOGIN_RATE_LIMITS[1], event: "login.rate_limited" }))
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
        /*
          Bewusst ohne den eingegebenen Code im Protokoll: Wer die
          Protokolltabelle lesen kann, bekäme sonst eine Liste gerade
          gültiger Codes frei Haus.
        */
        recordAudit({
          event: "login.failed",
          ip: ctx.clientIp,
          detail: { method: "code" },
        });
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message:
            "Code ungültig oder abgelaufen. Fordere beim Bot mit /login einen neuen an.",
        });
      }

      await signInWithTelegram(
        ctx,
        {
          id: entry.telegramId,
          name: entry.telegramName ?? entry.telegramUsername,
          username: entry.telegramUsername,
        },
        "code"
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
    .use(
      rateLimited({
        key: "auth.widget",
        limit: 20,
        windowMs: 10 * 60_000,
        event: "login.rate_limited",
      })
    )
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
        /*
          Hier lohnt das Hinsehen: Eine ungültige Signatur entsteht nicht
          beim normalen Gebrauch. Entweder ist der Bot-Token gewechselt
          worden – oder jemand versucht, sich Anmeldedaten zu bauen.
        */
        recordAudit({
          event: "login.widget_invalid",
          telegramId: String(input.id),
          ip: ctx.clientIp,
        });
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Die Telegram-Anmeldung konnte nicht verifiziert werden.",
        });
      }

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
      await signInWithTelegram(
        ctx,
        { id: String(input.id), name, username: input.username ?? null },
        "widget"
      );
      return { success: true, name };
    }),

  /**
   * Anmeldewege des eigenen Kontos für die Einstellungen (seit 4.8.0).
   *
   * Ob Telegram verbunden ist, entscheidet `telegramChatId` – die Oberfläche
   * soll die Form der `unionId` nicht kennen müssen.
   */
  loginMethods: authedQuery.query(({ ctx }) => {
    const user = ctx.user;
    return {
      telegram: telegramChatId(user.unionId) !== null,
      telegramUsername: user.telegramUsername,
      discord: user.discordId
        ? { username: user.discordUsername ?? null }
        : null,
      discordAvailable: discordConfigured(),
      canUnlinkDiscord: canUnlinkDiscord(user) === "ok",
    };
  }),

  /**
   * Discord verbinden: legt die Anfrage an, setzt das Bindungs-Cookie und
   * liefert die Adresse bei Discord; die Oberfläche wechselt dorthin. Das
   * Ergebnis kommt als `/einstellungen?discord=<Ergebnis>` zurück.
   */
  discordLinkStart: authedQuery.mutation(async ({ ctx }) => {
    if (!discordConfigured()) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Diese Instanz bietet die Anmeldung über Discord nicht an.",
      });
    }
    if (ctx.user.discordId) {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Dein Konto ist schon mit Discord verbunden. Trenne es zuerst, wenn du ein anderes Discord-Konto verbinden willst.",
      });
    }
    const started = await beginDiscord(ctx.req.headers, ctx.user.id);
    if (!started) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message:
          "Zu viele Versuche. Bitte in ein paar Minuten erneut versuchen.",
      });
    }
    ctx.resHeaders.append("set-cookie", started.cookie);
    return { url: started.url };
  }),

  /**
   * Discord trennen – nur, solange ein anderer Weg bleibt, mit dem sich das
   * Konto anmelden darf. Sonst sperrte man sich selbst aus.
   */
  discordUnlink: authedQuery.mutation(async ({ ctx }) => {
    const check = canUnlinkDiscord(ctx.user);
    if (check !== "ok") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          check === "not_linked"
            ? "Dein Konto ist nicht mit Discord verbunden."
            : "Discord ist der einzige Weg, mit dem du dich anmelden kannst. Trennen würde dich aussperren.",
      });
    }
    await unlinkDiscord(ctx.user.id);
    recordAudit({
      event: "login.discord_unlinked",
      actorUserId: ctx.user.id,
      ip: ctx.clientIp,
      detail: { discordId: ctx.user.discordId },
    });
    return { success: true };
  }),

  /**
   * Abmelden auf diesem Gerät. Entwertet bewusst **nur** das Cookie: Wer sich
   * am Telefon abmeldet, will nicht zugleich am Rechner hinausfliegen.
   */
  logout: blockedQuery.mutation(async ({ ctx }) => {
    recordAudit({
      event: "logout",
      actorUserId: ctx.user.id,
      ip: ctx.clientIp,
    });
    ctx.resHeaders.append("set-cookie", clearSessionCookie(ctx.req.headers));
    return { success: true };
  }),

  /**
   * Abmelden auf allen Geräten – der Weg für den Fall, dass ein Gerät
   * abhandengekommen ist. Erhöht `users.tokenVersion` und macht damit jedes
   * ausgestellte Token ungültig, auch das der eigenen Sitzung.
   */
  logoutAllDevices: blockedQuery.mutation(async ({ ctx }) => {
    await revokeSessions(ctx.user.id);
    recordAudit({
      event: "session.revoked",
      actorUserId: ctx.user.id,
      ip: ctx.clientIp,
    });
    ctx.resHeaders.append("set-cookie", clearSessionCookie(ctx.req.headers));
    return { success: true };
  }),
});
