import { and, isNull, lt, or } from "drizzle-orm";
import { discordLoginRequests } from "@db/schema";
import { getDb } from "./connection";

/**
 * Löscht abgelaufene Anfragen. Läuft bei jedem Start mit (Verifier und
 * Discord-Profile liegen so nicht bis zum täglichen Lauf) und im täglichen
 * Aufräumen (`api/queries/retention.ts`); die Anmeldung selbst steht in `api/discord.ts`.
 */
export async function purgeDiscordLoginRequests(): Promise<number> {
  const now = new Date();
  const rows = await getDb()
    .delete(discordLoginRequests)
    .where(
      and(
        lt(discordLoginRequests.expiresAt, now),
        or(
          isNull(discordLoginRequests.handoffExpiresAt),
          lt(discordLoginRequests.handoffExpiresAt, now)
        )
      )
    )
    .returning({ stateHash: discordLoginRequests.stateHash });
  return rows.length;
}
