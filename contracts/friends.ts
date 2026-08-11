import { z } from "zod";

/**
 * Freundschaften und geteilte Lager – gemeinsamer Code für Client und Server.
 *
 * Wie die übrigen Dateien in `contracts/` von Client, Server und Tests
 * importierbar und ohne alles aus `@db` oder `api/` zur Laufzeit – nur zod und
 * eigene Logik.
 *
 * Anders als bei den Preset-Aufzählungen sind die Listen hier **nicht** aus
 * `db/schema.ts` gespiegelt, sondern dort importiert: `pgEnum` bekommt genau
 * diese Konstanten. Die Abhängigkeit läuft damit nur in eine Richtung
 * (`db/` → `contracts/`, wie schon beim Typ `NameI18n`), und zwei Listen können
 * nicht auseinanderlaufen.
 */

// ---------------------------------------------------------------------------
// Aufzählungen – Grundlage der Postgres-Enums in db/schema.ts
// ---------------------------------------------------------------------------

/**
 * Wie viel ein Freund von **einem** Lager sehen darf.
 *
 * Seit 2.4.0 gilt die Stufe je Lager und Freund (`lager_shares`), nicht mehr für
 * den gesamten Bestand. Die Stufen selbst sind unverändert.
 */
export const FRIEND_VISIBILITIES = ["none", "search", "full"] as const;
export type FriendVisibility = (typeof FRIEND_VISIBILITIES)[number];

export const FRIENDSHIP_STATUSES = ["pending", "accepted", "declined"] as const;
export type FriendshipStatus = (typeof FRIENDSHIP_STATUSES)[number];

export const LOAN_REQUEST_STATUSES = [
  "open",
  "accepted",
  "declined",
  "withdrawn",
] as const;
export type LoanRequestStatus = (typeof LOAN_REQUEST_STATUSES)[number];

export const friendVisibilitySchema = z.enum(FRIEND_VISIBILITIES);

/*
  Hier stand bis 2.3.0 `DEFAULT_FRIEND_VISIBILITY = "search"` – die Stufe, die
  eine neu angenommene Freundschaft automatisch bekam. Begründet war das damit,
  dass eine Freundschaft ohne jede Freigabe wirkungslos wäre und niemand
  verstünde, warum nichts passiert.

  Mit Freigaben je Lager trägt das nicht mehr: Eine Vorgabe würde ein **konkretes
  Lager** öffnen, das der Benutzer vielleicht gerade nicht zeigen will, und sie
  müsste bei jedem neu angelegten Lager erneut entscheiden. Ein versehentlich
  offenes Lager ist der schlimmere Fehler als ein versehentlich geschlossenes.

  Die Verständlichkeit trägt jetzt die Oberfläche: Die Freundeskarte sagt
  ausdrücklich, wenn nichts freigegeben ist, und die Lager-Seite zeigt je Lager,
  mit wie vielen Freunden es geteilt ist.
*/

/**
 * Rangfolge der Stufen. `full` schließt `search` ein – wer das ganze Lager
 * sehen darf, findet darin selbstverständlich auch etwas.
 */
const VISIBILITY_RANK: Record<FriendVisibility, number> = {
  none: 0,
  search: 1,
  full: 2,
};

/** Reicht `have` für `required` aus? */
export function visibilityAllows(
  have: FriendVisibility,
  required: FriendVisibility
): boolean {
  return VISIBILITY_RANK[have] >= VISIBILITY_RANK[required];
}

// ---------------------------------------------------------------------------
// Freundescode
// ---------------------------------------------------------------------------

/**
 * Alphabet des Freundescodes – ohne `I`, `O`, `0`, `1`.
 *
 * Der Code wird abgetippt, vorgelesen und weitergeschickt; verwechselbare
 * Zeichen kosten dabei mehr, als das größere Alphabet einbringt. Bei acht
 * Stellen aus 32 Zeichen bleiben rund 1,1 Billionen Möglichkeiten – genug,
 * dass Erraten keine Rolle spielt.
 */
export const FRIEND_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Stellen im Code, ohne Präfix und Bindestriche */
export const FRIEND_CODE_LENGTH = 8;

/** `FH-A2B3-C4D5` – Präfix, damit ein Code als solcher erkennbar ist */
const FRIEND_CODE_PATTERN = new RegExp(
  `^FH-[${FRIEND_CODE_ALPHABET}]{4}-[${FRIEND_CODE_ALPHABET}]{4}$`
);

/**
 * Bringt eine Eingabe in die Normalform.
 *
 * Nachsichtig bei allem, was beim Abtippen und Kopieren passiert:
 * Kleinschreibung, fehlende oder zusätzliche Bindestriche, Leerzeichen,
 * vergessenes Präfix. Wer `fh a2b3c4d5` eintippt, meint denselben Code – ihn
 * daran scheitern zu lassen wäre schlechte Laune ohne Sicherheitsgewinn.
 *
 * Gibt `null` zurück, wenn daraus kein gültiger Code werden kann.
 */
export function normalizeFriendCode(input: string): string | null {
  const bare = input.toUpperCase().replace(/[\s-]/g, "").replace(/^FH/, "");
  if (bare.length !== FRIEND_CODE_LENGTH) return null;
  if (![...bare].every(c => FRIEND_CODE_ALPHABET.includes(c))) return null;
  return `FH-${bare.slice(0, 4)}-${bare.slice(4)}`;
}

/** Prüft die Normalform. Für Tests und als Zusicherung beim Erzeugen. */
export function isFriendCode(value: string): boolean {
  return FRIEND_CODE_PATTERN.test(value);
}

// ---------------------------------------------------------------------------
// Telegram-Benutzername
// ---------------------------------------------------------------------------

/**
 * Bringt `@Name`, `Name` und ein kopiertes `https://t.me/Name` auf den bloßen
 * Benutzernamen. Telegram erlaubt 5–32 Zeichen aus `a-z`, `0-9` und `_`;
 * verglichen wird später ohne Rücksicht auf Groß- und Kleinschreibung, weil
 * Telegram selbst das auch nicht unterscheidet.
 */
export function normalizeTelegramUsername(input: string): string | null {
  const bare = input
    .trim()
    .replace(/^https?:\/\/(t|telegram)\.me\//i, "")
    .replace(/^@/, "");
  return /^[A-Za-z0-9_]{5,32}$/.test(bare) ? bare : null;
}

// ---------------------------------------------------------------------------
// Suche
// ---------------------------------------------------------------------------

/**
 * Mindestlänge eines Suchbegriffs für die Suche im Lager von Freunden.
 *
 * Der Grund ist keine Sparsamkeit, sondern die Stufe `search`: Ohne
 * Pflichtbegriff wäre sie in der Wirkung `full` – man müsste nur nichts
 * eintippen, um alles zu bekommen. Deshalb steht die Grenze an zwei Stellen
 * (zod im Router **und** in der Abfragefunktion selbst), nicht nur in einer.
 */
export const FRIEND_SEARCH_MIN_LENGTH = 2;

/**
 * Höchstzahl der Treffer aus fremden Lagern.
 *
 * Begrenzt, was ein einzelner Aufruf herausgeben kann, und hält die Antwort
 * klein. Wer mehr sehen will, braucht Stufe `full`.
 */
export const FRIEND_SEARCH_LIMIT = 50;

/** Höchstlänge der Begleitnachricht einer Ausleih-Anfrage */
export const LOAN_MESSAGE_MAX_LENGTH = 300;
