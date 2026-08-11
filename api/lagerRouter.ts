import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  MAX_LAGER_PER_USER,
  filamentDiameterSchema,
  lagerConfigIsValid,
  materialKindSchema,
} from "@contracts/materials";
import { createRouter, authedQuery } from "./middleware";
import { recordAudit } from "./queries/audit";
import { countSharesByLager } from "./queries/friends";
import {
  LAGER_NAME_TAKEN,
  countLagerByUser,
  countMaterialsByLager,
  createLager,
  deleteLager,
  findLagerById,
  findLagerByUser,
  updateLager,
} from "./queries/lager";

/**
 * Lager anlegen und verwalten.
 *
 * Muster: `api/storageBoxRouter.ts`. Deutsche Fehlermeldungen, `NOT_FOUND` auch
 * bei fremden Zeilen (nie `FORBIDDEN` – das verriete deren Existenz), IDs als
 * `z.number().int().positive()`.
 */

const lagerInput = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich").max(255),
  materialKind: materialKindSchema,
  filamentDiameterUm: filamentDiameterSchema.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/**
 * Wandelt den Namenskonflikt in eine Meldung um, die man einem Benutzer zeigen
 * kann.
 *
 * `createLager`/`updateLager` melden ihn als `LAGER_NAME_TAKEN`; ohne diese
 * Umsetzung wäre es ein INTERNAL_SERVER_ERROR und die Oberfläche zeigte die
 * rohe Postgres-Meldung samt Constraint-Namen.
 */
async function withNameConflict<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Error && error.message === LAGER_NAME_TAKEN) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Ein Lager mit diesem Namen gibt es schon.",
      });
    }
    throw error;
  }
}

/**
 * Prüft, dass Materialart und Stärke zusammenpassen.
 *
 * Die Regel selbst steht als reine Funktion in `contracts/materials.ts` und ist
 * dort ohne Datenbank getestet; hier wird sie nur auf den Zustand **nach** dem
 * Patch angewandt – dasselbe Vorgehen wie bei der Gebindewahl in
 * `validateForeignKeys` (`api/materialRouter.ts`). Ohne das könnte eine
 * Teilaktualisierung ein Harzlager mit einer Filamentstärke hinterlassen.
 */
function assertConfigValid(config: {
  materialKind: z.infer<typeof materialKindSchema>;
  filamentDiameterUm?: number | null;
}) {
  if (lagerConfigIsValid(config)) return;
  throw new TRPCError({
    code: "BAD_REQUEST",
    message:
      config.materialKind === "filament"
        ? "Bitte eine Filamentstärke wählen (1,75 mm oder 2,85 mm)."
        : "Eine Filamentstärke gibt es nur bei Filament-Lagern.",
  });
}

export const lagerRouter = createRouter({
  /**
   * Die eigenen Lager, jedes mit der Zahl der Freunde, die es sehen dürfen.
   *
   * Die Zahl steht bewusst hier und nicht auf der Freundesseite: Die
   * Voreinstellung ist „nichts freigegeben“, und dieser Zustand darf nirgends
   * unsichtbar sein. Wer seine Lager ansieht, soll erkennen, welche davon
   * hinausgehen – ohne dafür jede Freundeskarte durchklicken zu müssen.
   */
  list: authedQuery.query(async ({ ctx }) => {
    /*
      Die Belegung kommt als Zahl mit, nicht als Bestand. Die Lager-Seite lud
      dafür vorher den gesamten Bestand – hunderte Kilobyte samt Wägungsverlauf
      für eine Handvoll Zahlen – und zählte im Browser nur die **eigenen** Zeilen,
      während die Löschsperre alles im Lager zählt. Beide Zahlen konnten sich
      widersprechen.
    */
    const [rows, shares, counts] = await Promise.all([
      findLagerByUser(ctx.user.id),
      countSharesByLager(ctx.user.id),
      countMaterialsByLager(ctx.user.id),
    ]);
    return rows.map(row => ({
      ...row,
      sharedWith: shares.get(row.id) ?? 0,
      materialCount: counts.get(row.id) ?? 0,
    }));
  }),

  create: authedQuery.input(lagerInput).mutation(async ({ ctx, input }) => {
    /*
      Obergrenze. Vorerst für alle Konten gleich (siehe MAX_LAGER_PER_USER).

      Bewusst nur hier und nicht in der Datenbank: Ein Zähler ist weder als
      Unique- noch als partieller Index ausdrückbar. Zwei gleichzeitige
      Anfragen können daher ein Lager zu viel erzeugen – der Schaden ist
      gering, aber die Lücke soll benannt sein und nicht als Garantie
      durchgehen.
    */
    const existing = await countLagerByUser(ctx.user.id);
    if (existing >= MAX_LAGER_PER_USER) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Mehr als ${MAX_LAGER_PER_USER} Lager sind derzeit nicht möglich.`,
      });
    }
    assertConfigValid(input);
    return withNameConflict(() =>
      createLager({
        ...input,
        filamentDiameterUm: input.filamentDiameterUm ?? null,
        userId: ctx.user.id,
      })
    );
  }),

  update: authedQuery
    .input(lagerInput.partial().extend({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await findLagerById(ctx.user.id, id);
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lager nicht gefunden",
        });
      }

      // Zustand nach dem Patch prüfen, nicht bloß die gesendeten Felder.
      const nextKind = data.materialKind ?? existing.materialKind;
      const nextDiameter =
        data.filamentDiameterUm !== undefined
          ? data.filamentDiameterUm
          : existing.filamentDiameterUm;
      /*
        Wechselt die Materialart weg von Filament, fällt die Stärke weg – sonst
        bliebe an einem Harzlager eine Angabe stehen, die nichts bedeutet.
        Umgekehrt muss der Aufrufer eine Stärke mitschicken.
      */
      const diameter = nextKind === "filament" ? nextDiameter : null;
      assertConfigValid({
        materialKind: nextKind,
        filamentDiameterUm: diameter,
      });

      const updated = await withNameConflict(() =>
        updateLager(ctx.user.id, id, {
          ...data,
          filamentDiameterUm: diameter,
        })
      );
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lager nicht gefunden",
        });
      }
      return updated;
    }),

  delete: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      /*
        Erst die Zugehörigkeit, dann der Inhalt: Sonst verriete die
        Konfliktmeldung („noch 3 Materialien") die Belegung eines fremden
        Lagers.
      */
      const own = await findLagerById(ctx.user.id, input.id);
      if (!own) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lager nicht gefunden",
        });
      }
      /*
        Das letzte Lager darf gehen. Die Materialübersicht kommt mit „kein
        Lager vorhanden" zurecht und lädt zum Anlegen ein – eine Sperre wäre
        eine Bevormundung, und wer neu anfangen will, soll das können.

        Gezählt wird **in** der Transaktion (`deleteLager`), nicht hier davor:
        Sonst könnte zwischen Zählen und Löschen Material hineinwandern.
      */
      const { revoked, blockedBy } = await deleteLager(ctx.user.id, input.id);
      if (blockedBy != null) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `In diesem Lager liegen noch ${blockedBy} Material(ien). Verschiebe sie oder lösche sie zuerst.`,
        });
      }
      /*
        Je betroffenem Freund ein Eintrag, und zwar derselbe Ereignisname wie
        beim Zurücknehmen von Hand: Für den Betroffenen ist es dasselbe – sein
        Zugriff endet. Ein eigenes `lager.deleted` sagte nicht, **wessen**
        Zugriff endete, und genau das muss das Protokoll beantworten. `reason`
        unterscheidet die beiden Wege.
      */
      for (const friendId of revoked) {
        recordAudit({
          event: "friend.visibility_changed",
          actorUserId: ctx.user.id,
          subjectUserId: friendId,
          ip: ctx.clientIp,
          detail: {
            lagerId: input.id,
            visibility: "none",
            reason: "lager_deleted",
          },
        });
      }
      return { ok: true };
    }),
});
