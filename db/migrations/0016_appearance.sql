CREATE TYPE "public"."texture_kind" AS ENUM('plain', 'matte', 'glossy', 'silk', 'metallic', 'carbon', 'transparent', 'glow', 'wood');--> statement-breakpoint
CREATE TABLE "custom_colors" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint,
	"organizationId" bigint,
	"name" varchar(100) NOT NULL,
	"nameKey" varchar(100) NOT NULL,
	"hex" varchar(7) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_colors_owner_xor" CHECK (num_nonnulls("userId", "organizationId") = 1)
);
--> statement-breakpoint
CREATE TABLE "custom_textures" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint,
	"organizationId" bigint,
	"name" varchar(100) NOT NULL,
	"nameKey" varchar(100) NOT NULL,
	"kind" texture_kind NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_textures_owner_xor" CHECK (num_nonnulls("userId", "organizationId") = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "custom_colors_name_per_user_unique" ON "custom_colors" USING btree ("userId","nameKey") WHERE "organizationId" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_colors_name_per_organization_unique" ON "custom_colors" USING btree ("organizationId","nameKey") WHERE "organizationId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "custom_colors_user_idx" ON "custom_colors" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "custom_colors_organization_idx" ON "custom_colors" USING btree ("organizationId");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_textures_name_per_user_unique" ON "custom_textures" USING btree ("userId","nameKey") WHERE "organizationId" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_textures_name_per_organization_unique" ON "custom_textures" USING btree ("organizationId","nameKey") WHERE "organizationId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "custom_textures_user_idx" ON "custom_textures" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "custom_textures_organization_idx" ON "custom_textures" USING btree ("organizationId");