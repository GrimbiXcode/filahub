ALTER TABLE "preset_spool_series" ADD COLUMN "nameI18n" jsonb;--> statement-breakpoint
ALTER TABLE "preset_spool_versions" ADD COLUMN "nameI18n" jsonb;--> statement-breakpoint
ALTER TABLE "preset_spool_variants" DROP COLUMN "displayName";