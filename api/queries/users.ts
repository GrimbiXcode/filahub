import { eq } from "drizzle-orm";
import * as schema from "@db/schema";
import type { InsertUser } from "@db/schema";
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
 * nicht zurückdrehen. MySQL kann Versionsnummern nicht sinnvoll vergleichen
 * (`0.10.0` < `0.9.0` als Text), deshalb passiert der Vergleich hier.
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
  patch: { currency?: string; locale?: string | null }
) {
  const values: Partial<InsertUser> = {};
  if (patch.currency !== undefined) values.currency = patch.currency;
  if (patch.locale !== undefined) values.locale = patch.locale;
  if (Object.keys(values).length === 0) return;

  await getDb()
    .update(schema.users)
    .set(values)
    .where(eq(schema.users.id, userId));
}

/**
 * Legt einen Benutzer an bzw. aktualisiert ihn beim Login.
 * Rolle: explizit gesetzter Owner (OWNER_TELEGRAM_ID) oder der allererste
 * registrierte Benutzer wird Admin.
 */
export async function upsertUser(data: InsertUser) {
  const values = { ...data };
  const updateSet: Partial<InsertUser> = {
    lastSignInAt: new Date(),
    name: data.name,
    telegramUsername: data.telegramUsername,
    avatar: data.avatar,
  };

  if (values.role === undefined) {
    const isOwner =
      !!env.ownerTelegramId && values.unionId === env.ownerTelegramId;
    const existing = await findUserByUnionId(values.unionId!);
    if (isOwner) {
      values.role = "admin";
      updateSet.role = "admin";
    } else if (!existing) {
      const all = await getDb()
        .select({ id: schema.users.id })
        .from(schema.users)
        .limit(1);
      if (all.length === 0) {
        values.role = "admin";
        updateSet.role = "admin";
      }
    }
  }

  await getDb()
    .insert(schema.users)
    .values(values)
    .onDuplicateKeyUpdate({ set: updateSet });
}
