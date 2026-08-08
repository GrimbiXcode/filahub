import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { consumeRateLimit } from "./lib/rateLimit";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

const requireAuth = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

function requireRole(role: string) {
  return t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== role) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

export const authedQuery = t.procedure.use(requireAuth);
export const adminQuery = authedQuery.use(requireRole("admin"));

/**
 * Begrenzt, wie oft eine Prozedur von derselben Adresse aufgerufen werden darf.
 *
 * Bewusst als tRPC-Middleware und nicht als Hono-Middleware: Der Client bündelt
 * über `httpBatchLink` mehrere Prozeduraufrufe in **einer** HTTP-Anfrage. Auf
 * HTTP-Ebene gezählt wären zwanzig Anmeldeversuche in einem Bündel ein einziger
 * Zugriff – die Sperre liefe ins Leere.
 *
 * Ohne ermittelbare Adresse teilen sich alle Aufrufer einen Eimer. Das ist
 * grob, aber die sichere Richtung: Lieber greift die Sperre zu breit, als dass
 * sie sich durch Weglassen einer Kopfzeile aushebeln lässt.
 */
export function rateLimited(options: {
  /** Kennzeichnet den Eimer, damit sich Prozeduren nicht gegenseitig sperren. */
  key: string;
  limit: number;
  windowMs: number;
}) {
  return t.middleware(async ({ ctx, next }) => {
    const bucket = `${options.key}:${ctx.clientIp ?? "unbekannt"}`;
    const result = consumeRateLimit(bucket, options.limit, options.windowMs);
    if (!result.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Zu viele Versuche. Bitte in ${result.retryAfterSeconds} Sekunden erneut probieren.`,
      });
    }
    return next();
  });
}
