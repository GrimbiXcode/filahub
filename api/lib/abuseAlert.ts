import { evaluateAlerts, type AbuseAlert } from "@contracts/limits";
import { collectAbuseCounts } from "../queries/abuse";
import { ABUSE_PATH, notifyAdmins } from "./notify";

/**
 * Weckt die Administratoren, wenn eine Schwelle gerissen ist.
 *
 * Die Entscheidung selbst steht als reine Funktion in `contracts/limits.ts`
 * (`evaluateAlerts`) und ist dort ohne Datenbank geprüft. Hier liegt nur, was
 * sich nicht prüfen lässt: das Abklingen und der Versand.
 */

/**
 * Wie lange nach einer Meldung dieselbe Schwelle schweigt.
 *
 * **Ohne das schreibt ein Angriff den Administratoren im Viertelstundentakt.**
 * Eine Meldung, die man wegwischt, ist schlechter als keine – sie erzieht dazu,
 * die nächste auch wegzuwischen. Sechs Stunden sind lang genug, dass ein
 * andauernder Vorfall höchstens viermal am Tag anklopft, und kurz genug, dass
 * ein zweiter, neuer Vorfall nicht untergeht.
 */
const COOLDOWN_MS = 6 * 60 * 60 * 1000;

/**
 * Wann welche Schwelle zuletzt gemeldet wurde.
 *
 * Im Arbeitsspeicher wie die Zugriffsbegrenzung (`api/lib/rateLimit.ts`) und
 * aus demselben Grund: Das ausgelieferte Abbild ist ein einzelner Container.
 * Folge wie dort – wer über mehrere Repliken skaliert, bekommt die Meldung je
 * Replik einmal. Ein Neustart meldet einen andauernden Vorfall erneut, und das
 * ist die richtige Richtung: Lieber eine Meldung zu viel nach einem Neustart
 * als eine verschwiegene.
 */
const lastSent = new Map<string, number>();

/** Nur für Tests: vergisst, was schon gemeldet wurde. */
export function resetAbuseAlertCooldown() {
  lastSent.clear();
}

/**
 * Filtert heraus, was gerade nicht schweigen muss.
 *
 * Rein und ohne Seiteneffekt außer dem Merker – damit bleibt `runAbuseCheck`
 * darunter eine Zeile Ablauf und diese Entscheidung einzeln nachvollziehbar.
 */
export function dueAlerts(
  alerts: AbuseAlert[],
  now = Date.now()
): AbuseAlert[] {
  const due = alerts.filter(alert => {
    const last = lastSent.get(alert.key);
    return last === undefined || now - last >= COOLDOWN_MS;
  });
  for (const alert of due) lastSent.set(alert.key, now);
  return due;
}

/** Die Zeile, die ein Administrator in Telegram liest. */
function describe(alert: AbuseAlert): string {
  const labels: Record<AbuseAlert["key"], string> = {
    rateLimited: "Abgewiesene Zugriffe",
    quotaExceeded: "Erreichte Obergrenzen",
    registrationBlocked: "Abgewiesene Registrierungen",
    pendingUnblockRequests: "Offene Entsperr-Anträge",
  };
  // Ohne Zeitraum bei einer Schwelle über den Bestand – „(, Schwelle 5)“ wäre
  // die Art von Klammer, an der man merkt, dass niemand hingesehen hat.
  const zeitraum = alert.window ? `${alert.window}, ` : "";
  return `• ${labels[alert.key]}: ${alert.count} (${zeitraum}Schwelle ${alert.threshold})`;
}

/**
 * Ein Durchlauf der Überwachung.
 *
 * Fehlertolerant wie `runRetentionSweep`: Eine Meldung, die nicht hinausgeht,
 * ist ein Betriebsproblem und kein Grund, den Dienst zu stören. Sie landet
 * deshalb in der Konsole und nicht in einer Ausnahme.
 */
export async function runAbuseCheck(): Promise<AbuseAlert[]> {
  try {
    const counts = await collectAbuseCounts();
    const due = dueAlerts(evaluateAlerts(counts));
    if (due.length === 0) return [];

    const lines = due.map(describe).join("\n");
    await notifyAdmins(m => m.abuseAlert({ lines }), ABUSE_PATH);
    console.warn(`[missbrauch] ${due.length} Schwelle(n) gerissen:\n${lines}`);
    return due;
  } catch (error) {
    console.warn("[missbrauch] Prüfung fehlgeschlagen:", error);
    return [];
  }
}
