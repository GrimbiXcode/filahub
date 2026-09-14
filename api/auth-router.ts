import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { languageSchema } from "@contracts/i18n";
import { currencySchema, localeSchema } from "@contracts/locale";
import { hiddenMaterialColumnsSchema } from "@contracts/materialColumns";
import { releaseVersionSchema } from "@contracts/releaseNotes";
import { clearSessionCookie, sessionCookie } from "./lib/cookies";
import {
  MAX_REGISTRATIONS_PER_DAY,
  MAX_REGISTRATIONS_PER_IP_PER_DAY,
} from "@contracts/limits";
import { env } from "./lib/env";
import { consumeRateLimit } from "./lib/rateLimit";
import { recordAudit } from "./queries/audit";
import {
  createRouter,
  authedQuery,
  blockedQuery,
  publicQuery,
  rateLimited,
} from "./middleware";
import { redeemLoginCode } from "./telegram/bot";
import { signSessionToken } from "./telegram/session";
import { verifyTelegramWidgetData } from "./telegram/widget";
import {
  countUsersCreatedSince,
  findUserByUnionId,
  markReleaseNotesSeen,
  revokeSessions,
  updateUserSettings,
  upsertUser,
} from "./queries/users";

/**
 * Prüft, ob sich dieses Telegram-Konto anmelden darf.
 *
 * Ohne Freigabeliste **und** ohne ausdrückliches `TELEGRAM_OPEN_REGISTRATION`
 * kommt niemand herein. Das ist die Umkehr des früheren Verhaltens, wo eine
 * leere Liste „jeder darf“ bedeutete: Wer die Variable übersah, betrieb
 * unbemerkt eine offene Instanz und wurde damit ungewollt Verantwortlicher
 * für die Daten Fremder.
 */
function assertAllowed(telegramId: string, ip: string | null) {
  if (env.telegramAllowedIds.length === 0) {
    if (!env.telegramOpenRegistration) {
      recordAudit({
        event: "login.blocked",
        telegramId,
        ip,
        detail: { reason: "registration_closed" },
      });
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Diese Instanz nimmt keine Anmeldungen an. Der Betreiber muss TELEGRAM_ALLOWED_IDS setzen oder die Registrierung ausdrücklich öffnen.",
      });
    }
    return;
  }

  if (!env.telegramAllowedIds.includes(telegramId)) {
    recordAudit({
      event: "login.blocked",
      telegramId,
      ip,
      detail: { reason: "not_allowlisted" },
    });
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Dieses Konto ist für den Zugriff nicht freigeschaltet.",
    });
  }
}

/**
 * Hält fest, dass sich ein gesperrtes Konto angemeldet hat.
 *
 * **Die Anmeldung selbst wird nicht verhindert**, und das ist Absicht: Der
 * Gesperrte soll erfahren, woran er ist, und seinen Entsperr-Antrag stellen
 * können (`api/unblockRouter.ts`). Fachlich erreicht er nichts – dafür sorgt
 * `authedQuery`. Wer sich trotz Sperre regelmäßig anmeldet, ist aber genau das,
 * was ein Betreiber sehen will, wenn er einen Vorfall aufklärt.
 */
function noteBlockedSignIn(
  user: { id: number; unionId: string; blockedAt: Date | null },
  ip: string | null
) {
  if (!user.blockedAt) return;
  recordAudit({
    event: "login.blocked",
    actorUserId: user.id,
    telegramId: user.unionId,
    ip,
    detail: { reason: "user_blocked" },
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Bremst den Zustrom neuer Konten.
 *
 * `assertAllowed` daneben beantwortet, **wer** herein darf; diese Funktion,
 * **wie viele auf einmal**. Die Trennung ist nötig, weil die Freigabeliste bei
 * offener Registrierung gar nicht greift – dort ist dies die einzige Bremse.
 *
 * Läuft nur bei **neuen** Konten: Eine Anmeldung an einem bestehenden Konto ist
 * keine Registrierung, und wer schon da ist, soll nicht aussperrt werden, weil
 * andere sich gerade anmelden. Deshalb die Abfrage zuerst – sie kostet nichts,
 * `upsertUser` lädt die Zeile gleich danach ohnehin.
 *
 * Zwei Achsen, und beide braucht es: Die Instanzgrenze fängt den Ansturm aus
 * vielen Richtungen, die Adressgrenze verhindert, dass ein einzelner Aufrufer
 * das Tageskontingent ausschöpft und damit alle anderen aussperrt – die Abwehr
 * wäre sonst selbst der Angriff.
 */
async function assertRegistrationAllowed(
  telegramId: string,
  ip: string | null
) {
  const existing = await findUserByUnionId(telegramId);
  if (existing) return;

  /*
    Bei gesetzter Freigabeliste entscheidet der Betreiber über jeden einzelnen
    Zugang. Eine Tagesgrenze träfe dort nur den Fall, dass er zwanzig Kollegen
    auf einmal freischaltet – eine Bremse gegen den eigenen Willen.
  */
  if (env.telegramOpenRegistration && env.telegramAllowedIds.length === 0) {
    const since = new Date(Date.now() - DAY_MS);
    if ((await countUsersCreatedSince(since)) >= MAX_REGISTRATIONS_PER_DAY) {
      recordAudit({
        event: "registration.rate_limited",
        telegramId,
        ip,
        detail: { reason: "instance" },
      });
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message:
          "Diese Instanz nimmt heute keine neuen Anmeldungen mehr an. Bitte morgen erneut versuchen.",
      });
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
      telegramId,
      ip,
      detail: { reason: "ip" },
    });
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message:
        "Von diesem Anschluss wurden heute schon mehrere Konten angelegt. Bitte morgen erneut versuchen.",
    });
  }
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
    .use(
      rateLimited({
        key: "auth.login",
        limit: 10,
        windowMs: 10 * 60_000,
        event: "login.rate_limited",
      })
    )
    .use(
      rateLimited({
        key: "auth.login.hour",
        limit: 30,
        windowMs: 60 * 60_000,
        event: "login.rate_limited",
      })
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

      assertAllowed(entry.telegramId, ctx.clientIp);
      await assertRegistrationAllowed(entry.telegramId, ctx.clientIp);

      const user = await upsertUser({
        unionId: entry.telegramId,
        name: entry.telegramName ?? entry.telegramUsername,
        telegramUsername: entry.telegramUsername,
        lastSignInAt: new Date(),
      });

      recordAudit({
        event: "login.success",
        actorUserId: user.id,
        telegramId: entry.telegramId,
        ip: ctx.clientIp,
        detail: { method: "code" },
      });
      noteBlockedSignIn(user, ctx.clientIp);

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

      const telegramId = String(input.id);
      assertAllowed(telegramId, ctx.clientIp);
      await assertRegistrationAllowed(telegramId, ctx.clientIp);

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

      recordAudit({
        event: "login.success",
        actorUserId: user.id,
        telegramId,
        ip: ctx.clientIp,
        detail: { method: "widget" },
      });
      noteBlockedSignIn(user, ctx.clientIp);

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
