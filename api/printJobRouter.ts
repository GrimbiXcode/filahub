import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  MAX_CONSUMPTIONS_PER_MATERIAL,
  MAX_PRINT_JOBS_PER_SCOPE,
} from "@contracts/limits";
import {
  PRINT_JOB_PAGE_SIZE,
  PRINT_JOB_SEARCH_MIN_LENGTH,
  PRINT_JOB_STATUSES,
  decodePrintJobCursor,
  encodePrintJobCursor,
  mayDeletePrintJob,
  printJobInputSchema,
  type PrintJobInput,
} from "@contracts/printJobs";
import { createRouter, authedQuery, rateLimited } from "./middleware";
import { assertWithinLimit } from "./lib/quota";
import { resolveScope, scopeInput, scopeRole } from "./scope";
import { countConsumptionsForMaterial } from "./queries/filament";
import {
  PRINT_JOB_BAD_MATERIAL,
  PRINT_JOB_NOT_FOUND,
  PRINT_JOB_USED_UP,
  countPrintJobsInScope,
  createPrintJob,
  deletePrintJob,
  findLatestPrintJobId,
  findPrintJobFacets,
  findPrintJobInScope,
  findPrintJobRowInScope,
  listPrintJobs,
  updatePrintJob,
} from "./queries/printJobs";

/**
 * Druckhistorie (seit 4.2.0) – Einzelheiten in `api/queries/printJobs.ts`
 * und `AGENTS.md`, „Druckhistorie“.
 *
 * Stufen: `viewer` sieht und sucht, `weigher` erfasst (ein Druck bucht ab wie
 * ein Verbrauch) und darf den eigenen gerade eben löschen, `editor` ändert und
 * löscht jeden. Ändern braucht `editor`, weil es Verbräuche umbucht.
 */

/** Übersetzt die Fehlerkennungen der Schreibpfade in lesbare Meldungen. */
async function withPrintJobErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === PRINT_JOB_NOT_FOUND)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Druck nicht gefunden",
      });
    if (code === PRINT_JOB_BAD_MATERIAL)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Ein Material oder Gebinde des Drucks gibt es nicht (mehr), oder das Gebinde gehört nicht zum Material.",
      });
    if (code === PRINT_JOB_USED_UP)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Von einem aufgebrauchten Gebinde lässt sich nichts abbuchen. Bitte ein anderes wählen oder die Menge auf 0 setzen.",
      });
    throw error;
  }
}

/** Die Obergrenze der Verbräuche je Gebinde gilt auch für Drucke. */
async function assertConsumptionRoom(
  input: PrintJobInput,
  actorUserId: number,
  ip: string | null | undefined
) {
  const perGebinde = new Map<number, number>();
  for (const row of input.materials) {
    if (row.materialId && row.grams > 0)
      perGebinde.set(row.materialId, (perGebinde.get(row.materialId) ?? 0) + 1);
  }
  for (const [materialId, adding] of perGebinde) {
    assertWithinLimit({
      current: await countConsumptionsForMaterial(materialId),
      max: MAX_CONSUMPTIONS_PER_MATERIAL,
      adding,
      quota: "consumptions_per_material",
      message: `Für ein Gebinde dieses Drucks sind bereits ${MAX_CONSUMPTIONS_PER_MATERIAL} Verbräuche erfasst. Bitte alte Einträge entfernen.`,
      actorUserId,
      ip: ip ?? null,
    });
  }
}

const filtersInput = z.object({
  query: z.string().max(200).optional(),
  productId: z.number().int().positive().optional(),
  materialId: z.number().int().positive().optional(),
  materialType: z.string().max(100).optional(),
  status: z.enum(PRINT_JOB_STATUSES).optional(),
  printer: z.string().max(100).optional(),
  tag: z.string().max(200).optional(),
  from: z.date().optional(),
  to: z.date().optional(),
});

export const printJobRouter = createRouter({
  /** Eine Seite der Druckhistorie – neueste zuerst, gefiltert */
  list: authedQuery
    .use(
      rateLimited({
        key: "print.list",
        limit: 240,
        windowMs: 60_000,
        by: "user",
      })
    )
    .input(
      filtersInput.extend({
        cursor: z.string().max(100).nullish(),
        limit: z.number().int().min(1).max(100).optional(),
        ...scopeInput.shape,
      })
    )
    .query(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "viewer"
      );
      const { cursor, limit, organizationId: _scope, ...filters } = input;
      // Zu kurze Suchbegriffe wären ein vollständiger Scan ohne Nutzen
      const query =
        (filters.query?.trim().length ?? 0) >= PRINT_JOB_SEARCH_MIN_LENGTH
          ? filters.query
          : undefined;
      const page = await listPrintJobs(
        scope,
        { ...filters, query },
        decodePrintJobCursor(cursor),
        limit ?? PRINT_JOB_PAGE_SIZE
      );
      const last = page.items.at(-1);
      return {
        items: page.items,
        nextCursor: page.hasMore && last ? encodePrintJobCursor(last) : null,
      };
    }),

  byId: authedQuery
    .input(z.object({ id: z.number().int().positive(), ...scopeInput.shape }))
    .query(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "viewer"
      );
      const job = await findPrintJobInScope(scope, input.id);
      if (!job)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Druck nicht gefunden",
        });
      const latestId = await findLatestPrintJobId(scope);
      return {
        ...job,
        /** Ob der Aufrufer diesen Druck löschen darf (`mayDeletePrintJob`) */
        canDelete: mayDeletePrintJob(scopeRole(scope), job, latestId ?? 0),
      };
    }),

  /** Drucker und Tags des Bereichs – Vorschläge im Formular und Filter */
  facets: authedQuery.input(scopeInput).query(async ({ ctx, input }) => {
    const scope = await resolveScope(
      ctx.user.id,
      input.organizationId,
      "viewer"
    );
    return findPrintJobFacets(scope);
  }),

  create: authedQuery
    .use(
      rateLimited({
        key: "print.create",
        limit: 60,
        windowMs: 60_000,
        by: "user",
      })
    )
    .input(printJobInputSchema.extend(scopeInput.shape))
    .mutation(async ({ ctx, input }) => {
      const { organizationId, ...data } = input;
      const scope = await resolveScope(ctx.user.id, organizationId, "weigher");
      assertWithinLimit({
        current: await countPrintJobsInScope(scope),
        max: MAX_PRINT_JOBS_PER_SCOPE,
        quota: "print_jobs_per_scope",
        message: `Hier sind bereits ${MAX_PRINT_JOBS_PER_SCOPE} Drucke erfasst. Bitte alte Einträge entfernen.`,
        actorUserId: ctx.user.id,
        ip: ctx.clientIp,
      });
      await assertConsumptionRoom(data, ctx.user.id, ctx.clientIp);
      const id = await withPrintJobErrors(() => createPrintJob(scope, data));
      return { id };
    }),

  update: authedQuery
    .input(
      printJobInputSchema.extend({
        id: z.number().int().positive(),
        ...scopeInput.shape,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, organizationId, ...data } = input;
      const scope = await resolveScope(ctx.user.id, organizationId, "editor");
      await assertConsumptionRoom(data, ctx.user.id, ctx.clientIp);
      await withPrintJobErrors(() => updatePrintJob(scope, id, data));
      return { ok: true };
    }),

  delete: authedQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        /** Die abgebuchten Verbräuche mit zurücknehmen */
        revertConsumptions: z.boolean(),
        ...scopeInput.shape,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "weigher"
      );
      const job = await findPrintJobRowInScope(scope, input.id);
      if (!job)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Druck nicht gefunden",
        });
      const latestId = await findLatestPrintJobId(scope);
      if (!mayDeletePrintJob(scopeRole(scope), job, latestId ?? 0)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Diesen Druck kann nur löschen, wer Material bearbeiten darf – oder du direkt nach dem Erfassen.",
        });
      }
      await deletePrintJob(scope, input.id, input.revertConsumptions);
      return { ok: true };
    }),
});
