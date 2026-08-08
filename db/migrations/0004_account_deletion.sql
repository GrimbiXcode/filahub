ALTER TABLE "preset_proposals" ALTER COLUMN "userId" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "materials_user_idx" ON "materials" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "weighings_material_idx" ON "weighings" USING btree ("materialId");