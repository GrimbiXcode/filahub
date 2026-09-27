-- Oberflächen seit 4.5.0: `carbon` heißt `fiber`, dazu vier neue Musterarten.

/*
  **Von Hand geschrieben.** drizzle-kit erkennt die Umbenennung eines
  Enum-Werts nicht und erzeugt statt dessen: Spalte auf `text` umgießen, Typ
  löschen, Typ neu anlegen, Spalte zurückgießen. Auf jeder Datenbank mit einer
  eigenen Oberfläche der Art `carbon` scheitert der Rückguss – den Wert gibt es
  im neuen Typ nicht mehr. `RENAME VALUE` ändert dagegen nur den Namen im
  Katalog; die gespeicherten Zeilen verweisen auf den Wert, nicht auf seinen
  Text, und heißen danach von selbst `fiber`.

  Der Snapshot `meta/0026_snapshot.json` ist der von drizzle-kit erzeugte und
  beschreibt denselben Endstand. Die Probe: `npm run db:generate` erzeugt
  danach keine weitere Migration.

  `ADD VALUE` hängt an; die Reihenfolge entspricht `TEXTURE_KINDS` in
  `contracts/appearance.ts`. Die neuen Werte sind erst nach dem Commit
  benutzbar – diese Migration verwendet sie deshalb nicht selbst.
*/
ALTER TYPE "public"."texture_kind" RENAME VALUE 'carbon' TO 'fiber';--> statement-breakpoint
ALTER TYPE "public"."texture_kind" ADD VALUE 'speckle';--> statement-breakpoint
ALTER TYPE "public"."texture_kind" ADD VALUE 'sparkle';--> statement-breakpoint
ALTER TYPE "public"."texture_kind" ADD VALUE 'marble';--> statement-breakpoint
ALTER TYPE "public"."texture_kind" ADD VALUE 'satin';
