import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { apiTokens, bridgePrinters, users } from "@db/schema";
import type {
  BridgeConfigPrinter,
  BridgePrinterStatus,
  BridgeReport,
  BridgeStatus,
  PrusaLinkAuthKind,
} from "@contracts/bridge";
import { openSecret, sealSecret } from "../lib/apiToken";
import type { Scope } from "../scope";
import { getDb, type DbTransaction } from "./connection";

/**
 * API-Schlüssel und die Drucker der Brücke (seit 4.7.0). Wer einen Schlüssel
 * sieht und verwalten darf, entscheidet `tokenVisibleWhere`: sein Besitzer
 * immer, ein Administrator der Organisation alle Schlüssel, die auf sie
 * zielen.
 */

type Db = ReturnType<typeof getDb> | DbTransaction;

export type ApiTokenKind = "slicer" | "bridge";

export async function insertApiToken(data: {
  userId: number;
  organizationId: number | null;
  kind: ApiTokenKind;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
}): Promise<number> {
  const [row] = await getDb()
    .insert(apiTokens)
    .values(data)
    .returning({ id: apiTokens.id });
  return row.id;
}

export async function countApiTokensOfUser(userId: number): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId));
  return Number(rows.at(0)?.value ?? 0);
}

/**
 * Die Schlüssel, die ein Betrachter im Bereich sieht: im persönlichen Bereich
 * seine eigenen ohne Organisation; in einer Organisation seine eigenen für
 * sie – als Administrator alle für sie.
 */
function tokenVisibleWhere(viewerId: number, scope: Scope) {
  if (scope.kind === "personal")
    return and(
      eq(apiTokens.userId, viewerId),
      isNull(apiTokens.organizationId)
    );
  const forOrg = eq(apiTokens.organizationId, scope.organizationId);
  return scope.role === "admin"
    ? forOrg
    : and(forOrg, eq(apiTokens.userId, viewerId));
}

export type ApiTokenEntry = {
  id: number;
  kind: ApiTokenKind;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  mine: boolean;
  ownerName: string | null;
  bridgeStatus: BridgeStatus | null;
  bridgeStatusAt: Date | null;
};

export async function listApiTokens(
  viewerId: number,
  scope: Scope
): Promise<ApiTokenEntry[]> {
  const rows = await getDb()
    .select({ token: apiTokens, ownerName: users.name })
    .from(apiTokens)
    .leftJoin(users, eq(users.id, apiTokens.userId))
    .where(tokenVisibleWhere(viewerId, scope))
    .orderBy(desc(apiTokens.createdAt), desc(apiTokens.id));
  return rows.map(({ token, ownerName }) => ({
    id: token.id,
    kind: token.kind,
    name: token.name,
    prefix: token.tokenPrefix,
    createdAt: token.createdAt,
    lastUsedAt: token.lastUsedAt,
    mine: token.userId === viewerId,
    ownerName,
    bridgeStatus: token.bridgeStatus ?? null,
    bridgeStatusAt: token.bridgeStatusAt,
  }));
}

/** Ein Schlüssel, den der Betrachter im Bereich verwalten darf – oder `null` */
export async function findManageableToken(
  viewerId: number,
  scope: Scope,
  id: number
) {
  const [row] = await getDb()
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.id, id), tokenVisibleWhere(viewerId, scope)));
  return row ?? null;
}

/** Löscht Schlüssel samt Druckern; gibt die gelöschten zurück */
export async function deleteApiTokens(
  db: Db,
  where: ReturnType<typeof and>
): Promise<{ id: number; userId: number; organizationId: number | null }[]> {
  const removed = await db.delete(apiTokens).where(where).returning({
    id: apiTokens.id,
    userId: apiTokens.userId,
    organizationId: apiTokens.organizationId,
  });
  if (removed.length > 0)
    await db.delete(bridgePrinters).where(
      inArray(
        bridgePrinters.apiTokenId,
        removed.map(r => r.id)
      )
    );
  return removed;
}

export function deleteApiTokenById(id: number) {
  return getDb().transaction(tx => deleteApiTokens(tx, eq(apiTokens.id, id)));
}

/** Mit der Mitgliedschaft enden die Schlüssel, die auf die Organisation zielen */
export function deleteTokensOfMembership(
  db: Db,
  userId: number,
  organizationId: number
) {
  return deleteApiTokens(
    db,
    and(
      eq(apiTokens.userId, userId),
      eq(apiTokens.organizationId, organizationId)
    )
  );
}

/** Zum Prüfen eines Aufrufs: der Schlüssel samt Sperrstand seines Besitzers */
export async function findTokenByHash(hash: string) {
  const [row] = await getDb()
    .select({ token: apiTokens, blockedAt: users.blockedAt })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(eq(apiTokens.tokenHash, hash));
  return row ?? null;
}

/** „Zuletzt benutzt“ – höchstens einmal je Minute geschrieben */
export async function touchApiToken(id: number): Promise<void> {
  await getDb()
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(apiTokens.id, id),
        or(
          isNull(apiTokens.lastUsedAt),
          lt(apiTokens.lastUsedAt, sql`now() - interval '1 minute'`)
        )
      )
    );
}

// ---------------------------------------------------------------------------
// Drucker der Brücke
// ---------------------------------------------------------------------------

export type BridgePrinterEntry = {
  id: number;
  apiTokenId: number;
  name: string;
  host: string;
  authKind: PrusaLinkAuthKind;
  username: string | null;
  hasSecret: boolean;
  /** Gespeichert, aber mit dem aktuellen `APP_SECRET` nicht lesbar */
  secretUnreadable: boolean;
  enabled: boolean;
  testRequestedAt: Date | null;
  status: BridgePrinterStatus | null;
  statusAt: Date | null;
};

/** Die Drucker der genannten Brücken – ohne Zugangsdaten, nur ob es welche gibt */
export async function listBridgePrinters(
  tokenIds: number[]
): Promise<BridgePrinterEntry[]> {
  if (tokenIds.length === 0) return [];
  const rows = await getDb()
    .select()
    .from(bridgePrinters)
    .where(inArray(bridgePrinters.apiTokenId, tokenIds))
    .orderBy(bridgePrinters.name, bridgePrinters.id);
  return rows.map(row => ({
    id: row.id,
    apiTokenId: row.apiTokenId,
    name: row.name,
    host: row.host,
    authKind: row.authKind,
    username: row.username,
    hasSecret: row.secretCiphertext != null,
    secretUnreadable:
      row.secretCiphertext != null && openSecret(row.secretCiphertext) === null,
    enabled: row.enabled,
    testRequestedAt: row.testRequestedAt,
    status: row.status ?? null,
    statusAt: row.statusAt,
  }));
}

export async function countPrintersOfToken(tokenId: number): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(bridgePrinters)
    .where(eq(bridgePrinters.apiTokenId, tokenId));
  return Number(rows.at(0)?.value ?? 0);
}

export type BridgePrinterInput = {
  name: string;
  host: string;
  authKind: PrusaLinkAuthKind;
  username: string | null;
  /** `undefined` = unverändert lassen, `null` = entfernen */
  secret?: string | null;
  enabled: boolean;
};

export async function insertBridgePrinter(
  tokenId: number,
  input: BridgePrinterInput
): Promise<number> {
  const [row] = await getDb()
    .insert(bridgePrinters)
    .values({
      apiTokenId: tokenId,
      name: input.name,
      host: input.host,
      authKind: input.authKind,
      username: input.username,
      secretCiphertext: input.secret ? sealSecret(input.secret) : null,
      enabled: input.enabled,
      // Ein neuer Drucker wird gleich geprüft
      testRequestedAt: new Date(),
    })
    .returning({ id: bridgePrinters.id });
  return row.id;
}

export async function updateBridgePrinter(
  tokenId: number,
  id: number,
  input: BridgePrinterInput
): Promise<boolean> {
  const rows = await getDb()
    .update(bridgePrinters)
    .set({
      name: input.name,
      host: input.host,
      authKind: input.authKind,
      username: input.username,
      ...(input.secret !== undefined
        ? { secretCiphertext: input.secret ? sealSecret(input.secret) : null }
        : {}),
      enabled: input.enabled,
      // Nach einer Änderung gleich neu prüfen – sonst zeigt die App die
      // Diagnose der alten Adresse
      testRequestedAt: new Date(),
      status: null,
      statusAt: null,
    })
    .where(
      and(eq(bridgePrinters.id, id), eq(bridgePrinters.apiTokenId, tokenId))
    )
    .returning({ id: bridgePrinters.id });
  return rows.length > 0;
}

export async function deleteBridgePrinter(
  tokenId: number,
  id: number
): Promise<boolean> {
  const rows = await getDb()
    .delete(bridgePrinters)
    .where(
      and(eq(bridgePrinters.id, id), eq(bridgePrinters.apiTokenId, tokenId))
    )
    .returning({ id: bridgePrinters.id });
  return rows.length > 0;
}

export async function requestPrinterTest(
  tokenId: number,
  id: number
): Promise<boolean> {
  const rows = await getDb()
    .update(bridgePrinters)
    .set({ testRequestedAt: new Date() })
    .where(
      and(eq(bridgePrinters.id, id), eq(bridgePrinters.apiTokenId, tokenId))
    )
    .returning({ id: bridgePrinters.id });
  return rows.length > 0;
}

/** Was die Brücke abholt: aktive Drucker samt entschlüsseltem Zugang */
export async function bridgeConfigPrinters(
  tokenId: number
): Promise<BridgeConfigPrinter[]> {
  const rows = await getDb()
    .select()
    .from(bridgePrinters)
    .where(
      and(
        eq(bridgePrinters.apiTokenId, tokenId),
        eq(bridgePrinters.enabled, true)
      )
    )
    .orderBy(bridgePrinters.id);
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    host: row.host,
    authKind: row.authKind,
    username: row.username,
    secret: openSecret(row.secretCiphertext),
    testRequestedAt: row.testRequestedAt?.toISOString() ?? null,
  }));
}

/**
 * Übernimmt eine Meldung der Brücke: ihren eigenen Zustand und den jedes
 * Druckers, der zu ihr gehört. Fremde Drucker-IDs fallen still weg. Hat die
 * Brücke eine Testanfrage beantwortet, wird sie gelöscht – aber nur, wenn
 * seither keine neue kam.
 */
export async function applyBridgeReport(
  tokenId: number,
  report: BridgeReport
): Promise<void> {
  await getDb().transaction(async tx => {
    await tx
      .update(apiTokens)
      .set({
        bridgeStatus: {
          protocol: report.protocol,
          version: report.version,
          startedAt: report.startedAt,
          queued: report.queued,
          log: report.log,
        },
        bridgeStatusAt: new Date(),
        lastUsedAt: new Date(),
      })
      .where(eq(apiTokens.id, tokenId));
    for (const { id, ...status } of report.printers) {
      await tx
        .update(bridgePrinters)
        .set({ status, statusAt: new Date() })
        .where(
          and(eq(bridgePrinters.id, id), eq(bridgePrinters.apiTokenId, tokenId))
        );
      if (status.testAnsweredFor) {
        await tx
          .update(bridgePrinters)
          .set({ testRequestedAt: null })
          .where(
            and(
              eq(bridgePrinters.id, id),
              eq(bridgePrinters.apiTokenId, tokenId),
              sql`${bridgePrinters.testRequestedAt} <= ${new Date(status.testAnsweredFor)}`
            )
          );
      }
    }
  });
}
