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
} from "@contracts/printJobs";
import { mayDeletePrintFile } from "@contracts/printFiles";
import { createRouter, authedQuery, rateLimited } from "./middleware";
import { assertWithinLimit } from "./lib/quota";
import { resolveScope, scopeInput, scopeRole } from "./scope";
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
  type ConsumptionRoomCheck,
} from "./queries/printJobs";
import {
  deletePrintFile,
  findLatestFileIdOfJob,
  findPrintFileInScope,
  listPrintFiles,
  setPrintJobCover,
} from "./queries/printFiles";

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

/**
 * Die Obergrenze der Verbräuche je Gebinde gilt auch für Drucke. Geprüft wird
 * in der Transaktion (`insertChildren`), nach der Bereichsprüfung und nur für
 * Zeilen, die wirklich abbuchen – sonst verriete die Meldung fremde Gebinde,
 * und eine reine Titeländerung stieße an die eigenen Verbräuche.
 */
function consumptionRoom(
  actorUserId: number,
  ip: string | null | undefined
): ConsumptionRoomCheck {
  return (_materialId, current, adding) =>
    assertWithinLimit({
      current,
      max: MAX_CONSUMPTIONS_PER_MATERIAL,
      adding,
      quota: "consumptions_per_material",
      message: `Für ein Gebinde dieses Drucks sind bereits ${MAX_CONSUMPTIONS_PER_MATERIAL} Verbräuche erfasst. Bitte alte Einträge entfernen.`,
      actorUserId,
      ip: ip ?? null,
    });
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
      const [latestId, files, latestFileId] = await Promise.all([
        findLatestPrintJobId(scope),
        listPrintFiles(job.id),
        findLatestFileIdOfJob(job.id),
      ]);
      const role = scopeRole(scope);
      return {
        ...job,
        /** Ob der Aufrufer diesen Druck löschen darf (`mayDeletePrintJob`) */
        canDelete: mayDeletePrintJob(role, job, latestId ?? 0),
        /** Fotos und 3MF (seit 4.3.0), je mit derselben Korrekturregel */
        files: files.map(file => ({
          ...file,
          canDelete: mayDeletePrintFile(role, file, latestFileId ?? 0),
        })),
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
      const id = await withPrintJobErrors(() =>
        createPrintJob(scope, data, consumptionRoom(ctx.user.id, ctx.clientIp))
      );
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
      await withPrintJobErrors(() =>
        updatePrintJob(
          scope,
          id,
          data,
          consumptionRoom(ctx.user.id, ctx.clientIp)
        )
      );
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

  /**
   * Eine Datei löschen (seit 4.3.0) – `editor` jede, `weigher` nur die zuletzt
   * hochgeladene des Drucks und nur kurz danach (`mayDeletePrintFile`).
   * Hochgeladen wird über `POST /api/files/print-jobs/:id` (`api/fileRoutes.ts`).
   */
  deleteFile: authedQuery
    .input(z.object({ id: z.number().int().positive(), ...scopeInput.shape }))
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "weigher"
      );
      const file = await findPrintFileInScope(scope, input.id);
      if (!file)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Datei nicht gefunden",
        });
      const latestId = await findLatestFileIdOfJob(file.printJobId);
      if (!mayDeletePrintFile(scopeRole(scope), file, latestId ?? 0)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Diese Datei kann nur löschen, wer Material bearbeiten darf – oder du direkt nach dem Hochladen.",
        });
      }
      await deletePrintFile(scope, input.id);
      return { ok: true };
    }),

  /** Titelbild setzen – nur ein Foto desselben Drucks */
  setCover: authedQuery
    .input(
      z.object({
        printJobId: z.number().int().positive(),
        fileId: z.number().int().positive(),
        ...scopeInput.shape,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "weigher"
      );
      if (!(await setPrintJobCover(scope, input.printJobId, input.fileId)))
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Foto nicht gefunden",
        });
      return { ok: true };
    }),
});
