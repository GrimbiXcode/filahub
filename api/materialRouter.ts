import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { importManyInputSchema } from "@contracts/import";
import { createRouter, authedQuery } from "./middleware";
import {
  addWeighing,
  createMaterial,
  deleteMaterial,
  deleteWeighing,
  findMaterialById,
  findMaterialsByUser,
  findRecentWeighings,
  findWeighing,
  materialBelongsToUser,
  presetVariantIsSelectable,
  spoolTypeBelongsToUser,
  storageBoxBelongsToUser,
  updateMaterial,
} from "./queries/filament";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT")
  .nullable()
  .optional();

const materialInput = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  identifier: z.string().max(50).nullable().optional(),
  materialType: z.string().min(1, "Materialart ist erforderlich"),
  manufacturer: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  priceCents: z.number().int().min(0).nullable().optional(),
  purchaseDate: dateString,
  nominalWeight: z.number().int().positive("Nennmenge muss > 0 sein"),
  spoolTypeId: z.number().int().positive().nullable().optional(),
  spoolPresetVariantId: z.number().int().positive().nullable().optional(),
  storageBoxId: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/**
 * Einzige Stelle, an der die Rollenauswahl geprüft wird: entweder ein eigener
 * Rollentyp oder eine Variante aus dem Preset-Katalog, nie beides. Geprüft
 * wird immer der Zustand *nach* dem Patch, sonst könnte man über eine
 * Teilaktualisierung beide Felder gleichzeitig belegen.
 */
async function validateForeignKeys(
  userId: number,
  spoolTypeId?: number | null,
  spoolPresetVariantId?: number | null,
  storageBoxId?: number | null
) {
  if (spoolTypeId != null && spoolPresetVariantId != null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Bitte entweder einen eigenen Rollentyp oder eine Rolle aus dem Katalog wählen.",
    });
  }
  if (
    spoolTypeId != null &&
    !(await spoolTypeBelongsToUser(userId, spoolTypeId))
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Ungültiger Rollentyp",
    });
  }
  if (
    spoolPresetVariantId != null &&
    !(await presetVariantIsSelectable(spoolPresetVariantId))
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Ungültige Rolle aus dem Katalog",
    });
  }
  if (
    storageBoxId != null &&
    !(await storageBoxBelongsToUser(userId, storageBoxId))
  ) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Ungültige Lagerbox" });
  }
}

export const materialRouter = createRouter({
  list: authedQuery.query(({ ctx }) => findMaterialsByUser(ctx.user.id)),

  byId: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const material = await findMaterialById(ctx.user.id, input.id);
      if (!material)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Material nicht gefunden",
        });
      return material;
    }),

  recentWeighings: authedQuery.query(({ ctx }) =>
    findRecentWeighings(ctx.user.id, 10)
  ),

  create: authedQuery
    .input(
      materialInput.extend({
        /** Optionale Erstwägung (Bruttogewicht inkl. Rolle/Box) beim Kauf */
        initialGrossWeight: z.number().int().positive().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { initialGrossWeight, ...data } = input;
      await validateForeignKeys(
        ctx.user.id,
        data.spoolTypeId,
        data.spoolPresetVariantId,
        data.storageBoxId
      );
      const id = await createMaterial(
        {
          ...data,
          identifier: data.identifier ?? undefined,
          manufacturer: data.manufacturer ?? undefined,
          color: data.color ?? undefined,
          notes: data.notes ?? undefined,
          userId: ctx.user.id,
        },
        initialGrossWeight
      );
      return { id };
    }),

  update: authedQuery
    .input(materialInput.partial().extend({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await findMaterialById(ctx.user.id, id);
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Material nicht gefunden",
        });
      }
      // Effektiven Zustand nach dem Patch prüfen, nicht nur die gesendeten Felder
      const nextSpoolTypeId =
        data.spoolTypeId !== undefined
          ? data.spoolTypeId
          : existing.spoolTypeId;
      const nextPresetVariantId =
        data.spoolPresetVariantId !== undefined
          ? data.spoolPresetVariantId
          : existing.spoolPresetVariantId;
      await validateForeignKeys(
        ctx.user.id,
        nextSpoolTypeId,
        nextPresetVariantId,
        data.storageBoxId
      );
      await updateMaterial(ctx.user.id, id, data);
      return { ok: true };
    }),

  delete: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (!(await materialBelongsToUser(ctx.user.id, input.id))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Material nicht gefunden",
        });
      }
      await deleteMaterial(ctx.user.id, input.id);
      return { ok: true };
    }),

  /** Massenimport: erzeugt pro Position `anzahl` identische Materialien. */
  importMany: authedQuery
    .input(importManyInputSchema)
    .mutation(async ({ ctx, input }) => {
      const gesamt = input.items.reduce(
        (summe, item) => summe + item.anzahl,
        0
      );
      if (gesamt > 200) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Maximal 200 Datensätze pro Import",
        });
      }
      let created = 0;
      for (const item of input.items) {
        // Bezeichnung aus Hersteller + Typ + Farbe (wie buildAutoName im Formular)
        const name = [item.hersteller, item.typ, item.farbe]
          .map(s => s?.trim())
          .filter(Boolean)
          .join(" ");
        for (let i = 0; i < item.anzahl; i++) {
          await createMaterial({
            userId: ctx.user.id,
            name,
            materialType: item.typ,
            manufacturer: item.hersteller || undefined,
            color: item.farbe || undefined,
            priceCents: item.priceCents ?? undefined,
            purchaseDate: input.purchaseDate ?? undefined,
            nominalWeight: item.nenngewicht,
          });
          created++;
        }
      }
      return { created };
    }),

  /** Neue Wägung: gemessenes Bruttogewicht (Material + Rolle + ggf. Box) */
  addWeighing: authedQuery
    .input(
      z.object({
        materialId: z.number().int().positive(),
        grossWeight: z.number().int().positive("Gewicht muss > 0 sein"),
        weighedAt: z.date().optional(),
        note: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!(await materialBelongsToUser(ctx.user.id, input.materialId))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Material nicht gefunden",
        });
      }
      return addWeighing(input);
    }),

  deleteWeighing: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const weighing = await findWeighing(input.id);
      if (
        !weighing ||
        !(await materialBelongsToUser(ctx.user.id, weighing.materialId))
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Wägung nicht gefunden",
        });
      }
      await deleteWeighing(input.id);
      return { ok: true };
    }),
});
