import { createHmac } from "node:crypto";
import { lt } from "drizzle-orm";
import { AUDIT_RETENTION_DAYS, type AuditEvent } from "@contracts/audit";
import { auditLog } from "@db/schema";
import { getDb } from "./connection";
import { env } from "../lib/env";

/**
 * Schreiben ins Sicherheitsprotokoll.
 *
 * Ohne dieses Protokoll ließ sich ein Vorfall aus den Aufzeichnungen der
 * Anwendung heraus nicht rekonstruieren – es gab nur Zeitstempel in den
 * Fachtabellen. Art. 32 DSGVO verlangt Maßnahmen, die Vorfälle erkennbar
 * machen; ohne Protokoll fehlt dafür die Grundlage.
 */

/**
 * Verschlüsselter Fingerabdruck einer Client-Adresse.
 *
 * HMAC statt einfachem Hash: Der IPv4-Raum umfasst 2^32 Werte und ist in
 * Minuten durchgerechnet – ein SHA256 der Adresse wäre praktisch Klartext.
 * Mit `APP_SECRET` als Schlüssel geht das nicht mehr, wiedererkennen lässt
 * sich dieselbe Adresse trotzdem.
 *
 * Nebeneffekt: Wird `APP_SECRET` gewechselt, sind alte Einträge nicht mehr
 * mit neuen korrelierbar. Das ist hinnehmbar – ein Secret-Wechsel meldet
 * ohnehin alle ab.
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHmac("sha256", env.appSecret).update(ip).digest("hex");
}

export type AuditInput = {
  event: AuditEvent;
  actorUserId?: number | null;
  subjectUserId?: number | null;
  telegramId?: string | null;
  /** Rohe Adresse – wird hier gehasht und nie im Klartext gespeichert. */
  ip?: string | null;
  detail?: Record<string, unknown> | null;
};

/**
 * Hält ein Ereignis fest.
 *
 * Bewusst ohne `await` am Aufrufort verwendbar und mit verschlucktem Fehler:
 * Ein Protokolleintrag darf niemals eine Anmeldung oder eine Löschung
 * scheitern lassen. Ein Ausfall des Protokolls ist ein Betriebsproblem, kein
 * Grund, den Dienst zu verweigern – deshalb landet er in der Konsole.
 */
export function recordAudit(input: AuditInput): void {
  void getDb()
    .insert(auditLog)
    .values({
      event: input.event,
      actorUserId: input.actorUserId ?? null,
      subjectUserId: input.subjectUserId ?? null,
      telegramId: input.telegramId ?? null,
      ipHash: hashIp(input.ip),
      detail: input.detail ?? null,
    })
    .catch(error => {
      console.warn("[audit] Eintrag konnte nicht geschrieben werden:", error);
    });
}

/** Löscht Protokolleinträge, die älter sind als die Aufbewahrungsfrist. */
export async function purgeAuditLog(): Promise<number> {
  const cutoff = new Date(
    Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  const deleted = await getDb()
    .delete(auditLog)
    .where(lt(auditLog.at, cutoff))
    .returning({ id: auditLog.id });
  return deleted.length;
}
