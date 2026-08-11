-- Aus „Spule" wird „Gebinde": Umbenennung ohne Datenänderung.
--
-- Von Hand geschrieben, nicht generiert. drizzle-kit erkennt Umbenennungen
-- nicht und würde DROP TABLE + CREATE TABLE ausgeben – das löscht jeden
-- Bestand. Aus demselben Grund darf hier nie `db:push` laufen.
--
-- `ALTER TABLE … RENAME TO` benennt **nur** die Tabelle um. Indizes,
-- Constraints, Primärschlüssel und Sequenzen behalten ihren alten Namen. Weil
-- `db/schema.ts` sie namentlich führt, müssen sie einzeln mitkommen – sonst
-- will drizzle-kit sie beim nächsten `db:generate` löschen und neu anlegen.
-- Die Liste unten ist vollständig gegen `pg_class` und `pg_constraint` einer
-- 0009-Datenbank abgeglichen: 5 Tabellen, 5 Primärschlüssel, 4 Unique-
-- Constraints, 4 Indizes, 5 Sequenzen, 1 Enum-Typ.

-- Tabellen ---------------------------------------------------------------
ALTER TABLE "spool_types" RENAME TO "container_types";--> statement-breakpoint
ALTER TABLE "preset_spool_series" RENAME TO "preset_container_series";--> statement-breakpoint
ALTER TABLE "preset_spool_versions" RENAME TO "preset_container_versions";--> statement-breakpoint
ALTER TABLE "preset_spool_variants" RENAME TO "preset_container_variants";--> statement-breakpoint
ALTER TABLE "hidden_spool_presets" RENAME TO "hidden_container_presets";--> statement-breakpoint

-- Spalten ----------------------------------------------------------------
ALTER TABLE "materials" RENAME COLUMN "spoolTypeId" TO "containerTypeId";--> statement-breakpoint
ALTER TABLE "materials" RENAME COLUMN "spoolPresetVariantId" TO "containerPresetVariantId";--> statement-breakpoint
ALTER TABLE "preset_container_versions" RENAME COLUMN "spoolMaterial" TO "containerMaterial";--> statement-breakpoint
ALTER TABLE "preset_proposals" RENAME COLUMN "sourceSpoolTypeId" TO "sourceContainerTypeId";--> statement-breakpoint

-- Enum-Typ ---------------------------------------------------------------
ALTER TYPE "public"."preset_spool_material" RENAME TO "preset_container_material";--> statement-breakpoint

-- Primärschlüssel --------------------------------------------------------
ALTER TABLE "container_types" RENAME CONSTRAINT "spool_types_pkey" TO "container_types_pkey";--> statement-breakpoint
ALTER TABLE "preset_container_series" RENAME CONSTRAINT "preset_spool_series_pkey" TO "preset_container_series_pkey";--> statement-breakpoint
ALTER TABLE "preset_container_versions" RENAME CONSTRAINT "preset_spool_versions_pkey" TO "preset_container_versions_pkey";--> statement-breakpoint
ALTER TABLE "preset_container_variants" RENAME CONSTRAINT "preset_spool_variants_pkey" TO "preset_container_variants_pkey";--> statement-breakpoint
ALTER TABLE "hidden_container_presets" RENAME CONSTRAINT "hidden_spool_presets_pkey" TO "hidden_container_presets_pkey";--> statement-breakpoint

-- Unique-Constraints -----------------------------------------------------
ALTER TABLE "preset_container_series" RENAME CONSTRAINT "preset_spool_series_slug_unique" TO "preset_container_series_slug_unique";--> statement-breakpoint
ALTER TABLE "preset_container_versions" RENAME CONSTRAINT "preset_spool_versions_slug_unique" TO "preset_container_versions_slug_unique";--> statement-breakpoint
ALTER TABLE "preset_container_variants" RENAME CONSTRAINT "preset_spool_variants_unique" TO "preset_container_variants_unique";--> statement-breakpoint
ALTER TABLE "hidden_container_presets" RENAME CONSTRAINT "hidden_spool_presets_unique" TO "hidden_container_presets_unique";--> statement-breakpoint

-- Indizes ----------------------------------------------------------------
ALTER INDEX "preset_spool_series_manufacturer_idx" RENAME TO "preset_container_series_manufacturer_idx";--> statement-breakpoint
ALTER INDEX "preset_spool_versions_series_idx" RENAME TO "preset_container_versions_series_idx";--> statement-breakpoint
ALTER INDEX "preset_spool_variants_version_idx" RENAME TO "preset_container_variants_version_idx";--> statement-breakpoint
ALTER INDEX "hidden_spool_presets_user_idx" RENAME TO "hidden_container_presets_user_idx";--> statement-breakpoint

-- Sequenzen --------------------------------------------------------------
-- Rein kosmetisch: Der Name der Sequenz steht in der Spaltenvorgabe und
-- funktioniert auch unbenannt weiter. Bleibt sie „spool_types_id_seq", ist der
-- nächste Mensch, der `\d container_types` liest, verwirrt.
ALTER SEQUENCE "spool_types_id_seq" RENAME TO "container_types_id_seq";--> statement-breakpoint
ALTER SEQUENCE "preset_spool_series_id_seq" RENAME TO "preset_container_series_id_seq";--> statement-breakpoint
ALTER SEQUENCE "preset_spool_versions_id_seq" RENAME TO "preset_container_versions_id_seq";--> statement-breakpoint
ALTER SEQUENCE "preset_spool_variants_id_seq" RENAME TO "preset_container_variants_id_seq";--> statement-breakpoint
ALTER SEQUENCE "hidden_spool_presets_id_seq" RENAME TO "hidden_container_presets_id_seq";
