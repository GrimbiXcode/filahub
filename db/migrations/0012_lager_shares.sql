-- Freigaben je Lager statt je Freundschaft.

/*
  Die Stufe hing bis 2.3.0 an der Freundschaft und galt für den gesamten
  Bestand (`friendships.visibilityFromUser` / `visibilityFromFriend`). Ab hier
  steht sie je Lager und Empfänger.

  Drei Schritte in **einer** Transaktion, und die Reihenfolge ist nicht
  beliebig: Tabelle anlegen, Rechte übertragen, alte Spalten entfernen. Der
  `DROP COLUMN` am Ende ist nicht umkehrbar – wer ihn vorzieht, hat die Vorlage
  für den Backfill gelöscht.
*/

CREATE TABLE "lager_shares" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lagerId" bigint NOT NULL,
	"sharedWithUserId" bigint NOT NULL,
	"visibility" "friend_visibility" NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lager_shares_unique" UNIQUE("lagerId","sharedWithUserId")
);
--> statement-breakpoint
CREATE INDEX "lager_shares_recipient_idx" ON "lager_shares" USING btree ("sharedWithUserId");--> statement-breakpoint
CREATE INDEX "lager_shares_lager_idx" ON "lager_shares" USING btree ("lagerId");--> statement-breakpoint

/*
  Backfill – **er muss den bestehenden Zugriff erhalten.** Alles andere ändert
  stillschweigend Rechte: Zu wenig, und ein Freund verliert ohne Ankündigung,
  was er sehen durfte; zu viel, und ein Lager steht offen, das niemand
  freigegeben hat.

  Die alte Stufe galt für den ganzen Bestand, deshalb bekommt **jedes** Lager
  des Eigentümers eine Zeile. Wer mehrere Lager führt, kann danach je Lager
  zurücknehmen – das ist der Sinn der Änderung.

  Zwei Einschränkungen, beide bewusst:

   - Nur `status = 'accepted'`. Eine offene oder abgelehnte Anfrage gewährte
     schon vorher nichts (`resolveVisibility` prüfte den Status), und eine Zeile
     dafür anzulegen hieße, sie beim Annehmen wirksam werden zu lassen.
   - Nur Stufen über `none`. Eine fehlende Zeile **ist** `none`; es gibt keine
     `none`-Zeilen (siehe den Kommentar an der Tabelle in `db/schema.ts`).

  Ohne `ON CONFLICT`: Ein Konflikt bräuchte zwei Freundschaftszeilen für
  dasselbe Paar oder eine Freundschaft mit sich selbst. Beides ist ausgeschlossen
  – durch den Ausdrucks-Index aus `0008_friends.sql` und die Prüfung in
  `api/friendRouter.ts`. Träfe es doch zu, soll diese Migration scheitern und
  zurückrollen, statt eine von zwei widersprüchlichen Stufen zu würfeln.
*/

-- Was der Angefragte vom Bestand des Anfragenden sah:
INSERT INTO "lager_shares" ("lagerId", "sharedWithUserId", "visibility")
SELECT l."id", f."friendUserId", f."visibilityFromUser"
  FROM "friendships" f
  JOIN "lager" l ON l."userId" = f."userId"
 WHERE f."status" = 'accepted'
   AND f."visibilityFromUser" <> 'none';--> statement-breakpoint

-- Und die andere Richtung:
INSERT INTO "lager_shares" ("lagerId", "sharedWithUserId", "visibility")
SELECT l."id", f."userId", f."visibilityFromFriend"
  FROM "friendships" f
  JOIN "lager" l ON l."userId" = f."friendUserId"
 WHERE f."status" = 'accepted'
   AND f."visibilityFromFriend" <> 'none';--> statement-breakpoint

ALTER TABLE "friendships" DROP COLUMN "visibilityFromUser";--> statement-breakpoint
ALTER TABLE "friendships" DROP COLUMN "visibilityFromFriend";
