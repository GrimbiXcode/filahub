import { ErrorMessages } from "@contracts/constants";
import type { AuditEvent } from "@contracts/audit";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { consumeRateLimit } from "./lib/rateLimit";
import { recordAudit } from "./queries/audit";

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

/**
 * Weist ab, wessen Konto gesperrt ist.
 *
 * Bewusst **nicht** in `authenticateRequest` (`api/telegram/auth.ts`): Was dort
 * geworfen wird, verschluckt `createContext` – der Gesperrte hätte gar keinen
 * Benutzer im Kontext und sähe die Anmeldeschranke statt seiner Sperrseite. Er
 * soll aber wissen, woran er ist, und seinen Antrag stellen können.
 *
 * Die Meldung trägt den Präfix aus `ErrorMessages.blocked`, damit die
 * Oberfläche sie erkennt, ohne den Text zu vergleichen.
 */
/**
 * Exportiert allein für `api/blocking.test.ts`: Der Test prüft, welche
 * Prozeduren diese Middleware **nicht** tragen, und vergleicht die Identität
 * des Objekts statt Middleware-Ketten zu zählen. Eine Zählung führte in die
 * Irre, weil ein Eingabeschema und eine Zugriffsbegrenzung genauso mitzählen.
 */
export const requireNotBlocked = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (ctx.user?.blockedAt) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: ErrorMessages.blocked,
    });
  }

  return next();
});

/**
 * Angemeldet **und** nicht gesperrt – die Vorgabe für alles Fachliche.
 *
 * Die Sperrprüfung hängt hier und nicht an den einzelnen Prozeduren, damit sie
 * auch für die gilt, an die beim nächsten Feature niemand denkt: Eine
 * vergessene Bedingung fällt damit **zu** und nicht auf – dieselbe Erwägung
 * wie bei `scopeWhere` in `api/scope.ts`.
 */
export const authedQuery = t.procedure
  .use(requireAuth)
  .use(requireNotBlocked)
  .use(
    /*
      Grundlast je Benutzer. Großzügig bemessen: Sie soll das Skript ausbremsen
      und nicht den Menschen – der Client bündelt über `httpBatchLink` mehrere
      Prozeduren in einer Anfrage, eine frisch geladene Seite verbraucht also
      schon ein Dutzend. Die engen Grenzen stehen an den einzelnen Prozeduren.
    */
    rateLimited({
      key: "authed",
      limit: 600,
      windowMs: 60_000,
      by: "user",
    })
  );

export const adminQuery = authedQuery.use(requireRole("admin"));

/**
 * Angemeldet, Sperre egal.
 *
 * Für die wenigen Prozeduren, die ein Gesperrter erreichen können **muss**:
 *
 *  - `auth.me` – ohne sie wüsste die Oberfläche nicht, dass er gesperrt ist,
 *  - Abmelden, weil man ein Gerät auch aus einer Sperre heraus verlassen darf,
 *  - **Auskunft und Löschung des Kontos**: Art. 15 und Art. 17 DSGVO stehen
 *    nicht unter dem Vorbehalt des Wohlverhaltens. Eine Sperre, die den
 *    Datenexport mitsperrt, wäre rechtswidrig,
 *  - die Rechtstexte und die Sprachwahl, damit die Sperrseite lesbar ist,
 *  - der Entsperr-Antrag selbst.
 *
 * Wer hier etwas ergänzt, ergänzt es bewusst: `api/blocking.test.ts` hält die
 * Liste als geprüfte Zusicherung fest.
 */
export const blockedQuery = t.procedure.use(requireAuth);

/**
 * Begrenzt, wie oft eine Prozedur aufgerufen werden darf.
 *
 * Bewusst als tRPC-Middleware und nicht als Hono-Middleware: Der Client bündelt
 * über `httpBatchLink` mehrere Prozeduraufrufe in **einer** HTTP-Anfrage. Auf
 * HTTP-Ebene gezählt wären zwanzig Anmeldeversuche in einem Bündel ein einziger
 * Zugriff – die Sperre liefe ins Leere.
 */
export function rateLimited(options: {
  /** Kennzeichnet den Eimer, damit sich Prozeduren nicht gegenseitig sperren. */
  key: string;
  limit: number;
  windowMs: number;
  /**
   * Woran gezählt wird.
   *
   * `"ip"` für alles Offene – vor der Anmeldung gibt es nichts anderes. Ohne
   * ermittelbare Adresse teilen sich dort alle Aufrufer einen Eimer; das ist
   * grob, aber die sichere Richtung: Lieber greift die Sperre zu breit, als
   * dass sie sich durch Weglassen einer Kopfzeile aushebeln lässt.
   *
   * `"user"` für alles Angemeldete. Die Adresse wäre dort die falsche Achse:
   * Eine Werkstatt hinter einem NAT teilte sich einen Eimer und sperrte sich
   * gegenseitig aus, während ein Angreifer die Adresse ohnehin leichter
   * wechselt als das Konto. Fehlt wider Erwarten der Benutzer, fällt es auf
   * die Adresse zurück – lieber grob gezählt als gar nicht.
   */
  by?: "ip" | "user";
  /**
   * Ereignis für das Protokoll.
   *
   * Vorgabe `limit.rate_limited`; die Aufrufe am Anmeldeweg geben
   * `login.rate_limited`. Bis 2.7.0 trug jeder Eimer das Anmelde-Ereignis –
   * bei `material.create` schlicht falsch, und die Auswertung konnte einen
   * Angriff auf die Anmeldung nicht mehr von einem ausgereizten Kontingent
   * unterscheiden.
   */
  event?: Extract<AuditEvent, "login.rate_limited" | "limit.rate_limited">;
}) {
  const by = options.by ?? "ip";
  const event = options.event ?? "limit.rate_limited";

  return t.middleware(async ({ ctx, next }) => {
    const subject =
      by === "user" && ctx.user
        ? `u${ctx.user.id}`
        : (ctx.clientIp ?? "unbekannt");
    const bucket = `${options.key}:${subject}`;
    const result = consumeRateLimit(bucket, options.limit, options.windowMs);
    if (!result.allowed) {
      /*
        Nur beim Zuschlagen protokollieren, nicht bei jedem Versuch – sonst
        schriebe ein Angriff genau das Protokoll voll, das ihn aufklären soll.
      */
      recordAudit({
        event,
        actorUserId: ctx.user?.id ?? null,
        ip: ctx.clientIp,
        detail: { bucket: options.key },
      });
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Zu viele Versuche. Bitte in ${result.retryAfterSeconds} Sekunden erneut probieren.`,
      });
    }
    return next();
  });
}
