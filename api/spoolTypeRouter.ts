import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import {
  countMaterialsWithSpoolType,
  createSpoolType,
  deleteSpoolType,
  findSpoolTypesByUser,
  updateSpoolType,
} from "./queries/filament";

const spoolTypeInput = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  manufacturer: z.string().optional(),
  tareWeight: z.number().int().min(0, "Leergewicht muss >= 0 sein"),
  notes: z.string().optional(),
});

export const spoolTypeRouter = createRouter({
  list: authedQuery.query(({ ctx }) => findSpoolTypesByUser(ctx.user.id)),

  create: authedQuery.input(spoolTypeInput).mutation(({ ctx, input }) =>
    createSpoolType({ ...input, userId: ctx.user.id }),
  ),

  update: authedQuery
    .input(spoolTypeInput.partial().extend({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const updated = await updateSpoolType(ctx.user.id, id, data);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Rollentyp nicht gefunden" });
      return updated;
    }),

  delete: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const used = await countMaterialsWithSpoolType(input.id);
      if (used > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Dieser Rollentyp wird noch von ${used} Material(ien) verwendet und kann nicht gelöscht werden.`,
        });
      }
      await deleteSpoolType(ctx.user.id, input.id);
      return { ok: true };
    }),
});
