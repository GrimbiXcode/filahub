import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  appearanceNameSchema,
  colorSpecIsTrivial,
  colorSpecSchema,
  hexSchema,
  normalizeHex,
  parseStoredColorSpec,
  storedTextureKinds,
  textureKindsCompatible,
  textureKindSchema,
  type ColorSpec,
  type TextureKind,
} from "@contracts/appearance";
import { createRouter, authedQuery, rateLimited } from "./middleware";
import { resolveScope, scopeInput } from "./scope";
import {
  MAX_CUSTOM_COLORS_PER_SCOPE,
  MAX_CUSTOM_TEXTURES_PER_SCOPE,
} from "@contracts/limits";
import { assertWithinLimit } from "./lib/quota";
import {
  countCustomColorsInScope,
  countCustomTexturesInScope,
  countMaterialsWithAppearanceName,
  createCustomColor,
  createCustomTexture,
  deleteCustomColor,
  deleteCustomTexture,
  findCustomColorsInScope,
  findCustomTextureInScope,
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

/**
 * Eine eigene Farbe: **entweder** ein Farbcode (`hex`) **oder** ein Farbbild
 * (`spec`, seit 4.7.0) – beides zugleich ist `BAD_REQUEST`, dasselbe Muster
 * wie `material.create` mit `productId`. Die Leitfarbe in `hex` leitet bei
 * einem Farbbild der Server ab (`colorData`), damit es keine zweite Wahrheit
 * gibt.
 */
const colorInput = z.object({
  name: appearanceNameSchema,
  hex: hexInput.optional(),
  /** `null` beim Ändern: Farbbild entfernen, die Leitfarbe bleibt */
  spec: colorSpecSchema.nullable().optional(),
});

/**
 * Leitfarbe und Farbbild aus der Eingabe – die **eine** Stelle, an der beides
 * zusammenkommt.
 *
 * - Farbbild → Leitfarbe ist seine erste Farbe. Ist es nur ein Farbcode
 *   (eine Farbe, keine Partikel, keine Wirkung), wird es als solcher
 *   gespeichert: eine Wahrheit, nicht zwei.
 * - Farbcode → das Farbbild entfällt; wer auf eine Farbe zurückgeht, meint
 *   einfarbig.
 * - `spec: null` allein → Farbbild entfernen, die Leitfarbe bleibt.
 */
function colorData(input: { hex?: string; spec?: ColorSpec | null }): {
  hex?: string;
  spec?: ColorSpec | null;
} {
  if (input.hex !== undefined && input.spec != null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Bitte entweder einen Farbcode oder ein Farbbild angeben.",
    });
  }
  if (input.spec != null) {
    return {
      hex: input.spec.colors[0].hex,
      spec: colorSpecIsTrivial(input.spec) ? null : input.spec,
    };
  }
  if (input.hex !== undefined) return { hex: input.hex, spec: null };
  if (input.spec === null) return { spec: null };
  return {};
}

/** Zeilen mit gelesenem Farbbild – `jsonb` kommt als `unknown` aus der Datenbank */
function withSpec<T extends { spec: unknown }>(row: T) {
  return { ...row, spec: parseStoredColorSpec(row.spec) };
}

const textureInput = z.object({
  name: appearanceNameSchema,
  /**
   * Musterart aus `TEXTURE_KINDS`.
   *
   * Der **Name** bleibt frei („Sparkle"), die **Zeichnung** nicht: Gezeichnet
   * wird eines der Muster, die der Code kennt.
   */
  kind: textureKindSchema,
  /**
   * Zweite Art auf der anderen Ebene (seit 4.9.0) – „Silk Glitter“ ist
   * Glitzer **und** Seidenglanz. `null` = keine. Welche von beiden in `kind`
   * steht, ist gleich; gespeichert wird in fester Reihenfolge
   * (`storedTextureKinds`).
   */
  secondKind: textureKindSchema.nullable().optional(),
});

const TEXTURE_LAYER_CONFLICT =
  "Zwei Arten derselben Ebene gehen nicht zusammen – je eine Struktur und ein Glanz.";

/** Beide Arten geprüft und in der gespeicherten Reihenfolge */
function textureKindData(
  kind: TextureKind,
  secondKind: TextureKind | null | undefined
) {
  if (!textureKindsCompatible(kind, secondKind)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: TEXTURE_LAYER_CONFLICT,
    });
  }
  return storedTextureKinds(kind, secondKind);
}

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
    return { colors: colors.map(withSpec), textures };
  }),

  createColor: authedQuery
    .use(
      rateLimited({
        key: "appearance.createColor",
        limit: 60,
        windowMs: 60 * 60_000,
        by: "user",
      })
    )
    .input(colorInput.extend(scopeInput.shape))
    .mutation(async ({ ctx, input }) => {
      const { organizationId, name, ...rest } = input;
      const { hex, spec } = colorData(rest);
      if (hex === undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Farbcode oder Farbbild fehlt.",
        });
      }
      const scope = await resolveScope(ctx.user.id, organizationId, "editor");
      assertWithinLimit({
        current: await countCustomColorsInScope(scope),
        max: MAX_CUSTOM_COLORS_PER_SCOPE,
        quota: "custom_colors_per_scope",
        message: `Mehr als ${MAX_CUSTOM_COLORS_PER_SCOPE} eigene Farben sind nicht vorgesehen. Bitte nicht mehr genutzte löschen.`,
        actorUserId: ctx.user.id,
        ip: ctx.clientIp,
      });
      try {
        const created = await createCustomColor(scope, {
          name,
          hex,
          spec: spec ?? null,
        });
        return created && withSpec(created);
      } catch (error) {
        asConflict(error, "Diese Farbe ist bereits hinterlegt.");
      }
    }),

  updateColor: authedQuery
    .input(colorInput.partial().extend(idInput.shape))
    .mutation(async ({ ctx, input }) => {
      const { id, organizationId, name, ...rest } = input;
      const data = {
        ...colorData(rest),
        ...(name === undefined ? {} : { name }),
      };
      const scope = await resolveScope(ctx.user.id, organizationId, "editor");
      const updated = await updateCustomColor(scope, id, data).catch(error =>
        asConflict(error, "Diese Farbe ist bereits hinterlegt.")
      );
      if (!updated)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Farbe nicht gefunden",
        });
      return withSpec(updated);
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
    .use(
      rateLimited({
        key: "appearance.createTexture",
        limit: 60,
        windowMs: 60 * 60_000,
        by: "user",
      })
    )
    .input(textureInput.extend(scopeInput.shape))
    .mutation(async ({ ctx, input }) => {
      const { organizationId, name, kind, secondKind } = input;
      const kinds = textureKindData(kind, secondKind);
      const scope = await resolveScope(ctx.user.id, organizationId, "editor");
      assertWithinLimit({
        current: await countCustomTexturesInScope(scope),
        max: MAX_CUSTOM_TEXTURES_PER_SCOPE,
        quota: "custom_textures_per_scope",
        message: `Mehr als ${MAX_CUSTOM_TEXTURES_PER_SCOPE} eigene Oberflächen sind nicht vorgesehen. Bitte nicht mehr genutzte löschen.`,
        actorUserId: ctx.user.id,
        ip: ctx.clientIp,
      });
      try {
        return await createCustomTexture(scope, { name, ...kinds });
      } catch (error) {
        asConflict(error, "Diese Oberfläche ist bereits hinterlegt.");
      }
    }),

  updateTexture: authedQuery
    .input(textureInput.partial().extend(idInput.shape))
    .mutation(async ({ ctx, input }) => {
      const { id, organizationId, name, kind, secondKind } = input;
      const scope = await resolveScope(ctx.user.id, organizationId, "editor");
      /*
        Die Arten als Paar: Wer nur eine schickt, wird mit der gespeicherten
        anderen geprüft – sonst entstünden über zwei Aufrufe zwei Glanzarten.
        Ein fremder Eintrag fällt dabei wie unten als NOT_FOUND heraus.
      */
      let kinds: ReturnType<typeof storedTextureKinds> | undefined;
      if (kind !== undefined || secondKind !== undefined) {
        const stored = await findCustomTextureInScope(scope, id);
        if (!stored)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Oberfläche nicht gefunden",
          });
        kinds = textureKindData(
          kind ?? stored.kind,
          secondKind !== undefined ? secondKind : stored.secondKind
        );
      }
      const data = {
        ...(name !== undefined ? { name } : {}),
        ...kinds,
      };
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
