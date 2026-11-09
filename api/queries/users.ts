import { and, count, eq, gte, isNull, sql } from "drizzle-orm";
import * as schema from "@db/schema";
import type { InsertUser } from "@db/schema";
import {
  type MaterialColumn,
  normalizeHiddenColumns,
} from "@contracts/materialColumns";
import { compareVersions } from "@contracts/releaseNotes";
import { getDb } from "./connection";
import { env } from "../lib/env";
import { discordUnionId, hasAnyAllowlist } from "../lib/loginAccess";

/** Das Konto, mit dem diese Discord-ID verbunden ist (seit 4.8.0). */
export async function findUserByDiscordId(discordId: string) {
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.discordId, discordId))
    .limit(1);
  return rows.at(0);
}

export async function findUserByUnionId(unionId: string) {
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.unionId, unionId))
    .limit(1);
  return rows.at(0);
}

/**
 * Wie viele Konten seit einem Zeitpunkt angelegt wurden – Grundlage der
 * Registrierungsgrenze.
 *
 * Instanzweit und nicht je Adresse: Die Adresse deckt `consumeRateLimit` ab,
 * hier geht es um den Ansturm aus vielen Richtungen, den eine offene
 * Registrierung einlädt.
 */
/**
 * Ein Konto über seine interne ID.
 *
 * Neben `findUserByUnionId`, das die Telegram-ID nachschlägt: Die Verwaltung
 * arbeitet mit den IDs aus ihrer eigenen Liste und kennt die Telegram-ID
 * bewusst nicht (siehe `findUsersForAdmin`).
 */
export async function findUserById(id: number) {
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);
  return rows.at(0);
}

export async function countUsersCreatedSince(since: Date): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(schema.users)
    .where(gte(schema.users.createdAt, since));
  return Number(rows.at(0)?.value ?? 0);
}

/**
 * Alle Administratoren dieser Instanz – Empfänger der Missbrauchsmeldungen.
 *
 * Liefert nur, was der Versand braucht (`unionId` ist die Telegram-ID, dazu die
 * Sprache): Ein `select()` über die ganze Zeile zöge Anzeigeeinstellungen und
 * Freundescodes mit, die eine Benachrichtigung nichts angehen.
 */
export async function findAdminUsers() {
  return getDb()
    .select({
      id: schema.users.id,
      unionId: schema.users.unionId,
      language: schema.users.language,
    })
    .from(schema.users)
    .where(eq(schema.users.role, "admin"));
}

/**
 * Merkt sich, bis zu welcher Version der Benutzer die Neuerungen gesehen hat.
 *
 * Bewusst monoton: Ein alter Tab oder ein zurückgerolltes Image darf den Stand
 * nicht zurückdrehen. Die Datenbank kann Versionsnummern nicht sinnvoll
 * vergleichen (`0.10.0` < `0.9.0` als Text), deshalb passiert der Vergleich
 * hier.
 */
export async function markReleaseNotesSeen(userId: number, version: string) {
  const rows = await getDb()
    .select({ lastSeen: schema.users.lastSeenReleaseVersion })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  const current = rows.at(0)?.lastSeen;
  if (current != null && compareVersions(version, current) <= 0) return;

  await getDb()
    .update(schema.users)
    .set({ lastSeenReleaseVersion: version })
    .where(eq(schema.users.id, userId));
}

/**
 * Anzeige-Einstellungen eines Benutzers ändern (Währung, Regionalformat).
 * `locale: null` bedeutet „Locale des Browsers verwenden”.
 */
export async function updateUserSettings(
  userId: number,
  patch: {
    currency?: string;
    locale?: string | null;
    language?: string | null;
    hiddenMaterialColumns?: MaterialColumn[] | null;
  }
) {
  const values: Partial<InsertUser> = {};
  if (patch.currency !== undefined) values.currency = patch.currency;
  if (patch.locale !== undefined) values.locale = patch.locale;
  if (patch.language !== undefined) values.language = patch.language;
  /*
    Normalisiert vor dem Schreiben, damit gesperrte Spalten und Dubletten gar
    nicht erst in der Datenbank landen: Das Schema lässt jede Kennung zu, die
    es gibt – dass `name` und `actions` nicht abschaltbar sind, weiß erst
    `normalizeHiddenColumns`. `null` bedeutet „zurück auf Standard“ und wird
    dabei zur leeren Liste.
  */
  if (patch.hiddenMaterialColumns !== undefined) {
    values.hiddenMaterialColumns = normalizeHiddenColumns(
      patch.hiddenMaterialColumns
    );
  }
  if (Object.keys(values).length === 0) return;

  await getDb()
    .update(schema.users)
    .set(values)
    .where(eq(schema.users.id, userId));
}

/**
 * Entscheidet, ob ein Konto beim Anlegen Administratorrechte bekommt.
 *
 * Ausgelagert und frei von Umgebungszugriffen, damit sich die Regel prüfen
 * lässt – es geht um Rechtevergabe, da ist ein Test mehr wert als eine
 * Zeile weniger.
 *
 * Zwei Wege führen zu „ja“:
 *
 *  1. Die Telegram-ID steht in `OWNER_TELEGRAM_ID`. Das ist die ausdrückliche
 *     Ansage des Betreibers und gilt bei jeder Anmeldung erneut.
 *  2. Es ist der allererste Benutzer **und** es gibt eine Freigabeliste. Dann
 *     hat der Betreiber diese Person zugelassen; die Bequemlichkeit der
 *     Ersteinrichtung ist hier unbedenklich.
 *
 * Bei offener Registrierung ohne Freigabeliste gibt es **keine** Automatik.
 * Sonst wäre es ein Wettrennen: Auf einer frisch aufgesetzten, öffentlich
 * erreichbaren Instanz bekäme schlicht der erste Fremde die Administration.
 */
export async function shouldGrantAdmin(options: {
  unionId: string;
  ownerTelegramId: string;
  /** Seit 4.8.0: dieselbe Ansage für Discord (`OWNER_DISCORD_ID`) */
  discordId?: string | null;
  ownerDiscordId?: string;
  hasAllowlist: boolean;
  isFirstUser: () => Promise<boolean>;
}): Promise<boolean> {
  if (options.ownerTelegramId && options.unionId === options.ownerTelegramId) {
    return true;
  }
  if (
    options.ownerDiscordId &&
    options.discordId &&
    options.discordId === options.ownerDiscordId
  ) {
    return true;
  }
  if (!options.hasAllowlist) return false;
  return options.isFirstUser();
}

/**
 * Legt einen Benutzer an bzw. aktualisiert ihn beim Login.
 * Rolle: explizit gesetzter Owner (OWNER_TELEGRAM_ID) oder der allererste
 * registrierte Benutzer – Letzteres aber nur bei gesetzter Freigabeliste,
 * siehe unten.
 *
 * Gibt die geschriebene Zeile zurück – der Aufrufer braucht daraus
 * `tokenVersion`, um das Session-Token auszustellen.
 */
export async function upsertUser(data: InsertUser) {
  const values = { ...data };
  const updateSet: Partial<InsertUser> = {
    lastSignInAt: new Date(),
    name: data.name,
    telegramUsername: data.telegramUsername,
    discordUsername: data.discordUsername,
  };

  if (values.role === undefined) {
    const grantAdmin = await shouldGrantAdmin({
      unionId: values.unionId!,
      ownerTelegramId: env.ownerTelegramId,
      discordId: values.discordId ?? null,
      ownerDiscordId: env.ownerDiscordId,
      hasAllowlist: hasAnyAllowlist(env),
      // Erst fragen, wenn die Antwort zählt – sonst zwei Abfragen pro Login.
      isFirstUser: async () => {
        const existing = await findUserByUnionId(values.unionId!);
        if (existing) return false;
        const all = await getDb()
          .select({ id: schema.users.id })
          .from(schema.users)
          .limit(1);
        return all.length === 0;
      },
    });
    if (grantAdmin) {
      values.role = "admin";
      updateSet.role = "admin";
    }
  }

  // Postgres braucht die Konfliktspalte explizit; eindeutig ist die
  // Telegram-ID (`unionId`).
  const [user] = await getDb()
    .insert(schema.users)
    .values(values)
    .onConflictDoUpdate({ target: schema.users.unionId, set: updateSet })
    .returning();
  return user;
}

/**
 * Entwertet alle ausgegebenen Sitzungen eines Benutzers, indem der Zähler
 * erhöht wird (siehe `users.tokenVersion`). Gedacht für „auf allen Geräten
 * abmelden“ und für den Fall, dass ein Gerät abhandengekommen ist.
 */
export async function revokeSessions(userId: number) {
  await getDb()
    .update(schema.users)
    .set({ tokenVersion: sql`${schema.users.tokenVersion} + 1` })
    .where(eq(schema.users.id, userId));
}

export type DiscordProfile = {
  id: string;
  username: string;
  globalName: string | null;
};

/**
 * Anmeldung über Discord: das verbundene Konto auffrischen oder ein neues
 * anlegen (seit 4.8.0).
 *
 * Ein bestehendes Konto behält seinen Namen – bei einem Telegram-Konto, das
 * Discord nur verbunden hat, wäre es sonst Zufall, welcher Dienst zuletzt
 * den Anzeigenamen gesetzt hat. Aufgefrischt wird nur der Discord-Benutzername
 * und, beim Betreiber, die Rolle.
 */
export async function upsertDiscordUser(profile: DiscordProfile) {
  const existing = await findUserByDiscordId(profile.id);
  if (!existing) {
    return upsertUser({
      unionId: discordUnionId(profile.id),
      name: profile.globalName ?? profile.username,
      discordId: profile.id,
      discordUsername: profile.username,
      lastSignInAt: new Date(),
    });
  }
  const set: Partial<InsertUser> = {
    lastSignInAt: new Date(),
    discordUsername: profile.username,
  };
  if (env.ownerDiscordId && env.ownerDiscordId === profile.id) {
    set.role = "admin";
  }
  const [user] = await getDb()
    .update(schema.users)
    .set(set)
    .where(eq(schema.users.id, existing.id))
    .returning();
  return user;
}

export type LinkDiscordResult = "linked" | "already_linked" | "taken";

/**
 * Verbindet ein Discord-Konto mit einem filahub-Konto.
 *
 * Ersetzt nie: Hat das Konto schon ein anderes Discord-Konto, muss es erst
 * getrennt werden. Und eine Discord-ID, die schon zu einem anderen Konto
 * führt, wird nicht umgehängt – sonst verlöre jemand still seinen
 * Anmeldeweg. Der eindeutige Index fängt das Rennen zweier gleichzeitiger
 * Verbindungen ab.
 */
export async function linkDiscord(
  userId: number,
  profile: DiscordProfile
): Promise<LinkDiscordResult> {
  const holder = await findUserByDiscordId(profile.id);
  if (holder) return holder.id === userId ? "already_linked" : "taken";
  try {
    const rows = await getDb()
      .update(schema.users)
      .set({ discordId: profile.id, discordUsername: profile.username })
      .where(and(eq(schema.users.id, userId), isNull(schema.users.discordId)))
      .returning({ id: schema.users.id });
    return rows.length === 1 ? "linked" : "already_linked";
  } catch (error) {
    // Drizzle hüllt den Treiberfehler ein; der SQLSTATE steckt in `cause`.
    for (let e: unknown = error, i = 0; e != null && i < 5; i++) {
      if ((e as { code?: unknown }).code === "23505") return "taken";
      e = (e as { cause?: unknown }).cause;
    }
    throw error;
  }
}

/** Trennt Discord wieder; die Prüfung, ob ein Weg bleibt, macht der Aufrufer. */
export async function unlinkDiscord(userId: number) {
  await getDb()
    .update(schema.users)
    .set({ discordId: null, discordUsername: null })
    .where(eq(schema.users.id, userId));
}
