import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  PRESET_PROPOSAL_STATUSES,
  SPOOL_MATERIALS,
  manufacturerFieldsSchema,
  materialTypesSchema,
  nameI18nInputSchema,
  proposalPayloadSchema,
  seriesFieldsSchema,
  slugify,
  variantFieldsSchema,
  type ProposalPayload,
} from "@contracts/presets";
import { adminQuery, createRouter } from "./middleware";
import { recordAudit } from "./queries/audit";
import { countMaterialsWithPresetVariant } from "./queries/filament";
import {
  countAllTables,
  getDatabaseInfo,
  getSchemaMigrations,
  getSeedInfo,
} from "./queries/systemStatus";
import {
  closeProposal,
  countCatalogChildren,
  createVariant,
  deleteManufacturer,
  deleteSeries,
  deleteVariant,
  deleteVersion,
  findCatalogTree,
  findOrCreateManufacturer,
  findOrCreateSeries,
  findOrCreateVersion,
  findProposal,
  findProposalsForReview,
  findVariantByNominalWeight,
  findVariantById,
  setSeriesMaterialTypes,
  updateManufacturer,
  updateSeries,
  updateVariant,
  updateVersion,
} from "./queries/presets";

const idInput = z.object({ id: z.number().int().positive() });

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT")
  .nullable()
  .optional();

/**
 * Wendet einen angenommenen Vorschlag auf den Katalog an.
 *
 * Läuft bewusst ohne Transaktion: Jeder Schritt ist über seinen natürlichen
 * Schlüssel idempotent und der Statuswechsel des Vorschlags kommt zuletzt.
 * Bricht die Freigabe mittendrin ab, bleibt der Vorschlag „pending“ und ein
 * erneuter Versuch führt zum selben Endzustand. Postgres könnte hier eine
 * Transaktion aufspannen – die Idempotenz deckt zusätzlich den Fall ab, dass
 * zwei Administratoren gleichzeitig freigeben.
 */
async function applyProposal(
  payload: ProposalPayload,
  targetId: number | null
): Promise<number> {
  if (payload.kind === "new") {
    const manufacturer = await findOrCreateManufacturer({
      slug: slugify(payload.manufacturer.name),
      name: payload.manufacturer.name,
      website: payload.manufacturer.website ?? null,
      source: "community",
    });
    const series = await findOrCreateSeries({
      manufacturerId: manufacturer.id,
      slug: slugify(payload.series.name),
      name: payload.series.name,
      nameI18n: payload.series.nameI18n ?? null,
      source: "community",
    });
    if (payload.series.materialTypes.length > 0) {
      await setSeriesMaterialTypes(series.id, payload.series.materialTypes);
    }
    const version = await findOrCreateVersion({
      seriesId: series.id,
      slug: slugify(payload.version.name),
      name: payload.version.name,
      nameI18n: payload.version.nameI18n ?? null,
      spoolMaterial: payload.version.spoolMaterial ?? null,
      validFrom: payload.version.validFrom ?? null,
      validTo: payload.version.validTo ?? null,
      source: "community",
    });
    const existing = await findVariantByNominalWeight(
      version.id,
      payload.variant.nominalWeight
    );
    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Diese Variante existiert bereits im Katalog. Bitte als Änderungsvorschlag behandeln.",
      });
    }
    const variant = await createVariant({
      versionId: version.id,
      nominalWeight: payload.variant.nominalWeight,
      tareWeight: payload.variant.tareWeight,
      outerDiameterMm: payload.variant.outerDiameterMm ?? null,
      widthMm: payload.variant.widthMm ?? null,
      boreDiameterMm: payload.variant.boreDiameterMm ?? null,
      notes: payload.variant.notes ?? null,
      source: "community",
    });
    return variant.id;
  }

  if (targetId == null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Dem Änderungsvorschlag fehlt der Bezug zum Katalogeintrag.",
    });
  }

  switch (payload.scope) {
    case "manufacturer":
      await updateManufacturer(targetId, payload.patch, "community");
      return targetId;
    case "series": {
      const { materialTypes, ...rest } = payload.patch;
      await updateSeries(targetId, rest, "community");
      if (materialTypes) await setSeriesMaterialTypes(targetId, materialTypes);
      return targetId;
    }
    case "version":
      await updateVersion(targetId, payload.patch, "community");
      return targetId;
    case "variant":
      await updateVariant(targetId, payload.patch, "community");
      return targetId;
  }
}

const presetAdminRouter = createRouter({
  /** Kompletter Katalog inkl. deaktivierter Einträge */
  tree: adminQuery.query(({ ctx }) =>
    findCatalogTree(ctx.user.id, { includeInactive: true })
  ),

  createManufacturer: adminQuery
    .input(manufacturerFieldsSchema)
    .mutation(({ input }) =>
      findOrCreateManufacturer({
        slug: slugify(input.name),
        name: input.name,
        website: input.website ?? null,
      })
    ),

  updateManufacturer: adminQuery
    .input(
      manufacturerFieldsSchema.partial().extend(idInput.shape).extend({
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updated = await updateManufacturer(id, data);
      if (!updated)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Hersteller nicht gefunden",
        });
      return updated;
    }),

  deleteManufacturer: adminQuery.input(idInput).mutation(async ({ input }) => {
    const children = await countCatalogChildren("manufacturer", input.id);
    if (children > 0) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Dieser Hersteller hat noch ${children} Serie(n). Bitte diese zuerst entfernen oder den Hersteller deaktivieren.`,
      });
    }
    await deleteManufacturer(input.id);
    return { ok: true };
  }),

  createSeries: adminQuery
    .input(
      seriesFieldsSchema.extend({ manufacturerId: z.number().int().positive() })
    )
    .mutation(async ({ input }) => {
      const series = await findOrCreateSeries({
        manufacturerId: input.manufacturerId,
        slug: slugify(input.name),
        name: input.name,
        nameI18n: input.nameI18n ?? null,
      });
      await setSeriesMaterialTypes(series.id, input.materialTypes);
      return series;
    }),

  updateSeries: adminQuery
    .input(
      seriesFieldsSchema
        .partial()
        .extend(idInput.shape)
        .extend({ active: z.boolean().optional() })
    )
    .mutation(async ({ input }) => {
      const { id, materialTypes, ...data } = input;
      const updated = await updateSeries(id, data);
      if (!updated)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Serie nicht gefunden",
        });
      if (materialTypes) await setSeriesMaterialTypes(id, materialTypes);
      return updated;
    }),

  deleteSeries: adminQuery.input(idInput).mutation(async ({ input }) => {
    const children = await countCatalogChildren("series", input.id);
    if (children > 0) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Diese Serie hat noch ${children} Ausführung(en). Bitte diese zuerst entfernen oder die Serie deaktivieren.`,
      });
    }
    await deleteSeries(input.id);
    return { ok: true };
  }),

  setMaterialTypes: adminQuery
    .input(
      z.object({
        seriesId: z.number().int().positive(),
        materialTypes: materialTypesSchema,
      })
    )
    .mutation(async ({ input }) => {
      await setSeriesMaterialTypes(input.seriesId, input.materialTypes);
      return { ok: true };
    }),

  createVersion: adminQuery
    .input(
      z.object({
        seriesId: z.number().int().positive(),
        name: z.string().trim().min(1, "Bezeichnung ist erforderlich").max(255),
        nameI18n: nameI18nInputSchema,
        spoolMaterial: z.enum(SPOOL_MATERIALS).nullable().optional(),
        validFrom: isoDate,
        validTo: isoDate,
      })
    )
    .mutation(({ input }) =>
      findOrCreateVersion({
        seriesId: input.seriesId,
        slug: slugify(input.name),
        name: input.name,
        nameI18n: input.nameI18n ?? null,
        spoolMaterial: input.spoolMaterial ?? null,
        validFrom: input.validFrom ?? null,
        validTo: input.validTo ?? null,
      })
    ),

  updateVersion: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1).max(255).optional(),
        nameI18n: nameI18nInputSchema,
        spoolMaterial: z.enum(SPOOL_MATERIALS).nullable().optional(),
        validFrom: isoDate,
        validTo: isoDate,
        notes: z.string().max(2000).nullable().optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updated = await updateVersion(id, data);
      if (!updated)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ausführung nicht gefunden",
        });
      return updated;
    }),

  deleteVersion: adminQuery.input(idInput).mutation(async ({ input }) => {
    const children = await countCatalogChildren("version", input.id);
    if (children > 0) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Diese Ausführung hat noch ${children} Variante(n). Bitte diese zuerst entfernen oder die Ausführung deaktivieren.`,
      });
    }
    await deleteVersion(input.id);
    return { ok: true };
  }),

  createVariant: adminQuery
    .input(
      variantFieldsSchema.and(
        z.object({ versionId: z.number().int().positive() })
      )
    )
    .mutation(async ({ input }) => {
      const existing = await findVariantByNominalWeight(
        input.versionId,
        input.nominalWeight
      );
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Für dieses Nenngewicht gibt es in dieser Ausführung bereits eine Variante.",
        });
      }
      return createVariant(input);
    }),

  updateVariant: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        nominalWeight: z.number().int().positive().max(20000).optional(),
        tareWeight: z.number().int().min(0).max(5000).optional(),
        outerDiameterMm: z
          .number()
          .int()
          .min(50)
          .max(400)
          .nullable()
          .optional(),
        widthMm: z.number().int().min(10).max(200).nullable().optional(),
        boreDiameterMm: z.number().int().min(10).max(200).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const current = await findVariantById(id);
      if (!current)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Variante nicht gefunden",
        });
      const nominalWeight = data.nominalWeight ?? current.nominalWeight;
      const tareWeight = data.tareWeight ?? current.tareWeight;
      if (tareWeight >= nominalWeight) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Das Leergewicht muss kleiner als das Nenngewicht sein",
        });
      }
      return updateVariant(id, data);
    }),

  /**
   * Löschen ist nur erlaubt, solange kein Material die Variante nutzt – ohne
   * Fremdschlüssel in der Datenbank würde sonst still die Tara verloren gehen
   * und alle Restmengen der betroffenen Materialien nach oben springen.
   */
  deleteVariant: adminQuery.input(idInput).mutation(async ({ input }) => {
    const used = await countMaterialsWithPresetVariant(input.id);
    if (used > 0) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Diese Rolle wird noch von ${used} Material(ien) verwendet. Sie kann nur deaktiviert werden.`,
      });
    }
    await deleteVariant(input.id);
    return { ok: true };
  }),
});

const proposalAdminRouter = createRouter({
  list: adminQuery
    .input(
      z
        .object({
          status: z.enum(PRESET_PROPOSAL_STATUSES).optional(),
          limit: z.number().int().min(1).max(200).default(100),
        })
        .default({ limit: 100 })
    )
    .query(({ input }) => findProposalsForReview(input.status, input.limit)),

  approve: adminQuery.input(idInput).mutation(async ({ ctx, input }) => {
    const proposal = await findProposal(input.id);
    if (!proposal) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Vorschlag nicht gefunden",
      });
    }
    if (proposal.status !== "pending") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Der Vorschlag wurde bereits bearbeitet.",
      });
    }
    const payload = proposalPayloadSchema.safeParse(proposal.payload);
    if (!payload.success) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Der Vorschlag ist nicht mehr mit dem aktuellen Schema kompatibel und muss neu eingereicht werden.",
      });
    }
    const resultId = await applyProposal(payload.data, proposal.targetId);
    const closed = await closeProposal(input.id, {
      status: "approved",
      reviewedBy: ctx.user.id,
      resultId,
    });
    if (!closed) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Der Vorschlag wurde zwischenzeitlich bearbeitet.",
      });
    }
    recordAudit({
      event: "proposal.approved",
      actorUserId: ctx.user.id,
      subjectUserId: proposal.userId,
      ip: ctx.clientIp,
      detail: { proposalId: input.id, resultId },
    });
    return { ok: true, resultId };
  }),

  reject: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        reason: z
          .string()
          .trim()
          .min(1, "Bitte eine Begründung für die Ablehnung angeben")
          .max(1000, "Begründung darf höchstens 1000 Zeichen haben"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const closed = await closeProposal(input.id, {
        status: "rejected",
        reviewedBy: ctx.user.id,
        reviewNote: input.reason,
      });
      if (!closed) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Der Vorschlag wurde bereits bearbeitet.",
        });
      }
      // Die Begründung selbst bleibt draußen – sie ist Freitext und steht
      // ohnehin am Vorschlag.
      recordAudit({
        event: "proposal.rejected",
        actorUserId: ctx.user.id,
        ip: ctx.clientIp,
        detail: { proposalId: input.id },
      });
      return { ok: true };
    }),
});

/**
 * Systemzustand für `/verwaltung/system`.
 *
 * Zeigt, worauf der Server läuft und was beim Start passiert ist: Verbindung,
 * Schema-Migrationen, Füllstand der Fachtabellen und Startkatalog.
 */
const systemAdminRouter = createRouter({
  status: adminQuery.query(async () => {
    const [database, schemaMigrations, tableCounts, seed] = await Promise.all([
      getDatabaseInfo(),
      getSchemaMigrations(),
      countAllTables(),
      getSeedInfo(),
    ]);
    return { database, schemaMigrations, tableCounts, seed };
  }),
});

export const adminRouter = createRouter({
  preset: presetAdminRouter,
  proposal: proposalAdminRouter,
  system: systemAdminRouter,
});
