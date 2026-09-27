CREATE TYPE "public"."print_job_status" AS ENUM('success', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "print_job_links" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"printJobId" bigint NOT NULL,
	"url" varchar(2000) NOT NULL,
	"label" varchar(100),
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_job_materials" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"printJobId" bigint NOT NULL,
	"productId" bigint,
	"productName" varchar(255) NOT NULL,
	"materialId" bigint,
	"grams" integer NOT NULL,
	"consumptionId" bigint,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint,
	"organizationId" bigint,
	"title" varchar(255) NOT NULL,
	"printedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "print_job_status" DEFAULT 'success' NOT NULL,
	"durationMinutes" integer,
	"printer" varchar(100),
	"notes" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_jobs_owner_xor" CHECK (num_nonnulls("userId", "organizationId") = 1)
);
--> statement-breakpoint
CREATE INDEX "print_job_links_job_idx" ON "print_job_links" USING btree ("printJobId");--> statement-breakpoint
CREATE INDEX "print_job_materials_job_idx" ON "print_job_materials" USING btree ("printJobId");--> statement-breakpoint
CREATE INDEX "print_job_materials_product_idx" ON "print_job_materials" USING btree ("productId");--> statement-breakpoint
CREATE INDEX "print_job_materials_material_idx" ON "print_job_materials" USING btree ("materialId");--> statement-breakpoint
CREATE INDEX "print_job_materials_consumption_idx" ON "print_job_materials" USING btree ("consumptionId");--> statement-breakpoint
CREATE INDEX "print_jobs_user_printed_idx" ON "print_jobs" USING btree ("userId","printedAt");--> statement-breakpoint
CREATE INDEX "print_jobs_organization_printed_idx" ON "print_jobs" USING btree ("organizationId","printedAt");--> statement-breakpoint
CREATE INDEX "print_jobs_tags_idx" ON "print_jobs" USING gin ("tags");