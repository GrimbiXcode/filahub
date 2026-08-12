import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  PRESET_SCOPES,
  buildVariantDisplayName,
  nameI18nInputSchema,
  proposalChangePayloadSchema,
  proposalNewPayloadSchema,
  resolveName,
  CONTAINER_MATERIALS,
  materialTypesSchema,
} from "@contracts/presets";
import { createRouter, authedQuery } from "./middleware";
import { resolveScope } from "./scope";
import {
  createContainerType,
  findContainerTypesInScope,
} from "./queries/filament";
import {
  closeProposal,
  countOpenProposals,
  createProposal,
  findCatalogTree,
  findManufacturerById,
  findPresetOptionsForUser,
  findPresetVariantWithPath,
  findProposal,
  findProposalsByUser,
  findSeriesById,
  findVariantById,
  findVersionById,
  setHiddenPreset,
} from "./queries/presets";

/** Höchstzahl gleichzeitig offener Vorschläge pro Benutzer */
const MAX_OPEN_PROPOSALS = 20;

const scopeSchema = z.enum(PRESET_SCOPES);

const proposeChangeInput = z.object({
  targetType: scopeSchema,
  targetId: z.number().int().positive(),
  payload: proposalChangePayloadSchema,
  comment: z.string().trim().max(1000).optional(),
});

const proposeNewInput = z.object({
  payload: proposalNewPayloadSchema,
  sourceContainerTypeId: z.number().int().positive().nullable().optional(),
  comment: z.string().trim().max(1000).optional(),
});

/** Vorschlag direkt aus einer eigenen Gebindeart heraus */
const proposeFromContainerTypeInput = z.object({
  containerTypeId: z.number().int().positive(),
  manufacturer: z
    .string()
    .trim()
    .min(1, "Herstellername ist erforderlich")
    .max(255),
  series: z.string().trim().min(1, "Name der Serie ist erforderlich").max(255),
  /** Übersetzungen der Serie, vom Einreichenden mitgeliefert */
  seriesI18n: nameI18nInputSchema,
  version: z
    .string()
    .trim()
    .min(1, "Bezeichnung der Ausführung ist erforderlich")
    .max(255),
  versionI18n: nameI18nInputSchema,
  containerMaterial: z.enum(CONTAINER_MATERIALS).nullable().optional(),
  materialTypes: materialTypesSchema,
  nominalWeight: z
    .number()
    .int("Nenngewicht muss eine ganze Zahl sein")
    .positive("Nenngewicht muss größer als 0 sein"),
  comment: z.string().trim().max(1000).optional(),
});

async function assertProposalQuota(userId: number) {
  const open = await countOpenProposals(userId);
  if (open >= MAX_OPEN_PROPOSALS) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Du hast bereits ${MAX_OPEN_PROPOSALS} offene Vorschläge. Bitte warte auf die Prüfung.`,
    });
  }
}

/** Prüft, ob der Katalogeintrag existiert, auf den sich ein Vorschlag bezieht. */
async function assertTargetExists(
  targetType: (typeof PRESET_SCOPES)[number],
  targetId: number
) {
  const found =
    targetType === "manufacturer"
      ? await findManufacturerById(targetId)
      : targetType === "series"
        ? await findSeriesById(targetId)
        : targetType === "version"
          ? await findVersionById(targetId)
          : await findVariantById(targetId);
  if (!found) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Der Katalogeintrag existiert nicht (mehr).",
    });
  }
}

export const presetRouter = createRouter({
  /** Katalogbaum inkl. der eigenen Ausblendungen (auch ausgeblendete Zweige) */
  tree: authedQuery.query(({ ctx }) => findCatalogTree(ctx.user.id)),

  /** Flache Auswahlliste für das Materialformular (ohne Ausgeblendete) */
  options: authedQuery.query(({ ctx }) =>
    findPresetOptionsForUser(ctx.user.id, ctx.language)
  ),

  setHidden: authedQuery
    .input(
      z.object({
        scope: scopeSchema,
        refId: z.number().int().positive(),
        hidden: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await setHiddenPreset(
        ctx.user.id,
        input.scope,
        input.refId,
        input.hidden
      );
      return { ok: true };
    }),

  /** Preset als eigene, frei editierbare Gebindeart übernehmen */
  copyToOwn: authedQuery
    .input(
      z.object({
        variantId: z.number().int().positive(),
        name: z.string().trim().max(255).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const path = await findPresetVariantWithPath(input.variantId);
      if (!path) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Preset-Variante nicht gefunden",
        });
      }
      /*
        „Kopieren & anpassen" legt immer im **persönlichen** Bereich an. Der
        Katalog ist global und die Kopie eine Vorliebe des Einzelnen; wer eine
        Gebindeart für seine Organisation braucht, legt sie dort an. Sonst
        bräuchte diese Prozedur einen Bereich in der Eingabe, und der
        Preset-Dialog kennt keinen.
      */
      const personal = await resolveScope(ctx.user.id, null, "editor");
      const created = await createContainerType(personal, {
        name:
          input.name?.trim() ||
          buildVariantDisplayName({
            manufacturer: path.manufacturer.name,
            series: resolveName(path.series, ctx.language),
            version: resolveName(path.version, ctx.language),
            nominalWeight: path.variant.nominalWeight,
          }),
        manufacturer: path.manufacturer.name,
        /*
          Die Form der Ausführung wandert mit. Ohne sie fiele die kopierte
          Gebindeart auf die Spaltenvorgabe `rolle` zurück – eine Harzflasche
          hieße nach dem Kopieren „Rolle“ und sortierte in der Gebindeauswahl
          nach unten, weil `formFitsKind("rolle", "resin")` falsch ist. `null`
          heißt „unbekannt“ und bleibt es; die Vorgabe greift nur beim Anlegen
          von Hand.
        */
        ...(path.version.form != null ? { form: path.version.form } : {}),
        tareWeight: path.variant.tareWeight,
        sourceVariantId: path.variant.id,
      });
      return created;
    }),

  proposals: createRouter({
    mine: authedQuery.query(({ ctx }) => findProposalsByUser(ctx.user.id)),

    /** Kompletten neuen Katalogpfad vorschlagen */
    submitNew: authedQuery
      .input(proposeNewInput)
      .mutation(async ({ ctx, input }) => {
        await assertProposalQuota(ctx.user.id);
        return createProposal({
          userId: ctx.user.id,
          kind: "new",
          targetType: "variant",
          payload: input.payload,
          sourceContainerTypeId: input.sourceContainerTypeId,
          comment: input.comment,
        });
      }),

    /**
     * Bequemer Weg aus der Gebindeliste: Name, Hersteller und Leergewicht
     * kommen aus der eigenen Gebindeart, der Rest aus dem Formular.
     */
    submitFromContainerType: authedQuery
      .input(proposeFromContainerTypeInput)
      .mutation(async ({ ctx, input }) => {
        await assertProposalQuota(ctx.user.id);
        /*
          Vorschläge kommen aus dem persönlichen Bestand. Eine Gebindeart einer
          Organisation einzureichen hieße, fremde Angaben unter eigenem Namen in
          den globalen Katalog zu geben.
        */
        const personal = await resolveScope(ctx.user.id, null, "editor");
        const own = (await findContainerTypesInScope(personal)).find(
          entry => entry.id === input.containerTypeId
        );
        if (!own) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Gebindeart nicht gefunden",
          });
        }
        const payload = proposalNewPayloadSchema.safeParse({
          kind: "new",
          manufacturer: { name: input.manufacturer },
          series: {
            name: input.series,
            nameI18n: input.seriesI18n,
            materialTypes: input.materialTypes,
          },
          version: {
            name: input.version,
            nameI18n: input.versionI18n,
            /* Die Form der eigenen Gebindeart ist die beste Auskunft, die es hier gibt. */
            form: own.form,
            containerMaterial: input.containerMaterial ?? null,
          },
          variant: {
            nominalWeight: input.nominalWeight,
            tareWeight: own.tareWeight,
            notes: own.notes,
          },
        });
        if (!payload.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              payload.error.issues[0]?.message ??
              "Der Vorschlag ist unvollständig.",
          });
        }
        return createProposal({
          userId: ctx.user.id,
          kind: "new",
          targetType: "variant",
          payload: payload.data,
          sourceContainerTypeId: own.id,
          comment: input.comment,
        });
      }),

    /** Änderung an einem bestehenden Katalogeintrag vorschlagen */
    submitChange: authedQuery
      .input(proposeChangeInput)
      .mutation(async ({ ctx, input }) => {
        await assertProposalQuota(ctx.user.id);
        if (input.payload.scope !== input.targetType) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Der Vorschlag passt nicht zur gewählten Katalogebene.",
          });
        }
        await assertTargetExists(input.targetType, input.targetId);
        return createProposal({
          userId: ctx.user.id,
          kind: "change",
          targetType: input.targetType,
          targetId: input.targetId,
          payload: input.payload,
          comment: input.comment,
        });
      }),

    withdraw: authedQuery
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const proposal = await findProposal(input.id);
        if (!proposal || proposal.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vorschlag nicht gefunden",
          });
        }
        const closed = await closeProposal(input.id, { status: "withdrawn" });
        if (!closed) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Der Vorschlag wurde bereits bearbeitet.",
          });
        }
        return { ok: true };
      }),
  }),
});
