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
