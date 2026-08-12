-- Organisationen: Lager, Material, Gebindearten und Dryboxen im gemeinsamen Besitz.

/*
  Vollständig von drizzle-kit erzeugt – anders als 0008, 0009 und 0012 ist hier
  nichts von Hand ergänzt. Der Grund: Es gibt **keinen Backfill**. Alle
  bestehenden Zeilen sind persönlich, sie behalten ihre `userId`, und
  `organizationId` bleibt NULL. Der XOR-Check ist für sie damit von Anfang an
  erfüllt (`num_nonnulls` = 1), und das `DROP NOT NULL` weitet nur, statt zu
  verengen.

  Die einzige nicht umkehrbare Stelle ist der Wechsel des Namensschlüssels auf
  `lager`: Der alte `UNIQUE("userId","name")` fällt weg und wird durch **zwei
  partielle** Unique-Indizes ersetzt. Nötig ist das, weil NULL-Werte in einem
  Unique-Index in Postgres voneinander verschieden sind – der alte Schlüssel
  ließe beliebig viele gleichnamige Lager derselben Organisation zu. Beide
  Anweisungen stehen in derselben Transaktion; zwischen dem DROP und dem
  CREATE ist der Name also nie ungeschützt.

  Wer künftig Migrationen erzeugt, muss aus dieser Datei nichts übernehmen. Das
  gilt weiterhin nur für die beiden Hand-Indizes aus 0008_friends.sql.
*/

CREATE TYPE "public"."organization_invitation_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."organization_role" AS ENUM('viewer', 'weigher', 'editor', 'admin');--> statement-breakpoint
CREATE TABLE "organization_invitations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organizationId" bigint NOT NULL,
	"invitedUserId" bigint NOT NULL,
	"invitedByUserId" bigint NOT NULL,
	"role" "organization_role" NOT NULL,
	"status" "organization_invitation_status" DEFAULT 'pending' NOT NULL,
	"respondedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organizationId" bigint NOT NULL,
	"userId" bigint NOT NULL,
	"role" "organization_role" NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_members_unique" UNIQUE("organizationId","userId")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"joinCode" varchar(16),
	"joinRole" "organization_role" DEFAULT 'viewer' NOT NULL,
	"notes" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_joinCode_unique" UNIQUE("joinCode")
);
--> statement-breakpoint
ALTER TABLE "lager" DROP CONSTRAINT "lager_name_per_user_unique";--> statement-breakpoint
ALTER TABLE "container_types" ALTER COLUMN "userId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lager" ALTER COLUMN "userId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "materials" ALTER COLUMN "userId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "storage_boxes" ALTER COLUMN "userId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "container_types" ADD COLUMN "organizationId" bigint;--> statement-breakpoint
ALTER TABLE "lager" ADD COLUMN "organizationId" bigint;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "organizationId" bigint;--> statement-breakpoint
ALTER TABLE "storage_boxes" ADD COLUMN "organizationId" bigint;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_invitations_open_unique" ON "organization_invitations" USING btree ("organizationId","invitedUserId") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "organization_invitations_invited_idx" ON "organization_invitations" USING btree ("invitedUserId");--> statement-breakpoint
CREATE INDEX "organization_invitations_organization_idx" ON "organization_invitations" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "organization_members_user_idx" ON "organization_members" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "organization_members_organization_idx" ON "organization_members" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "container_types_user_idx" ON "container_types" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "container_types_organization_idx" ON "container_types" USING btree ("organizationId");--> statement-breakpoint
CREATE UNIQUE INDEX "lager_name_per_user_unique" ON "lager" USING btree ("userId","name") WHERE "organizationId" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "lager_name_per_organization_unique" ON "lager" USING btree ("organizationId","name") WHERE "organizationId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "lager_organization_idx" ON "lager" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "materials_organization_idx" ON "materials" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "storage_boxes_user_idx" ON "storage_boxes" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "storage_boxes_organization_idx" ON "storage_boxes" USING btree ("organizationId");--> statement-breakpoint
ALTER TABLE "container_types" ADD CONSTRAINT "container_types_owner_xor" CHECK (num_nonnulls("userId", "organizationId") = 1);--> statement-breakpoint
ALTER TABLE "lager" ADD CONSTRAINT "lager_owner_xor" CHECK (num_nonnulls("userId", "organizationId") = 1);--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_owner_xor" CHECK (num_nonnulls("userId", "organizationId") = 1);--> statement-breakpoint
ALTER TABLE "storage_boxes" ADD CONSTRAINT "storage_boxes_owner_xor" CHECK (num_nonnulls("userId", "organizationId") = 1);