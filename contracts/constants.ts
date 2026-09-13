export const Session = {
  cookieName: "filament_sid",
  /**
   * Lebensdauer einer Sitzung. Ein Jahr war reichlich für ein Token, das sich
   * nicht widerrufen ließ; 30 Tage sind bequem genug und begrenzen den
   * Schaden, wenn ein Token abhandenkommt.
   *
   * Gilt für Cookie **und** JWT – `signSessionToken` leitet die Ablaufzeit
   * hieraus ab, damit beide nicht auseinanderlaufen können.
   */
  maxAgeMs: 30 * 24 * 60 * 60 * 1000,
} as const;

export const ErrorMessages = {
  unauthenticated: "Authentication required",
  insufficientRole: "Insufficient permissions",
} as const;

export const Paths = {
  login: "/login",
} as const;

/**
 * Kopfzeile, mit der der Client seine tatsächliche Oberflächensprache meldet.
 * Nötig, solange die Spracheinstellung auf „automatisch“ steht – dann kennt
 * nur der Browser die Sprache (siehe api/context.ts).
 */
export const LANGUAGE_HEADER = "x-filahub-language";

/**
 * Rahmendokument für das Telegram-Login-Widget (`public/telegram-login.html`).
 *
 * Das Widget-Skript von telegram.org baut seinen `data-onauth`-Rückruf mit
 * `eval` zusammen. Die Content Security Policy der Anwendung erlaubt kein
 * `'unsafe-eval'`, also läuft das Widget in einem eigenen Dokument, dem
 * `api/app.ts` genau diese eine Ausnahme zugesteht – erkannt wird es an
 * diesem Pfad. Deshalb steht er hier und nicht zweimal getippt herum.
 */
export const TELEGRAM_LOGIN_FRAME_PATH = "/telegram-login.html";

/**
 * Kennung der Nachrichten, die das Rahmendokument per `postMessage` an die
 * Anmeldeseite schickt. Fremde Nachrichten landen im selben Ereignis –
 * ohne diese Kennung wäre jede davon ein Anmeldeversuch.
 */
export const TELEGRAM_LOGIN_FRAME_MESSAGE = "filahub-telegram-login";
