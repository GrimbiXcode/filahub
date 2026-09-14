import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { MAX_STORAGE_BOXES_PER_SCOPE } from "@contracts/limits";
import { createRouter, authedQuery, rateLimited } from "./middleware";
import { assertWithinLimit } from "./lib/quota";
import { resolveScope, scopeInput } from "./scope";
import {
  countMaterialsWithStorageBox,
  countStorageBoxesInScope,
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
    .use(
      rateLimited({
        key: "storageBox.create",
        limit: 60,
        windowMs: 60 * 60_000,
        by: "user",
      })
    )
    .input(storageBoxInput.extend(scopeInput.shape))
    .mutation(async ({ ctx, input }) => {
      const { organizationId, ...data } = input;
      const scope = await resolveScope(ctx.user.id, organizationId, "editor");
      assertWithinLimit({
        current: await countStorageBoxesInScope(scope),
        max: MAX_STORAGE_BOXES_PER_SCOPE,
        quota: "storage_boxes_per_scope",
        message: `Mehr als ${MAX_STORAGE_BOXES_PER_SCOPE} Dryboxen sind nicht vorgesehen. Bitte nicht mehr genutzte löschen.`,
        actorUserId: ctx.user.id,
        ip: ctx.clientIp,
      });
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
