import { relations } from "drizzle-orm";
import {
  lager,
  materials,
  presetManufacturers,
  presetSpoolSeries,
  presetSpoolVariants,
  presetSpoolVersions,
  spoolTypes,
  storageBoxes,
  users,
  weighings,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  materials: many(materials),
  spoolTypes: many(spoolTypes),
  storageBoxes: many(storageBoxes),
  lager: many(lager),
}));

export const lagerRelations = relations(lager, ({ one, many }) => ({
  user: one(users, { fields: [lager.userId], references: [users.id] }),
  materials: many(materials),
}));

export const spoolTypesRelations = relations(spoolTypes, ({ one, many }) => ({
  user: one(users, { fields: [spoolTypes.userId], references: [users.id] }),
  materials: many(materials),
}));

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
  spoolType: one(spoolTypes, {
    fields: [materials.spoolTypeId],
    references: [spoolTypes.id],
  }),
  storageBox: one(storageBoxes, {
    fields: [materials.storageBoxId],
    references: [storageBoxes.id],
  }),
  spoolPresetVariant: one(presetSpoolVariants, {
    fields: [materials.spoolPresetVariantId],
    references: [presetSpoolVariants.id],
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
// `hidden_spool_presets`, `friendships` und `loan_requests` gibt es bewusst
// keine Relations: die meisten zeigen polymorph bzw. doppelt auf `users`
// (`friendships` gleich mit beiden Spalten), die übrigen sind
// Zuordnungstabellen. Sie werden per select() geladen und in JS verknüpft
// (Muster wie `findRecentWeighings`).
// ---------------------------------------------------------------------------

export const presetManufacturersRelations = relations(
  presetManufacturers,
  ({ many }) => ({
    series: many(presetSpoolSeries),
  })
);

export const presetSpoolSeriesRelations = relations(
  presetSpoolSeries,
  ({ one, many }) => ({
    manufacturer: one(presetManufacturers, {
      fields: [presetSpoolSeries.manufacturerId],
      references: [presetManufacturers.id],
    }),
    versions: many(presetSpoolVersions),
  })
);

export const presetSpoolVersionsRelations = relations(
  presetSpoolVersions,
  ({ one, many }) => ({
    series: one(presetSpoolSeries, {
      fields: [presetSpoolVersions.seriesId],
      references: [presetSpoolSeries.id],
    }),
    variants: many(presetSpoolVariants),
  })
);

export const presetSpoolVariantsRelations = relations(
  presetSpoolVariants,
  ({ one, many }) => ({
    version: one(presetSpoolVersions, {
      fields: [presetSpoolVariants.versionId],
      references: [presetSpoolVersions.id],
    }),
    materials: many(materials),
  })
);
