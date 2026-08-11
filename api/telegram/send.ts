import { env } from "../lib/env";

/**
 * Ausgehende Telegram-Nachrichten.
 *
 * Eigenes Modul und nicht in `bot.ts`, aus zwei Gründen:
 *
 *  1. Ein Router darf eine Benachrichtigung schicken, ohne die Polling-Schleife
 *     zu importieren. `bot.ts` startet mit `startTelegramBot()` einen
 *     Dauerprozess; esbuild bündelt `api/boot.ts` in eine einzige Datei, und
 *     ein Import aus einem Router zöge den Bot in jeden Aufrufpfad.
 *  2. Der Erfolg muss sichtbar sein. `sendMessage` in `bot.ts` verschluckt
 *     Fehler bewusst – bei einer Antwort auf `/login` ist das richtig, dort
 *     kann niemand etwas damit anfangen. Bei einer Ausleih-Anfrage schon: Wenn
 *     die Nachricht nicht ankommt, soll die Oberfläche sagen können, dass der
 *     Vorgang trotzdem in der App liegt.
 */

/**
 * Schickt eine Nachricht an einen Telegram-Chat.
 *
 * Die Chat-ID ist die Telegram-User-ID, in der Datenbank `users.unionId`.
 *
 * Gibt `false` zurück, statt zu werfen: Eine fehlgeschlagene Benachrichtigung
 * darf den Vorgang nicht scheitern lassen, der sie ausgelöst hat.
 *
 * Häufigster Grund für `false` ist kein Fehler, sondern Telegram selbst: Ein
 * Bot darf einem Menschen nur schreiben, wenn dieser den Chat einmal selbst
 * geöffnet hat (`403 bot can't initiate conversation`). Wer sich
 * ausschließlich über das Login-Widget angemeldet hat, ist also unerreichbar.
 */
export async function sendTelegramMessage(
  chatId: string | number,
  text: string
): Promise<boolean> {
  if (!env.telegramBotToken) {
    /*
      Ohne Token gibt es keinen Bot – etwa in der Entwicklung, wo
      `startTelegramBot()` ohnehin nicht läuft (siehe api/boot.ts). Die
      Funktion bleibt bedienbar, nur ohne Nachricht; der Aufrufer erfährt es
      über den Rückgabewert.
    */
    console.log(
      "[telegram] Kein TELEGRAM_BOT_TOKEN – Nachricht nicht gesendet."
    );
    return false;
  }
  try {
    const resp = await fetch(
      `https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      }
    );
    if (!resp.ok) {
      const body = await resp.text();
      console.warn(
        `[telegram] sendMessage ${resp.status}: ${body.slice(0, 200)}`
      );
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[telegram] sendMessage fehlgeschlagen:", e);
    return false;
  }
}

/**
 * Baut einen Link in die App, sofern die öffentliche Adresse konfiguriert ist.
 *
 * `null`, wenn `APP_BASE_URL` fehlt. Dann nennt die Nachricht nur den Ort in
 * der App – besser als ein kaputter Link oder eine erratene Adresse.
 */
export function appLink(path: string): string | null {
  if (!env.appBaseUrl) return null;
  return `${env.appBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
