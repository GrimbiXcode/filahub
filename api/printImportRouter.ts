import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  MAX_API_TOKENS_PER_USER,
  MAX_PRINT_JOBS_PER_SCOPE,
} from "@contracts/limits";
import { printJobInputSchema } from "@contracts/printJobs";
import {
  MAX_PRINTERS_PER_BRIDGE,
  PRUSALINK_AUTH_KINDS,
  normalizePrinterHost,
} from "@contracts/bridge";
import { createRouter, authedQuery, rateLimited } from "./middleware";
import { generateApiToken } from "./lib/apiToken";
import { assertWithinLimit } from "./lib/quota";
import { resolveScope, scopeInput, scopeOrganizationId } from "./scope";
import { recordAudit } from "./queries/audit";
import {
  countApiTokensOfUser,
  countPrintersOfToken,
  deleteApiTokenById,
  deleteBridgePrinter,
  findManageableToken,
  insertApiToken,
  insertBridgePrinter,
  listApiTokens,
  listBridgePrinters,
  requestPrinterTest,
  updateBridgePrinter,
} from "./queries/apiTokens";
import {
  ImportGoneError,
  claimImportHooks,
  countOpenImportsInScope,
  dismissImports,
  findOpenImportInScope,
  listOpenImports,
} from "./queries/printImports";
import { countPrintJobsInScope, createPrintJob } from "./queries/printJobs";
import { consumptionRoom, withPrintJobErrors } from "./printJobRouter";

/**
 * Eingangsfach (`printImport.*`) und Verbindungen (`connection.*`: API-Schlüssel
 * und Drucker der Brücke) – seit 4.7.0.
 *
 * Stufen: Fach ansehen `viewer`; übernehmen und verwerfen `weigher` (wie ein
 * Druck); Schlüssel anlegen `weigher`. Verwalten (Drucker, entziehen) darf
 * der Besitzer des Schlüssels – in einer Organisation zusätzlich jeder
 * Administrator (`findManageableToken`).
 */

const idInput = z.object({ id: z.number().int().positive() });

export const printImportRouter = createRouter({
  list: authedQuery.input(scopeInput).query(async ({ ctx, input }) => {
    const scope = await resolveScope(
      ctx.user.id,
      input.organizationId,
      "viewer"
    );
    return listOpenImports(scope);
  }),

  count: authedQuery.input(scopeInput).query(async ({ ctx, input }) => {
    const scope = await resolveScope(
      ctx.user.id,
      input.organizationId,
      "viewer"
    );
    return countOpenImportsInScope(scope);
  }),

  byId: authedQuery
    .input(idInput.extend(scopeInput.shape))
    .query(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "viewer"
      );
      const item = await findOpenImportInScope(scope, input.id);
      if (!item)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Eintrag nicht gefunden",
        });
      return item;
    }),

  dismiss: authedQuery
    .input(
      z.object({
        ids: z.array(z.number().int().positive()).min(1).max(500),
        ...scopeInput.shape,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "weigher"
      );
      return { dismissed: await dismissImports(scope, input.ids) };
    }),

  /**
   * Übernehmen: ein gewöhnlicher Druck (dieselbe Eingabe, dieselben Grenzen,
   * dieselbe Verbrauchskopplung wie `print.create`), und in derselben
   * Transaktion wird der Eintrag erledigt.
   */
  resolve: authedQuery
    .use(
      rateLimited({
        key: "print.create",
        limit: 60,
        windowMs: 60_000,
        by: "user",
      })
    )
    .input(
      printJobInputSchema.extend({
        importId: z.number().int().positive(),
        ...scopeInput.shape,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId, importId, ...data } = input;
      const scope = await resolveScope(ctx.user.id, organizationId, "weigher");
      assertWithinLimit({
        current: await countPrintJobsInScope(scope),
        max: MAX_PRINT_JOBS_PER_SCOPE,
        quota: "print_jobs_per_scope",
        message: `Hier sind bereits ${MAX_PRINT_JOBS_PER_SCOPE} Drucke erfasst. Bitte alte Einträge entfernen.`,
        actorUserId: ctx.user.id,
        ip: ctx.clientIp,
      });
      try {
        const id = await withPrintJobErrors(() =>
          createPrintJob(
            scope,
            data,
            consumptionRoom(ctx.user.id, ctx.clientIp),
            claimImportHooks(scope, importId)
          )
        );
        return { id };
      } catch (error) {
        if (error instanceof ImportGoneError)
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        throw error;
      }
    }),
});

const printerInput = z.object({
  tokenId: z.number().int().positive(),
  name: z.string().trim().min(1, "Bitte einen Namen angeben").max(100),
  host: z
    .string()
    .trim()
    .transform((value, issue) => {
      const host = normalizePrinterHost(value);
      if (!host) {
        issue.addIssue({
          code: "custom",
          message:
            "Bitte eine Adresse wie 192.168.1.50 oder http://mk4.local angeben",
        });
        return z.NEVER;
      }
      return host;
    }),
  authKind: z.enum(PRUSALINK_AUTH_KINDS),
  username: z.string().trim().max(100).nullable(),
  /** `undefined` = nicht ändern, `""`/`null` = entfernen */
  secret: z.string().max(200).nullable().optional(),
  enabled: z.boolean().default(true),
});

export const connectionRouter = createRouter({
  /** Schlüssel des Bereichs; bei Brücken samt Druckern und Diagnose */
  list: authedQuery.input(scopeInput).query(async ({ ctx, input }) => {
    const scope = await resolveScope(
      ctx.user.id,
      input.organizationId,
      "viewer"
    );
    const tokens = await listApiTokens(ctx.user.id, scope);
    const printers = await listBridgePrinters(
      tokens.filter(t => t.kind === "bridge").map(t => t.id)
    );
    return tokens.map(token => ({
      ...token,
      printers: printers.filter(p => p.apiTokenId === token.id),
    }));
  }),

  create: authedQuery
    .use(
      rateLimited({
        key: "connection.create",
        limit: 10,
        windowMs: 60_000,
        by: "user",
      })
    )
    .input(
      z.object({
        kind: z.enum(["slicer", "bridge"]),
        name: z.string().trim().min(1, "Bitte einen Namen angeben").max(100),
        ...scopeInput.shape,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "weigher"
      );
      assertWithinLimit({
        current: await countApiTokensOfUser(ctx.user.id),
        max: MAX_API_TOKENS_PER_USER,
        quota: "api_tokens_per_user",
        message: `Du hast bereits ${MAX_API_TOKENS_PER_USER} Schlüssel. Bitte einen alten entfernen.`,
        actorUserId: ctx.user.id,
        ip: ctx.clientIp,
      });
      const { token, hash, prefix } = generateApiToken();
      const organizationId = scopeOrganizationId(scope);
      const id = await insertApiToken({
        userId: ctx.user.id,
        organizationId,
        kind: input.kind,
        name: input.name,
        tokenHash: hash,
        tokenPrefix: prefix,
      });
      recordAudit({
        event: "api_token.created",
        actorUserId: ctx.user.id,
        ip: ctx.clientIp,
        detail: { tokenId: id, organizationId, kind: input.kind },
      });
      // Der einzige Moment, in dem der Schlüssel im Klartext hinausgeht
      return { id, token, prefix };
    }),

  revoke: authedQuery
    .input(idInput.extend(scopeInput.shape))
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "viewer"
      );
      const token = await findManageableToken(ctx.user.id, scope, input.id);
      if (!token)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schlüssel nicht gefunden",
        });
      await deleteApiTokenById(token.id);
      recordAudit({
        event: "api_token.revoked",
        actorUserId: ctx.user.id,
        subjectUserId: token.userId,
        ip: ctx.clientIp,
        detail: {
          tokenId: token.id,
          organizationId: token.organizationId,
          reason: token.userId === ctx.user.id ? "user" : "admin",
        },
      });
      return { ok: true };
    }),

  addPrinter: authedQuery
    .input(printerInput.extend(scopeInput.shape))
    .mutation(async ({ ctx, input }) => {
      const { organizationId, tokenId, secret, ...data } = input;
      const token = await bridgeToken(ctx.user.id, organizationId, tokenId);
      if ((await countPrintersOfToken(token.id)) >= MAX_PRINTERS_PER_BRIDGE)
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Eine Brücke betreut höchstens ${MAX_PRINTERS_PER_BRIDGE} Drucker.`,
        });
      const id = await insertBridgePrinter(token.id, {
        ...data,
        username: data.username || null,
        secret: secret || null,
      });
      return { id };
    }),

  updatePrinter: authedQuery
    .input(
      printerInput.extend({
        id: z.number().int().positive(),
        ...scopeInput.shape,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId, tokenId, id, secret, ...data } = input;
      const token = await bridgeToken(ctx.user.id, organizationId, tokenId);
      const ok = await updateBridgePrinter(token.id, id, {
        ...data,
        username: data.username || null,
        secret: secret === undefined ? undefined : secret || null,
      });
      if (!ok)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Drucker nicht gefunden",
        });
      return { ok: true };
    }),

  removePrinter: authedQuery
    .input(
      z.object({
        tokenId: z.number().int().positive(),
        id: z.number().int().positive(),
        ...scopeInput.shape,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const token = await bridgeToken(
        ctx.user.id,
        input.organizationId,
        input.tokenId
      );
      if (!(await deleteBridgePrinter(token.id, input.id)))
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Drucker nicht gefunden",
        });
      return { ok: true };
    }),

  testPrinter: authedQuery
    .input(
      z.object({
        tokenId: z.number().int().positive(),
        id: z.number().int().positive(),
        ...scopeInput.shape,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const token = await bridgeToken(
        ctx.user.id,
        input.organizationId,
        input.tokenId
      );
      if (!(await requestPrinterTest(token.id, input.id)))
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Drucker nicht gefunden",
        });
      return { ok: true };
    }),
});

/** Ein Brücken-Schlüssel, den der Betrachter verwalten darf */
async function bridgeToken(
  viewerId: number,
  organizationId: number | null,
  tokenId: number
) {
  const scope = await resolveScope(viewerId, organizationId, "viewer");
  const token = await findManageableToken(viewerId, scope, tokenId);
  if (!token || token.kind !== "bridge")
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Brücke nicht gefunden",
    });
  return token;
}
