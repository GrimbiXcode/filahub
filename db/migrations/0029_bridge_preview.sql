ALTER TABLE "print_imports" ADD COLUMN "previewKey" varchar(32);--> statement-breakpoint
ALTER TABLE "print_imports" ADD COLUMN "previewMimeType" varchar(100);--> statement-breakpoint
ALTER TABLE "print_imports" ADD COLUMN "previewBytes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "print_imports" ADD COLUMN "previewSha256" varchar(64);--> statement-breakpoint
ALTER TABLE "print_imports" ADD COLUMN "previewWidth" integer;--> statement-breakpoint
ALTER TABLE "print_imports" ADD COLUMN "previewHeight" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "print_imports_preview_key_unique" ON "print_imports" USING btree ("previewKey");