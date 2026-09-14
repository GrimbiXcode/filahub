import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { UNBLOCK_REQUEST_MAX_LENGTH } from "@contracts/limits";
import { blockedQuery, createRouter, rateLimited } from "./middleware";
import { recordAudit } from "./queries/audit";
import {
  createUnblockRequest,
  findLatestUnblockRequest,
} from "./queries/blocking";

/**
 * Der Weg zurück aus einer Sperre.
 *
 * Beide Prozeduren sind `blockedQuery` – sie sind ja gerade für den, dem
 * `authedQuery` verschlossen ist. Der Vorgang lebt in der App und nicht im
 * Postfach des Betreibers: Beide Seiten sehen denselben Stand, und der Antrag
 * geht nicht verloren, wenn der Bot den Betroffenen nicht erreicht.
 *
 * Wer **nicht** gesperrt ist, hat hier nichts zu suchen. Das ist keine
 * Förmlichkeit: Ohne die Prüfung ließe sich die Warteschlange der Moderation
 * von jedem beliebigen Konto aus füllen – dasselbe Loch, das der partielle
 * Unique-Index für den einzelnen Gesperrten schon schließt.
 */
export const unblockRouter = createRouter({
  /** Stand der eigenen Sperre und des jüngsten Antrags – für die Sperrseite. */
  status: blockedQuery.query(async ({ ctx }) => {
    const request = await findLatestUnblockRequest(ctx.user.id);
    return {
      blockedAt: ctx.user.blockedAt,
      blockedReason: ctx.user.blockedReason,
      request: request
        ? {
            id: request.id,
            status: request.status,
            createdAt: request.createdAt,
            reviewedAt: request.reviewedAt,
            reviewNote: request.reviewNote,
          }
        : null,
    };
  }),

  request: blockedQuery
    /*
      Drei Anträge am Tag. Mehr braucht niemand: Es gibt ohnehin höchstens
      **einen** offenen, die Grenze fängt also nur das wiederholte Stellen nach
      einer Ablehnung – und genau daraus würde sonst der Dauerbeschuss der
      Moderation, gegen den diese ganze Änderung antritt.
    */
    .use(
      rateLimited({
        key: "unblock.request",
        limit: 3,
        windowMs: 24 * 60 * 60_000,
        by: "user",
      })
    )
    .input(
      z.object({
        message: z
          .string()
          .trim()
          .min(1, "Bitte kurz schildern, worum es geht")
          .max(
            UNBLOCK_REQUEST_MAX_LENGTH,
            `Höchstens ${UNBLOCK_REQUEST_MAX_LENGTH} Zeichen`
          ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.blockedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Dein Konto ist nicht gesperrt.",
        });
      }

      const created = await createUnblockRequest({
        userId: ctx.user.id,
        message: input.message,
      });
      if (!created) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Es liegt bereits ein Antrag vor. Bitte die Prüfung abwarten.",
        });
      }

      /*
        Ohne den Text des Antrags: Er ist Freitext und steht am Vorgang – im
        Protokoll wäre er ein zweites personenbezogenes Datum ohne Zweck.
        Dieselbe Zurückhaltung wie bei `proposal.rejected`.
      */
      recordAudit({
        event: "unblock.requested",
        actorUserId: ctx.user.id,
        subjectUserId: ctx.user.id,
        ip: ctx.clientIp,
        detail: { requestId: created.id },
      });

      return { id: created.id, status: created.status };
    }),
});
