import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  MAX_PRINTERS_PER_SCOPE,
  printerNameSchema,
  printerSlotCountSchema,
  printerSlotSchema,
} from "@contracts/printers";
import { authedQuery, createRouter, rateLimited } from "./middleware";
import { assertWithinLimit } from "./lib/quota";
import { resolveScope, scopeInput } from "./scope";
import {
  PRINTER_NAME_TAKEN,
  countPrintersInScope,
  createPrinter,
  deletePrinter,
  findPrintersInScope,
  loadPrinterSlot,
  updatePrinter,
} from "./queries/printers";

const id = z.number().int().positive();

/** Der doppelte Name als lesbares `CONFLICT` statt der Postgres-Meldung */
async function withNameConflict<T>(name: string | undefined, run: () => T) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Error && error.message === PRINTER_NAME_TAKEN)
      throw new TRPCError({
        code: "CONFLICT",
        message: `Einen Drucker „${name ?? ""}“ gibt es hier schon.`,
      });
    throw error;
  }
}

/**
 * Drucker und ihre geladenen Gebinde (seit 4.9.0), Regeln in
 * `contracts/printers.ts`.
 *
 * Stufen: ansehen `viewer`; Gebinde laden und entladen `weigher` – das ist der
 * Handgriff am Drucker, so alltäglich wie Wiegen, und es geht nichts dabei
 * verloren; Drucker anlegen, ändern und löschen `editor`, wie Gebindearten und
 * Dryboxen.
 */
export const printerRouter = createRouter({
  list: authedQuery.input(scopeInput).query(async ({ ctx, input }) => {
    const scope = await resolveScope(
      ctx.user.id,
      input.organizationId,
      "viewer"
    );
    return findPrintersInScope(scope);
  }),

  create: authedQuery
    .use(
      rateLimited({
        key: "printer.create",
        limit: 60,
        windowMs: 60 * 60_000,
        by: "user",
      })
    )
    .input(
      z.object({
        ...scopeInput.shape,
        name: printerNameSchema,
        slotCount: printerSlotCountSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId, ...data } = input;
      const scope = await resolveScope(ctx.user.id, organizationId, "editor");
      assertWithinLimit({
        current: await countPrintersInScope(scope),
        max: MAX_PRINTERS_PER_SCOPE,
        quota: "printers_per_scope",
        message: `Mehr als ${MAX_PRINTERS_PER_SCOPE} Drucker sind nicht vorgesehen. Bitte nicht mehr genutzte löschen.`,
        actorUserId: ctx.user.id,
        ip: ctx.clientIp,
      });
      return withNameConflict(data.name, () => createPrinter(scope, data));
    }),

  update: authedQuery
    .input(
      z.object({
        ...scopeInput.shape,
        id,
        name: printerNameSchema.optional(),
        slotCount: printerSlotCountSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId, id: printerId, ...data } = input;
      const scope = await resolveScope(ctx.user.id, organizationId, "editor");
      const found = await withNameConflict(data.name, () =>
        updatePrinter(scope, printerId, data)
      );
      if (!found)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Drucker nicht gefunden",
        });
      return { ok: true };
    }),

  delete: authedQuery
    .input(z.object({ ...scopeInput.shape, id }))
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "editor"
      );
      if (!(await deletePrinter(scope, input.id)))
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Drucker nicht gefunden",
        });
      return { ok: true };
    }),

  /** Ein Gebinde in einen Platz laden – `materialId: null` leert ihn */
  loadSlot: authedQuery
    .use(
      rateLimited({
        key: "printer.loadSlot",
        limit: 120,
        windowMs: 60_000,
        by: "user",
      })
    )
    .input(
      z.object({
        ...scopeInput.shape,
        printerId: id,
        slot: printerSlotSchema,
        materialId: id.nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId, ...data } = input;
      const scope = await resolveScope(ctx.user.id, organizationId, "weigher");
      const result = await loadPrinterSlot(scope, data);
      switch (result) {
        case "ok":
          return { ok: true };
        case "printer_not_found":
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Drucker nicht gefunden",
          });
        case "gebinde_not_found":
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Gebinde nicht gefunden",
          });
        case "slot_out_of_range":
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Diesen Platz hat der Drucker nicht.",
          });
        case "gebinde_used_up":
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Das Gebinde ist als aufgebraucht markiert und lässt sich nicht laden.",
          });
        case "conflict":
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Das Gebinde wurde gerade woanders geladen. Bitte neu laden.",
          });
      }
    }),
});
