-- Materialarten, die sich nur in Groß-/Kleinschreibung oder Leerraum
-- unterscheiden, je Bereich zu einer Schreibweise zusammenführen (#36).

/*
  `materials.materialType` ist Freitext, und bis 2.9.0 verglichen die
  Vorschlagsliste des Formulars und der Filter der Übersicht exakt: Wer einmal
  „Pla“ statt „PLA“ eintrug, hatte von da an zwei Materialarten. Seit 2.9.1
  gilt die Vergleichsform aus `normalizeMaterialType` (`contracts/materials.ts`)
  – Groß-/Kleinschreibung und Leerraum zählen nicht –, und jeder Schreibpfad
  bildet die Eingabe über `canonicalMaterialType` auf die im Bereich schon
  vorhandene Schreibweise ab. Dafür muss der Altbestand einmal auf **eine**
  Schreibweise je Bereich und Vergleichsform gebracht werden; sonst stünden die
  Dubletten weiter da, und welche davon der Server beim nächsten Anlegen nähme,
  hinge an der Sortierung.

  Welche Schreibweise gewinnt, folgt derselben Rangfolge wie zur Laufzeit:

  1. Die aus der Vorschlagsliste (`COMMON_MATERIAL_TYPES`), wenn die
     Vergleichsform sie trifft – „pla“, „Pla“ und „PLA“ werden „PLA“. Die Liste
     steht hier als Kopie vom Stand 2.9.1: Eine Migration ist ein Schnappschuss
     und läuft genau einmal; wer die Liste später ändert, ändert diese Datei
     nicht.
  2. Sonst die häufigste Schreibweise im Bereich, bei Gleichstand die des
     ältesten Materials. Zur Laufzeit gibt es diesen Fall nicht mehr – dort
     steht je Vergleichsform nur noch eine Schreibweise, und die gewinnt.

  Der Bereich ist das Paar (`userId`, `organizationId`), genau eines davon
  gesetzt (`materials_owner_xor`); verglichen wird mit `IS NOT DISTINCT FROM`,
  weil `=` bei NULL nichts trifft. Ein zweiter Lauf findet nichts mehr zu
  ändern. `api/materialType.integration.test.ts` wendet die Datei auf einen von
  Hand angelegten Altbestand an und prüft das Ergebnis – in Produktion läuft sie
  einmal und ist danach nicht mehr beobachtbar.

  `upper()` folgt der Locale der Datenbank, die Vergleichsform im Code nicht;
  bei Umlauten könnten beide auseinandergehen. Materialarten sind Abkürzungen
  („PLA“, „PETG“, „PA (Nylon)“) – der Fall kommt dort nicht vor.
*/

WITH common(spelling) AS (
  VALUES ('PLA'), ('PLA+'), ('PETG'), ('ABS'), ('ASA'), ('TPU'),
         ('PA (Nylon)'), ('PC'), ('PET'), ('HIPS'), ('PVA'), ('PP'), ('Resin')
),
keyed AS (
  SELECT "id", "userId", "organizationId",
         regexp_replace(btrim("materialType"), '\s+', ' ', 'g') AS spelling,
         upper(regexp_replace(btrim("materialType"), '\s+', ' ', 'g')) AS key
    FROM "materials"
),
-- Je Bereich und Vergleichsform die häufigste Schreibweise, bei Gleichstand
-- die des ältesten Materials.
majority AS (
  SELECT DISTINCT ON ("userId", "organizationId", key)
         "userId", "organizationId", key, spelling
    FROM (
      SELECT "userId", "organizationId", key, spelling,
             count(*) AS occurrences, min("id") AS first_id
        FROM keyed
       GROUP BY "userId", "organizationId", key, spelling
    ) counted
   ORDER BY "userId", "organizationId", key, occurrences DESC, first_id
),
canon AS (
  SELECT m."userId", m."organizationId", m.key,
         coalesce(c.spelling, m.spelling) AS spelling
    FROM majority m
    LEFT JOIN common c ON upper(c.spelling) = m.key
)
UPDATE "materials" t
   SET "materialType" = canon.spelling
  FROM keyed
  JOIN canon ON canon."userId" IS NOT DISTINCT FROM keyed."userId"
            AND canon."organizationId" IS NOT DISTINCT FROM keyed."organizationId"
            AND canon.key = keyed.key
 WHERE t."id" = keyed."id"
   AND t."materialType" <> canon.spelling;
