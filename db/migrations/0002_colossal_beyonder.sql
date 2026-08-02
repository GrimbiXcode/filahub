ALTER TABLE `users` ADD `currency` varchar(3) DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `locale` varchar(35);