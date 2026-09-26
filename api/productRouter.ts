import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  COMMON_MATERIAL_TYPES,
  canonicalMaterialType,
} from "@contracts/materials";
import {
  MAX_PRINT_NOTES_LENGTH,
  hasPrintSettings,
  printSettingsSchema,
} from "@contracts/printSettings";
import { createRouter, authedQuery } from "./middleware";
import { resolveScope, scopeInput } from "./scope";
import { productFields } from "./materialRouter";
import { findGebindeOfProduct } from "./queries/filament";
import {
  PRODUCT_GONE,
  findMaterialTypesInScope,
  findPrintSettings,
  findProductLagerKinds,
  findProductRowInScope,
  findProductsInScope,
  mergeProducts,
  savePrintSettings,
  updateProduct,
} from "./queries/products";
import { getDb } from "./queries/connection";

/**
 * Materialien – das Produkt über den Gebinden, seit 4.0.0.
 *
 * Achtung, Namen: Der Router heißt `product`, weil `material` seit jeher die
 * Gebinde führt (Tabelle `materials`). In der Oberfläche ist es umgekehrt;
 * die Abbildung steht in `AGENTS.md` unter „Material und Gebinde“.
 *
 * Anlegen gibt es hier nicht: Ein Material entsteht mit seinem ersten Gebinde
 * (`material.create` ohne `productId`) und verschwindet mit seinem letzten.
 * Stufen wie beim Gebinde – `viewer` liest, `editor` schreibt.
 */

const idInput = z.object({
  id: z.number().int().positive(),
  ...scopeInput.shape,
});

export const productRouter = createRouter({
  /**
   * Alle Materialien des Bereichs mit Materialart, Stärke und Anzahl der
   * Gebinde – für die Auswahl im Formular und die Vorschläge zum
   * Zusammenführen (`mergeCandidates` rechnet der Browser).
   */
  list: authedQuery.input(scopeInput).query(async ({ ctx, input }) => {
    const scope = await resolveScope(
      ctx.user.id,
      input.organizationId,
      "viewer"
    );
    return findProductsInScope(scope);
  }),

  /** Ein Material mit **allen** seinen Gebinden über alle Lager und dem Bestand */
  byId: authedQuery.input(idInput).query(async ({ ctx, input }) => {
    const scope = await resolveScope(
      ctx.user.id,
      input.organizationId,
      "viewer"
    );
    const product = await findProductRowInScope(scope, input.id);
    if (!product) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Material nicht gefunden",
      });
    }
    const { gebinde, stock } = await findGebindeOfProduct(
      scope,
      input.id,
      ctx.language
    );
    const first = gebinde.find(g => g.lager != null)?.lager ?? null;
    return {
      ...product,
      kind: first?.materialKind ?? null,
      diameterUm: first?.filamentDiameterUm ?? null,
      gebinde,
      stock,
      /** Druckeinstellungen (seit 4.1.0), `null` = keine hinterlegt */
      printSettings: await findPrintSettings(input.id),
    };
  }),

  /** Ändert das Material – und damit alle seine Gebinde. */
  update: authedQuery
    .input(
      z
        .object(productFields)
        .extend({ notes: z.string().max(5000).nullable() })
        .partial()
        .extend(idInput.shape)
    )
    .mutation(async ({ ctx, input }) => {
      const { id, organizationId, ...data } = input;
      const scope = await resolveScope(ctx.user.id, organizationId, "editor");
      if (!(await findProductRowInScope(scope, id))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Material nicht gefunden",
        });
      }
      const materialType =
        data.materialType !== undefined
          ? canonicalMaterialType(data.materialType, [
              ...COMMON_MATERIAL_TYPES,
              ...(await findMaterialTypesInScope(scope)),
            ])
          : undefined;
      await updateProduct(getDb(), scope, id, { ...data, materialType });
      return { ok: true };
    }),

  /**
   * Druckeinstellungen setzen oder – mit `settings: null` – entfernen.
   *
   * Die Materialart der Einstellungen muss die des Materials sein, und die
   * steht am Lager seiner Gebinde. Sonst stünden an einem Harz Düsen- und
   * Betttemperaturen, die niemand mehr sieht, weil die Karte nach der Art des
   * Materials zeichnet.
   */
  setPrintSettings: authedQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        settings: printSettingsSchema.nullable(),
        notes: z.string().max(MAX_PRINT_NOTES_LENGTH).nullable(),
        ...scopeInput.shape,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "editor"
      );
      if (!(await findProductRowInScope(scope, input.id))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Material nicht gefunden",
        });
      }
      const kinds = await findProductLagerKinds(input.id);
      if (
        input.settings &&
        kinds.length > 0 &&
        kinds.some(k => k.kind !== input.settings!.kind)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Die Druckeinstellungen passen nicht zur Materialart des Lagers.",
        });
      }
      const notes = input.notes?.trim() || null;
      const empty = !hasPrintSettings(input.settings, notes);
      const saved = await savePrintSettings(
        scope,
        input.id,
        empty
          ? null
          : {
              settings: input.settings ?? {
                kind: kinds[0]?.kind ?? "filament",
              },
              notes,
            }
      );
      if (!saved) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Material nicht gefunden",
        });
      }
      return { ok: true };
    }),

  /**
   * Führt `sourceId` in `targetId` zusammen: Alle Gebinde wandern zum Ziel,
   * das leere Material wird gelöscht. Nur zwischen Materialien, deren Gebinde
   * in Lagern gleicher Art und Stärke liegen.
   */
  merge: authedQuery
    .input(
      z.object({
        sourceId: z.number().int().positive(),
        targetId: z.number().int().positive(),
        ...scopeInput.shape,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "editor"
      );
      if (input.sourceId === input.targetId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Ein Material lässt sich nicht mit sich selbst zusammenführen.",
        });
      }
      const [source, target] = await Promise.all([
        findProductRowInScope(scope, input.sourceId),
        findProductRowInScope(scope, input.targetId),
      ]);
      if (!source || !target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Material nicht gefunden",
        });
      }
      const kinds = (
        await Promise.all([
          findProductLagerKinds(input.sourceId),
          findProductLagerKinds(input.targetId),
        ])
      ).flat();
      const distinct = new Set(
        kinds.map(k => `${k.kind}|${k.diameterUm ?? ""}`)
      );
      if (distinct.size > 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Die beiden Materialien liegen in Lagern mit verschiedener Materialart oder Filamentstärke und lassen sich nicht zusammenführen.",
        });
      }
      try {
        const moved = await mergeProducts(
          scope,
          input.sourceId,
          input.targetId
        );
        return { moved };
      } catch (error) {
        if (error instanceof Error && error.message === PRODUCT_GONE) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Material nicht gefunden",
          });
        }
        throw error;
      }
    }),
});
