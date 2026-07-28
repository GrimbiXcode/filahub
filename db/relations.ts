import { relations } from "drizzle-orm";
import { materials, spoolTypes, storageBoxes, users, weighings } from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  materials: many(materials),
  spoolTypes: many(spoolTypes),
  storageBoxes: many(storageBoxes),
}));

export const spoolTypesRelations = relations(spoolTypes, ({ one, many }) => ({
  user: one(users, { fields: [spoolTypes.userId], references: [users.id] }),
  materials: many(materials),
}));

export const storageBoxesRelations = relations(storageBoxes, ({ one, many }) => ({
  user: one(users, { fields: [storageBoxes.userId], references: [users.id] }),
  materials: many(materials),
}));

export const materialsRelations = relations(materials, ({ one, many }) => ({
  user: one(users, { fields: [materials.userId], references: [users.id] }),
  spoolType: one(spoolTypes, {
    fields: [materials.spoolTypeId],
    references: [spoolTypes.id],
  }),
  storageBox: one(storageBoxes, {
    fields: [materials.storageBoxId],
    references: [storageBoxes.id],
  }),
  weighings: many(weighings),
}));

export const weighingsRelations = relations(weighings, ({ one }) => ({
  material: one(materials, {
    fields: [weighings.materialId],
    references: [materials.id],
  }),
}));
