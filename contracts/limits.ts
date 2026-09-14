/**
 * Obergrenzen gegen Missbrauch.
 *
 * Wie die übrigen Dateien in `contracts/` von Client, Server und Tests
 * importierbar – hier darf zur Laufzeit nichts aus `@db` oder `api/` geladen
 * werden.
 *
 * **Warum feste Zahlen und keine Umgebungsvariablen:** Es ist keine
 * Kommerzialisierung geplant, es gibt also keine Stufen (dieselbe Erwägung wie
 * bei den Grenzen in `contracts/organizations.ts`). Eine Variable je Grenze
 * wären ein Dutzend neuer Schalter, die der Betreiber pflegen müsste, um am
 * Ende doch bei diesen Werten zu landen.
 *
 * **Keine dieser Grenzen garantiert die Datenbank.** Ein Zähler ist weder als
 * Unique- noch als partieller Index ausdrückbar; zwei gleichzeitige Anfragen
 * können jede um eins überschreiten. Der Schaden ist gering, aber die Lücke
 * soll benannt sein und nicht als Zusicherung durchgehen – genauso steht es
 * bei `MAX_LAGER_PER_USER`.
 *
 * Die Werte sind bewusst weit über dem, was ein Mensch je erreicht: Sie sollen
 * das Skript ausbremsen und nicht den Benutzer. Wer an eine davon stößt, hat
 * entweder einen Anwendungsfall, den das Projekt noch nicht kennt – dann
 * gehört die Zahl hier hoch – oder er greift an.
 */

// ---------------------------------------------------------------------------
// Bestand
// ---------------------------------------------------------------------------

/**
 * Materialien je Lager.
 *
 * Am Lager und nicht am Konto, weil der Bestand dort liegt und die Zählung
 * damit dieselbe Achse hat wie die Anzeige. Wer mehr braucht, legt ein zweites
 * Lager an (bis fünf, `MAX_LAGER_PER_USER`) – zusammen 5000 Gebinde, und das
 * ist jenseits jedes Heimlagers und der meisten Makerspaces.
 */
export const MAX_MATERIALS_PER_LAGER = 1000;

/**
 * Wägungen je Material.
 *
 * Eine Rolle wird ein paar Dutzend Mal gewogen, bevor sie leer ist. Tausend
 * lassen auch dem Vielwieger Luft und schneiden zugleich die Endlosschleife
 * ab, die sonst mit einer einzigen Material-ID die Tabelle füllt.
 */
export const MAX_WEIGHINGS_PER_MATERIAL = 1000;

/** Eigene Farben je Bereich (persönlich oder Organisation). */
export const MAX_CUSTOM_COLORS_PER_SCOPE = 200;

/** Eigene Oberflächen je Bereich. Weniger als Farben – es gibt schlicht weniger. */
export const MAX_CUSTOM_TEXTURES_PER_SCOPE = 100;

/** Eigene Gebindearten je Bereich. */
export const MAX_CONTAINER_TYPES_PER_SCOPE = 100;

/** Dryboxen je Bereich. */
export const MAX_STORAGE_BOXES_PER_SCOPE = 100;

// ---------------------------------------------------------------------------
// Preset-Vorschläge
// ---------------------------------------------------------------------------

/**
 * Gleichzeitig offene Vorschläge je Benutzer.
 *
 * Stand bis 2.7.0 in `api/presetRouter.ts`. Hierher gezogen, weil die
 * Oberfläche den Wert nennen können muss und eine zweite Fassung dort die
 * nächste Stelle wäre, an der er auseinanderläuft.
 */
export const MAX_OPEN_PROPOSALS = 20;

/**
 * Vorschläge je Benutzer und Tag – **über alle Status**.
 *
 * `MAX_OPEN_PROPOSALS` allein bremst nicht: Wer zwanzig einreicht und sie
 * ablehnen lässt, darf sofort zwanzig neue stellen. Jeder Vorschlag ist
 * Handarbeit für die Moderation; diese Grenze ist die, die sie schützt.
 */
export const MAX_PROPOSALS_PER_DAY = 50;

// ---------------------------------------------------------------------------
// Registrierung
// ---------------------------------------------------------------------------

/**
 * Neue Konten je Tag auf der ganzen Instanz.
 *
 * **Greift nur bei offener Registrierung** (`TELEGRAM_OPEN_REGISTRATION`): Mit
 * `TELEGRAM_ALLOWED_IDS` entscheidet der Betreiber ohnehin über jeden Zugang,
 * dort träfe eine Tagesgrenze nur den Fall, dass er zwanzig Kollegen auf
 * einmal freischaltet.
 */
export const MAX_REGISTRATIONS_PER_DAY = 20;

/**
 * Neue Konten je Adresse und Tag.
 *
 * Die zweite Achse neben der Instanzgrenze: Ohne sie schöpfte ein einzelner
 * Aufrufer das Tageskontingent aus und sperrte damit alle anderen aus – die
 * Abwehr wäre selbst der Angriff.
 */
export const MAX_REGISTRATIONS_PER_IP_PER_DAY = 3;

// ---------------------------------------------------------------------------
// Sperre
// ---------------------------------------------------------------------------

/**
 * Gründe, aus denen ein Administrator ein Konto sperrt.
 *
 * Eine Auswahl und kein Freitext: Der Grund wird dem Gesperrten angezeigt und
 * ist damit übersetzbar zu halten. Ein Freitextfeld wäre außerdem ein zweites
 * personenbezogenes Datum ohne festen Zweck – siehe die Begründung zum
 * Audit-Log in `contracts/audit.ts`.
 */
export const BLOCK_REASONS = [
  /** Massenhaftes Anlegen von Daten, Ausreizen der Grenzen */
  "abuse",
  /** Werbung, unerwünschte Kontaktaufnahme gegenüber anderen Benutzern */
  "spam",
  /** Verstoß gegen die Nutzungsbedingungen */
  "terms",
  /** Verdacht auf ein Konto, das nicht von einem Menschen betrieben wird */
  "automated",
  /** Alles andere – der Administrator erläutert es außerhalb der App */
  "other",
] as const;

export type BlockReason = (typeof BLOCK_REASONS)[number];

/** Höchstlänge der Begründung eines Entsperr-Antrags. */
export const UNBLOCK_REQUEST_MAX_LENGTH = 1000;

/** Zustände eines Entsperr-Antrags. */
export const UNBLOCK_REQUEST_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;

export type UnblockRequestStatus = (typeof UNBLOCK_REQUEST_STATUSES)[number];

// ---------------------------------------------------------------------------
// Entscheidung und Alarmierung
// ---------------------------------------------------------------------------

/**
 * Ob eine Handlung die Grenze reißen würde.
 *
 * `current` ist der Stand **vor** der Handlung, `adding` die Zahl der Zeilen,
 * die sie anlegt – beim Massenimport sind das bis zu 200 auf einmal. Eine
 * eigene Funktion für einen Vergleich sieht nach zu wenig aus; sie steht hier,
 * weil „ab wann ist voll“ an sechs Stellen gleich beantwortet werden muss und
 * ein `>=` gegen ein `>` der Fehler ist, den niemand beim Lesen sieht.
 */
export function exceedsLimit(
  current: number,
  max: number,
  adding = 1
): boolean {
  return current + adding > max;
}

/**
 * Was die Überwachung beobachtet, und ab wann sie es meldet.
 *
 * Die Fenster sind absichtlich verschieden: Zugriffsbegrenzungen schlagen im
 * Angriff im Minutentakt an, ein volles Kontingent fällt erst über Stunden
 * auf, und ein Ansturm auf die Registrierung zeigt sich am Tag.
 */
export const ABUSE_ALERT_THRESHOLDS = {
  /** Treffer der Zugriffsbegrenzung in der letzten Stunde */
  rateLimited: { window: "1h", threshold: 100 },
  /** Abgewiesene Anlagen wegen erreichter Obergrenze in 24 Stunden */
  quotaExceeded: { window: "24h", threshold: 50 },
  /** Abgewiesene Registrierungsversuche in 24 Stunden */
  registrationBlocked: { window: "24h", threshold: 10 },
  /**
   * Offene Entsperr-Anträge. `window: null`, weil hier der **Bestand** zählt
   * und kein Zeitraum – und weil die Angabe unübersetzt durch die Oberfläche
   * wandert: „1h“ und „24h“ liest jeder, ein deutsches „jetzt“ stünde in der
   * englischen Fassung als Fremdkörper.
   */
  pendingUnblockRequests: { window: null, threshold: 5 },
} as const;

export type AbuseAlertKey = keyof typeof ABUSE_ALERT_THRESHOLDS;

/** Zählstände, auf die `evaluateAlerts` schaut. */
export type AbuseCounts = Record<AbuseAlertKey, number>;

export type AbuseAlert = {
  key: AbuseAlertKey;
  count: number;
  threshold: number;
  /** `null` bei einer Schwelle über den Bestand statt über einen Zeitraum. */
  window: string | null;
};

/**
 * Welche Schwellen gerissen sind.
 *
 * Rein und ohne Datenbank, damit die Entscheidung prüfbar ist: Wann eine
 * Instanz ihren Betreiber weckt, ist zu wichtig, um es nur im Betrieb zu
 * beobachten. Die Reihenfolge folgt `ABUSE_ALERT_THRESHOLDS`, damit die
 * Nachricht bei gleichem Befund gleich aussieht.
 */
export function evaluateAlerts(counts: AbuseCounts): AbuseAlert[] {
  const keys = Object.keys(ABUSE_ALERT_THRESHOLDS) as AbuseAlertKey[];
  return keys
    .filter(key => counts[key] >= ABUSE_ALERT_THRESHOLDS[key].threshold)
    .map(key => ({
      key,
      count: counts[key],
      threshold: ABUSE_ALERT_THRESHOLDS[key].threshold,
      window: ABUSE_ALERT_THRESHOLDS[key].window,
    }));
}
