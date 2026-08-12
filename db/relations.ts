import { relations } from "drizzle-orm";
import {
  lager,
  materials,
  organizationMembers,
  organizations,
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
  organizationMemberships: many(organizationMembers),
}));

/*
  Die `organization`-Relation steht neben `user` und nicht statt ihr: Ein Lager
  gehört genau einem von beiden (`ownerXor` in `db/schema.ts`), die jeweils
  andere Seite ist `null`. Für `organization_invitations` gibt es bewusst keine
  Relations – sie zeigt doppelt auf `users`, wie `friendships` (siehe der
  Abschnitt weiter unten).
*/
export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  lager: many(lager),
  containerTypes: many(containerTypes),
  storageBoxes: many(storageBoxes),
  materials: many(materials),
}));

export const organizationMembersRelations = relations(
  organizationMembers,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationMembers.organizationId],
      references: [organizations.id],
    }),
    user: one(users, {
      fields: [organizationMembers.userId],
      references: [users.id],
    }),
  })
);

export const lagerRelations = relations(lager, ({ one, many }) => ({
  user: one(users, { fields: [lager.userId], references: [users.id] }),
  organization: one(organizations, {
    fields: [lager.organizationId],
    references: [organizations.id],
  }),
  materials: many(materials),
}));

export const containerTypesRelations = relations(
  containerTypes,
  ({ one, many }) => ({
    user: one(users, {
      fields: [containerTypes.userId],
      references: [users.id],
    }),
    organization: one(organizations, {
      fields: [containerTypes.organizationId],
      references: [organizations.id],
    }),
    materials: many(materials),
  })
);

export const storageBoxesRelations = relations(
  storageBoxes,
  ({ one, many }) => ({
    user: one(users, { fields: [storageBoxes.userId], references: [users.id] }),
    organization: one(organizations, {
      fields: [storageBoxes.organizationId],
      references: [organizations.id],
    }),
    materials: many(materials),
  })
);

export const materialsRelations = relations(materials, ({ one, many }) => ({
  user: one(users, { fields: [materials.userId], references: [users.id] }),
  organization: one(organizations, {
    fields: [materials.organizationId],
    references: [organizations.id],
  }),
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
