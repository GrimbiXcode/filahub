import { eq, sql } from "drizzle-orm";
import * as schema from "@db/schema";
import type { InsertUser } from "@db/schema";
import {
  type MaterialColumn,
  normalizeHiddenColumns,
} from "@contracts/materialColumns";
import { compareVersions } from "@contracts/releaseNotes";
import { getDb } from "./connection";
import { env } from "../lib/env";

export async function findUserByUnionId(unionId: string) {
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.unionId, unionId))
    .limit(1);
  return rows.at(0);
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
  hasAllowlist: boolean;
  isFirstUser: () => Promise<boolean>;
}): Promise<boolean> {
  if (options.ownerTelegramId && options.unionId === options.ownerTelegramId) {
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
  };

  if (values.role === undefined) {
    const grantAdmin = await shouldGrantAdmin({
      unionId: values.unionId!,
      ownerTelegramId: env.ownerTelegramId,
      hasAllowlist: env.telegramAllowedIds.length > 0,
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
