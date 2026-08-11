import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { randomInt } from "node:crypto";
import {
  DEFAULT_FRIEND_VISIBILITY,
  FRIEND_CODE_ALPHABET,
  FRIEND_CODE_LENGTH,
  FRIEND_SEARCH_LIMIT,
  FRIEND_SEARCH_MIN_LENGTH,
  isFriendCode,
  visibilityAllows,
  type FriendVisibility,
} from "@contracts/friends";
import { resolveSpoolTare } from "@contracts/presets";
import {
  friendships,
  loanRequests,
  materials,
  users,
  weighings,
  type Friendship,
} from "@db/schema";
import { getDb } from "./connection";

/**
 * Freundschaften und der Blick ins Lager eines Freundes.
 *
 * Dies ist die einzige Datei, in der Materialdaten eines Benutzers für einen
 * **anderen** aufbereitet werden. Überall sonst gilt „`userId` gleich
 * `ctx.user.id`, sonst nichts“. Zwei Regeln halten das hier zusammen:
 *
 *  1. Über die Richtung einer Freundschaft entscheidet ausschließlich
 *     `resolveVisibility`. Ein zweiter Vergleich über `userId`/`friendUserId`
 *     irgendwo sonst wäre eine zweite Wahrheit – und ein vertauschtes Feld
 *     keine kaputte Ansicht, sondern eine Datenpanne.
 *  2. Jede Lesefunktion nimmt `viewerId` als ersten Parameter und ermittelt die
 *     erlaubten Besitzer **selbst**. Keine nimmt eine Besitzerliste von außen
 *     an; sonst könnte ein Aufrufer sie erweitern.
 */

// ---------------------------------------------------------------------------
// Richtung einer Freundschaft
// ---------------------------------------------------------------------------

/** Die beiden Spalten, die für die Richtungsauflösung gebraucht werden. */
type DirectionRow = Pick<
  Friendship,
  | "userId"
  | "friendUserId"
  | "status"
  | "visibilityFromUser"
  | "visibilityFromFriend"
>;

/**
 * Was darf `viewerId` vom Lager von `ownerId` sehen?
 *
 * Reine Funktion, absichtlich von der Datenbank gelöst: Die Richtungslogik ist
 * der heikelste Teil der ganzen Funktion und muss sich ohne Postgres prüfen
 * lassen (siehe `api/friendVisibility.test.ts`).
 *
 * `visibilityFromUser` ist die Freigabe, die **`row.userId`** erteilt – sie
 * gilt also, wenn `row.userId` der Besitzer ist. Genau hier vertauscht man es
 * leicht, deshalb steht es nur an dieser einen Stelle.
 */
export function resolveVisibility(
  row: DirectionRow | null | undefined,
  viewerId: number,
  ownerId: number
): FriendVisibility {
  if (!row) return "none";
  // Nur angenommene Freundschaften geben etwas frei. Offene und abgelehnte
  // Anfragen sind keine Freigabe.
  if (row.status !== "accepted") return "none";
  if (row.userId === ownerId && row.friendUserId === viewerId) {
    return row.visibilityFromUser;
  }
  if (row.friendUserId === ownerId && row.userId === viewerId) {
    return row.visibilityFromFriend;
  }
  // Die Zeile gehört zu einem anderen Paar – kein Zufall, sondern ein Fehler
  // beim Aufrufen. Nichts freigeben.
  return "none";
}

/** Findet die Freundschaftszeile zweier Benutzer, in welcher Richtung auch immer. */
export async function findFriendshipBetween(
  a: number,
  b: number
): Promise<Friendship | undefined> {
  const rows = await getDb()
    .select()
    .from(friendships)
    .where(
      or(
        and(eq(friendships.userId, a), eq(friendships.friendUserId, b)),
        and(eq(friendships.userId, b), eq(friendships.friendUserId, a))
      )
    )
    .limit(1);
  return rows.at(0);
}

/**
 * Sichtbarkeitsstufe für ein konkretes Paar – der Prüfpunkt für alle
 * Einzelzugriffe (etwa vor einer Ausleih-Anfrage).
 */
export async function visibilityFor(
  viewerId: number,
  ownerId: number
): Promise<FriendVisibility> {
  // Das eigene Lager sieht man immer vollständig; die Frage stellt sich hier
  // eigentlich nicht, aber ein `none` wäre eine überraschende Antwort.
  if (viewerId === ownerId) return "full";
  const row = await findFriendshipBetween(viewerId, ownerId);
  return resolveVisibility(row, viewerId, ownerId);
}

/** Ein Freund, dessen Lager `viewerId` mindestens auf Stufe `minLevel` sieht. */
export type VisibleOwner = {
  ownerId: number;
  ownerName: string;
  visibility: FriendVisibility;
};

/**
 * Alle Freunde, deren Lager `viewerId` mindestens auf `minLevel` sehen darf.
 *
 * Lädt beide Richtungen in einem Zug und löst sie über `resolveVisibility` auf –
 * kein `CASE` im SQL, damit die Regel nicht doppelt existiert.
 */
export async function listVisibleOwners(
  viewerId: number,
  minLevel: FriendVisibility
): Promise<VisibleOwner[]> {
  const rows = await getDb()
    .select({
      userId: friendships.userId,
      friendUserId: friendships.friendUserId,
      status: friendships.status,
      visibilityFromUser: friendships.visibilityFromUser,
      visibilityFromFriend: friendships.visibilityFromFriend,
      ownerAName: users.name,
    })
    .from(friendships)
    .leftJoin(users, eq(users.id, friendships.userId))
    .where(
      and(
        eq(friendships.status, "accepted"),
        or(
          eq(friendships.userId, viewerId),
          eq(friendships.friendUserId, viewerId)
        )
      )
    );

  // Namen der Gegenseite in einem zweiten Zug: Der Join oben trifft nur
  // `friendships.userId`, und zweimal dieselbe Tabelle zu joinen kostet mehr
  // Umstand als ein zweites, kleines SELECT.
  const ownerIds = rows.map(r =>
    r.userId === viewerId ? r.friendUserId : r.userId
  );
  const names = await loadDisplayNames(ownerIds);

  const result: VisibleOwner[] = [];
  for (const row of rows) {
    const ownerId = row.userId === viewerId ? row.friendUserId : row.userId;
    const visibility = resolveVisibility(row, viewerId, ownerId);
    if (!visibilityAllows(visibility, minLevel)) continue;
    result.push({
      ownerId,
      ownerName: names.get(ownerId) ?? "",
      visibility,
    });
  }
  return result;
}

/** Anzeigenamen mehrerer Benutzer. `users.name` ist nullable. */
async function loadDisplayNames(ids: number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await getDb()
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(rows.map(r => [r.id, r.name ?? ""]));
}

// ---------------------------------------------------------------------------
// Das Material, wie ein Freund es sieht
// ---------------------------------------------------------------------------

/**
 * Ein Material aus der Sicht eines Freundes.
 *
 * **Handgeschrieben und nicht aus dem Schema abgeleitet.** Wird `materials`
 * später um eine Spalte erweitert, taucht sie hier nicht von selbst auf – genau
 * das ist der Zweck. `api/friendVisibility.test.ts` nagelt die Schlüsselmenge
 * zusätzlich fest.
 *
 * Draußen bleiben, in dieser Reihenfolge der Begründung:
 *
 *  - `priceCents` – Geldbeträge sieht ein Freund nie, das ist die Vorgabe.
 *  - `notes` – Freitext. Die Datenschutzerklärung warnt ausdrücklich, dass
 *    solche Felder irgendwann Persönliches enthalten, das nichts mit Filament
 *    zu tun hat.
 *  - `purchaseDate` – verrät Kaufverhalten.
 *  - `storageBoxId` und die Lagerbox selbst – eine Ortsangabe in der Wohnung.
 *  - Der Wägungsverlauf – daraus ließe sich ablesen, wann jemand druckt.
 *    Restmenge und Prozent bleiben sichtbar, sonst wäre die Suche sinnlos.
 */
export type FriendMaterial = {
  id: number;
  ownerId: number;
  ownerName: string;
  name: string;
  identifier: string | null;
  materialType: string;
  manufacturer: string | null;
  color: string | null;
  nominalWeight: number;
  remainingWeight: number;
  remainingPercent: number | null;
};

/**
 * Spalten, die überhaupt geladen werden. `columns:` ist im Projekt neu – alle
 * bisherigen Materialabfragen holen die ganze Zeile, weil sie an ihren Besitzer
 * gehen. Hier ist die Projektion die halbe Sicherheitsmaßnahme, deshalb steht
 * sie einmal und wird von allen Freundes-Abfragen geteilt.
 */
const FRIEND_MATERIAL_COLUMNS = {
  id: true,
  userId: true,
  name: true,
  identifier: true,
  materialType: true,
  manufacturer: true,
  color: true,
  nominalWeight: true,
} as const;

/*
  Mitgeladene Relationen – ebenfalls nur mit den Spalten, die für die Rechnung
  gebraucht werden.

  Von den Rollen und der Box kommt allein das Leergewicht: `resolveSpoolTare`
  verlangt strukturell bloß `{ tareWeight }`, und `spoolType.name`/`notes` sind
  Freitext des Besitzers.

  Die Lagerbox ist für Freunde unsichtbar, ihr Leergewicht geht aber in die
  Rechnung ein: Wird eine Rolle **in** ihrer Drybox gewogen, ist die Restmenge
  `grossWeight − Rollentara − Boxtara`. Wer den Join hier weglässt, „weil
  Freunde die Box nicht sehen dürfen“, meldet eine um das Boxgewicht zu hohe
  Restmenge – also genau die Zahl falsch, um die es in dieser Funktion geht.

  Von den Wägungen nur das Bruttogewicht der letzten: Der Verlauf bleibt
  draußen, die Restmenge braucht bloß den jüngsten Wert.
*/
const TARE_ONLY = { columns: { tareWeight: true } as const };

const FRIEND_MATERIAL_WITH = {
  spoolType: TARE_ONLY,
  spoolPresetVariant: TARE_ONLY,
  storageBox: TARE_ONLY,
  weighings: {
    columns: { grossWeight: true } as const,
    orderBy: [desc(weighings.weighedAt), desc(weighings.id)],
    limit: 1,
  },
  /*
    `as const` gehört an die inneren `columns`-Objekte, nicht an das äußere:
    Ohne die Literaltypen wird `true` zu `boolean` verallgemeinert und Drizzle
    liefert `{}` statt `{ tareWeight: number }`; mit `as const` auf dem äußeren
    Objekt lehnt Drizzle die `readonly`-Fassung ab.
  */
};

/**
 * Zeilenform, die `FRIEND_MATERIAL_COLUMNS` + `FRIEND_MATERIAL_WITH` liefern.
 * Handgeschrieben wie `FriendMaterial` selbst – der Unit-Test füttert
 * `toFriendMaterial` damit, ohne eine Datenbank zu brauchen.
 */
export type FriendMaterialRow = {
  id: number;
  userId: number;
  name: string;
  identifier: string | null;
  materialType: string;
  manufacturer: string | null;
  color: string | null;
  nominalWeight: number;
  spoolType: { tareWeight: number } | null;
  spoolPresetVariant: { tareWeight: number } | null;
  storageBox: { tareWeight: number } | null;
  weighings: { grossWeight: number }[];
};

/**
 * Bildet eine geladene Zeile auf das ab, was hinausgehen darf.
 *
 * Rein und exportiert, damit der Unit-Test die Schlüsselmenge prüfen kann, ohne
 * eine Datenbank zu brauchen. Der Rückgabetyp ist **ausdrücklich** annotiert –
 * ohne die Annotation würde TypeScript ein zusätzlich durchgeschleiftes Feld
 * einfach in den Typ aufnehmen, statt es zu bemängeln.
 */
export function toFriendMaterial(
  row: FriendMaterialRow,
  ownerName: string
): FriendMaterial {
  const tare = resolveSpoolTare(row) + (row.storageBox?.tareWeight ?? 0);
  const last = row.weighings.at(0);
  const remainingWeight =
    last != null ? Math.max(0, last.grossWeight - tare) : row.nominalWeight;
  const remainingPercent =
    row.nominalWeight > 0
      ? Math.min(
          100,
          Math.max(0, Math.round((remainingWeight / row.nominalWeight) * 100))
        )
      : null;
  return {
    id: row.id,
    ownerId: row.userId,
    ownerName,
    name: row.name,
    identifier: row.identifier,
    materialType: row.materialType,
    manufacturer: row.manufacturer,
    color: row.color,
    nominalWeight: row.nominalWeight,
    remainingWeight,
    remainingPercent,
  };
}

// ---------------------------------------------------------------------------
// Lesepfade
// ---------------------------------------------------------------------------

/**
 * Sucht im Lager aller Freunde, die mindestens Stufe `search` gewährt haben.
 *
 * Server-seitig, und das ist der Kern der Stufe `search`: Die App sucht sonst
 * überall im Client über eine vollständig geladene Liste (`src/pages/Home.tsx`).
 * Würde sie das hier auch tun, wäre „nur in der Suche“ mit einem Blick in die
 * Entwicklerwerkzeuge ausgehebelt – die ganze Stufe wäre eine Lüge.
 *
 * Der Pflicht-Suchbegriff wird deshalb **zweimal** geprüft: hier und im Router.
 * Ein leerer Begriff würde `search` faktisch zu `full` machen.
 *
 * Nicht durchsucht wird `notes`: Man darf keine Treffer über einen Text
 * erzielen, den man nicht sehen darf.
 */
export async function findFriendMaterialsForSearch(
  viewerId: number,
  query: string,
  limit = FRIEND_SEARCH_LIMIT
): Promise<FriendMaterial[]> {
  const term = query.trim();
  if (term.length < FRIEND_SEARCH_MIN_LENGTH) return [];

  const owners = await listVisibleOwners(viewerId, "search");
  if (owners.length === 0) return [];
  const names = new Map(owners.map(o => [o.ownerId, o.ownerName]));

  const pattern = `%${escapeLike(term)}%`;
  const rows = await getDb().query.materials.findMany({
    columns: FRIEND_MATERIAL_COLUMNS,
    with: FRIEND_MATERIAL_WITH,
    where: and(
      inArray(materials.userId, [...names.keys()]),
      or(
        ilike(materials.name, pattern),
        ilike(materials.identifier, pattern),
        ilike(materials.materialType, pattern),
        ilike(materials.manufacturer, pattern),
        ilike(materials.color, pattern)
      )
    ),
    orderBy: [asc(materials.name), asc(materials.id)],
    limit,
  });

  return rows.map(row => toFriendMaterial(row, names.get(row.userId) ?? ""));
}

/**
 * Das ganze Lager eines Freundes – nur bei Stufe `full`.
 *
 * Gibt `null` zurück, wenn die Stufe nicht reicht. Der Router macht daraus ein
 * `NOT_FOUND` und nicht `FORBIDDEN`: Wie überall im Projekt soll die Antwort
 * nicht verraten, dass es die Zeile gibt.
 */
export async function findFriendInventory(
  viewerId: number,
  ownerId: number
): Promise<{ ownerName: string; materials: FriendMaterial[] } | null> {
  if (viewerId === ownerId) return null;
  const visibility = await visibilityFor(viewerId, ownerId);
  if (!visibilityAllows(visibility, "full")) return null;

  const names = await loadDisplayNames([ownerId]);
  const ownerName = names.get(ownerId) ?? "";
  const rows = await getDb().query.materials.findMany({
    columns: FRIEND_MATERIAL_COLUMNS,
    with: FRIEND_MATERIAL_WITH,
    where: eq(materials.userId, ownerId),
    orderBy: [asc(materials.name), asc(materials.id)],
  });
  return {
    ownerName,
    materials: rows.map(row => toFriendMaterial(row, ownerName)),
  };
}

/**
 * Ein einzelnes Material eines Freundes, für den Anfragedialog.
 *
 * Stufe `search` genügt: Wer es über die Suche gefunden hat, darf danach auch
 * fragen. `null` bei fehlender Freigabe – damit ist die Prozedur zugleich der
 * Schutz davor, Material-IDs durchzuprobieren.
 */
export async function findFriendMaterial(
  viewerId: number,
  materialId: number
): Promise<FriendMaterial | null> {
  const row = await getDb().query.materials.findFirst({
    columns: FRIEND_MATERIAL_COLUMNS,
    with: FRIEND_MATERIAL_WITH,
    where: eq(materials.id, materialId),
  });
  if (!row || row.userId === viewerId) return null;

  const visibility = await visibilityFor(viewerId, row.userId);
  if (!visibilityAllows(visibility, "search")) return null;

  const names = await loadDisplayNames([row.userId]);
  return toFriendMaterial(row, names.get(row.userId) ?? "");
}

/**
 * Maskiert `%` und `_` in einem Suchbegriff.
 *
 * Ohne das wäre ein einzelnes `%` ein Treffer auf alles – bei Stufe `search`
 * also eine vollständige Lagerliste, und damit dieselbe Umgehung, die der
 * Pflicht-Suchbegriff verhindern soll.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, c => `\\${c}`);
}

// ---------------------------------------------------------------------------
// Freundschaften verwalten
// ---------------------------------------------------------------------------

/** Freundschaft samt Gegenseite und beiden Richtungen, für die Freundesseite. */
export type FriendshipView = {
  id: number;
  friendId: number;
  friendName: string;
  friendUsername: string | null;
  status: Friendship["status"];
  /** Ob der angemeldete Benutzer die Anfrage gestellt hat */
  outgoing: boolean;
  /** Was der Freund von **meinem** Lager sieht – meine Entscheidung */
  sharedByMe: FriendVisibility;
  /** Was ich von **seinem** Lager sehe – seine Entscheidung */
  sharedWithMe: FriendVisibility;
  createdAt: Date;
};

export async function listFriendships(
  viewerId: number
): Promise<FriendshipView[]> {
  const rows = await getDb()
    .select()
    .from(friendships)
    .where(
      or(
        eq(friendships.userId, viewerId),
        eq(friendships.friendUserId, viewerId)
      )
    )
    .orderBy(desc(friendships.createdAt));

  const otherIds = rows.map(r =>
    r.userId === viewerId ? r.friendUserId : r.userId
  );
  const profiles = await loadProfiles(otherIds);

  return rows.map(row => {
    const outgoing = row.userId === viewerId;
    const friendId = outgoing ? row.friendUserId : row.userId;
    const profile = profiles.get(friendId);
    return {
      id: row.id,
      friendId,
      friendName: profile?.name ?? "",
      friendUsername: profile?.telegramUsername ?? null,
      status: row.status,
      outgoing,
      /*
        Auch hier nicht selbst rechnen: Die Zuordnung von Spalte zu Richtung
        gehört `resolveVisibility`. „Was der Freund von mir sieht“ heißt:
        Betrachter ist der Freund, Besitzer bin ich.
      */
      sharedByMe: resolveVisibility(row, friendId, viewerId),
      sharedWithMe: resolveVisibility(row, viewerId, friendId),
      createdAt: row.createdAt,
    };
  });
}

/**
 * Beim Anzeigen der Sichtbarkeit tut `resolveVisibility` das Richtige nur für
 * angenommene Freundschaften – bei offenen Anfragen liefert es `none`. Für die
 * Oberfläche ist das die ehrliche Antwort: Vor der Annahme ist nichts
 * freigegeben.
 */
async function loadProfiles(ids: number[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0)
    return new Map<
      number,
      { name: string | null; telegramUsername: string | null }
    >();
  const rows = await getDb()
    .select({
      id: users.id,
      name: users.name,
      telegramUsername: users.telegramUsername,
    })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(
    rows.map(r => [
      r.id,
      { name: r.name, telegramUsername: r.telegramUsername },
    ])
  );
}

export async function createFriendship(userId: number, friendUserId: number) {
  const [row] = await getDb()
    .insert(friendships)
    .values({
      userId,
      friendUserId,
      status: "pending",
      visibilityFromUser: DEFAULT_FRIEND_VISIBILITY,
      visibilityFromFriend: DEFAULT_FRIEND_VISIBILITY,
    })
    .returning();
  return row;
}

/**
 * Antwortet auf eine offene Anfrage. Nur der **Angefragte** darf das, deshalb
 * steckt `friendUserId` in der Bedingung – wer die Anfrage gestellt hat, kann
 * sie nicht selbst annehmen.
 */
export async function respondToFriendship(
  addresseeId: number,
  friendshipId: number,
  accept: boolean
) {
  const [row] = await getDb()
    .update(friendships)
    .set({
      status: accept ? "accepted" : "declined",
      respondedAt: new Date(),
    })
    .where(
      and(
        eq(friendships.id, friendshipId),
        eq(friendships.friendUserId, addresseeId),
        eq(friendships.status, "pending")
      )
    )
    .returning();
  return row ?? null;
}

/** Löst eine Freundschaft auf. Beide Seiten dürfen das, in jedem Status. */
export async function deleteFriendship(viewerId: number, friendshipId: number) {
  const [row] = await getDb()
    .delete(friendships)
    .where(
      and(
        eq(friendships.id, friendshipId),
        or(
          eq(friendships.userId, viewerId),
          eq(friendships.friendUserId, viewerId)
        )
      )
    )
    .returning();
  return row ?? null;
}

/**
 * Setzt die Stufe für **das eigene** Lager.
 *
 * Welche Spalte das ist, hängt daran, auf welcher Seite der Zeile der Benutzer
 * steht: Wer sie angelegt hat, schreibt `visibilityFromUser`, der andere
 * `visibilityFromFriend`. Beides in einer Anweisung, damit die Zuordnung nicht
 * von einem vorherigen Lesevorgang abhängt.
 */
export async function setOwnVisibility(
  viewerId: number,
  friendshipId: number,
  visibility: FriendVisibility
) {
  const [row] = await getDb()
    .update(friendships)
    .set({
      visibilityFromUser: sql`CASE WHEN ${friendships.userId} = ${viewerId}
        THEN ${visibility}::friend_visibility ELSE ${friendships.visibilityFromUser} END`,
      visibilityFromFriend: sql`CASE WHEN ${friendships.friendUserId} = ${viewerId}
        THEN ${visibility}::friend_visibility ELSE ${friendships.visibilityFromFriend} END`,
    })
    .where(
      and(
        eq(friendships.id, friendshipId),
        eq(friendships.status, "accepted"),
        or(
          eq(friendships.userId, viewerId),
          eq(friendships.friendUserId, viewerId)
        )
      )
    )
    .returning();
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Freund finden
// ---------------------------------------------------------------------------

/**
 * Erzeugt einen Freundescode.
 *
 * `crypto.randomInt` und nicht `Math.random`: Der Code ist zwar kein
 * Anmeldemerkmal, öffnet aber den Weg zu einer Anfrage. Vorhersagbare Codes
 * ließen sich durchprobieren.
 */
export function generateFriendCode(): string {
  let bare = "";
  for (let i = 0; i < FRIEND_CODE_LENGTH; i++) {
    bare += FRIEND_CODE_ALPHABET[randomInt(0, FRIEND_CODE_ALPHABET.length)];
  }
  return `FH-${bare.slice(0, 4)}-${bare.slice(4)}`;
}

/**
 * Liefert den Freundescode des Benutzers und legt ihn beim ersten Mal an.
 *
 * Erst bei Bedarf, nicht beim Registrieren: Wer die Freundesfunktion nie
 * benutzt, braucht auch kein zusätzliches Merkmal an seinem Konto.
 *
 * Die Schleife fängt die Kollision mit einem bereits vergebenen Code ab. Bei
 * 32^8 Möglichkeiten ist das nie zu erwarten, aber `friendCode` ist `unique` –
 * ohne Wiederholung wäre es ein Fehler statt eines zweiten Versuchs.
 */
export async function ensureFriendCode(userId: number): Promise<string> {
  const db = getDb();
  const existing = await db
    .select({ code: users.friendCode })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const current = existing.at(0)?.code;
  if (current) return current;
  return rotateFriendCode(userId);
}

/**
 * Erzeugt einen neuen Code; der alte ist damit wertlos.
 *
 * Die Wiederholung fängt die Kollision mit einem bereits vergebenen Code ab.
 * `onConflictDoNothing` gibt es nur beim Einfügen – ein `UPDATE` gegen eine
 * `unique`-Spalte wirft, also wird der Fehler gefangen und ein neuer Code
 * gezogen. Bei 32^8 Möglichkeiten passiert das nie; ein unbehandelter Fehler
 * beim Öffnen der Freundesseite wäre trotzdem das falsche Verhalten.
 */
export async function rotateFriendCode(userId: number): Promise<string> {
  const db = getDb();
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateFriendCode();
    try {
      const rows = await db
        .update(users)
        .set({ friendCode: code })
        .where(eq(users.id, userId))
        .returning({ code: users.friendCode });
      const written = rows.at(0)?.code;
      if (written) return written;
      // Kein Treffer heißt: Der Benutzer existiert nicht (mehr).
      throw new Error(`Benutzer ${userId} existiert nicht`);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Freundescode konnte nicht erzeugt werden: ${lastError}`);
}

/** Sucht einen Benutzer über seinen Freundescode. */
export async function findUserByFriendCode(code: string) {
  if (!isFriendCode(code)) return undefined;
  const rows = await getDb()
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.friendCode, code))
    .limit(1);
  return rows.at(0);
}

/**
 * Sucht einen Benutzer über seinen Telegram-Benutzernamen.
 *
 * Exakt und ohne Rücksicht auf Groß-/Kleinschreibung – Telegram unterscheidet
 * sie selbst nicht. Bewusst kein Teilstring-Vergleich: Eine Namenssuche wäre
 * eine Liste aller Konten.
 *
 * Die Spalte ist nullable und **nicht** unique (Telegram-Namen wechseln den
 * Besitzer). Bei mehr als einem Treffer wird deshalb keiner geliefert – lieber
 * „nicht gefunden“ als der Falsche.
 */
export async function findUserByTelegramUsername(username: string) {
  const rows = await getDb()
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(ilike(users.telegramUsername, escapeLike(username)))
    .limit(2);
  return rows.length === 1 ? rows.at(0) : undefined;
}

/** Sprache und Telegram-ID eines Benutzers – für die Benachrichtigung. */
export async function findNotificationTarget(userId: number) {
  const rows = await getDb()
    .select({
      unionId: users.unionId,
      language: users.language,
      name: users.name,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows.at(0);
}

// ---------------------------------------------------------------------------
// Ausleih-Anfragen
// ---------------------------------------------------------------------------

export type LoanRequestView = {
  id: number;
  materialId: number;
  materialName: string;
  message: string | null;
  status: (typeof loanRequests.$inferSelect)["status"];
  /** Ob der angemeldete Benutzer die Anfrage gestellt hat */
  outgoing: boolean;
  /** Die jeweils andere Person */
  counterpartId: number;
  counterpartName: string;
  createdAt: Date;
  respondedAt: Date | null;
};

export async function listLoanRequests(
  viewerId: number
): Promise<LoanRequestView[]> {
  const rows = await getDb()
    .select()
    .from(loanRequests)
    .where(
      or(
        eq(loanRequests.userId, viewerId),
        eq(loanRequests.ownerUserId, viewerId)
      )
    )
    .orderBy(desc(loanRequests.createdAt));

  const names = await loadDisplayNames(
    rows.map(r => (r.userId === viewerId ? r.ownerUserId : r.userId))
  );

  return rows.map(row => {
    const outgoing = row.userId === viewerId;
    const counterpartId = outgoing ? row.ownerUserId : row.userId;
    return {
      id: row.id,
      materialId: row.materialId,
      materialName: row.materialName,
      message: row.message,
      status: row.status,
      outgoing,
      counterpartId,
      counterpartName: names.get(counterpartId) ?? "",
      createdAt: row.createdAt,
      respondedAt: row.respondedAt,
    };
  });
}

export async function createLoanRequest(data: {
  userId: number;
  ownerUserId: number;
  materialId: number;
  materialName: string;
  message: string | null;
}) {
  const [row] = await getDb().insert(loanRequests).values(data).returning();
  return row;
}

/** Offene Anfrage derselben Person auf dasselbe Material. */
export async function findOpenLoanRequest(userId: number, materialId: number) {
  const rows = await getDb()
    .select({ id: loanRequests.id })
    .from(loanRequests)
    .where(
      and(
        eq(loanRequests.userId, userId),
        eq(loanRequests.materialId, materialId),
        eq(loanRequests.status, "open")
      )
    )
    .limit(1);
  return rows.at(0);
}

/** Zusagen oder ablehnen. Nur der Besitzer, nur solange offen. */
export async function respondToLoanRequest(
  ownerId: number,
  requestId: number,
  accept: boolean
) {
  const [row] = await getDb()
    .update(loanRequests)
    .set({
      status: accept ? "accepted" : "declined",
      respondedAt: new Date(),
    })
    .where(
      and(
        eq(loanRequests.id, requestId),
        eq(loanRequests.ownerUserId, ownerId),
        eq(loanRequests.status, "open")
      )
    )
    .returning();
  return row ?? null;
}

/** Zurückziehen. Nur der Anfragende, nur solange offen. */
export async function withdrawLoanRequest(userId: number, requestId: number) {
  const [row] = await getDb()
    .update(loanRequests)
    .set({ status: "withdrawn", respondedAt: new Date() })
    .where(
      and(
        eq(loanRequests.id, requestId),
        eq(loanRequests.userId, userId),
        eq(loanRequests.status, "open")
      )
    )
    .returning();
  return row ?? null;
}

/**
 * Zähler für das Abzeichen in der Seitenleiste: offene Freundschaftsanfragen an
 * mich und offene Ausleih-Anfragen für mein Material.
 */
export async function countPendingForUser(viewerId: number): Promise<number> {
  const db = getDb();
  const [friendRows, loanRows] = await Promise.all([
    db
      .select({ id: friendships.id })
      .from(friendships)
      .where(
        and(
          eq(friendships.friendUserId, viewerId),
          eq(friendships.status, "pending")
        )
      ),
    db
      .select({ id: loanRequests.id })
      .from(loanRequests)
      .where(
        and(
          eq(loanRequests.ownerUserId, viewerId),
          eq(loanRequests.status, "open")
        )
      ),
  ]);
  return friendRows.length + loanRows.length;
}
