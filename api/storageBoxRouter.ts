import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { resolveScope, scopeInput } from "./scope";
import {
  countMaterialsWithStorageBox,
  createStorageBox,
  deleteStorageBox,
  findStorageBoxesInScope,
  storageBoxInScope,
  updateStorageBox,
} from "./queries/filament";

const storageBoxInput = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  location: z.string().optional(),
  tareWeight: z.number().int().min(0, "Leergewicht muss >= 0 sein"),
  notes: z.string().optional(),
});

export const storageBoxRouter = createRouter({
  list: authedQuery.input(scopeInput).query(async ({ ctx, input }) => {
    const scope = await resolveScope(
      ctx.user.id,
      input.organizationId,
      "viewer"
    );
    return findStorageBoxesInScope(scope);
  }),

  create: authedQuery
    .input(storageBoxInput.extend(scopeInput.shape))
    .mutation(async ({ ctx, input }) => {
      const { organizationId, ...data } = input;
      const scope = await resolveScope(ctx.user.id, organizationId, "editor");
      return createStorageBox(scope, data);
    }),

  update: authedQuery
    .input(
      storageBoxInput
        .partial()
        .extend({ id: z.number().int().positive(), ...scopeInput.shape })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, organizationId, ...data } = input;
      const scope = await resolveScope(ctx.user.id, organizationId, "editor");
      const updated = await updateStorageBox(scope, id, data);
      if (!updated)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lagerbox nicht gefunden",
        });
      return updated;
    }),

  delete: authedQuery
    .input(z.object({ id: z.number().int().positive(), ...scopeInput.shape }))
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "editor"
      );
      // Erst die Zugehörigkeit, dann der Inhalt – siehe `containerType.delete`.
      if (!(await storageBoxInScope(scope, input.id))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Drybox nicht gefunden",
        });
      }
      const used = await countMaterialsWithStorageBox(scope, input.id);
      if (used > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Diese Lagerbox ist noch ${used} Material(ien) zugewiesen und kann nicht gelöscht werden.`,
        });
      }
      await deleteStorageBox(scope, input.id);
      return { ok: true };
    }),
});
