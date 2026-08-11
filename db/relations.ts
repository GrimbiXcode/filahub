import { relations } from "drizzle-orm";
import {
  lager,
  materials,
  presetManufacturers,
  presetContainerSeries,
  presetContainerVariants,
  presetContainerVersions,
  containerTypes,
  storageBoxes,
  users,
  weighings,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  materials: many(materials),
  containerTypes: many(containerTypes),
  storageBoxes: many(storageBoxes),
  lager: many(lager),
}));

export const lagerRelations = relations(lager, ({ one, many }) => ({
  user: one(users, { fields: [lager.userId], references: [users.id] }),
  materials: many(materials),
}));

export const containerTypesRelations = relations(
  containerTypes,
  ({ one, many }) => ({
    user: one(users, {
      fields: [containerTypes.userId],
      references: [users.id],
    }),
    materials: many(materials),
  })
);

export const storageBoxesRelations = relations(
  storageBoxes,
  ({ one, many }) => ({
    user: one(users, { fields: [storageBoxes.userId], references: [users.id] }),
    materials: many(materials),
  })
);

export const materialsRelations = relations(materials, ({ one, many }) => ({
  user: one(users, { fields: [materials.userId], references: [users.id] }),
  /*
    Wird mitgeladen, wo die Zweitanzeige gebraucht wird: Materialart und
    Filamentstärke stehen am Lager, nicht am Material.
  */
  lager: one(lager, { fields: [materials.lagerId], references: [lager.id] }),
  containerType: one(containerTypes, {
    fields: [materials.containerTypeId],
    references: [containerTypes.id],
  }),
  storageBox: one(storageBoxes, {
    fields: [materials.storageBoxId],
    references: [storageBoxes.id],
  }),
  containerPresetVariant: one(presetContainerVariants, {
    fields: [materials.containerPresetVariantId],
    references: [presetContainerVariants.id],
  }),
  weighings: many(weighings),
}));

export const weighingsRelations = relations(weighings, ({ one }) => ({
  material: one(materials, {
    fields: [weighings.materialId],
    references: [materials.id],
  }),
}));

// ---------------------------------------------------------------------------
// Preset-Katalog: Hersteller → Serie → Version → Variante
//
// Für `preset_proposals`, `preset_series_material_types`,
// `hidden_container_presets`, `friendships` und `loan_requests` gibt es bewusst
// keine Relations: die meisten zeigen polymorph bzw. doppelt auf `users`
// (`friendships` gleich mit beiden Spalten), die übrigen sind
// Zuordnungstabellen. Sie werden per select() geladen und in JS verknüpft
// (Muster wie `findRecentWeighings`).
// ---------------------------------------------------------------------------

export const presetManufacturersRelations = relations(
  presetManufacturers,
  ({ many }) => ({
    series: many(presetContainerSeries),
  })
);

export const presetContainerSeriesRelations = relations(
  presetContainerSeries,
  ({ one, many }) => ({
    manufacturer: one(presetManufacturers, {
      fields: [presetContainerSeries.manufacturerId],
      references: [presetManufacturers.id],
    }),
    versions: many(presetContainerVersions),
  })
);

export const presetContainerVersionsRelations = relations(
  presetContainerVersions,
  ({ one, many }) => ({
    series: one(presetContainerSeries, {
      fields: [presetContainerVersions.seriesId],
      references: [presetContainerSeries.id],
    }),
    variants: many(presetContainerVariants),
  })
);

export const presetContainerVariantsRelations = relations(
  presetContainerVariants,
  ({ one, many }) => ({
    version: one(presetContainerVersions, {
      fields: [presetContainerVariants.versionId],
      references: [presetContainerVersions.id],
    }),
    materials: many(materials),
  })
);
