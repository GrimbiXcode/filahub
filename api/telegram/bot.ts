import { and, eq, gt, isNull } from "drizzle-orm";
import { loginCodes } from "@db/schema";
import { getDb } from "../queries/connection";
import { env } from "../lib/env";

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: {
    from?: TelegramUser;
    text?: string;
  };
};

/** Antwortet auf eine Bot-Nachricht (Fehler werden nur geloggt). */
async function sendMessage(chatId: number, text: string) {
  try {
    await fetch(
      `https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      }
    );
  } catch (e) {
    console.warn("[telegram] sendMessage fehlgeschlagen:", e);
  }
}

/** Erzeugt einen neuen 6-stelligen Login-Code (10 Minuten gültig). */
async function issueLoginCode(user: TelegramUser): Promise<string> {
  const db = getDb();
  // Alte, unbenutzte Codes dieses Nutzers verwerfen
  await db
    .delete(loginCodes)
    .where(
      and(eq(loginCodes.telegramId, String(user.id)), isNull(loginCodes.usedAt))
    );

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const name =
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.username ||
    null;
  await db.insert(loginCodes).values({
    code,
    telegramId: String(user.id),
    telegramUsername: user.username ?? null,
    telegramName: name,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
  return code;
}

/** Verarbeitet eine eingehende Telegram-Nachricht. */
async function handleUpdate(update: TelegramUpdate) {
  const from = update.message?.from;
  const text = update.message?.text?.trim() ?? "";
  if (!from) return;

  if (text === "/start" || text.startsWith("/login") || text === "/code") {
    const code = await issueLoginCode(from);
    await sendMessage(
      from.id,
      // Zweisprachig: Der Bot kennt die Spracheinstellung nicht – beim /login
      // existiert der Benutzer in der Datenbank oft noch gar nicht.
      `Dein Login-Code für filahub / Your filahub login code:\n\n${code}\n\n` +
        `Der Code ist 10 Minuten gültig. Gib ihn auf der Website ein, um dich anzumelden.\n` +
        `The code is valid for 10 minutes. Enter it on the website to sign in.`
    );
  } else if (text === "/id") {
    await sendMessage(from.id, `Deine Telegram-ID: ${from.id}`);
  }
}

/**
 * Startet das Long-Polling des Telegram-Bots (nur wenn ein Token konfiguriert ist).
 * Läuft im Hintergrund; Fehler werden geloggt und mit Backoff erneut versucht.
 */
export function startTelegramBot() {
  if (!env.telegramBotToken) {
    console.log(
      "[telegram] Kein TELEGRAM_BOT_TOKEN gesetzt – Bot-Polling deaktiviert."
    );
    return;
  }

  let offset = 0;
  const poll = async () => {
    try {
      const resp = await fetch(
        `https://api.telegram.org/bot${env.telegramBotToken}/getUpdates?offset=${offset}&timeout=25`
      );
      if (resp.ok) {
        const data = (await resp.json()) as {
          ok: boolean;
          result?: TelegramUpdate[];
        };
        for (const update of data.result ?? []) {
          offset = update.update_id + 1;
          await handleUpdate(update);
        }
      } else {
        const body = await resp.text();
        console.warn(
          `[telegram] getUpdates ${resp.status}: ${body.slice(0, 200)}`
        );
        await new Promise(r => setTimeout(r, 10000));
      }
    } catch (e) {
      console.warn("[telegram] Polling-Fehler:", e);
      await new Promise(r => setTimeout(r, 10000));
    }
    setTimeout(poll, 0);
  };
  void poll();
  console.log(
    `[telegram] Bot-Polling gestartet (@${env.telegramBotUsername || "?"})`
  );
}

/** Prüft einen eingegebenen Code und markiert ihn als verwendet. */
export async function redeemLoginCode(code: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(loginCodes)
    .where(
      and(
        eq(loginCodes.code, code),
        isNull(loginCodes.usedAt),
        gt(loginCodes.expiresAt, new Date())
      )
    )
    .limit(1);
  const entry = rows.at(0);
  if (!entry) return null;
  await db
    .update(loginCodes)
    .set({ usedAt: new Date() })
    .where(eq(loginCodes.id, entry.id));
  return entry;
}
