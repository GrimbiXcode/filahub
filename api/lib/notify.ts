import {
  notificationMessages,
  type NotificationMessages,
} from "@contracts/notifications";
import { findNotificationTarget } from "../queries/friends";
import { appLink, sendTelegramMessage } from "../telegram/send";

/**
 * Ausgehende Telegram-Hinweise – gemeinsam genutzt von Freundschaften und
 * Organisationen.
 *
 * Stand bis 2.4.1 in `api/friendRouter.ts`; mit den Organisationen gibt es
 * einen zweiten Aufrufer, und eine zweite Fassung derselben Funktion wäre eine
 * zweite Stelle, an der die Sprache des Empfängers falsch gewählt werden kann.
 */

/**
 * Verschickt eine Benachrichtigung, wenn der Empfänger erreichbar ist.
 *
 * Der Rückgabewert wandert bis in die Oberfläche: Telegram lässt einen Bot nur
 * schreiben, wenn der Empfänger den Chat einmal geöffnet hat. Wer sich nur über
 * das Login-Widget angemeldet hat, erfährt von seiner Anfrage erst beim
 * nächsten Besuch – das soll der Absender wissen, statt auf eine Antwort zu
 * warten, die nie kommt.
 */
export async function notify(
  recipientId: number,
  build: (m: NotificationMessages) => string,
  path: string
): Promise<boolean> {
  const target = await findNotificationTarget(recipientId);
  if (!target) return false;
  const messages = notificationMessages(target.language);
  const link = appLink(path);
  const text = build(messages) + (link ? messages.openLink({ url: link }) : "");
  return sendTelegramMessage(target.unionId, text);
}

/** Anzeigename für Benachrichtigungen. `users.name` ist nullable. */
export function displayName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  return trimmed === "" ? "Jemand" : trimmed;
}

/**
 * Wohin ein Hinweis zu Organisationen führt.
 *
 * Der Pfad steht hier und nicht in `src/const.ts`: Der Server darf nichts aus
 * `src/` laden, und ein zweites Mal eingetippt würde er beim nächsten Umbenennen
 * stillschweigend falsch. Beide Fassungen zusammenzuführen hieße, die Pfade
 * nach `contracts/` zu ziehen – das lohnt für einen Pfad noch nicht.
 */
export const ORGANIZATIONS_PATH = "/organisationen";
