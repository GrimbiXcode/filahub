import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { importManyInputSchema } from "@contracts/import";
import {
  identifierInputSchema,
  identifierTakenMessage,
  nextIdentifiers,
} from "@contracts/identifierTemplate";
import {
  WEIGHING_CORRECTION_MINUTES,
  mayDeleteConsumption,
  mayDeleteWeighing,
  roleAllows,
} from "@contracts/organizations";
import {
  MAX_CONSUMPTIONS_PER_MATERIAL,
  MAX_MATERIALS_PER_LAGER,
  MAX_WEIGHINGS_PER_MATERIAL,
} from "@contracts/limits";
import {
  COMMON_MATERIAL_TYPES,
  canonicalMaterialType,
} from "@contracts/materials";
import { createRouter, authedQuery, rateLimited } from "./middleware";
import { assertWithinLimit } from "./lib/quota";
import { resolveScope, scopeInput, scopeRole, type Scope } from "./scope";
import {
  addConsumption,
  addWeighing,
  countConsumptionsForMaterial,
  countWeighingsForMaterial,
  IDENTIFIER_TAKEN,
  createMaterial,
  deleteConsumption,
  deleteMaterial,
  deleteWeighing,
  findConsumption,
  findLatestConsumptionId,
  findLatestWeighingId,
  findIdentifiersInScope,
  findMaterialInScope,
  findMaterialTypesInScope,
  findMaterialsInScope,
  findRecentWeighings,
  findWeighing,
  materialInScope,
  presetVariantIsSelectable,
  containerTypeInScope,
  storageBoxInScope,
  updateMaterial,
} from "./queries/filament";
import {
  countMaterialsInLager,
  findLagerInScopeById,
  lagerInScope,
} from "./queries/lager";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT")
  .nullable()
  .optional();

const materialInput = z.object({
  /** Pflicht: Ein Material liegt immer in genau einem Lager. */
  lagerId: z.number().int().positive("Bitte ein Lager wählen"),
  name: z.string().min(1, "Name ist erforderlich"),
  /** Getrimmt, leer = `null`; je Lager eindeutig (siehe `withIdentifierConflict`) */
  identifier: identifierInputSchema.optional(),
  /**
   * Freitext, aber case-insensitiv: Die gespeicherte Schreibweise legt
   * `canonicalMaterialType` fest, siehe `knownMaterialTypes` unten. `trim()`
   * vor `min(1)`, sonst wäre „ “ eine gültige Materialart.
   */
  materialType: z.string().trim().min(1, "Materialart ist erforderlich"),
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

/**
 * Die Schreibweisen, gegen die eine eingegebene Materialart abgeglichen wird:
 * die Vorschlagsliste zuerst, dann der Bestand des Bereichs – in dieser
 * Reihenfolge, weil `canonicalMaterialType` die **erste** Übereinstimmung nimmt
 * und „pla“ auch dann „PLA“ werden soll, wenn im Bestand noch etwas anderes
 * stünde. Das Formular baut seine Vorschlagsliste aus denselben zwei Quellen.
 *
 * Jeder Schreibpfad (`create`, `update`, `importMany`) geht hier durch. Erst
 * **nach** `resolveScope` aufrufen: Die Liste verrät, welche Materialarten ein
 * Bereich führt.
 */
async function knownMaterialTypes(scope: Scope): Promise<string[]> {
  return [...COMMON_MATERIAL_TYPES, ...(await findMaterialTypesInScope(scope))];
}

/**
 * Übersetzt die doppelte Kennung (`IDENTIFIER_TAKEN` aus dem Unique-Index) in
 * ein `CONFLICT` mit einer Meldung, die das Formular unter dem Feld zeigt.
 * Ohne das wäre es ein INTERNAL_SERVER_ERROR mit der rohen Postgres-Meldung.
 *
 * Geprüft wird bewusst **nur** über den Index und nicht vorher per Abfrage:
 * Eine Vorabprüfung ließe zwei gleichzeitige Anfragen beide durch.
 */
async function withIdentifierConflict<T>(
  identifier: string | null | undefined,
  run: () => Promise<T>
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Error && error.message === IDENTIFIER_TAKEN) {
      throw new TRPCError({
        code: "CONFLICT",
        message: identifierTakenMessage(identifier ?? ""),
      });
    }
    throw error;
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
      const materialType = canonicalMaterialType(
        data.materialType,
        await knownMaterialTypes(scope)
      );
      const id = await withIdentifierConflict(data.identifier, () =>
        createMaterial(
          scope,
          {
            ...data,
            materialType,
            identifier: data.identifier ?? undefined,
            manufacturer: data.manufacturer ?? undefined,
            color: data.color ?? undefined,
            notes: data.notes ?? undefined,
          },
          initialGrossWeight
        )
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
      /*
        Nur wenn das Feld mitgeschickt wurde – `undefined` heißt „nicht
        ändern“ (siehe `hasChanges`), und dabei bleibt es.
      */
      const materialType =
        data.materialType !== undefined
          ? canonicalMaterialType(
              data.materialType,
              await knownMaterialTypes(scope)
            )
          : undefined;
      /*
        Die Kennung kann auch dann kollidieren, wenn sie gar nicht mitgeschickt
        wurde: Wer ein Material in ein anderes Lager verschiebt, nimmt seine
        Kennung dorthin mit. Die Meldung nennt deshalb die effektive.
      */
      await withIdentifierConflict(
        data.identifier !== undefined ? data.identifier : existing.identifier,
        () => updateMaterial(scope, id, { ...data, materialType })
      );
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
      /*
        Einmal für den ganzen Stapel geladen. Eine Schreibweise, die dieser
        Import neu einführt, gilt ab dann auch für seine folgenden Positionen –
        sonst stünden „Wood“ und „wood“ aus derselben Tabelle nebeneinander.
      */
      const known = await knownMaterialTypes(scope);
      /*
        Die Kennungsvorlage des Ziellagers gilt auch hier: Jedes importierte
        Material bekommt die nächste freie Nummer, gezählt wie im Formular über
        den ganzen Bereich (`contracts/identifierTemplate.ts`). Vorab für den
        ganzen Stapel, damit sich die Positionen nicht gegenseitig dieselbe
        Nummer geben.
      */
      const lager = await findLagerInScopeById(scope, input.lagerId);
      const identifiers = lager?.identifierTemplate
        ? nextIdentifiers(
            lager.identifierTemplate,
            await findIdentifiersInScope(scope),
            gesamt
          )
        : [];
      for (const item of input.items) {
        const materialType = canonicalMaterialType(item.typ, known);
        if (!known.includes(materialType)) known.push(materialType);
        // Bezeichnung aus Hersteller + Typ + Farbe (wie buildAutoName im Formular)
        const name = [item.hersteller, materialType, item.farbe]
          .map(s => s?.trim())
          .filter(Boolean)
          .join(" ");
        for (let i = 0; i < item.anzahl; i++) {
          const identifier = identifiers[created];
          await withIdentifierConflict(identifier, () =>
            createMaterial(scope, {
              lagerId: input.lagerId,
              identifier,
              name,
              materialType,
              manufacturer: item.hersteller || undefined,
              color: item.farbe || undefined,
              priceCents: item.priceCents ?? undefined,
              purchaseDate: input.purchaseDate ?? undefined,
              nominalWeight: item.nenngewicht,
            })
          );
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

  /**
   * Verbrauch abbuchen (seit 2.9.0): verbrauchte Gramm ohne Waage, üblicherweise
   * die Angabe des Slicers nach einem Druck. Die Restmenge sinkt sofort; die
   * nächste Wägung ersetzt die Schätzungen wieder durch eine Messung.
   */
  addConsumption: authedQuery
    .use(
      rateLimited({
        key: "material.addConsumption",
        limit: 120,
        windowMs: 60_000,
        by: "user",
      })
    )
    .input(
      z.object({
        materialId: z.number().int().positive(),
        /*
          Keine Obergrenze gegen die Restmenge: Der Slicer schätzt, und wer 60 g
          abbucht, wo die App 50 g vermutet, hat eine leere Rolle in der Hand –
          kein Eingabefehler. `remainingAmount` klemmt auf 0.
        */
        weight: z.number().int().positive("Menge muss > 0 sein"),
        consumedAt: z.date().optional(),
        note: z.string().max(500).optional(),
        ...scopeInput.shape,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId, ...data } = input;
      // `weigher`, aus demselben Grund wie bei `addWeighing`: Abbuchen ist
      // genau das, wofür die Stufe da ist.
      const scope = await resolveScope(ctx.user.id, organizationId, "weigher");
      if (!(await materialInScope(scope, data.materialId))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Material nicht gefunden",
        });
      }
      assertWithinLimit({
        current: await countConsumptionsForMaterial(data.materialId),
        max: MAX_CONSUMPTIONS_PER_MATERIAL,
        quota: "consumptions_per_material",
        message: `Für dieses Material sind bereits ${MAX_CONSUMPTIONS_PER_MATERIAL} Verbräuche erfasst. Bitte alte Einträge entfernen.`,
        actorUserId: ctx.user.id,
        ip: ctx.clientIp,
      });
      return addConsumption(data);
    }),

  /** Spiegel von `deleteWeighing` – dieselbe Korrekturregel, siehe dort. */
  deleteConsumption: authedQuery
    .input(z.object({ id: z.number().int().positive(), ...scopeInput.shape }))
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveScope(
        ctx.user.id,
        input.organizationId,
        "weigher"
      );
      const consumption = await findConsumption(input.id);
      if (
        !consumption ||
        !(await materialInScope(scope, consumption.materialId))
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Verbrauch nicht gefunden",
        });
      }
      const role = scopeRole(scope);
      if (!roleAllows(role, "editor")) {
        const latestId = await findLatestConsumptionId(consumption.materialId);
        if (consumption.id !== latestId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Nur der zuletzt erfasste Verbrauch lässt sich so entfernen. Ältere Einträge kann bereinigen, wer Material erfassen darf.",
          });
        }
        if (!mayDeleteConsumption(role, consumption, latestId)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Dieser Verbrauch ist älter als ${WEIGHING_CORRECTION_MINUTES} Minuten. Nur wer Material erfassen darf, kann ihn noch löschen.`,
          });
        }
      }
      await deleteConsumption(input.id);
      return { ok: true };
    }),
});
