import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { containerFormSchema } from "@contracts/materials";
import { createRouter, authedQuery } from "./middleware";
import { resolveScope, scopeInput } from "./scope";
import {
  containerTypeInScope,
  countMaterialsWithContainerType,
  createContainerType,
  deleteContainerType,
  findContainerTypesInScope,
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
  list: authedQuery.input(scopeInput).query(async ({ ctx, input }) => {
    const scope = await resolveScope(
      ctx.user.id,
      input.organizationId,
      "viewer"
    );
    return findContainerTypesInScope(scope);
  }),

  create: authedQuery
    .input(containerTypeInput.extend(scopeInput.shape))
    .mutation(async ({ ctx, input }) => {
      const { organizationId, ...data } = input;
      const scope = await resolveScope(ctx.user.id, organizationId, "editor");
      return createContainerType(scope, data);
    }),

  update: authedQuery
    .input(
      containerTypeInput
        .partial()
        .extend({ id: z.number().int().positive(), ...scopeInput.shape })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, organizationId, ...data } = input;
      const scope = await resolveScope(ctx.user.id, organizationId, "editor");
      const updated = await updateContainerType(scope, id, data);
      if (!updated)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Gebindeart nicht gefunden",
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
      /*
        Erst die Zugehörigkeit, dann der Inhalt – wie bei `lager.delete`: Sonst
        verriete die Konfliktmeldung („noch 3 Materialien“) die Belegung einer
        fremden Gebindeart, und ein `{ ok: true }` auf eine fremde ID ließe sich
        nicht von einem echten Löschen unterscheiden.
      */
      if (!(await containerTypeInScope(scope, input.id))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Gebindeart nicht gefunden",
        });
      }
      const used = await countMaterialsWithContainerType(scope, input.id);
      if (used > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Diese Gebindeart wird noch von ${used} Material(ien) verwendet und kann nicht gelöscht werden.`,
        });
      }
      await deleteContainerType(scope, input.id);
      return { ok: true };
    }),
});
