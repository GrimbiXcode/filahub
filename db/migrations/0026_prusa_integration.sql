CREATE TYPE "public"."api_token_kind" AS ENUM('slicer', 'bridge');--> statement-breakpoint
CREATE TYPE "public"."print_import_source" AS ENUM('slicer', 'printer');--> statement-breakpoint
CREATE TYPE "public"."prusalink_auth_kind" AS ENUM('api_key', 'digest');--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"organizationId" bigint,
	"kind" "api_token_kind" NOT NULL,
	"name" varchar(100) NOT NULL,
	"tokenHash" varchar(64) NOT NULL,
	"tokenPrefix" varchar(16) NOT NULL,
	"lastUsedAt" timestamp with time zone,
	"bridgeStatus" jsonb,
	"bridgeStatusAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bridge_printers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"apiTokenId" bigint NOT NULL,
	"name" varchar(100) NOT NULL,
	"host" varchar(255) NOT NULL,
	"authKind" "prusalink_auth_kind" NOT NULL,
	"username" varchar(100),
	"secretCiphertext" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"testRequestedAt" timestamp with time zone,
	"status" jsonb,
	"statusAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_imports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint,
	"organizationId" bigint,
	"source" "print_import_source" NOT NULL,
	"externalKey" varchar(200) NOT NULL,
	"title" varchar(255) NOT NULL,
	"printedAt" timestamp with time zone NOT NULL,
	"status" "print_job_status" DEFAULT 'success' NOT NULL,
	"progressPercent" integer,
	"durationMinutes" integer,
	"printer" varchar(100),
	"filaments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gramsEstimated" boolean DEFAULT false NOT NULL,
	"apiTokenId" bigint,
	"printJobId" bigint,
	"resolvedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_imports_owner_xor" CHECK (num_nonnulls("userId", "organizationId") = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "api_tokens_hash_unique" ON "api_tokens" USING btree ("tokenHash");--> statement-breakpoint
CREATE INDEX "api_tokens_user_idx" ON "api_tokens" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "api_tokens_organization_idx" ON "api_tokens" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "bridge_printers_token_idx" ON "bridge_printers" USING btree ("apiTokenId");--> statement-breakpoint
CREATE UNIQUE INDEX "print_imports_user_key_unique" ON "print_imports" USING btree ("userId","externalKey") WHERE "organizationId" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "print_imports_organization_key_unique" ON "print_imports" USING btree ("organizationId","externalKey") WHERE "organizationId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "print_imports_user_open_idx" ON "print_imports" USING btree ("userId","resolvedAt");--> statement-breakpoint
CREATE INDEX "print_imports_organization_open_idx" ON "print_imports" USING btree ("organizationId","resolvedAt");