import { eq } from "drizzle-orm";
import * as schema from "@db/schema";
import type { InsertUser } from "@db/schema";
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
 * Anzeige-Einstellungen eines Benutzers ändern (Währung, Regionalformat).
 * `locale: null` bedeutet „Locale des Browsers verwenden“.
 */
export async function updateUserSettings(
  userId: number,
  patch: { currency?: string; locale?: string | null },
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
    const isOwner = !!env.ownerTelegramId && values.unionId === env.ownerTelegramId;
    const existing = await findUserByUnionId(values.unionId!);
    if (isOwner) {
      values.role = "admin";
      updateSet.role = "admin";
    } else if (!existing) {
      const all = await getDb().select({ id: schema.users.id }).from(schema.users).limit(1);
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
