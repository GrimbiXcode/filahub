import { lt } from "drizzle-orm";
import { loginCodes } from "@db/schema";
import { purgeAuditLog } from "./audit";
import { getDb } from "./connection";

/**
 * Aufbewahrung personenbezogener Daten, die nicht am Benutzerkonto hängen.
 *
 * Login-Codes tragen Telegram-ID, Benutzername und Anzeigename – auch dann,
 * wenn nie ein Konto daraus wurde, etwa weil die Whitelist den Zugang
 * verweigert hat. Ohne Aufräumen sammelt sich hier ein Personenbestand an,
 * den niemand je liest und für den es keinen Zweck mehr gibt.
 */

/** Ab wann ein Login-Code endgültig verfällt, unabhängig von `usedAt`. */
const LOGIN_CODE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Löscht Login-Codes, die älter als 24 Stunden sind – verbrauchte, abgelaufene
 * und offene gleichermaßen. Eine einzige Regel über `createdAt` genügt: Codes
 * sind nur Minuten gültig, alles darüber hinaus ist Altlast.
 *
 * Gibt die Anzahl gelöschter Zeilen zurück, damit der Aufrufer sie loggen kann.
 */
export async function purgeExpiredLoginCodes(): Promise<number> {
  const cutoff = new Date(Date.now() - LOGIN_CODE_TTL_MS);
  const deleted = await getDb()
    .delete(loginCodes)
    .where(lt(loginCodes.createdAt, cutoff))
    .returning({ id: loginCodes.id });
  return deleted.length;
}

/**
 * Sammelstelle für alle wiederkehrenden Löschläufe. Bewusst fehlertolerant:
 * Aufbewahrung ist wichtig, aber kein Grund, den Serverstart scheitern zu
 * lassen oder eine Anmeldung zu blockieren.
 */
export async function runRetentionSweep(): Promise<void> {
  try {
    const codes = await purgeExpiredLoginCodes();
    if (codes > 0) {
      console.log(`[retention] ${codes} abgelaufene Login-Codes gelöscht.`);
    }
  } catch (error) {
    console.warn(
      "[retention] Löschlauf für Login-Codes fehlgeschlagen:",
      error
    );
  }

  /*
    Eigener try/catch: Scheitert das eine, soll das andere trotzdem laufen.
    Beides in einem Block hätte zur Folge, dass ein Fehler bei den Codes das
    Audit-Log unbegrenzt anwachsen ließe – und das ist selbst personenbezogen.
  */
  try {
    const entries = await purgeAuditLog();
    if (entries > 0) {
      console.log(`[retention] ${entries} alte Protokolleinträge gelöscht.`);
    }
  } catch (error) {
    console.warn(
      "[retention] Löschlauf für das Audit-Log fehlgeschlagen:",
      error
    );
  }
}
