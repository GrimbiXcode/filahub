-- Schemastand von filahub unter MySQL 8.4 (Migrationen 0000–0003),
-- zusammengefasst als eine Datei.
--
-- Wird nicht mehr angewendet: die Anwendung läuft auf PostgreSQL
-- (db/migrations). Diese Datei bleibt aus zwei Gründen erhalten:
--   1. als Referenz für die Struktur der Altdaten, die
--      api/queries/legacyImport.ts ausliest,
--   2. als Fixture für den Integrationstest der Datenübernahme, der
--      damit eine MySQL-Quelldatenbank aufbaut.
--
-- Die Anweisungen sind durch die Breakpoint-Markierung von drizzle-kit
-- getrennt. Die Markierung selbst steht bewusst nirgends im Klartext in
-- diesem Kopf: Der Test zerlegt die Datei daran und würde sonst hier
-- mittendrin trennen.

CREATE TABLE `login_codes` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`code` varchar(6) NOT NULL,
	`telegramId` varchar(64) NOT NULL,
	`telegramUsername` varchar(255),
	`telegramName` varchar(255),
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `login_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `materials` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`name` varchar(255) NOT NULL,
	`identifier` varchar(50),
	`materialType` varchar(100) NOT NULL,
	`manufacturer` varchar(255),
	`color` varchar(100),
	`priceCents` int,
	`purchaseDate` date,
	`nominalWeight` int NOT NULL,
	`spoolTypeId` bigint unsigned,
	`storageBoxId` bigint unsigned,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `materials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `spool_types` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`name` varchar(255) NOT NULL,
	`manufacturer` varchar(255),
	`tareWeight` int NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `spool_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `storage_boxes` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`name` varchar(255) NOT NULL,
	`location` varchar(255),
	`tareWeight` int NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `storage_boxes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`unionId` varchar(255) NOT NULL,
	`name` varchar(255),
	`telegramUsername` varchar(255),
	`email` varchar(320),
	`avatar` text,
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	`lastSignInAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_unionId_unique` UNIQUE(`unionId`)
);
--> statement-breakpoint
CREATE TABLE `weighings` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`materialId` bigint unsigned NOT NULL,
	`grossWeight` int NOT NULL,
	`weighedAt` timestamp NOT NULL DEFAULT (now()),
	`note` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `weighings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hidden_spool_presets` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`scope` enum('manufacturer','series','version','variant') NOT NULL,
	`refId` bigint unsigned NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `hidden_spool_presets_id` PRIMARY KEY(`id`),
	CONSTRAINT `hidden_spool_presets_unique` UNIQUE(`userId`,`scope`,`refId`)
);
--> statement-breakpoint
CREATE TABLE `preset_manufacturers` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`website` varchar(500),
	`source` enum('seed','admin','community') NOT NULL DEFAULT 'admin',
	`seedRevision` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `preset_manufacturers_id` PRIMARY KEY(`id`),
	CONSTRAINT `preset_manufacturers_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `preset_proposals` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`kind` enum('new','change') NOT NULL,
	`targetType` enum('manufacturer','series','version','variant') NOT NULL,
	`targetId` bigint unsigned,
	`payload` json NOT NULL,
	`sourceSpoolTypeId` bigint unsigned,
	`comment` text,
	`status` enum('pending','approved','rejected','withdrawn') NOT NULL DEFAULT 'pending',
	`reviewedBy` bigint unsigned,
	`reviewedAt` timestamp,
	`reviewNote` text,
	`resultId` bigint unsigned,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `preset_proposals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `preset_series_material_types` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`seriesId` bigint unsigned NOT NULL,
	`materialType` varchar(100) NOT NULL,
	CONSTRAINT `preset_series_material_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `preset_series_material_types_unique` UNIQUE(`seriesId`,`materialType`)
);
--> statement-breakpoint
CREATE TABLE `preset_spool_series` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`manufacturerId` bigint unsigned NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`source` enum('seed','admin','community') NOT NULL DEFAULT 'admin',
	`seedRevision` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `preset_spool_series_id` PRIMARY KEY(`id`),
	CONSTRAINT `preset_spool_series_slug_unique` UNIQUE(`manufacturerId`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `preset_spool_variants` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`versionId` bigint unsigned NOT NULL,
	`nominalWeight` int NOT NULL,
	`tareWeight` int NOT NULL,
	`outerDiameterMm` int,
	`widthMm` int,
	`boreDiameterMm` int,
	`displayName` varchar(500) NOT NULL,
	`source` enum('seed','admin','community') NOT NULL DEFAULT 'admin',
	`seedRevision` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `preset_spool_variants_id` PRIMARY KEY(`id`),
	CONSTRAINT `preset_spool_variants_unique` UNIQUE(`versionId`,`nominalWeight`)
);
--> statement-breakpoint
CREATE TABLE `preset_spool_versions` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`seriesId` bigint unsigned NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`spoolMaterial` enum('kunststoff','karton','metall','sonstiges'),
	`validFrom` date,
	`validTo` date,
	`source` enum('seed','admin','community') NOT NULL DEFAULT 'admin',
	`seedRevision` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `preset_spool_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `preset_spool_versions_slug_unique` UNIQUE(`seriesId`,`slug`)
);
--> statement-breakpoint
ALTER TABLE `materials` ADD `spoolPresetVariantId` bigint unsigned;--> statement-breakpoint
ALTER TABLE `spool_types` ADD `sourceVariantId` bigint unsigned;--> statement-breakpoint
CREATE INDEX `hidden_spool_presets_user_idx` ON `hidden_spool_presets` (`userId`);--> statement-breakpoint
CREATE INDEX `preset_proposals_status_idx` ON `preset_proposals` (`status`);--> statement-breakpoint
CREATE INDEX `preset_proposals_user_idx` ON `preset_proposals` (`userId`);--> statement-breakpoint
CREATE INDEX `preset_spool_series_manufacturer_idx` ON `preset_spool_series` (`manufacturerId`);--> statement-breakpoint
CREATE INDEX `preset_spool_variants_version_idx` ON `preset_spool_variants` (`versionId`);--> statement-breakpoint
CREATE INDEX `preset_spool_versions_series_idx` ON `preset_spool_versions` (`seriesId`);--> statement-breakpoint
ALTER TABLE `users` ADD `currency` varchar(3) DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `locale` varchar(35);--> statement-breakpoint
ALTER TABLE `users` ADD `lastSeenReleaseVersion` varchar(32);
