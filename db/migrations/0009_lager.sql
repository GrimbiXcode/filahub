CREATE TYPE "public"."material_kind" AS ENUM('filament', 'powder', 'resin');--> statement-breakpoint
CREATE TABLE "lager" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"name" varchar(255) NOT NULL,
	"materialKind" "material_kind" NOT NULL,
	"filamentDiameterUm" integer,
	"notes" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lager_name_per_user_unique" UNIQUE("userId","name")
);
--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "texture" varchar(100);--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "densityGramsPerLiter" integer;--> statement-breakpoint
CREATE INDEX "lager_user_idx" ON "lager" USING btree ("userId");--> statement-breakpoint
--
-- Ab hier von Hand: `materials.lagerId` ist `NOT NULL`, aber bestehende Zeilen
-- haben noch kein Lager. drizzle-kit erzeugt dafür ein nacktes
-- `ADD COLUMN ... NOT NULL`, das auf **jeder** Datenbank mit Daten scheitert.
-- Also in drei Schritten: Spalte nullable anlegen, füllen, dann festziehen.
--
-- Der Backfill läuft in Produktion genau einmal und ist danach nicht mehr
-- prüfbar – `api/lager.integration.test.ts` deckt ihn deshalb eigens ab.
--
ALTER TABLE "materials" ADD COLUMN "lagerId" bigint;--> statement-breakpoint
--
-- Jeder bestehende Benutzer bekommt ein Lager mit allem darin. `materialKind`
-- ist 'filament', weil es bis 2.1.0 nichts anderes gab, und 1750 µm = 1,75 mm
-- ist die verbreitete Stärke; wer 2,85 mm führt, stellt es einmal um.
--
-- Auch Benutzer ohne Material bekommen eines: Sonst stünde der Erstbesuch nach
-- dem Update vor einer Materialübersicht ohne wählbares Lager.
INSERT INTO "lager" ("userId", "name", "materialKind", "filamentDiameterUm")
  SELECT "id", 'Mein Lager', 'filament', 1750 FROM "users";--> statement-breakpoint
UPDATE "materials" m SET "lagerId" = l."id"
  FROM "lager" l WHERE l."userId" = m."userId";--> statement-breakpoint
--
-- Erst jetzt festziehen. Schlägt die Anweisung fehl, gibt es Material ohne
-- Benutzer – dann ist der Datenbestand kaputt und die Migration soll abbrechen,
-- statt die Lücke mit einem erfundenen Lager zu überdecken.
ALTER TABLE "materials" ALTER COLUMN "lagerId" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "materials_lager_idx" ON "materials" USING btree ("lagerId");