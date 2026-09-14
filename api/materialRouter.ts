import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { importManyInputSchema } from "@contracts/import";
import {
  WEIGHING_CORRECTION_MINUTES,
  mayDeleteWeighing,
  roleAllows,
} from "@contracts/organizations";
import {
  MAX_MATERIALS_PER_LAGER,
  MAX_WEIGHINGS_PER_MATERIAL,
} from "@contracts/limits";
import { createRouter, authedQuery, rateLimited } from "./middleware";
import { assertWithinLimit } from "./lib/quota";
import { resolveScope, scopeInput, scopeRole, type Scope } from "./scope";
import {
  addWeighing,
  countWeighingsForMaterial,
  createMaterial,
  deleteMaterial,
  deleteWeighing,
  findLatestWeighingId,
  findMaterialInScope,
  findMaterialsInScope,
  findRecentWeighings,
  findWeighing,
  materialInScope,
  presetVariantIsSelectable,
  containerTypeInScope,
  storageBoxInScope,
  updateMaterial,
} from "./queries/filament";
import { countMaterialsInLager, lagerInScope } from "./queries/lager";

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
  scope: Scope,
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
  if (lagerId != null && !(await lagerInScope(scope, lagerId))) {
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
    !(await containerTypeInScope(scope, containerTypeId))
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
  if (storageBoxId != null && !(await storageBoxInScope(scope, storageBoxId))) {
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
    /*
      Ohne `lagerId` liefert die Prozedur den **gesamten** Bestand – so füttert
      die Schnellsuche (Strg/⌘ + K) ihre Trefferliste. Das macht sie zur
      teuersten Leseprozedur überhaupt und damit zu der, mit der sich eine
      Instanz am billigsten beschäftigen lässt. Die Grenze ist weit genug, dass
      auch hektisches Tippen nicht anstößt.
    */
    .use(
      rateLimited({
        key: "material.list",
        limit: 240,
        windowMs: 60_000,
        by: "user",
      })
    )
    .input(
      z.object({
        lagerId: z.number().int().positive().optional(),
        ...scopeInput.shape,
      })
    )
    .query(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "viewer"
      );
      return findMaterialsInScope(scope, ctx.language, input.lagerId);
    }),

  byId: authedQuery
    .input(z.object({ id: z.number().int().positive(), ...scopeInput.shape }))
    .query(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "viewer"
      );
      const material = await findMaterialInScope(scope, input.id, ctx.language);
      if (!material)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Material nicht gefunden",
        });
      return material;
    }),

  recentWeighings: authedQuery
    .input(scopeInput)
    .query(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "viewer"
      );
      return findRecentWeighings(scope, 10);
    }),

  create: authedQuery
    .use(
      rateLimited({
        key: "material.create",
        limit: 60,
        windowMs: 60_000,
        by: "user",
      })
    )
    .input(
      materialInput.extend({
        /** Optionale Erstwägung (Bruttogewicht inkl. Gebinde/Box) beim Kauf */
        initialGrossWeight: z.number().int().positive().nullable().optional(),
        ...scopeInput.shape,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { initialGrossWeight, organizationId, ...data } = input;
      const scope = await resolveScope(ctx.user.id, organizationId, "editor");
      await validateForeignKeys(
        scope,
        data.containerTypeId,
        data.containerPresetVariantId,
        data.storageBoxId,
        data.lagerId
      );
      /*
        Erst nach `validateForeignKeys`: Das Lager muss zum Bereich gehören,
        bevor seine Belegung gezählt wird – sonst verriete die Meldung „Lager
        ist voll“ die Existenz eines fremden Lagers.
      */
      assertWithinLimit({
        current: await countMaterialsInLager(data.lagerId),
        max: MAX_MATERIALS_PER_LAGER,
        quota: "materials_per_lager",
        message: `Dieses Lager fasst ${MAX_MATERIALS_PER_LAGER} Materialien. Bitte Verbrauchtes löschen oder ein weiteres Lager anlegen.`,
        actorUserId: ctx.user.id,
        ip: ctx.clientIp,
      });
      const id = await createMaterial(
        scope,
        {
          ...data,
          identifier: data.identifier ?? undefined,
          manufacturer: data.manufacturer ?? undefined,
          color: data.color ?? undefined,
          notes: data.notes ?? undefined,
        },
        initialGrossWeight
      );
      return { id };
    }),

  update: authedQuery
    .input(
      materialInput
        .partial()
        .extend({ id: z.number().int().positive(), ...scopeInput.shape })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, organizationId, ...data } = input;
      const scope = await resolveScope(ctx.user.id, organizationId, "editor");
      const existing = await findMaterialInScope(scope, id);
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
        scope,
        nextContainerTypeId,
        nextPresetVariantId,
        data.storageBoxId,
        data.lagerId
      );
      await updateMaterial(scope, id, data);
      return { ok: true };
    }),

  delete: authedQuery
    .input(z.object({ id: z.number().int().positive(), ...scopeInput.shape }))
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "editor"
      );
      if (!(await materialInScope(scope, input.id))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Material nicht gefunden",
        });
      }
      await deleteMaterial(scope, input.id);
      return { ok: true };
    }),

  /** Massenimport: erzeugt pro Position `anzahl` identische Materialien. */
  importMany: authedQuery
    /*
      Ein Aufruf legt bis zu 200 Zeilen an – die Prozedur mit dem größten
      Hebel überhaupt. Fünf in der Stunde reichen für jede Umzugsaktion aus
      einer Tabellenkalkulation und für nichts sonst.
    */
    .use(
      rateLimited({
        key: "material.import",
        limit: 5,
        windowMs: 60 * 60_000,
        by: "user",
      })
    )
    .input(importManyInputSchema.extend(scopeInput.shape))
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "editor"
      );
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
      await validateForeignKeys(scope, null, null, null, input.lagerId);
      /*
        Die Obergrenze **vor** der Schleife und für den ganzen Stapel: Ein
        Abbruch mittendrin hinterließe einen halben Import, den niemand
        zuordnen kann. Entweder passt alles hinein oder nichts.
      */
      assertWithinLimit({
        current: await countMaterialsInLager(input.lagerId),
        max: MAX_MATERIALS_PER_LAGER,
        adding: gesamt,
        quota: "materials_per_lager",
        message: `Dieses Lager fasst ${MAX_MATERIALS_PER_LAGER} Materialien; der Import würde das überschreiten. Bitte in kleineren Schritten importieren oder ein weiteres Lager anlegen.`,
        actorUserId: ctx.user.id,
        ip: ctx.clientIp,
      });
      let created = 0;
      for (const item of input.items) {
        // Bezeichnung aus Hersteller + Typ + Farbe (wie buildAutoName im Formular)
        const name = [item.hersteller, item.typ, item.farbe]
          .map(s => s?.trim())
          .filter(Boolean)
          .join(" ");
        for (let i = 0; i < item.anzahl; i++) {
          await createMaterial(scope, {
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
    .use(
      rateLimited({
        key: "material.addWeighing",
        limit: 120,
        windowMs: 60_000,
        by: "user",
      })
    )
    .input(
      z.object({
        materialId: z.number().int().positive(),
        grossWeight: z.number().int().positive("Gewicht muss > 0 sein"),
        weighedAt: z.date().optional(),
        note: z.string().max(500).optional(),
        ...scopeInput.shape,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId, ...data } = input;
      /*
        `weigher` und nicht `editor`: Wiegen ist das Abbuchen von Material und
        die häufigste Handlung überhaupt. Wer es darf, muss deshalb nicht auch
        Material anlegen oder löschen dürfen – genau dafür gibt es die Stufe.
      */
      const scope = await resolveScope(ctx.user.id, organizationId, "weigher");
      if (!(await materialInScope(scope, data.materialId))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Material nicht gefunden",
        });
      }
      assertWithinLimit({
        current: await countWeighingsForMaterial(data.materialId),
        max: MAX_WEIGHINGS_PER_MATERIAL,
        quota: "weighings_per_material",
        message: `Für dieses Material sind bereits ${MAX_WEIGHINGS_PER_MATERIAL} Wägungen erfasst. Bitte alte Einträge entfernen.`,
        actorUserId: ctx.user.id,
        ip: ctx.clientIp,
      });
      return addWeighing(data);
    }),

  deleteWeighing: authedQuery
    .input(z.object({ id: z.number().int().positive(), ...scopeInput.shape }))
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "weigher"
      );
      const weighing = await findWeighing(input.id);
      if (!weighing || !(await materialInScope(scope, weighing.materialId))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Wägung nicht gefunden",
        });
      }
      /*
        Ab hier steht fest, dass die Wägung im Bereich liegt – die beiden
        Meldungen unten verraten also nichts, was der Aufrufer nicht ohnehin
        sieht. Deshalb dürfen sie den Grund nennen, statt „nicht gefunden“ zu
        behaupten.

        Ein `weigher` darf **korrigieren, nicht aufräumen**: die zuletzt
        erfasste Wägung, solange sie frisch ist. Die Regel selbst steht in
        `contracts/organizations.ts`, weil die Oberfläche dieselbe braucht, um
        den Knopf auszublenden.
      */
      const role = scopeRole(scope);
      if (!roleAllows(role, "editor")) {
        const latestId = await findLatestWeighingId(weighing.materialId);
        if (weighing.id !== latestId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Nur die zuletzt erfasste Wägung lässt sich so entfernen. Ältere Einträge kann bereinigen, wer Material erfassen darf.",
          });
        }
        if (!mayDeleteWeighing(role, weighing, latestId)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Diese Wägung ist älter als ${WEIGHING_CORRECTION_MINUTES} Minuten. Nur wer Material erfassen darf, kann sie noch löschen.`,
          });
        }
      }
      await deleteWeighing(input.id);
      return { ok: true };
    }),
});
