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
  containerTypeBelongsToUser,
  storageBoxBelongsToUser,
  updateMaterial,
} from "./queries/filament";
import { lagerBelongsToUser } from "./queries/lager";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT")
  .nullable()
  .optional();

const materialInput = z.object({
  /** Pflicht: Ein Material liegt immer in genau einem Lager. */
  lagerId: z.number().int().positive("Bitte ein Lager wählen"),
  name: z.string().min(1, "Name ist erforderlich"),
  identifier: z.string().max(50).nullable().optional(),
  materialType: z.string().min(1, "Materialart ist erforderlich"),
  manufacturer: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  /** Oberfläche als Freitext („Matt", „Silk") – Vorschläge im Formular */
  texture: z.string().max(100).nullable().optional(),
  priceCents: z.number().int().min(0).nullable().optional(),
  purchaseDate: dateString,
  nominalWeight: z.number().int().positive("Nennmenge muss > 0 sein"),
  /**
   * Dichte in Gramm je Liter, nur für die Zweitanzeige. Die Obergrenze ist
   * großzügig: Metallpulver liegt weit über Kunststoff.
   */
  densityGramsPerLiter: z
    .number()
    .int()
    .positive()
    .max(25000, "Dichte ist unplausibel hoch")
    .nullable()
    .optional(),
  containerTypeId: z.number().int().positive().nullable().optional(),
  containerPresetVariantId: z.number().int().positive().nullable().optional(),
  storageBoxId: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/**
 * Einzige Stelle, an der die Gebindeauswahl geprüft wird: entweder eine eigene
 * Gebindeart oder eine Variante aus dem Preset-Katalog, nie beides. Geprüft
 * wird immer der Zustand *nach* dem Patch, sonst könnte man über eine
 * Teilaktualisierung beide Felder gleichzeitig belegen.
 */
async function validateForeignKeys(
  userId: number,
  containerTypeId?: number | null,
  containerPresetVariantId?: number | null,
  storageBoxId?: number | null,
  lagerId?: number | null
) {
  /*
    Das Lager zuerst: Ohne gültiges Lager hat das Material keinen Ort, und die
    Materialart – die über Felder und Zweitanzeige entscheidet – wäre unbekannt.

    Eine Konsistenzprüfung zwischen Material und Lager gibt es bewusst nicht:
    Materialart und Filamentstärke stehen **nur** am Lager, es kann also nichts
    auseinanderlaufen. Genau das ist der Gewinn dieser Modellierung.
  */
  if (lagerId != null && !(await lagerBelongsToUser(userId, lagerId))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Ungültiges Lager" });
  }
  if (containerTypeId != null && containerPresetVariantId != null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Bitte entweder eine eigene Gebindeart oder ein Gebinde aus dem Katalog wählen.",
    });
  }
  if (
    containerTypeId != null &&
    !(await containerTypeBelongsToUser(userId, containerTypeId))
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Ungültige Gebindeart",
    });
  }
  if (
    containerPresetVariantId != null &&
    !(await presetVariantIsSelectable(containerPresetVariantId))
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Ungültiges Gebinde aus dem Katalog",
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
  /**
   * Materialien des Benutzers, auf Wunsch auf ein Lager eingeschränkt.
   *
   * Ohne `lagerId` kommt der gesamte Bestand – die Schnellsuche braucht das,
   * sie soll über alle Lager finden. Die Übersicht schickt das gewählte Lager
   * mit.
   */
  list: authedQuery
    .input(
      z.object({ lagerId: z.number().int().positive().optional() }).optional()
    )
    .query(({ ctx, input }) =>
      findMaterialsByUser(ctx.user.id, ctx.language, input?.lagerId)
    ),

  byId: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const material = await findMaterialById(
        ctx.user.id,
        input.id,
        ctx.language
      );
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
        /** Optionale Erstwägung (Bruttogewicht inkl. Gebinde/Box) beim Kauf */
        initialGrossWeight: z.number().int().positive().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { initialGrossWeight, ...data } = input;
      await validateForeignKeys(
        ctx.user.id,
        data.containerTypeId,
        data.containerPresetVariantId,
        data.storageBoxId,
        data.lagerId
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
      const nextContainerTypeId =
        data.containerTypeId !== undefined
          ? data.containerTypeId
          : existing.containerTypeId;
      const nextPresetVariantId =
        data.containerPresetVariantId !== undefined
          ? data.containerPresetVariantId
          : existing.containerPresetVariantId;
      await validateForeignKeys(
        ctx.user.id,
        nextContainerTypeId,
        nextPresetVariantId,
        data.storageBoxId,
        data.lagerId
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
      // Einmal vorab statt je Position – es ist für alle dasselbe Lager.
      await validateForeignKeys(ctx.user.id, null, null, null, input.lagerId);
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
            lagerId: input.lagerId,
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

  /** Neue Wägung: gemessenes Bruttogewicht (Material + Gebinde + ggf. Box) */
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
