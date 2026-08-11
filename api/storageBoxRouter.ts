import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import {
  countMaterialsWithStorageBox,
  createStorageBox,
  deleteStorageBox,
  findStorageBoxesByUser,
  storageBoxBelongsToUser,
  updateStorageBox,
} from "./queries/filament";

const storageBoxInput = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  location: z.string().optional(),
  tareWeight: z.number().int().min(0, "Leergewicht muss >= 0 sein"),
  notes: z.string().optional(),
});

export const storageBoxRouter = createRouter({
  list: authedQuery.query(({ ctx }) => findStorageBoxesByUser(ctx.user.id)),

  create: authedQuery
    .input(storageBoxInput)
    .mutation(({ ctx, input }) =>
      createStorageBox({ ...input, userId: ctx.user.id })
    ),

  update: authedQuery
    .input(
      storageBoxInput.partial().extend({ id: z.number().int().positive() })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const updated = await updateStorageBox(ctx.user.id, id, data);
      if (!updated)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lagerbox nicht gefunden",
        });
      return updated;
    }),

  delete: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      // Erst die Zugehörigkeit, dann der Inhalt – siehe `containerType.delete`.
      if (!(await storageBoxBelongsToUser(ctx.user.id, input.id))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Drybox nicht gefunden",
        });
      }
      const used = await countMaterialsWithStorageBox(ctx.user.id, input.id);
      if (used > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Diese Lagerbox ist noch ${used} Material(ien) zugewiesen und kann nicht gelöscht werden.`,
        });
      }
      await deleteStorageBox(ctx.user.id, input.id);
      return { ok: true };
    }),
});
