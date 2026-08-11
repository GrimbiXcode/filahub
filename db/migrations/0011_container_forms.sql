-- Gebindeformen und zwei neue Gebindewerkstoffe.

/*
  Neue Enum-Werte. `ALTER TYPE … ADD VALUE` läuft seit PostgreSQL 12 auch
  innerhalb einer Transaktion – die Einschränkung ist, dass der neue Wert nicht
  in derselben Transaktion **benutzt** werden darf. Hier wird er nur angelegt,
  gesetzt wird er später durch Benutzer und Katalogpflege.

  Angehängt statt eingeschoben: Die Reihenfolge im Enum bestimmt die Sortierung,
  und `ADD VALUE … BEFORE` wäre für zwei Werkstoffe unnötige Genauigkeit.
*/
ALTER TYPE "public"."preset_container_material" ADD VALUE IF NOT EXISTS 'glas';--> statement-breakpoint
ALTER TYPE "public"."preset_container_material" ADD VALUE IF NOT EXISTS 'folie';--> statement-breakpoint

CREATE TYPE "public"."container_form" AS ENUM('rolle', 'beutel', 'flasche', 'eimer', 'kartusche', 'sonstiges');--> statement-breakpoint

/*
  Eigene Gebindearten: Form ist Pflicht, Vorgabe `rolle`.

  Der Backfill ist keine Annahme, sondern der tatsächliche Stand: Bis 2.2.0
  konnte in dieser Tabelle nichts anderes als eine Rolle stehen. Die Spalte
  bekommt die Vorgabe direkt bei `ADD COLUMN` – damit ist sie für jede
  bestehende Zeile gesetzt, ohne dass ein separates UPDATE nötig wäre.
*/
ALTER TABLE "container_types" ADD COLUMN "form" "container_form" DEFAULT 'rolle' NOT NULL;--> statement-breakpoint

/*
  Katalog: Form bleibt `NULL` für alles, was vorher angelegt wurde – bewusst
  **kein** Backfill. Der Startkatalog führt zwar ausschließlich Spulen, aber
  Einträge von Administratoren und aus der Community können alles sein. Eine
  gesetzte Form wäre eine Angabe, die niemand geprüft hat und die später als
  gepflegt gelesen würde.
*/
ALTER TABLE "preset_container_versions" ADD COLUMN "form" "container_form";
