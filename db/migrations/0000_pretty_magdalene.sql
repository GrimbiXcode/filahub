CREATE TYPE "public"."migration_status" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."preset_proposal_kind" AS ENUM('new', 'change');--> statement-breakpoint
CREATE TYPE "public"."preset_proposal_status" AS ENUM('pending', 'approved', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."preset_scope" AS ENUM('manufacturer', 'series', 'version', 'variant');--> statement-breakpoint
CREATE TYPE "public"."preset_source" AS ENUM('seed', 'admin', 'community');--> statement-breakpoint
CREATE TYPE "public"."preset_spool_material" AS ENUM('kunststoff', 'karton', 'metall', 'sonstiges');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "hidden_spool_presets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"scope" "preset_scope" NOT NULL,
	"refId" bigint NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hidden_spool_presets_unique" UNIQUE("userId","scope","refId")
);
--> statement-breakpoint
CREATE TABLE "login_codes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" varchar(6) NOT NULL,
	"telegramId" varchar(64) NOT NULL,
	"telegramUsername" varchar(255),
	"telegramName" varchar(255),
	"expiresAt" timestamp with time zone NOT NULL,
	"usedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"name" varchar(255) NOT NULL,
	"identifier" varchar(50),
	"materialType" varchar(100) NOT NULL,
	"manufacturer" varchar(255),
	"color" varchar(100),
	"priceCents" integer,
	"purchaseDate" date,
	"nominalWeight" integer NOT NULL,
	"spoolTypeId" bigint,
	"spoolPresetVariantId" bigint,
	"storageBoxId" bigint,
	"notes" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migration_state" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" varchar(64) NOT NULL,
	"status" "migration_status" DEFAULT 'pending' NOT NULL,
	"source" varchar(255),
	"tablesTotal" integer DEFAULT 0 NOT NULL,
	"tablesDone" integer DEFAULT 0 NOT NULL,
	"rowsCopied" integer DEFAULT 0 NOT NULL,
	"detail" jsonb,
	"error" text,
	"startedAt" timestamp with time zone,
	"finishedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "migration_state_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "preset_manufacturers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"website" varchar(500),
	"source" "preset_source" DEFAULT 'admin' NOT NULL,
	"seedRevision" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preset_manufacturers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "preset_proposals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"kind" "preset_proposal_kind" NOT NULL,
	"targetType" "preset_scope" NOT NULL,
	"targetId" bigint,
	"payload" jsonb NOT NULL,
	"sourceSpoolTypeId" bigint,
	"comment" text,
	"status" "preset_proposal_status" DEFAULT 'pending' NOT NULL,
	"reviewedBy" bigint,
	"reviewedAt" timestamp with time zone,
	"reviewNote" text,
	"resultId" bigint,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preset_series_material_types" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"seriesId" bigint NOT NULL,
	"materialType" varchar(100) NOT NULL,
	CONSTRAINT "preset_series_material_types_unique" UNIQUE("seriesId","materialType")
);
--> statement-breakpoint
CREATE TABLE "preset_spool_series" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"manufacturerId" bigint NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"source" "preset_source" DEFAULT 'admin' NOT NULL,
	"seedRevision" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preset_spool_series_slug_unique" UNIQUE("manufacturerId","slug")
);
--> statement-breakpoint
CREATE TABLE "preset_spool_variants" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"versionId" bigint NOT NULL,
	"nominalWeight" integer NOT NULL,
	"tareWeight" integer NOT NULL,
	"outerDiameterMm" integer,
	"widthMm" integer,
	"boreDiameterMm" integer,
	"displayName" varchar(500) NOT NULL,
	"source" "preset_source" DEFAULT 'admin' NOT NULL,
	"seedRevision" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preset_spool_variants_unique" UNIQUE("versionId","nominalWeight")
);
--> statement-breakpoint
CREATE TABLE "preset_spool_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"seriesId" bigint NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"spoolMaterial" "preset_spool_material",
	"validFrom" date,
	"validTo" date,
	"source" "preset_source" DEFAULT 'admin' NOT NULL,
	"seedRevision" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preset_spool_versions_slug_unique" UNIQUE("seriesId","slug")
);
--> statement-breakpoint
CREATE TABLE "spool_types" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"name" varchar(255) NOT NULL,
	"manufacturer" varchar(255),
	"tareWeight" integer NOT NULL,
	"sourceVariantId" bigint,
	"notes" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_boxes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"name" varchar(255) NOT NULL,
	"location" varchar(255),
	"tareWeight" integer NOT NULL,
	"notes" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"unionId" varchar(255) NOT NULL,
	"name" varchar(255),
	"telegramUsername" varchar(255),
	"email" varchar(320),
	"avatar" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"locale" varchar(35),
	"lastSeenReleaseVersion" varchar(32),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignInAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_unionId_unique" UNIQUE("unionId")
);
--> statement-breakpoint
CREATE TABLE "weighings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"materialId" bigint NOT NULL,
	"grossWeight" integer NOT NULL,
	"weighedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"note" varchar(500),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "hidden_spool_presets_user_idx" ON "hidden_spool_presets" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "preset_proposals_status_idx" ON "preset_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "preset_proposals_user_idx" ON "preset_proposals" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "preset_spool_series_manufacturer_idx" ON "preset_spool_series" USING btree ("manufacturerId");--> statement-breakpoint
CREATE INDEX "preset_spool_variants_version_idx" ON "preset_spool_variants" USING btree ("versionId");--> statement-breakpoint
CREATE INDEX "preset_spool_versions_series_idx" ON "preset_spool_versions" USING btree ("seriesId");