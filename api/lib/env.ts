import "dotenv/config";

/**
 * Wandelt ein literales `\n` in einen echten Zeilenumbruch.
 *
 * Nötig, weil `\n` nur in doppelt gequoteten `.env`-Werten expandiert wird –
 * in `docker-compose.yml` unter `environment:` oder bei `docker run -e`
 * dagegen nie. So schreibt man eine mehrzeilige Anschrift überall gleich.
 */
function multiline(value: string | undefined): string {
  return (value ?? "").replace(/\\n/g, "\n");
}

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const env = {
  /** Secret für die Signierung der Session-Tokens (JWT) */
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  /**
   * Nur für den Umstieg von MySQL auf Postgres: Ist die Variable gesetzt,
   * übernimmt der Server beim Start einmalig die Altdaten aus dieser
   * Datenbank (siehe api/queries/legacyImport.ts). Nach erfolgreicher
   * Übernahme kann sie entfernt werden.
   */
  legacyMysqlUrl: process.env.LEGACY_MYSQL_URL ?? "",
  /** Bot-Token von @BotFather, z. B. "123456:ABC-DEF..." */
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  /** Bot-Username ohne @, z. B. "FilamentLagerBot" */
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME ?? "",
  /** Kommagetrennte Liste erlaubter Telegram-User-IDs; leer = jeder darf sich registrieren */
  telegramAllowedIds: (process.env.TELEGRAM_ALLOWED_IDS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean),
  /** Telegram-User-ID des ersten Admins (optional, sonst: erster registrierte Nutzer) */
  ownerTelegramId: process.env.OWNER_TELEGRAM_ID ?? "",
  /**
   * Anmeldung ohne Telegram für die lokale Entwicklung (`DEV_LOGIN=1`).
   * Wirkt nur außerhalb von NODE_ENV=production – siehe api/devLogin.ts.
   */
  devLogin: ["1", "true"].includes((process.env.DEV_LOGIN ?? "").toLowerCase()),
  /** Anzeigename des Entwickler-Kontos */
  devLoginName: process.env.DEV_LOGIN_NAME || "Dev-Benutzer",

  /*
    Betreiberangaben für Impressum und Datenschutzerklärung.

    Bewusst aus der Umgebung und nicht aus den Textdateien: Die Rechtstexte
    liegen im Docker-Image, jede Instanz hat aber einen eigenen Betreiber.
    Wären die Angaben fest eingebaut, würde jeder Selbst-Hoster den Autor der
    Software als Verantwortlichen für seine Datenverarbeitung ausweisen – falsch
    für ihn, unzumutbar für den Autor.

    Wer eine öffentlich erreichbare Instanz betreibt, ist Verantwortlicher im
    Sinne von Art. 4 Nr. 7 DSGVO bzw. Art. 5 lit. j revDSG und muss diese
    Angaben ausfüllen. Fehlen sie, weist die App im Rechtsbereich sichtbar
    darauf hin, statt einen falschen Namen zu nennen.
  */
  operatorName: process.env.LEGAL_OPERATOR_NAME ?? "",
  operatorAddress: multiline(process.env.LEGAL_OPERATOR_ADDRESS),
  operatorEmail: process.env.LEGAL_OPERATOR_EMAIL ?? "",
  /**
   * Wer die Server stellt, auf denen diese Instanz läuft – als Auftragsverarbeiter
   * nach Art. 28 DSGVO in der Datenschutzerklärung zu nennen. Ebenfalls
   * instanzspezifisch: Der eine hostet bei einem Anbieter, der Nächste im Keller.
   */
  operatorHosting: process.env.LEGAL_OPERATOR_HOSTING ?? "",

  /**
   * Wie viele vertrauenswürdige Proxys vor der App stehen. Bestimmt, welcher
   * Eintrag aus `x-forwarded-for` als echte Client-Adresse gilt – siehe
   * `api/lib/clientIp.ts`. Standard 1: ein Reverse Proxy, wie im README
   * empfohlen.
   */
  trustProxyHops: Math.max(
    1,
    parseInt(process.env.TRUST_PROXY_HOPS ?? "1", 10) || 1
  ),
};
