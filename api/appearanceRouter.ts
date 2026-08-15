import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  appearanceNameSchema,
  hexSchema,
  normalizeHex,
  textureKindSchema,
} from "@contracts/appearance";
import { createRouter, authedQuery } from "./middleware";
import { resolveScope, scopeInput } from "./scope";
import {
  countMaterialsWithAppearanceName,
  createCustomColor,
  createCustomTexture,
  deleteCustomColor,
  deleteCustomTexture,
  findCustomColorsInScope,
  findCustomTexturesInScope,
  updateCustomColor,
  updateCustomTexture,
} from "./queries/appearance";

/**
 * Eigene Farben und Oberflächen.
 *
 * Aufbau wie `containerTypeRouter`: Bereich zuerst auflösen, dann arbeiten.
 * `list` liefert beide Listen in einem Aufruf – die Oberfläche zeigt das Feld
 * immer aus beidem zusammen, zwei Abfragen wären zwei Ladezustände für eine
 * Anzeige.
 */

/**
 * Farbcode als `#rrggbb`.
 *
 * `normalizeHex` vor der Prüfung, damit `#FFF` aus der Zwischenablage und
 * `#ffffff` aus dem Farbwähler denselben Weg nehmen. Was danach nicht passt,
 * fällt in die Meldung von `hexSchema` statt still ein falsches Feld zu färben.
 */
const hexInput = z
  .string()
  .transform(raw => normalizeHex(raw) ?? raw)
  .pipe(hexSchema);

const colorInput = z.object({
  name: appearanceNameSchema,
  hex: hexInput,
});

const textureInput = z.object({
  name: appearanceNameSchema,
  /**
   * Musterart aus `TEXTURE_KINDS`.
   *
   * Der **Name** bleibt frei („Sparkle"), die **Zeichnung** nicht: Gezeichnet
   * wird eines der Muster, die der Code kennt.
   */
  kind: textureKindSchema,
});

const idInput = z.object({
  id: z.number().int().positive(),
  ...scopeInput.shape,
});

/**
 * Ein doppelter Name ist der einzige erwartbare Datenbankfehler hier – der
 * partielle Unique-Index je Bereich schlägt zu. Als `CONFLICT` und mit Klartext
 * statt als `INTERNAL_SERVER_ERROR` mit Postgres-Kauderwelsch.
 *
 * **Der Fehlercode steht nicht oben, sondern in der Ursachenkette.** Drizzle
 * verpackt den Fehler des Treibers in einen eigenen; `error.code` ist deshalb
 * `undefined`, und die erste Fassung dieser Funktion warf still den Rohfehler
 * weiter – samt SQL-Text **und Parametern** bis in den Browser. Aufgefallen ist
 * das erst im Integrationstest, weil ohne Datenbank kein Unique-Index zuschlägt.
 * Dieselbe Kette liest `api/test/integration-db.ts` für den Verklemmungs-Code.
 */
function pgErrorCode(error: unknown): string | undefined {
  for (let current = error, depth = 0; current != null && depth < 5; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function asConflict(error: unknown, message: string): never {
  if (pgErrorCode(error) === "23505")
    throw new TRPCError({ code: "CONFLICT", message });
  throw error;
}

export const appearanceRouter = createRouter({
  list: authedQuery.input(scopeInput).query(async ({ ctx, input }) => {
    const scope = await resolveScope(
      ctx.user.id,
      input.organizationId,
      "viewer"
    );
    const [colors, textures] = await Promise.all([
      findCustomColorsInScope(scope),
      findCustomTexturesInScope(scope),
    ]);
    return { colors, textures };
  }),

  createColor: authedQuery
    .input(colorInput.extend(scopeInput.shape))
    .mutation(async ({ ctx, input }) => {
      const { organizationId, ...data } = input;
      const scope = await resolveScope(ctx.user.id, organizationId, "editor");
      try {
        return await createCustomColor(scope, data);
      } catch (error) {
        asConflict(error, "Diese Farbe ist bereits hinterlegt.");
      }
    }),

  updateColor: authedQuery
    .input(colorInput.partial().extend(idInput.shape))
    .mutation(async ({ ctx, input }) => {
      const { id, organizationId, ...data } = input;
      const scope = await resolveScope(ctx.user.id, organizationId, "editor");
      const updated = await updateCustomColor(scope, id, data).catch(error =>
        asConflict(error, "Diese Farbe ist bereits hinterlegt.")
      );
      if (!updated)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Farbe nicht gefunden",
        });
      return updated;
    }),

  deleteColor: authedQuery.input(idInput).mutation(async ({ ctx, input }) => {
    const scope = await resolveScope(
      ctx.user.id,
      input.organizationId,
      "editor"
    );
    /*
      Kein Konflikt bei belegten Namen, anders als bei der Gebindeart: Das
      Material trägt den Farbnamen als Freitext und verliert nichts, es fällt
      nur auf das Rückfallfeld zurück. Die Zahl steht vorher im Dialog
      (`materialsUsingColor`), gesperrt wird nichts.
    */
    await deleteCustomColor(scope, input.id);
    return { ok: true };
  }),

  createTexture: authedQuery
    .input(textureInput.extend(scopeInput.shape))
    .mutation(async ({ ctx, input }) => {
      const { organizationId, ...data } = input;
      const scope = await resolveScope(ctx.user.id, organizationId, "editor");
      try {
        return await createCustomTexture(scope, data);
      } catch (error) {
        asConflict(error, "Diese Oberfläche ist bereits hinterlegt.");
      }
    }),

  updateTexture: authedQuery
    .input(textureInput.partial().extend(idInput.shape))
    .mutation(async ({ ctx, input }) => {
      const { id, organizationId, ...data } = input;
      const scope = await resolveScope(ctx.user.id, organizationId, "editor");
      const updated = await updateCustomTexture(scope, id, data).catch(error =>
        asConflict(error, "Diese Oberfläche ist bereits hinterlegt.")
      );
      if (!updated)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Oberfläche nicht gefunden",
        });
      return updated;
    }),

  deleteTexture: authedQuery.input(idInput).mutation(async ({ ctx, input }) => {
    const scope = await resolveScope(
      ctx.user.id,
      input.organizationId,
      "editor"
    );
    await deleteCustomTexture(scope, input.id);
    return { ok: true };
  }),

  /** Wie viele Materialien diesen Namen tragen – nur als Hinweis im Dialog. */
  usage: authedQuery
    .input(
      z.object({
        column: z.enum(["color", "texture"]),
        name: appearanceNameSchema,
        ...scopeInput.shape,
      })
    )
    .query(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "viewer"
      );
      return {
        count: await countMaterialsWithAppearanceName(
          scope,
          input.column,
          input.name
        ),
      };
    }),
});
