import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { deletionConfirmationMatches } from "@contracts/account";
import { clearSessionCookie } from "./lib/cookies";
import { authedQuery, createRouter } from "./middleware";
import { deleteUserAccount, exportUserData } from "./queries/account";
import { recordAudit } from "./queries/audit";

/**
 * Betroffenenrechte am eigenen Konto: Auskunft, Datenübertragbarkeit, Löschung.
 *
 * Beide Prozeduren sind `authedQuery` – jeder darf nur an die eigenen Daten.
 * Eine Auskunft über fremde Konten gibt es hier bewusst auch für
 * Administratoren nicht.
 */
export const accountRouter = createRouter({
  /**
   * Vollständige Auskunft nach Art. 15 DSGVO in maschinenlesbarer Form
   * (Art. 20).
   *
   * Absichtlich eine `mutation` und keine `query`: Ergebnisse von Queries
   * landen im Cache von TanStack Query und blieben dort als vollständiger
   * Personendatensatz liegen. Ein Datenabzug soll fließen, nicht herumliegen.
   */
  export: authedQuery.mutation(({ ctx }) => {
    recordAudit({
      event: "account.exported",
      actorUserId: ctx.user.id,
      ip: ctx.clientIp,
    });
    return exportUserData(ctx.user.id);
  }),

  /**
   * Kontolöschung nach Art. 17 DSGVO.
   *
   * Der Anzeigename muss abgetippt werden. Das ist kein Zierrat: Die Löschung
   * ist endgültig, und ein Dialog mit „Abbrechen/OK“ wird routiniert
   * weggeklickt.
   */
  delete: authedQuery
    .input(z.object({ confirmation: z.string().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      if (!deletionConfirmationMatches(input.confirmation, ctx.user.name)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Die Bestätigung stimmt nicht mit deinem Namen überein.",
        });
      }

      /*
        Vor der Löschung protokollieren: Danach ist die Benutzer-ID weg, und
        der Eintrag ließe sich keinem Vorgang mehr zuordnen. `deleteUserAccount`
        anonymisiert die Einträge anschließend selbst.
      */
      recordAudit({
        event: "account.deleted",
        actorUserId: ctx.user.id,
        subjectUserId: ctx.user.id,
        ip: ctx.clientIp,
      });

      const result = await deleteUserAccount(ctx.user.id);

      /*
        Was mit den Organisationen geschah, in denen dieses Konto der letzte
        Administrator war – **nach** der Transaktion protokolliert, nicht darin:
        Ein Eintrag, der bei einem Abbruch mit zurückgerollt wird, ist kein
        Protokoll.

        `actorUserId` bleibt leer. Das Konto gibt es nicht mehr, und die
        Beförderung war keine Handlung einer Person, sondern die Folge der
        Löschung – `reason` sagt das. Betroffen (`subjectUserId`) ist der neue
        Administrator: Für ihn ändert sich ein Zugriffsrecht, ohne dass er
        etwas getan hat.
      */
      for (const org of result.organizations) {
        if (org.outcome === "promoted") {
          recordAudit({
            event: "organization.member_role_changed",
            subjectUserId: org.newAdminUserId,
            ip: ctx.clientIp,
            detail: {
              organizationId: org.organizationId,
              role: "admin",
              reason: "last_admin_deleted",
            },
          });
        } else {
          recordAudit({
            event: "organization.deleted",
            ip: ctx.clientIp,
            detail: {
              organizationId: org.organizationId,
              reason: "last_admin_deleted",
            },
          });
        }
      }

      /*
        Cookie sofort löschen: Das Konto ist weg, das Token zeigt ins Leere.
        Ohne das liefe der Client noch mit einer Session weiter, die bei jeder
        Abfrage in einen 401 läuft.
      */
      ctx.resHeaders.append("set-cookie", clearSessionCookie(ctx.req.headers));

      return result;
    }),
});
