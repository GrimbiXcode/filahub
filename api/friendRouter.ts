import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  FRIEND_SEARCH_LIMIT,
  FRIEND_SEARCH_MIN_LENGTH,
  LOAN_MESSAGE_MAX_LENGTH,
  friendVisibilitySchema,
  normalizeFriendCode,
  normalizeTelegramUsername,
} from "@contracts/friends";
import {
  notificationMessages,
  type LoanDecision,
} from "@contracts/notifications";
import { createRouter, authedQuery, rateLimited } from "./middleware";
import { recordAudit } from "./queries/audit";
import { lagerBelongsToOrganization } from "./queries/lager";
import {
  countPendingForUser,
  createFriendship,
  createLoanRequest,
  deleteFriendship,
  ensureFriendCode,
  findFriendInventory,
  findFriendMaterial,
  findFriendMaterialsForSearch,
  findFriendshipBetween,
  findNotificationTarget,
  findOpenLoanRequest,
  findUserByFriendCode,
  findUserByTelegramUsername,
  listFriendships,
  listLoanRequests,
  respondToFriendship,
  respondToLoanRequest,
  rotateFriendCode,
  setLagerShare,
  withdrawLoanRequest,
} from "./queries/friends";
import { appLink, sendTelegramMessage } from "./telegram/send";

/**
 * Freundschaften, geteiltes Lager und Ausleih-Anfragen.
 *
 * Die Lesepfade liegen alle in `api/queries/friends.ts` und nehmen dort
 * `viewerId` als ersten Parameter. Dieser Router gibt **niemals** eine
 * Besitzer-ID aus der Eingabe an eine Abfrage weiter, ohne dass die Abfrage
 * selbst die Freigabe prüft – sonst wäre die Prüfung eine Frage der Disziplin
 * am Aufrufort statt eine Eigenschaft des Codes.
 */

const idInput = z.object({ id: z.number().int().positive() });

/**
 * Verschickt eine Benachrichtigung, wenn der Empfänger erreichbar ist.
 *
 * Der Rückgabewert wandert bis in die Oberfläche: Telegram lässt einen Bot nur
 * schreiben, wenn der Empfänger den Chat einmal geöffnet hat. Wer sich nur über
 * das Login-Widget angemeldet hat, erfährt von seiner Anfrage erst beim
 * nächsten Besuch – das soll der Absender wissen, statt auf eine Antwort zu
 * warten, die nie kommt.
 */
async function notify(
  recipientId: number,
  build: (m: ReturnType<typeof notificationMessages>) => string,
  path: string
): Promise<boolean> {
  const target = await findNotificationTarget(recipientId);
  if (!target) return false;
  const messages = notificationMessages(target.language);
  const link = appLink(path);
  const text = build(messages) + (link ? messages.openLink({ url: link }) : "");
  return sendTelegramMessage(target.unionId, text);
}

/** Anzeigename für Benachrichtigungen. `users.name` ist nullable. */
function displayName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  return trimmed === "" ? "Jemand" : trimmed;
}

export const friendRouter = createRouter({
  // -------------------------------------------------------------------------
  // Eigener Freundescode
  // -------------------------------------------------------------------------

  /**
   * Eigener Code, beim ersten Aufruf erzeugt. Bewusst eine Mutation und keine
   * Query: Der erste Aufruf schreibt.
   */
  myCode: authedQuery.mutation(({ ctx }) =>
    ensureFriendCode(ctx.user.id).then(code => ({ code }))
  ),

  rotateCode: authedQuery.mutation(async ({ ctx }) => {
    const code = await rotateFriendCode(ctx.user.id);
    recordAudit({
      event: "friend.code_rotated",
      actorUserId: ctx.user.id,
      ip: ctx.clientIp,
    });
    return { code };
  }),

  // -------------------------------------------------------------------------
  // Freundschaften
  // -------------------------------------------------------------------------

  list: authedQuery.query(({ ctx }) => listFriendships(ctx.user.id)),

  /** Zähler für das Abzeichen in der Seitenleiste. */
  pendingCount: authedQuery.query(({ ctx }) =>
    countPendingForUser(ctx.user.id).then(count => ({ count }))
  ),

  /**
   * Freundschaftsanfrage per Code **oder** Telegram-Benutzername.
   *
   * Die Zugriffsbegrenzung ist hier wichtiger als bei den übrigen Prozeduren:
   * Ohne sie ließe sich über den Code-Weg der Wertebereich durchprobieren und
   * über den Namensweg prüfen, welche Konten es gibt.
   */
  request: authedQuery
    .use(
      rateLimited({ key: "friend.request", limit: 20, windowMs: 60 * 60_000 })
    )
    .input(
      z
        .object({
          code: z.string().optional(),
          username: z.string().optional(),
        })
        .refine(v => Boolean(v.code) !== Boolean(v.username), {
          message:
            "Bitte entweder einen Freundescode oder einen Telegram-Namen angeben.",
        })
    )
    .mutation(async ({ ctx, input }) => {
      const target = input.code
        ? await resolveByCode(input.code)
        : await resolveByUsername(input.username ?? "");

      if (target.id === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Du kannst dich nicht mit dir selbst verbinden.",
        });
      }

      const existing = await findFriendshipBetween(ctx.user.id, target.id);
      if (existing) {
        /*
          Auch eine abgelehnte Zeile blockiert – sonst wäre „nein“ nur eine
          Verzögerung. Wer es sich anders überlegt, löst die Freundschaft auf
          (`remove`), dann ist der Weg wieder frei.
        */
        throw new TRPCError({
          code: "CONFLICT",
          message:
            existing.status === "accepted"
              ? "Ihr seid schon verbunden."
              : "Es gibt bereits eine Anfrage zwischen euch.",
        });
      }

      const row = await createFriendship(ctx.user.id, target.id);
      recordAudit({
        event: "friend.requested",
        actorUserId: ctx.user.id,
        subjectUserId: target.id,
        ip: ctx.clientIp,
        detail: { via: input.code ? "code" : "username" },
      });

      const notified = await notify(
        target.id,
        m => m.friendRequest({ from: displayName(ctx.user.name) }),
        "/freunde"
      );
      return { id: row.id, notified };
    }),

  respond: authedQuery
    .input(idInput.extend({ accept: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const row = await respondToFriendship(
        ctx.user.id,
        input.id,
        input.accept
      );
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Anfrage nicht gefunden",
        });
      }
      recordAudit({
        event: input.accept ? "friend.accepted" : "friend.declined",
        actorUserId: ctx.user.id,
        subjectUserId: row.userId,
        ip: ctx.clientIp,
      });
      if (input.accept) {
        await notify(
          row.userId,
          m => m.friendAccepted({ from: displayName(ctx.user.name) }),
          "/freunde"
        );
      }
      return { ok: true };
    }),

  remove: authedQuery.input(idInput).mutation(async ({ ctx, input }) => {
    const row = await deleteFriendship(ctx.user.id, input.id);
    if (!row) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Freundschaft nicht gefunden",
      });
    }
    recordAudit({
      event: "friend.removed",
      actorUserId: ctx.user.id,
      subjectUserId: row.userId === ctx.user.id ? row.friendUserId : row.userId,
      ip: ctx.clientIp,
    });
    return { ok: true };
  }),

  /**
   * Gibt **ein eigenes Lager** für einen Freund frei – oder nimmt die Freigabe
   * zurück (`none`).
   *
   * `friendId` ist die ID des Freundes, nicht die der Freundschaftszeile: Die
   * Freigabe hängt seit 2.4.0 am Paar Lager/Empfänger, und `setLagerShare` sucht
   * die Freundschaft selbst. Ein `NOT_FOUND` deckt beide Fehlschläge ab –
   * fremdes Lager und fehlende angenommene Freundschaft. Sie zu unterscheiden
   * hieße zu verraten, welche der beiden Zeilen es gibt.
   */
  setLagerVisibility: authedQuery
    .input(
      z.object({
        friendId: z.number().int().positive(),
        lagerId: z.number().int().positive(),
        visibility: friendVisibilitySchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      /*
        **Ein Lager einer Organisation lässt sich nicht an Freunde freigeben.**

        Semantisch: Ein einzelner Administrator dürfte nicht den Bestand aller
        Mitglieder nach außen öffnen. Technisch fiele es ohnehin zu –
        `setLagerShare` verlangt `lager.userId = ownerId`, und der ist bei einem
        Org-Lager NULL, also käme unten schon `false` heraus.

        Der Riegel steht trotzdem ausdrücklich hier: „fällt von selbst zu“ ist
        kein Riegel, sondern ein Zufall, der beim nächsten Umbau kippt. Und die
        Meldung sagt den Grund, statt „nicht gefunden“ zu behaupten – das Lager
        gibt es ja, der Aufrufer sieht es in seiner Liste.
      */
      if (await lagerBelongsToOrganization(input.lagerId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Ein Lager einer Organisation lässt sich nicht mit Freunden teilen.",
        });
      }

      const ok = await setLagerShare(
        ctx.user.id,
        input.lagerId,
        input.friendId,
        input.visibility
      );
      if (!ok) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lager oder Freundschaft nicht gefunden",
        });
      }
      recordAudit({
        event: "friend.visibility_changed",
        actorUserId: ctx.user.id,
        subjectUserId: input.friendId,
        ip: ctx.clientIp,
        /*
          Die Lager-ID gehört ins Protokoll: Ohne sie beantwortet der Eintrag
          nicht mehr, wer Zugriff auf **was** bekam – und genau das ist die
          Frage, für die das Protokoll da ist.
        */
        detail: { lagerId: input.lagerId, visibility: input.visibility },
      });
      return { ok: true };
    }),

  // -------------------------------------------------------------------------
  // Lager der Freunde
  // -------------------------------------------------------------------------

  /**
   * Suche im Lager aller Freunde ab Stufe `search`.
   *
   * Der Pflicht-Suchbegriff ist keine Bequemlichkeit, sondern die Stufe selbst:
   * Ohne ihn wäre `search` in der Wirkung `full`. Deshalb steht die
   * Mindestlänge hier **und** in `findFriendMaterialsForSearch` – eine der
   * beiden Prüfungen könnte man beim Umbauen verlieren.
   */
  searchMaterials: authedQuery
    /*
      Zugriffsbegrenzung, und zwar aus demselben Grund wie der Pflicht-Suchbegriff:
      Mit zwei Zeichen und Teilstring-Suche über sechs Spalten lässt sich ein
      freigegebenes Lager mit einigen hundert Anfragen vollständig
      zusammensetzen – „nur in der Suche“ wäre dann in der Wirkung „ganzes
      Lager“, also genau die Lüge, die der Pflichtbegriff verhindern soll.

      Die Grenze ist bewusst hoch: Tippen erzeugt (nach dem Entprellen) echte
      Anfragen, und wer suchend arbeitet, soll nicht anstoßen. Sie schneidet das
      systematische Durchprobieren ab, nicht das Suchen.
    */
    .use(rateLimited({ key: "friend.search", limit: 120, windowMs: 60_000 }))
    .input(
      z.object({
        query: z
          .string()
          .min(
            FRIEND_SEARCH_MIN_LENGTH,
            `Bitte mindestens ${FRIEND_SEARCH_MIN_LENGTH} Zeichen eingeben.`
          ),
        limit: z.number().int().positive().max(FRIEND_SEARCH_LIMIT).optional(),
      })
    )
    .query(({ ctx, input }) =>
      findFriendMaterialsForSearch(ctx.user.id, input.query, input.limit)
    ),

  /** Ganzes Lager eines Freundes – nur bei Stufe `full`. */
  inventory: authedQuery
    .input(z.object({ friendId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const result = await findFriendInventory(ctx.user.id, input.friendId);
      if (!result) {
        /*
          `NOT_FOUND` und nicht `FORBIDDEN`: Wie überall im Projekt soll die
          Antwort nicht verraten, dass es die Zeile gibt – hier zusätzlich
          nicht, welche Stufe der Freund gewählt hat.
        */
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lager nicht gefunden",
        });
      }
      return result;
    }),

  // -------------------------------------------------------------------------
  // Ausleih-Anfragen
  // -------------------------------------------------------------------------

  loanRequests: authedQuery.query(({ ctx }) => listLoanRequests(ctx.user.id)),

  requestLoan: authedQuery
    .input(
      z.object({
        materialId: z.number().int().positive(),
        message: z.string().max(LOAN_MESSAGE_MAX_LENGTH).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      /*
        `findFriendMaterial` prüft die Freigabe selbst und liefert sonst `null`.
        Damit ist diese Zeile zugleich der Schutz davor, Material-IDs
        durchzuprobieren: Ohne Freigabe ist die Antwort dieselbe wie für ein
        Material, das es nicht gibt.
      */
      const material = await findFriendMaterial(ctx.user.id, input.materialId);
      if (!material) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Material nicht gefunden",
        });
      }

      const open = await findOpenLoanRequest(ctx.user.id, input.materialId);
      if (open) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Zu diesem Material läuft schon eine Anfrage von dir.",
        });
      }

      const message = input.message?.trim() || null;
      const row = await createLoanRequest({
        userId: ctx.user.id,
        ownerUserId: material.ownerId,
        materialId: material.id,
        materialName: material.name,
        message,
      });

      const notified = await notify(
        material.ownerId,
        m =>
          m.loanRequest({
            from: displayName(ctx.user.name),
            material: material.name,
            message,
          }),
        "/freunde"
      );
      return { id: row.id, notified };
    }),

  respondLoan: authedQuery
    .input(idInput.extend({ accept: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const row = await respondToLoanRequest(
        ctx.user.id,
        input.id,
        input.accept
      );
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Anfrage nicht gefunden",
        });
      }
      const decision: LoanDecision = input.accept ? "accepted" : "declined";
      await notify(
        row.userId,
        m =>
          m.loanAnswer({
            from: displayName(ctx.user.name),
            material: row.materialName,
            decision,
          }),
        "/freunde"
      );
      return { ok: true };
    }),

  withdrawLoan: authedQuery.input(idInput).mutation(async ({ ctx, input }) => {
    const row = await withdrawLoanRequest(ctx.user.id, input.id);
    if (!row) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Anfrage nicht gefunden",
      });
    }
    return { ok: true };
  }),
});

/**
 * Löst einen Freundescode auf.
 *
 * Ein ungültiges Format und ein unbekannter Code führen zur **gleichen**
 * Meldung: Sonst wäre die Antwort ein Orakel dafür, welche Codes vergeben sind.
 */
async function resolveByCode(raw: string) {
  const code = normalizeFriendCode(raw);
  const found = code ? await findUserByFriendCode(code) : undefined;
  if (!found) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Zu diesem Freundescode gibt es kein Konto.",
    });
  }
  return found;
}

async function resolveByUsername(raw: string) {
  const username = normalizeTelegramUsername(raw);
  const found = username
    ? await findUserByTelegramUsername(username)
    : undefined;
  if (!found) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message:
        "Zu diesem Telegram-Namen gibt es kein Konto. Der Freundescode ist der zuverlässigere Weg.",
    });
  }
  return found;
}
