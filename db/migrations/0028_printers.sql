CREATE TABLE "printer_slots" (
	"printerId" bigint NOT NULL,
	"slot" integer NOT NULL,
	"materialId" bigint NOT NULL,
	"loadedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "printer_slots_pkey" PRIMARY KEY("printerId","slot")
);
--> statement-breakpoint
CREATE TABLE "printers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint,
	"organizationId" bigint,
	"name" varchar(100) NOT NULL,
	"slotCount" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "printers_owner_xor" CHECK (num_nonnulls("userId", "organizationId") = 1),
	CONSTRAINT "printers_slot_count_range" CHECK ("slotCount" BETWEEN 1 AND 16)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "printer_slots_material_unique" ON "printer_slots" USING btree ("materialId");--> statement-breakpoint
CREATE UNIQUE INDEX "printers_user_name_unique" ON "printers" USING btree ("userId",lower("name")) WHERE "organizationId" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "printers_organization_name_unique" ON "printers" USING btree ("organizationId",lower("name")) WHERE "organizationId" IS NOT NULL;