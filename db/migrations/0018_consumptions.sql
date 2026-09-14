CREATE TABLE "consumptions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"materialId" bigint NOT NULL,
	"weight" integer NOT NULL,
	"consumedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"note" varchar(500),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "consumptions_material_idx" ON "consumptions" USING btree ("materialId");