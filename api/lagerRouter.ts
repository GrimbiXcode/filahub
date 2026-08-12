import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  MAX_LAGER_PER_USER,
  filamentDiameterSchema,
  lagerConfigIsValid,
  materialKindSchema,
} from "@contracts/materials";
import { MAX_LAGER_PER_ORGANIZATION } from "@contracts/organizations";
import { createRouter, authedQuery } from "./middleware";
import { resolveScope, scopeInput, type Scope } from "./scope";
import { recordAudit } from "./queries/audit";
import { countSharesByLager } from "./queries/friends";
import {
  LAGER_NAME_TAKEN,
  countLagerInScope,
  countMaterialsByLager,
  createLager,
  deleteLager,
  findLagerInScope,
  findLagerInScopeById,
  updateLager,
} from "./queries/lager";

/**
 * Lager anlegen und verwalten.
 *
 * Muster: `api/storageBoxRouter.ts`. Deutsche Fehlermeldungen, `NOT_FOUND` auch
 * bei fremden Zeilen (nie `FORBIDDEN` – das verriete deren Existenz), IDs als
 * `z.number().int().positive()`.
 */

const lagerInput = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich").max(255),
  materialKind: materialKindSchema,
  filamentDiameterUm: filamentDiameterSchema.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/**
 * Obergrenze und Meldung hängen am Bereich.
 *
 * Bewusst nur hier und nicht in der Datenbank: Ein Zähler ist weder als
 * Unique- noch als partieller Index ausdrückbar. Zwei gleichzeitige Anfragen
 * können daher ein Lager zu viel erzeugen – der Schaden ist gering, aber die
 * Lücke soll benannt sein und nicht als Garantie durchgehen.
 */
function lagerLimitFor(scope: Scope): number {
  return scope.kind === "personal"
    ? MAX_LAGER_PER_USER
    : MAX_LAGER_PER_ORGANIZATION;
}

/**
 * Wandelt den Namenskonflikt in eine Meldung um, die man einem Benutzer zeigen
 * kann.
 *
 * `createLager`/`updateLager` melden ihn als `LAGER_NAME_TAKEN`; ohne diese
 * Umsetzung wäre es ein INTERNAL_SERVER_ERROR und die Oberfläche zeigte die
 * rohe Postgres-Meldung samt Constraint-Namen.
 */
async function withNameConflict<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Error && error.message === LAGER_NAME_TAKEN) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Ein Lager mit diesem Namen gibt es schon.",
      });
    }
    throw error;
  }
}

/**
 * Prüft, dass Materialart und Stärke zusammenpassen.
 *
 * Die Regel selbst steht als reine Funktion in `contracts/materials.ts` und ist
 * dort ohne Datenbank getestet; hier wird sie nur auf den Zustand **nach** dem
 * Patch angewandt – dasselbe Vorgehen wie bei der Gebindewahl in
 * `validateForeignKeys` (`api/materialRouter.ts`). Ohne das könnte eine
 * Teilaktualisierung ein Harzlager mit einer Filamentstärke hinterlassen.
 */
function assertConfigValid(config: {
  materialKind: z.infer<typeof materialKindSchema>;
  filamentDiameterUm?: number | null;
}) {
  if (lagerConfigIsValid(config)) return;
  throw new TRPCError({
    code: "BAD_REQUEST",
    message:
      config.materialKind === "filament"
        ? "Bitte eine Filamentstärke wählen (1,75 mm oder 2,85 mm)."
        : "Eine Filamentstärke gibt es nur bei Filament-Lagern.",
  });
}

export const lagerRouter = createRouter({
  /**
   * Die eigenen Lager, jedes mit der Zahl der Freunde, die es sehen dürfen.
   *
   * Die Zahl steht bewusst hier und nicht auf der Freundesseite: Die
   * Voreinstellung ist „nichts freigegeben“, und dieser Zustand darf nirgends
   * unsichtbar sein. Wer seine Lager ansieht, soll erkennen, welche davon
   * hinausgehen – ohne dafür jede Freundeskarte durchklicken zu müssen.
   */
  list: authedQuery.input(scopeInput).query(async ({ ctx, input }) => {
    const scope = await resolveScope(
      ctx.user.id,
      input.organizationId,
      "viewer"
    );
    /*
      Die Belegung kommt als Zahl mit, nicht als Bestand. Die Lager-Seite lud
      dafür vorher den gesamten Bestand – hunderte Kilobyte samt Wägungsverlauf
      für eine Handvoll Zahlen – und zählte im Browser nur die **eigenen** Zeilen,
      während die Löschsperre alles im Lager zählt. Beide Zahlen konnten sich
      widersprechen.

      `countSharesByLager` läuft nur im persönlichen Bereich: Ein Lager einer
      Organisation lässt sich nicht an Freunde freigeben, die Zahl wäre dort
      immer 0 – und die Abfrage eine Runde zur Datenbank für eine Konstante.
    */
    const [rows, shares, counts] = await Promise.all([
      findLagerInScope(scope),
      scope.kind === "personal"
        ? countSharesByLager(scope.userId)
        : new Map<number, number>(),
      countMaterialsByLager(scope),
    ]);
    return rows.map(row => ({
      ...row,
      sharedWith: shares.get(row.id) ?? 0,
      materialCount: counts.get(row.id) ?? 0,
    }));
  }),

  create: authedQuery
    .input(lagerInput.extend(scopeInput.shape))
    .mutation(async ({ ctx, input }) => {
      const { organizationId, ...data } = input;
      /*
        `admin`, obwohl Material schon `editor` darf: Ein Lager ist Struktur,
        und sein Löschen wirkt auf alle Mitglieder.
      */
      const scope = await resolveScope(ctx.user.id, organizationId, "admin");

      const limit = lagerLimitFor(scope);
      const existing = await countLagerInScope(scope);
      if (existing >= limit) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Mehr als ${limit} Lager sind derzeit nicht möglich.`,
        });
      }
      assertConfigValid(data);
      return withNameConflict(() =>
        createLager(scope, {
          ...data,
          filamentDiameterUm: data.filamentDiameterUm ?? null,
        })
      );
    }),

  update: authedQuery
    .input(
      lagerInput
        .partial()
        .extend({ id: z.number().int().positive(), ...scopeInput.shape })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, organizationId, ...data } = input;
      const scope = await resolveScope(ctx.user.id, organizationId, "admin");
      const existing = await findLagerInScopeById(scope, id);
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lager nicht gefunden",
        });
      }

      // Zustand nach dem Patch prüfen, nicht bloß die gesendeten Felder.
      const nextKind = data.materialKind ?? existing.materialKind;
      const nextDiameter =
        data.filamentDiameterUm !== undefined
          ? data.filamentDiameterUm
          : existing.filamentDiameterUm;
      /*
        Wechselt die Materialart weg von Filament, fällt die Stärke weg – sonst
        bliebe an einem Harzlager eine Angabe stehen, die nichts bedeutet.
        Umgekehrt muss der Aufrufer eine Stärke mitschicken.
      */
      const diameter = nextKind === "filament" ? nextDiameter : null;
      assertConfigValid({
        materialKind: nextKind,
        filamentDiameterUm: diameter,
      });

      const updated = await withNameConflict(() =>
        updateLager(scope, id, {
          ...data,
          filamentDiameterUm: diameter,
        })
      );
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lager nicht gefunden",
        });
      }
      return updated;
    }),

  delete: authedQuery
    .input(z.object({ id: z.number().int().positive(), ...scopeInput.shape }))
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "admin"
      );
      /*
        Erst die Zugehörigkeit, dann der Inhalt: Sonst verriete die
        Konfliktmeldung („noch 3 Materialien") die Belegung eines fremden
        Lagers.
      */
      const own = await findLagerInScopeById(scope, input.id);
      if (!own) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lager nicht gefunden",
        });
      }
      /*
        Das letzte Lager darf gehen. Die Materialübersicht kommt mit „kein
        Lager vorhanden" zurecht und lädt zum Anlegen ein – eine Sperre wäre
        eine Bevormundung, und wer neu anfangen will, soll das können.

        Gezählt wird **in** der Transaktion (`deleteLager`), nicht hier davor:
        Sonst könnte zwischen Zählen und Löschen Material hineinwandern.
      */
      const { revoked, blockedBy } = await deleteLager(scope, input.id);
      if (blockedBy != null) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `In diesem Lager liegen noch ${blockedBy} Material(ien). Verschiebe sie oder lösche sie zuerst.`,
        });
      }
      /*
        Je betroffenem Freund ein Eintrag, und zwar derselbe Ereignisname wie
        beim Zurücknehmen von Hand: Für den Betroffenen ist es dasselbe – sein
        Zugriff endet. Ein eigenes `lager.deleted` sagte nicht, **wessen**
        Zugriff endete, und genau das muss das Protokoll beantworten. `reason`
        unterscheidet die beiden Wege.
      */
      for (const friendId of revoked) {
        recordAudit({
          event: "friend.visibility_changed",
          actorUserId: ctx.user.id,
          subjectUserId: friendId,
          ip: ctx.clientIp,
          detail: {
            lagerId: input.id,
            visibility: "none",
            reason: "lager_deleted",
          },
        });
      }
      return { ok: true };
    }),
});
