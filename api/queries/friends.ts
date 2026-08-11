import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { randomInt } from "node:crypto";
import {
  FRIEND_CODE_ALPHABET,
  FRIEND_CODE_LENGTH,
  FRIEND_SEARCH_LIMIT,
  FRIEND_SEARCH_MIN_LENGTH,
  isFriendCode,
  visibilityAllows,
  type FriendVisibility,
} from "@contracts/friends";
import {
  resolveDensity,
  secondaryAmount,
  type MaterialKind,
  type SecondaryAmount,
} from "@contracts/materials";
import { resolveContainerTare } from "@contracts/presets";
import {
  friendships,
  lager,
  lagerShares,
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
 *  1. Über die Stufe einer Freigabe entscheidet ausschließlich `resolveShare`.
 *     Eine zweite Stelle, die Freigabe und Freundschaftsstatus selbst
 *     verrechnet, wäre eine zweite Wahrheit – und ein übersehener Status keine
 *     kaputte Ansicht, sondern eine Datenpanne.
 *  2. Jede Lesefunktion nimmt `viewerId` als ersten Parameter und ermittelt die
 *     freigegebenen Lager **selbst**. Keine nimmt eine Lager- oder
 *     Besitzerliste von außen an; sonst könnte ein Aufrufer sie erweitern.
 */

// ---------------------------------------------------------------------------
// Freigabe eines Lagers
// ---------------------------------------------------------------------------

/**
 * Was darf der Empfänger von diesem Lager sehen?
 *
 * Reine Funktion, absichtlich von der Datenbank gelöst: Dies ist die heikelste
 * Regel der ganzen Funktion und muss sich ohne Postgres prüfen lassen (siehe
 * `api/friendVisibility.test.ts`).
 *
 * **Zwei Tabellen, eine Bedingung.** Die Freigabe steht in `lager_shares`, der
 * Freundschaftsstatus in `friendships`. Deshalb nimmt die Funktion beides und
 * nicht bloß die Freigabe: Wanderte die Statusprüfung ins SQL, behielte eine
 * abgelehnte oder aufgelöste Freundschaft ihren Zugriff – und kein Test, der die
 * Freigabe allein betrachtet, würde das bemerken.
 *
 * Die Richtungsauflösung, die hier bis 2.3.0 stand, ist entfallen: Ein Lager hat
 * genau einen Eigentümer, es gibt keine zwei Spalten mehr zu verwechseln.
 */
export function resolveShare(input: {
  friendshipStatus: Friendship["status"] | null | undefined;
  shareVisibility: FriendVisibility | null | undefined;
}): FriendVisibility {
  // Ohne angenommene Freundschaft gilt keine Freigabe – auch keine bestehende.
  if (input.friendshipStatus !== "accepted") return "none";
  // Fehlende Zeile heißt „nicht freigegeben“; `none`-Zeilen gibt es nicht.
  return input.shareVisibility ?? "none";
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
 * Stufe für **ein** Lager – der Prüfpunkt für alle Einzelzugriffe (etwa vor
 * einer Ausleih-Anfrage).
 */
export async function shareLevelFor(
  viewerId: number,
  lagerId: number
): Promise<FriendVisibility> {
  const rows = await getDb()
    .select({
      ownerId: lager.userId,
      visibility: lagerShares.visibility,
      status: friendships.status,
    })
    .from(lager)
    .leftJoin(
      lagerShares,
      and(
        eq(lagerShares.lagerId, lager.id),
        eq(lagerShares.sharedWithUserId, viewerId)
      )
    )
    /*
      Die Freundschaft zwischen Betrachter und **Eigentümer des Lagers** – nicht
      irgendeine. Ohne die Zuordnung an dieser Stelle würde eine beliebige
      Freundschaft die Freigabe eines fremden Lagers gültig machen.
    */
    .leftJoin(
      friendships,
      or(
        and(
          eq(friendships.userId, lager.userId),
          eq(friendships.friendUserId, viewerId)
        ),
        and(
          eq(friendships.friendUserId, lager.userId),
          eq(friendships.userId, viewerId)
        )
      )
    )
    .where(eq(lager.id, lagerId))
    .limit(1);

  const row = rows.at(0);
  if (!row) return "none";
  // Das eigene Lager sieht man immer vollständig.
  if (row.ownerId === viewerId) return "full";
  return resolveShare({
    friendshipStatus: row.status,
    shareVisibility: row.visibility,
  });
}

/** Ein Lager, das `viewerId` mindestens auf Stufe `minLevel` sehen darf. */
export type VisibleLager = {
  lagerId: number;
  ownerId: number;
  ownerName: string;
  visibility: FriendVisibility;
};

/**
 * Alle **Lager**, die `viewerId` mindestens auf `minLevel` sehen darf.
 *
 * Bis 2.3.0 lieferte diese Funktion Besitzer; jetzt Lager, weil ein Freund
 * Lager A zeigen und Lager B verbergen kann.
 *
 * Drei Bedingungen müssen zusammenkommen, und keine davon steht allein: eine
 * Freigabezeile für diesen Empfänger, das Lager mit seinem Eigentümer, und eine
 * **angenommene** Freundschaft zwischen Empfänger und genau diesem Eigentümer.
 * Der Statusvergleich passiert danach in `resolveShare` und nicht im SQL – siehe
 * die Begründung dort.
 */
export async function listVisibleLager(
  viewerId: number,
  minLevel: FriendVisibility
): Promise<VisibleLager[]> {
  const rows = await getDb()
    .select({
      lagerId: lagerShares.lagerId,
      ownerId: lager.userId,
      visibility: lagerShares.visibility,
      status: friendships.status,
    })
    .from(lagerShares)
    .innerJoin(lager, eq(lager.id, lagerShares.lagerId))
    .leftJoin(
      friendships,
      or(
        and(
          eq(friendships.userId, lager.userId),
          eq(friendships.friendUserId, viewerId)
        ),
        and(
          eq(friendships.friendUserId, lager.userId),
          eq(friendships.userId, viewerId)
        )
      )
    )
    .where(eq(lagerShares.sharedWithUserId, viewerId));

  const names = await loadDisplayNames(rows.map(r => r.ownerId));

  const result: VisibleLager[] = [];
  for (const row of rows) {
    const visibility = resolveShare({
      friendshipStatus: row.status,
      shareVisibility: row.visibility,
    });
    if (!visibilityAllows(visibility, minLevel)) continue;
    result.push({
      lagerId: row.lagerId,
      ownerId: row.ownerId,
      ownerName: names.get(row.ownerId) ?? "",
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
 *  - `lagerId` und der Lagername – ein Lagername ist Freitext, der einen Ort
 *    verraten kann („Keller Müllerstraße“); dieselbe Erwägung schließt die
 *    Drybox aus. Seit 2.4.0 ist das Lager die **Einheit der Freigabe**, und
 *    trotzdem bleibt beides draußen: Die Liste eines Freundes ist flach, nicht
 *    nach Lagern gruppiert, also braucht der Empfänger die Kennung nicht. Wer
 *    hier gruppieren will, gibt damit Auskunft über die Ordnung eines fremden
 *    Bestands – und die hat niemand freigegeben.
 *  - `densityGramsPerLiter` – steckt bereits in `secondary`; sie zusätzlich
 *    herauszugeben brächte nichts.
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
  /** Oberfläche – Teil der Materialidentität wie die Farbe. */
  texture: string | null;
  nominalWeight: number;
  remainingWeight: number;
  remainingPercent: number | null;
  /**
   * Zweitanzeige, fertig gerechnet.
   *
   * Genau deshalb rechnet der Server und nicht der Client: Die Rechnung
   * braucht Materialart und Filamentstärke, und beide hängen am Lager. Wanderte
   * sie in den Browser, müsste die Projektion Art und Stärke einzeln
   * herausgeben – zwei Felder mehr, nur damit der Browser eine Division
   * ausführt.
   */
  secondary: SecondaryAmount | null;
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
  /*
    Das Lager wird geladen, geht aber **nicht** hinaus. Es entscheidet über die
    Freigabe (`shareLevelFor` in `findFriendMaterial`) und über die Zweitanzeige –
    beides braucht die Zeile, der Empfänger nicht. Draußen bleibt es, weil
    `toFriendMaterial` es nicht in sein Ergebnis schreibt; genau dafür ist die
    Projektion handgeschrieben und ihre Schlüsselmenge festgenagelt.
  */
  lagerId: true,
  name: true,
  identifier: true,
  materialType: true,
  manufacturer: true,
  color: true,
  texture: true,
  nominalWeight: true,
  /* Die Dichte ebenso: geht in die Zweitanzeige ein, aber nicht hinaus. */
  densityGramsPerLiter: true,
} as const;

/*
  Mitgeladene Relationen – ebenfalls nur mit den Spalten, die für die Rechnung
  gebraucht werden.

  Von den Rollen und der Box kommt allein das Leergewicht: `resolveContainerTare`
  verlangt strukturell bloß `{ tareWeight }`, und `containerType.name`/`notes` sind
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
  containerType: TARE_ONLY,
  containerPresetVariant: TARE_ONLY,
  storageBox: TARE_ONLY,
  /*
    Vom Lager nur Materialart und Stärke – die beiden Angaben, die die
    Zweitanzeige braucht. Der Name bleibt ungeladen, damit er nicht aus
    Versehen mit hinausgeht: Was nicht in der Zeile steht, kann keine
    Projektion durchlassen.
  */
  lager: {
    columns: { materialKind: true, filamentDiameterUm: true } as const,
  },
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
  lagerId: number;
  name: string;
  identifier: string | null;
  materialType: string;
  manufacturer: string | null;
  color: string | null;
  texture: string | null;
  nominalWeight: number;
  densityGramsPerLiter: number | null;
  containerType: { tareWeight: number } | null;
  containerPresetVariant: { tareWeight: number } | null;
  storageBox: { tareWeight: number } | null;
  lager: {
    materialKind: MaterialKind;
    filamentDiameterUm: number | null;
  } | null;
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
  const tare = resolveContainerTare(row) + (row.storageBox?.tareWeight ?? 0);
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
  /*
    Ohne Lager keine Zweitanzeige. Nach der Migration hat jedes Material eines,
    aber der Typ lässt `null` zu und eine geratene Länge wäre schlimmer als
    keine – dieselbe Regel wie in `secondaryAmount` selbst.
  */
  const secondary = row.lager
    ? secondaryAmount({
        kind: row.lager.materialKind,
        grams: remainingWeight,
        density: resolveDensity({
          kind: row.lager.materialKind,
          materialType: row.materialType,
          densityGramsPerLiter: row.densityGramsPerLiter,
        }),
        diameterUm: row.lager.filamentDiameterUm,
      })
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
    texture: row.texture,
    nominalWeight: row.nominalWeight,
    remainingWeight,
    remainingPercent,
    secondary,
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

  const visible = await listVisibleLager(viewerId, "search");
  if (visible.length === 0) return [];
  const names = new Map(visible.map(v => [v.ownerId, v.ownerName]));

  const pattern = `%${escapeLike(term)}%`;
  const rows = await getDb().query.materials.findMany({
    columns: FRIEND_MATERIAL_COLUMNS,
    with: FRIEND_MATERIAL_WITH,
    where: and(
      inArray(
        materials.lagerId,
        visible.map(v => v.lagerId)
      ),
      /*
        Zusätzlich der Besitzer, obwohl das Lager ihn bereits festlegt: Der
        Filter ist redundant, solange kein Material in einem fremden Lager liegt
        (`api/lager.integration.test.ts` prüft genau das). Genau deshalb ist er
        billig – er macht eine verletzte Invariante unerreichbar statt bloß
        unwahrscheinlich, und dies ist die Abfrage, in der das zählt.
      */
      inArray(materials.userId, [...names.keys()]),
      or(
        ilike(materials.name, pattern),
        ilike(materials.identifier, pattern),
        ilike(materials.materialType, pattern),
        ilike(materials.manufacturer, pattern),
        ilike(materials.color, pattern),
        // Wer „mattes PETG“ sucht, sucht nach der Oberfläche – sie ist ein
        // eigenes Feld, seit sie nicht mehr in der Materialart steckt.
        ilike(materials.texture, pattern)
      )
    ),
    orderBy: [asc(materials.name), asc(materials.id)],
    limit,
  });

  return rows.map(row => toFriendMaterial(row, names.get(row.userId) ?? ""));
}

/**
 * Was ein Freund ganz freigegeben hat – die Lager auf Stufe `full`.
 *
 * Eine **flache Liste**, nicht nach Lagern gruppiert: Der Lagername geht
 * bewusst nicht an Freunde hinaus (Freitext, kann einen Ort verraten). Die
 * Freigabe entscheidet also nur, *welche* Materialien hier stehen – ein Freund
 * sieht nicht, aus wie vielen Lagern sie kommen.
 *
 * Gibt `null` zurück, wenn nichts ganz freigegeben ist. Der Router macht daraus
 * ein `NOT_FOUND` und nicht `FORBIDDEN`: Wie überall im Projekt soll die Antwort
 * nicht verraten, dass es die Zeile gibt.
 */
export async function findFriendInventory(
  viewerId: number,
  ownerId: number
): Promise<{ ownerName: string; materials: FriendMaterial[] } | null> {
  if (viewerId === ownerId) return null;
  const visible = await listVisibleLager(viewerId, "full");
  const lagerIds = visible
    .filter(v => v.ownerId === ownerId)
    .map(v => v.lagerId);
  if (lagerIds.length === 0) return null;

  const names = await loadDisplayNames([ownerId]);
  const ownerName = names.get(ownerId) ?? "";
  const rows = await getDb().query.materials.findMany({
    columns: FRIEND_MATERIAL_COLUMNS,
    with: FRIEND_MATERIAL_WITH,
    // Besitzer **und** Lager, aus demselben Grund wie im Suchpfad.
    where: and(
      eq(materials.userId, ownerId),
      inArray(materials.lagerId, lagerIds)
    ),
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

  /*
    Geprüft wird das **Lager des Materials**, nicht der Besitzer: Wer nur ein
    Lager freigegeben hat, soll nicht über eine geratene Material-ID nach einem
    Material aus einem anderen gefragt werden können.
  */
  const visibility = await shareLevelFor(viewerId, row.lagerId);
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

/** Die Stufe, die ein Freund für **eines** meiner Lager hat. */
export type LagerShareView = {
  lagerId: number;
  visibility: FriendVisibility;
};

/** Freundschaft samt Gegenseite und beiden Richtungen, für die Freundesseite. */
export type FriendshipView = {
  id: number;
  friendId: number;
  friendName: string;
  friendUsername: string | null;
  status: Friendship["status"];
  /** Ob der angemeldete Benutzer die Anfrage gestellt hat */
  outgoing: boolean;
  /**
   * Was der Freund von **meinen** Lagern sieht – meine Entscheidung, je Lager.
   *
   * **Ein Eintrag je eigenem Lager**, auch bei `none`. So muss die Oberfläche
   * keinen Vorgabewert erfinden, und ein nicht freigegebenes Lager ist dort
   * sichtbar nicht freigegeben statt gar nicht erwähnt. Den Namen holt sie sich
   * über `lagerId` aus `lager.list`.
   */
  sharedByMe: LagerShareView[];
  /**
   * Was ich von **seinem** Bestand sehe – seine Entscheidung, als **höchste**
   * Stufe über alle seine Lager.
   *
   * Bewusst eine einzige Stufe und keine Liste: Wie viele Lager er hat und
   * welche er freigibt, ist eine Auskunft über seinen Bestand, die er nicht
   * gegeben hat. Für die Oberfläche zählt ohnehin nur, ob der Lagerblick offen
   * ist (`full`) oder bloß die Suche (`search`).
   */
  sharedWithMe: FriendVisibility;
  createdAt: Date;
};

export async function listFriendships(
  viewerId: number
): Promise<FriendshipView[]> {
  const db = getDb();
  const rows = await db
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
  const granted = await loadGrantedShares(viewerId, otherIds);
  const received = await loadReceivedShares(viewerId, otherIds);
  const ownLagerIds = await loadOwnLagerIds(viewerId);

  return rows.map(row => {
    const outgoing = row.userId === viewerId;
    const friendId = outgoing ? row.friendUserId : row.userId;
    const profile = profiles.get(friendId);
    const grants = granted.get(friendId);
    /*
      Auch für die Anzeige nicht selbst rechnen: Über die geltende Stufe
      entscheidet `resolveShare`, und zwar in beiden Richtungen. Für eine offene
      oder abgelehnte Anfrage kommt damit überall `none` heraus – die ehrliche
      Antwort, denn ohne Annahme gilt keine Freigabe.
    */
    return {
      id: row.id,
      friendId,
      friendName: profile?.name ?? "",
      friendUsername: profile?.telegramUsername ?? null,
      status: row.status,
      outgoing,
      sharedByMe: ownLagerIds.map(lagerId => ({
        lagerId,
        visibility: resolveShare({
          friendshipStatus: row.status,
          shareVisibility: grants?.get(lagerId),
        }),
      })),
      sharedWithMe: resolveShare({
        friendshipStatus: row.status,
        shareVisibility: received.get(friendId),
      }),
      createdAt: row.createdAt,
    };
  });
}

/** IDs der eigenen Lager, in stabiler Reihenfolge. */
async function loadOwnLagerIds(viewerId: number): Promise<number[]> {
  const rows = await getDb()
    .select({ id: lager.id })
    .from(lager)
    .where(eq(lager.userId, viewerId))
    .orderBy(asc(lager.id));
  return rows.map(r => r.id);
}

/**
 * Freigaben, die `viewerId` erteilt hat: `Empfänger → (Lager → Stufe)`.
 *
 * Eine Abfrage für alle Freunde statt eine je Freundeskarte – die Freundesseite
 * zeigt sonst bei fünf Lagern und zwanzig Freunden hundert Einzelabfragen.
 */
async function loadGrantedShares(
  viewerId: number,
  recipientIds: number[]
): Promise<Map<number, Map<number, FriendVisibility>>> {
  const unique = [...new Set(recipientIds)];
  const result = new Map<number, Map<number, FriendVisibility>>();
  if (unique.length === 0) return result;
  const rows = await getDb()
    .select({
      lagerId: lagerShares.lagerId,
      recipientId: lagerShares.sharedWithUserId,
      visibility: lagerShares.visibility,
    })
    .from(lagerShares)
    .innerJoin(lager, eq(lager.id, lagerShares.lagerId))
    .where(
      and(
        eq(lager.userId, viewerId),
        inArray(lagerShares.sharedWithUserId, unique)
      )
    );
  for (const row of rows) {
    const perLager = result.get(row.recipientId) ?? new Map();
    perLager.set(row.lagerId, row.visibility);
    result.set(row.recipientId, perLager);
  }
  return result;
}

/**
 * Freigaben, die `viewerId` **bekommen** hat, verdichtet auf die höchste Stufe
 * je Besitzer: `Besitzer → Stufe`.
 *
 * Die Verdichtung passiert hier und nicht in der Oberfläche, damit die Anzahl
 * der Lager des Freundes den Server nicht verlässt.
 */
async function loadReceivedShares(
  viewerId: number,
  ownerIds: number[]
): Promise<Map<number, FriendVisibility>> {
  const unique = [...new Set(ownerIds)];
  const result = new Map<number, FriendVisibility>();
  if (unique.length === 0) return result;
  const rows = await getDb()
    .select({
      ownerId: lager.userId,
      visibility: lagerShares.visibility,
    })
    .from(lagerShares)
    .innerJoin(lager, eq(lager.id, lagerShares.lagerId))
    .where(
      and(
        eq(lagerShares.sharedWithUserId, viewerId),
        inArray(lager.userId, unique)
      )
    );
  for (const row of rows) {
    const current = result.get(row.ownerId);
    // `full` schlägt `search`; die Rangfolge steht allein in `visibilityAllows`.
    if (current == null || visibilityAllows(row.visibility, current))
      result.set(row.ownerId, row.visibility);
  }
  return result;
}

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

/**
 * Legt eine Anfrage an. Freigegeben ist danach **nichts**: Freigaben stehen seit
 * 2.4.0 je Lager in `lager_shares`, und eine Vorgabe müsste ein konkretes Lager
 * benennen – siehe die Begründung in `contracts/friends.ts` dort, wo
 * `DEFAULT_FRIEND_VISIBILITY` stand.
 */
export async function createFriendship(userId: number, friendUserId: number) {
  const [row] = await getDb()
    .insert(friendships)
    .values({ userId, friendUserId, status: "pending" })
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

/**
 * Löst eine Freundschaft auf. Beide Seiten dürfen das, in jedem Status.
 *
 * **Die Freigaben gehen in beiden Richtungen mit.** Bleiben sie stehen, weckt
 * eine erneut geschlossene Freundschaft den alten Zugriff wieder auf, ohne dass
 * jemand etwas freigegeben hätte – und weil `resolveShare` dann eine angenommene
 * Freundschaft vorfindet, fällt es an keiner Prüfung auf.
 */
export async function deleteFriendship(viewerId: number, friendshipId: number) {
  const db = getDb();
  return db.transaction(async tx => {
    const [row] = await tx
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
    if (!row) return null;

    // Beide Richtungen: was ich ihm freigegeben habe und er mir.
    for (const [ownerId, recipientId] of [
      [row.userId, row.friendUserId],
      [row.friendUserId, row.userId],
    ] as const) {
      await tx
        .delete(lagerShares)
        .where(
          and(
            eq(lagerShares.sharedWithUserId, recipientId),
            inArray(
              lagerShares.lagerId,
              tx
                .select({ id: lager.id })
                .from(lager)
                .where(eq(lager.userId, ownerId))
            )
          )
        );
    }
    return row;
  });
}

/**
 * Setzt die Freigabe **eines eigenen Lagers** für einen Freund.
 *
 * Zwei Bedingungen, beide in der `where`-Klausel bzw. davor geprüft: Das Lager
 * muss dem Aufrufer gehören, und die Freundschaft muss angenommen sein. Ohne die
 * zweite ließe sich eine Freigabe an jemanden erteilen, mit dem man nicht
 * befreundet ist – wirkungslos wegen `resolveShare`, aber eine Zeile mit
 * Personenbezug, die niemand erwartet.
 *
 * `none` **löscht** die Zeile, statt sie zu schreiben: Eine fehlende Zeile ist
 * der Grundzustand (siehe `lager_shares` in `db/schema.ts`).
 */
export async function setLagerShare(
  ownerId: number,
  lagerId: number,
  friendUserId: number,
  visibility: FriendVisibility
): Promise<boolean> {
  const db = getDb();

  const own = await db
    .select({ id: lager.id })
    .from(lager)
    .where(and(eq(lager.id, lagerId), eq(lager.userId, ownerId)))
    .limit(1);
  if (own.length === 0) return false;

  const friendship = await findFriendshipBetween(ownerId, friendUserId);
  if (!friendship || friendship.status !== "accepted") return false;

  if (visibility === "none") {
    await db
      .delete(lagerShares)
      .where(
        and(
          eq(lagerShares.lagerId, lagerId),
          eq(lagerShares.sharedWithUserId, friendUserId)
        )
      );
    return true;
  }

  await db
    .insert(lagerShares)
    .values({ lagerId, sharedWithUserId: friendUserId, visibility })
    .onConflictDoUpdate({
      target: [lagerShares.lagerId, lagerShares.sharedWithUserId],
      set: { visibility, updatedAt: new Date() },
    });
  return true;
}

/**
 * Freigaben eines Lagers – wer sieht es, und wie viel?
 *
 * Gebraucht beim Löschen eines Lagers (das entzieht Zugriff und gehört
 * protokolliert) und für die Anzeige „mit N Freunden geteilt“.
 */
export async function findSharesOfLager(
  lagerId: number
): Promise<{ sharedWithUserId: number; visibility: FriendVisibility }[]> {
  return getDb()
    .select({
      sharedWithUserId: lagerShares.sharedWithUserId,
      visibility: lagerShares.visibility,
    })
    .from(lagerShares)
    .where(eq(lagerShares.lagerId, lagerId));
}

/**
 * Anzahl der Freigaben je eigenem Lager – für die Lager-Seite.
 *
 * Gezählt werden Zeilen, ohne den Freundschaftsstatus nachzuschlagen. Das ist
 * hier richtig: Zeilen entstehen nur bei angenommener Freundschaft
 * (`setLagerShare`) und verschwinden mit ihr (`deleteFriendship`), und für die
 * Frage „geht dieses Lager hinaus?“ ist die Zeile selbst die Antwort.
 */
export async function countSharesByLager(
  ownerId: number
): Promise<Map<number, number>> {
  const rows = await getDb()
    .select({ lagerId: lagerShares.lagerId, count: count() })
    .from(lagerShares)
    .innerJoin(lager, eq(lager.id, lagerShares.lagerId))
    .where(eq(lager.userId, ownerId))
    .groupBy(lagerShares.lagerId);
  return new Map(rows.map(r => [r.lagerId, Number(r.count)]));
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
