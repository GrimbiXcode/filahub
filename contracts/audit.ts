/**
 * Ereignisse des Audit-Logs.
 *
 * Wie die übrigen Dateien in `contracts/` von Client, Server und Tests
 * importierbar – hier darf zur Laufzeit nichts aus `@db` oder `api/` geladen
 * werden.
 *
 * Zweck des Protokolls ist die Erkennung und Aufklärung von Vorfällen: Wer hat
 * sich wann angemeldet, welche Versuche schlugen fehl, wer hat administrativ
 * eingegriffen. Es ist bewusst **kein** Nutzungsprotokoll – wer welche Rolle
 * gewogen hat, gehört nicht hinein.
 */

export const AUDIT_EVENTS = [
  /** Anmeldung erfolgreich */
  "login.success",
  /** Code ungültig oder abgelaufen */
  "login.failed",
  /** Konto nicht freigeschaltet bzw. Registrierung geschlossen */
  "login.blocked",
  /** Zugriffsbegrenzung hat zugeschlagen */
  "login.rate_limited",
  /** Signatur des Telegram-Widgets nicht verifizierbar */
  "login.widget_invalid",
  /** Abmeldung auf diesem Gerät */
  "logout",
  /** Alle Sitzungen entwertet */
  "session.revoked",
  /** Datenauskunft nach Art. 15/20 DSGVO erteilt */
  "account.exported",
  /** Konto gelöscht nach Art. 17 DSGVO */
  "account.deleted",
  /** Preset-Vorschlag angenommen */
  "proposal.approved",
  /** Preset-Vorschlag abgelehnt */
  "proposal.rejected",
] as const;

export type AuditEvent = (typeof AUDIT_EVENTS)[number];

/**
 * Aufbewahrung des Audit-Logs.
 *
 * Lang genug, um einen Vorfall aufzuklären, der erst Wochen später auffällt –
 * kurz genug, dass hier kein dauerhaftes Bewegungsprofil entsteht. Das
 * Protokoll ist selbst personenbezogen und stützt sich auf Art. 6 Abs. 1
 * lit. f DSGVO; eine unbegrenzte Aufbewahrung wäre davon nicht gedeckt.
 */
export const AUDIT_RETENTION_DAYS = 90;
