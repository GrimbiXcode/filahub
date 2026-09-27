-- Material und Gebinde (4.0.0).

/*
  Bis 3.1.0 war eine Zeile in `materials` beides: das Produkt („Polymaker
  PolyTerra PLA, Charcoal Black“) und das Stück im Lager. Seit 4.0.0 stehen
  Name, Materialart, Hersteller, Farbe, Oberfläche und Dichte am **Material**
  (`material_products`), und `materials` ist das **Gebinde**.

  drizzle-kit erzeugt `CREATE TABLE`, `ADD COLUMN … NOT NULL` und
  `DROP COLUMN`, aber keinen Backfill – das nackte `ADD COLUMN … NOT NULL`
  scheiterte auf jeder Datenbank mit Daten. Deshalb von Hand ergänzt, nach dem
  Muster von `0009_lager.sql` und `0012_lager_shares.sql`: Spalte nullable
  anlegen, füllen, festziehen, und die alten Spalten erst ganz am Ende löschen.

  Zusammengelegt wird **konservativ** – zwei fälschlich zusammengelegte Rollen
  sind schlimmer als zwei getrennte, weil die Warnung dann zu spät kommt. Ein
  Material für mehrere Gebinde entsteht nur, wenn im selben Bereich alle
  Merkmale übereinstimmen: Materialart und Stärke des Lagers,
  Materialart-Bezeichnung (Großbuchstaben, Leerraum bereinigt), Hersteller,
  Farbe, Oberfläche (klein, Leerraum bereinigt) – und Hersteller und Farbe
  nicht leer sind. Das ist `productKey` in `contracts/materials.ts`, Stand
  4.0.0. Alles andere wird ein eigenes Material; zusammenführen lässt es sich
  danach in der App.

  Name, Dichte und Anlagezeitpunkt des Materials stammen vom **ältesten**
  Gebinde der Gruppe. Die Hilfstabellen sind temporär und werden am Ende
  ausdrücklich gelöscht – auch dann, wenn die Datei außerhalb einer
  Transaktion läuft. Geprüft in `api/materialProducts.integration.test.ts` an
  einem von Hand angelegten Altbestand.
*/

CREATE TABLE "material_products" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint,
	"organizationId" bigint,
	"name" varchar(255) NOT NULL,
	"materialType" varchar(100) NOT NULL,
	"manufacturer" varchar(255),
	"color" varchar(100),
	"texture" varchar(100),
	"densityGramsPerLiter" integer,
	"notes" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_products_owner_xor" CHECK (num_nonnulls("userId", "organizationId") = 1)
);
--> statement-breakpoint
ALTER TABLE "lager" ADD COLUMN "lowStockGrams" integer;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "productId" bigint;--> statement-breakpoint
CREATE TEMP TABLE "_material_product_groups" AS
SELECT
  m."id" AS "materialId",
  CASE
    WHEN l."id" IS NOT NULL
      AND lower(regexp_replace(regexp_replace(coalesce(m."manufacturer", ''), '\s+', ' ', 'g'), '^ | $', '', 'g')) <> ''
      AND lower(regexp_replace(regexp_replace(coalesce(m."color", ''), '\s+', ' ', 'g'), '^ | $', '', 'g')) <> ''
    THEN concat_ws(
      chr(31),
      coalesce(m."userId"::text, ''),
      coalesce(m."organizationId"::text, ''),
      l."materialKind"::text,
      coalesce(l."filamentDiameterUm"::text, ''),
      upper(regexp_replace(regexp_replace(m."materialType", '\s+', ' ', 'g'), '^ | $', '', 'g')),
      lower(regexp_replace(regexp_replace(coalesce(m."manufacturer", ''), '\s+', ' ', 'g'), '^ | $', '', 'g')),
      lower(regexp_replace(regexp_replace(coalesce(m."color", ''), '\s+', ' ', 'g'), '^ | $', '', 'g')),
      lower(regexp_replace(regexp_replace(coalesce(m."texture", ''), '\s+', ' ', 'g'), '^ | $', '', 'g'))
    )
    ELSE 'single' || chr(31) || m."id"::text
  END AS "key"
FROM "materials" AS m
LEFT JOIN "lager" AS l ON l."id" = m."lagerId";
--> statement-breakpoint
CREATE TEMP TABLE "_material_product_seeds" AS
SELECT
  nextval(pg_get_serial_sequence('material_products', 'id')) AS "productId",
  oldest.*
FROM (
  SELECT DISTINCT ON (g."key")
    g."key",
    m."userId",
    m."organizationId",
    m."name",
    m."materialType",
    m."manufacturer",
    m."color",
    m."texture",
    m."densityGramsPerLiter",
    m."createdAt"
  FROM "_material_product_groups" AS g
  JOIN "materials" AS m ON m."id" = g."materialId"
  ORDER BY g."key", m."createdAt", m."id"
) AS oldest;
--> statement-breakpoint
INSERT INTO "material_products" (
  "id", "userId", "organizationId", "name", "materialType", "manufacturer",
  "color", "texture", "densityGramsPerLiter", "createdAt", "updatedAt"
)
SELECT
  "productId", "userId", "organizationId", "name", "materialType",
  "manufacturer", "color", "texture", "densityGramsPerLiter", "createdAt",
  "createdAt"
FROM "_material_product_seeds";
--> statement-breakpoint
UPDATE "materials" AS m
SET "productId" = s."productId"
FROM "_material_product_groups" AS g
JOIN "_material_product_seeds" AS s ON s."key" = g."key"
WHERE m."id" = g."materialId";
--> statement-breakpoint
DROP TABLE "_material_product_seeds";--> statement-breakpoint
DROP TABLE "_material_product_groups";--> statement-breakpoint
ALTER TABLE "materials" ALTER COLUMN "productId" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "material_products_user_idx" ON "material_products" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "material_products_organization_idx" ON "material_products" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "materials_product_idx" ON "materials" USING btree ("productId");--> statement-breakpoint
ALTER TABLE "materials" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "materials" DROP COLUMN "materialType";--> statement-breakpoint
ALTER TABLE "materials" DROP COLUMN "manufacturer";--> statement-breakpoint
ALTER TABLE "materials" DROP COLUMN "color";--> statement-breakpoint
ALTER TABLE "materials" DROP COLUMN "texture";--> statement-breakpoint
ALTER TABLE "materials" DROP COLUMN "densityGramsPerLiter";
