-- Nachzügler der Umbenennung aus 0010: der Schlüssel **innerhalb** der Payload.

/*
  `0010` hat Tabellen, Spalten und den Enum-Typ umbenannt, aber nicht in
  `preset_proposals.payload` hineingesehen. Dort steht ein Vorschlag als JSON, und
  ein vor 2.3.0 eingereichter trägt darin noch `spoolMaterial`.

  Das ist nicht bloß unschön: `proposalPayloadSchema` kennt den Schlüssel nicht
  mehr, und zod verwirft unbekannte Schlüssel stillschweigend. Nimmt eine
  Administratorin einen solchen Vorschlag an, schreibt `applyProposal`
  `containerMaterial = null` – die Angabe des Einreichers ist weg, ohne Fehler und
  ohne Spur im Protokoll. Beim Änderungsvorschlag bleibt nach dem Verwerfen ein
  leerer Patch übrig, was zwar auffällt („nicht mehr mit dem aktuellen Schema
  kompatibel“), aber auch nicht zu retten ist.

  Zwei Anweisungen, weil die Payload je Vorschlagsart anders aufgebaut ist:
  `payload.version` beim neuen Preset, `payload.patch` beim Änderungsvorschlag.
  Die `WHERE`-Klausel stellt sicher, dass das Teilobjekt existiert – ein zweiter
  Lauf findet nichts mehr, die Migration ist also wiederholbar.
*/

UPDATE "preset_proposals"
   SET "payload" = jsonb_set(
         "payload",
         '{version}',
         ("payload" -> 'version') - 'spoolMaterial'
           || jsonb_build_object(
                'containerMaterial',
                "payload" -> 'version' -> 'spoolMaterial'
              )
       )
 WHERE "payload" -> 'version' ? 'spoolMaterial';--> statement-breakpoint

UPDATE "preset_proposals"
   SET "payload" = jsonb_set(
         "payload",
         '{patch}',
         ("payload" -> 'patch') - 'spoolMaterial'
           || jsonb_build_object(
                'containerMaterial',
                "payload" -> 'patch' -> 'spoolMaterial'
              )
       )
 WHERE "payload" -> 'patch' ? 'spoolMaterial';
