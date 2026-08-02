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
CREATE INDEX `preset_spool_versions_series_idx` ON `preset_spool_versions` (`seriesId`);