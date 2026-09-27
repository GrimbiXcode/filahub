CREATE TYPE "public"."print_file_kind" AS ENUM('image', 'model_3mf');--> statement-breakpoint
CREATE TABLE "print_job_files" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"printJobId" bigint NOT NULL,
	"kind" "print_file_kind" NOT NULL,
	"originalName" varchar(255) NOT NULL,
	"mimeType" varchar(100) NOT NULL,
	"sizeBytes" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"storageKey" varchar(32) NOT NULL,
	"thumbnailKey" varchar(32),
	"thumbnailBytes" integer DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "print_jobs" ADD COLUMN "coverFileId" bigint;--> statement-breakpoint
CREATE INDEX "print_job_files_job_idx" ON "print_job_files" USING btree ("printJobId");--> statement-breakpoint
CREATE UNIQUE INDEX "print_job_files_storage_key_unique" ON "print_job_files" USING btree ("storageKey");--> statement-breakpoint
CREATE UNIQUE INDEX "print_job_files_thumbnail_key_unique" ON "print_job_files" USING btree ("thumbnailKey");