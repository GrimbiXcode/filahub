import "dotenv/config";

/**
 * Macht aus einem Umgebungswert einen mehrzeiligen Text – egal, wie die
 * Zeilenumbrüche dort hineingeraten sind.
 *
 * Es gibt dafür schlicht zu viele Wege, und keiner davon ist falsch:
 *
 *  - `\n` als **literale** Zeichenfolge. So landet es in einer nicht
 *    gequoteten Konfigurationszeile, unter `environment:` in
 *    `docker-compose.yml` und bei `docker run -e`.
 *  - Ein **echter** Umbruch. So kommt es aus einem gequoteten Wert und aus
 *    mehrzeiligen Eingabefeldern von Verwaltungsoberflächen.
 *  - `\r\n` in beiden Formen. Windows schreibt es so, und manche
 *    Web-Formulare schicken CRLF, auch wenn niemand danach gefragt hat.
 *
 * Ohne die `\r`-Behandlung blieb bei literalem `\r\n` ein sichtbares `\r`
 * im Text stehen – in einem Impressum eine unschöne Art, aufzufallen.
 *
 * Leerräume am Zeilenrand fallen weg: Bei einer Anschrift sind sie nie
 * gewollt, und am Zeilenende steuern zwei Leerzeichen in Markdown den
 * Umbruch (siehe `fillOperator` in `src/lib/legal.ts`) – da soll nichts
 * durcheinandergeraten, was der Betreiber nicht bewusst gesetzt hat.
 */
export function multiline(value: string | undefined): string {
  return (
    (value ?? "")
      /*
        Literale Escapes zuerst, sonst bliebe der Backslash stehen.

        `\\+` – ein *oder mehr* Backslashes. Manche Deployment-Plattformen
        escapen den Wert auf dem Weg in den Bau ein zweites Mal: Aus `\n`
        wird `\\n`. Coolify tut das, wenn es die Variablen als `ARG` ins
        generierte Dockerfile oder in eine Umgebungsdatei schreibt.

        Zählte man die Ebenen einzeln auf – erst ein Backslash, dann zwei –,
        stünde man bei der nächsten Verdopplung vor demselben Problem, nur
        eine Ebene tiefer. Deshalb gleich beliebig viele.
      */
      .replace(/\\+r\\+n|\\+[rn]/g, "\n")
      // Danach echte Zeilenenden vereinheitlichen.
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(line => line.trim())
      // Leerzeilen raus: Eine Anschrift ist ein zusammenhängender Block, und
      // eine leere Zeile würde in Markdown einen neuen Absatz beginnen.
      .filter(Boolean)
      .join("\n")
  );
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
  /** Bot-Token von @BotFather, z. B. "123456:ABC-DEF..." */
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  /** Bot-Username ohne @, z. B. "FilamentLagerBot" */
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME ?? "",
  /** Kommagetrennte Liste erlaubter Telegram-User-IDs; leer = jeder darf sich registrieren */
  telegramAllowedIds: (process.env.TELEGRAM_ALLOWED_IDS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean),
  /** Telegram-User-ID des ersten Admins */
  ownerTelegramId: process.env.OWNER_TELEGRAM_ID ?? "",
  /*
    Öffentliche Adresse dieser Instanz, z. B. „https://filahub.example“.

    Gebraucht nur für Links in Telegram-Nachrichten: Der Server kennt seine
    eigene Adresse nicht: Hinter einem Reverse Proxy stehen in der Anfrage
    Kopfzeilen, die ein Aufrufer setzen kann – daraus einen Link zu bauen, den
    wir an Dritte verschicken, wäre eine offene Weiterleitung. Deshalb
    ausdrücklich konfiguriert oder eben nicht: Fehlt der Wert, lässt die
    Nachricht den Link weg und nennt nur den Ort in der App.

    Abschließende Schrägstriche fallen weg, damit `${appBaseUrl}/freunde` nicht
    zu einem doppelten Schrägstrich führt.
  */
  appBaseUrl: (process.env.APP_BASE_URL ?? "").trim().replace(/\/+$/, ""),
  /*
    Registrierung für jeden Telegram-Nutzer öffnen.

    Bis 1.1.1 war das der stille Standard: leere `TELEGRAM_ALLOWED_IDS`
    hießen „jeder darf“. Wer die Variable schlicht übersah, betrieb eine
    offene Instanz, ohne es zu merken – und wurde damit ohne Absicht
    Verantwortlicher für die Daten Fremder. Jetzt muss man es sagen wollen.
  */
  telegramOpenRegistration: ["1", "true"].includes(
    (process.env.TELEGRAM_OPEN_REGISTRATION ?? "").toLowerCase()
  ),
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
  // Wie die Anschrift mehrzeilig: Ein Anbieter mit Sitz und Rechenzentrum
  // steht selten in einer Zeile.
  operatorHosting: multiline(process.env.LEGAL_OPERATOR_HOSTING),

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
