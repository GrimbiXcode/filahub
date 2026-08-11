import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  MAX_LAGER_PER_USER,
  filamentDiameterSchema,
  lagerConfigIsValid,
  materialKindSchema,
} from "@contracts/materials";
import { createRouter, authedQuery } from "./middleware";
import {
  countLagerByUser,
  countMaterialsInLager,
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
 * Prüft, dass Materialart und Stärke zusammenpassen.
 *
 * Die Regel selbst steht als reine Funktion in `contracts/materials.ts` und ist
 * dort ohne Datenbank getestet; hier wird sie nur auf den Zustand **nach** dem
 * Patch angewandt – dasselbe Vorgehen wie bei der Rollenwahl in
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
  list: authedQuery.query(({ ctx }) => findLagerByUser(ctx.user.id)),

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
    return createLager({
      ...input,
      filamentDiameterUm: input.filamentDiameterUm ?? null,
      userId: ctx.user.id,
    });
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

      const updated = await updateLager(ctx.user.id, id, {
        ...data,
        filamentDiameterUm: diameter,
      });
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
      const used = await countMaterialsInLager(input.id);
      if (used > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `In diesem Lager liegen noch ${used} Material(ien). Verschiebe sie oder lösche sie zuerst.`,
        });
      }
      /*
        Das letzte Lager darf gehen. Die Materialübersicht kommt mit „kein
        Lager vorhanden" zurecht und lädt zum Anlegen ein – eine Sperre wäre
        eine Bevormundung, und wer neu anfangen will, soll das können.
      */
      await deleteLager(ctx.user.id, input.id);
      return { ok: true };
    }),
});
