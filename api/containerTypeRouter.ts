import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { containerFormSchema } from "@contracts/materials";
import { createRouter, authedQuery } from "./middleware";
import {
  countMaterialsWithContainerType,
  createContainerType,
  deleteContainerType,
  findContainerTypesByUser,
  updateContainerType,
} from "./queries/filament";

const containerTypeInput = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  manufacturer: z.string().optional(),
  /**
   * Form des Gebindes. Vorgabe `rolle`, damit ein Aufrufer, der das Feld nicht
   * kennt, denselben Datensatz wie vor 2.3.0 anlegt.
   */
  form: containerFormSchema.default("rolle"),
  /*
    Keine Obergrenze wie im Katalog: Eigene Gebindearten hatten nie eine, und
    wer sein Gebinde selbst gewogen hat, weiß es besser als eine Plausibilitäts-
    schranke.
  */
  tareWeight: z.number().int().min(0, "Leergewicht muss >= 0 sein"),
  notes: z.string().optional(),
});

export const containerTypeRouter = createRouter({
  list: authedQuery.query(({ ctx }) => findContainerTypesByUser(ctx.user.id)),

  create: authedQuery
    .input(containerTypeInput)
    .mutation(({ ctx, input }) =>
      createContainerType({ ...input, userId: ctx.user.id })
    ),

  update: authedQuery
    .input(
      containerTypeInput.partial().extend({ id: z.number().int().positive() })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const updated = await updateContainerType(ctx.user.id, id, data);
      if (!updated)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Gebindeart nicht gefunden",
        });
      return updated;
    }),

  delete: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const used = await countMaterialsWithContainerType(input.id);
      if (used > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Diese Gebindeart wird noch von ${used} Material(ien) verwendet und kann nicht gelöscht werden.`,
        });
      }
      await deleteContainerType(ctx.user.id, input.id);
      return { ok: true };
    }),
});
