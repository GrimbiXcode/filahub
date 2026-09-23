-- Kennungen je Lager eindeutig machen (3.1.0).

/*
  Seit 3.1.0 darf eine Kennung je Lager nur einmal vorkommen, ohne Rücksicht auf
  Groß-/Kleinschreibung (`normalizeIdentifier`, `contracts/identifierTemplate.ts`).
  Vorher war das nirgends geprüft, der Altbestand kann also Dubletten enthalten –
  und an denen scheiterte das `CREATE UNIQUE INDEX` am Ende.

  1. Leerraum am Rand fällt weg, eine leere Kennung wird NULL. Die Eingabe tut
     das seit 3.1.0 selbst (`identifierInputSchema`); ohne diesen Schritt wären
     „F01“ und „F01 “ im Index zwei Kennungen.
  2. Dubletten bekommen einen Zusatz: Das älteste Material (kleinste ID) behält
     seine Kennung, die weiteren heißen „F01 (2)“, „F01 (3)“ … Gelöscht oder
     geleert wird nichts – eine Kennung steht womöglich auf einem Etikett, und
     wer sie wiederfindet, soll sehen, woher der Zusatz kommt. Passt der Zusatz
     nicht mehr in 50 Zeichen, wird vorne gekürzt.

  Ein zweiter Lauf findet nichts mehr zu ändern, daher auch `IF NOT EXISTS`.
  Geprüft in `api/lager.integration.test.ts` an einem von Hand angelegten
  Altbestand.
*/

UPDATE "materials"
SET "identifier" = NULLIF(btrim("identifier"), '')
WHERE "identifier" IS DISTINCT FROM NULLIF(btrim("identifier"), '');
--> statement-breakpoint
WITH ranked AS (
  SELECT
    "id",
    "identifier",
    ' (' || row_number() OVER (
      PARTITION BY "lagerId", lower("identifier")
      ORDER BY "id"
    ) || ')' AS suffix,
    row_number() OVER (
      PARTITION BY "lagerId", lower("identifier")
      ORDER BY "id"
    ) AS rank
  FROM "materials"
  WHERE "identifier" IS NOT NULL
)
UPDATE "materials" AS m
SET "identifier" = left(r."identifier", 50 - length(r.suffix)) || r.suffix
FROM ranked AS r
WHERE m."id" = r."id" AND r.rank > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "materials_identifier_per_lager_unique" ON "materials" USING btree ("lagerId",lower("identifier")) WHERE "identifier" IS NOT NULL;
