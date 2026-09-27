CREATE TABLE "material_print_settings" (
	"productId" bigint PRIMARY KEY NOT NULL,
	"schemaVersion" integer NOT NULL,
	"settings" jsonb NOT NULL,
	"notes" text,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "archivedAt" timestamp with time zone;