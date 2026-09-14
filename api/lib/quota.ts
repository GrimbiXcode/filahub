import { TRPCError } from "@trpc/server";
import { exceedsLimit } from "@contracts/limits";
import { recordAudit } from "../queries/audit";

/**
 * Die eine Stelle, an der eine erreichte Mengenobergrenze zum Fehler wird.
 *
 * Sie steht hier und nicht in `api/queries/`, weil sie `TRPCError` wirft – der
 * Abfrage-Layer kennt tRPC nicht und soll es nicht kennen (dieselbe Begründung
 * wie bei `resolveScope` in `api/scope.ts`).
 *
 * Zusammengefasst statt an sieben Stellen ausgeschrieben, aus zwei Gründen:
 * Der Protokolleintrag wird sonst irgendwo vergessen, und `>=` statt `>` ist
 * der Fehler, den beim Lesen niemand sieht – die Entscheidung dazu steht als
 * reine Funktion in `contracts/limits.ts` und ist dort ohne Datenbank geprüft.
 *
 * `TOO_MANY_REQUESTS` und nicht `BAD_REQUEST`: Die Anfrage ist in Ordnung, nur
 * das Kontingent ist es nicht – dieselbe Lesart wie bei der Zugriffsbegrenzung.
 */
export function assertWithinLimit(options: {
  /** Stand **vor** der Handlung. */
  current: number;
  max: number;
  /** Wie viele Zeilen die Handlung anlegt – der Massenimport bringt viele. */
  adding?: number;
  /** Kennung fürs Protokoll, z. B. `"materials_per_lager"`. */
  quota: string;
  /** Was der Benutzer liest. Deutsch, und nennt die Grenze. */
  message: string;
  actorUserId?: number | null;
  ip?: string | null;
}): void {
  const adding = options.adding ?? 1;
  if (!exceedsLimit(options.current, options.max, adding)) return;

  /*
    Wie beim Rate-Limit nur das Zuschlagen protokollieren: Jede erlaubte
    Anlage mitzuschreiben machte aus der Abwehr das Nutzungsprotokoll, das
    `contracts/audit.ts` ausdrücklich ausschließt.
  */
  recordAudit({
    event: "limit.quota_exceeded",
    actorUserId: options.actorUserId ?? null,
    ip: options.ip,
    detail: { quota: options.quota, max: options.max },
  });

  throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: options.message });
}
