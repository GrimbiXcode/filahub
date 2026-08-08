/**
 * Zugriffsbegrenzung für unauthentifizierte Endpunkte.
 *
 * Bewusst im Arbeitsspeicher und ohne Redis: Das ausgelieferte Image ist ein
 * einzelner Container mit einer Postgres-Datenbank daneben. Ein zusätzlicher
 * Dienst nur für Zähler wäre mehr Betriebsaufwand, als er hier abwendet.
 *
 * Wer über mehrere Repliken skaliert, muss wissen: Jede Replik zählt für sich,
 * das tatsächliche Limit vervielfacht sich entsprechend.
 */

type Bucket = {
  count: number;
  /** Zeitpunkt, an dem der Zähler zurückgesetzt wird. */
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  /** Verbleibende Versuche im laufenden Fenster. */
  remaining: number;
  /** Sekunden bis zum Zurücksetzen – für die Fehlermeldung. */
  retryAfterSeconds: number;
};

const buckets = new Map<string, Bucket>();

/**
 * Entfernt abgelaufene Eimer. Ohne das wüchse die Map mit jeder je gesehenen
 * Adresse weiter – bei einem offen erreichbaren Endpunkt ist das der Weg in
 * den Speicherüberlauf.
 */
function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Zählt einen Versuch und sagt, ob er noch erlaubt ist.
 *
 * Festes Fenster statt gleitendem: Ein gleitendes Fenster bräuchte je Schlüssel
 * eine Liste von Zeitstempeln. Für das Ziel – Durchprobieren unmöglich machen –
 * genügt das feste Fenster, und es kostet einen Zähler statt einer Liste.
 */
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): RateLimitResult {
  if (now - lastSweep > SWEEP_INTERVAL_MS) {
    sweep(now);
    lastSweep = now;
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((existing.resetAt - now) / 1000)
  );
  if (existing.count > limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }
  return {
    allowed: true,
    remaining: limit - existing.count,
    retryAfterSeconds,
  };
}

/** Nur für Tests: setzt alle Zähler zurück. */
export function resetRateLimits() {
  buckets.clear();
  lastSweep = 0;
}
