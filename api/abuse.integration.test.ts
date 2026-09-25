/**
 * Missbrauchsabwehr gegen eine echte PostgreSQL-Datenbank.
 *
 * Läuft nur mit `npm run test:integration` und gesetzter `TEST_DATABASE_URL`.
 *
 * Drei Dinge lassen sich ausschließlich hier prüfen: dass die Obergrenzen
 * **an der Grenze** greifen und nicht daneben (jede braucht echte Zeilen), dass
 * die Sperre das Fachliche schließt und die Betroffenenrechte offen lässt, und
 * dass der partielle Unique-Index auf den Entsperr-Anträgen wirklich in der
 * Datenbank steht – er ist von Hand in die Migration geschrieben und in keinem
 * Schema-Ausdruck sichtbar.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  MAX_CONTAINER_TYPES_PER_SCOPE,
  MAX_CUSTOM_COLORS_PER_SCOPE,
  MAX_MATERIALS_PER_LAGER,
  MAX_STORAGE_BOXES_PER_SCOPE,
  MAX_WEIGHINGS_PER_MATERIAL,
  MAX_CONSUMPTIONS_PER_MATERIAL,
} from "@contracts/limits";
import * as schema from "@db/schema";
import type { User } from "@db/schema";
import { getAbuseOverview } from "./queries/abuse";
import { blockUser, unblockUser } from "./queries/blocking";
import { getDb } from "./queries/connection";
import { exportUserData } from "./queries/account";
import { findUserByUnionId, upsertUser } from "./queries/users";
import {
  callerFor,
  closeDb,
  insertMaterials,
  resetSchema,
} from "./test/integration-db";

const db = () => getDb();
const PERSONAL = { organizationId: null } as const;

let anna: User;
let chef: User;

beforeAll(async () => {
  await resetSchema();
}, 60_000);

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await resetSchema();
  await upsertUser({ unionId: "anna-1", name: "Anna" });
  await upsertUser({ unionId: "chef-1", name: "Chefin", role: "admin" });
  anna = (await findUserByUnionId("anna-1"))!;
  chef = (await findUserByUnionId("chef-1"))!;
});

/** Ein Lager, in dem die Materialtests arbeiten. */
async function lagerFuer(user: User): Promise<number> {
  const created = await callerFor(user).lager.create({
    ...PERSONAL,
    name: "Filament",
    materialKind: "filament",
    filamentDiameterUm: 1750,
  });
  return created!.id;
}

/**
 * Füllt eine Tabelle bis dicht unter die Grenze – direkt über die Datenbank.
 *
 * Über den Router wären das tausend Aufrufe je Test, die zusätzlich in die
 * Zugriffsbegrenzung liefen. Geprüft werden soll die Obergrenze, nicht die
 * Geduld des Testlaufs.
 */
async function fuelleMaterialien(
  lagerId: number,
  userId: number,
  anzahl: number
) {
  const rows = Array.from({ length: anzahl }, (_, i) => ({
    lagerId,
    userId,
    organizationId: null,
    name: `Rolle ${i}`,
    materialType: "PLA",
    nominalWeight: 1000,
  }));
  await insertMaterials(rows);
}

describe("Mengenobergrenzen", () => {
  it("lässt das letzte Material zu und weist das nächste ab", async () => {
    const lagerId = await lagerFuer(anna);
    await fuelleMaterialien(lagerId, anna.id, MAX_MATERIALS_PER_LAGER - 1);

    // Das letzte, das hineinpasst.
    await expect(
      callerFor(anna).material.create({
        ...PERSONAL,
        lagerId,
        name: "Das letzte",
        materialType: "PLA",
        nominalWeight: 1000,
      })
    ).resolves.toBeTruthy();

    await expect(
      callerFor(anna).material.create({
        ...PERSONAL,
        lagerId,
        name: "Eins zu viel",
        materialType: "PLA",
        nominalWeight: 1000,
      })
    ).rejects.toThrow(/fasst/);
  });

  it("bricht den Massenimport ab, bevor eine einzige Zeile entsteht", async () => {
    const lagerId = await lagerFuer(anna);
    await fuelleMaterialien(lagerId, anna.id, MAX_MATERIALS_PER_LAGER - 5);

    await expect(
      callerFor(anna).material.importMany({
        ...PERSONAL,
        lagerId,
        items: [
          {
            hersteller: "X",
            typ: "PLA",
            farbe: "Rot",
            nenngewicht: 1000,
            anzahl: 20,
          },
        ],
      })
    ).rejects.toThrow(/überschreiten/);

    /*
      Der eigentliche Punkt: **nichts** ist angelegt worden. Eine Prüfung je
      Position hätte fünf Zeilen hinterlassen und dann abgebrochen – einen
      halben Import, den niemand zuordnen kann.
    */
    const [{ value }] = await db()
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.materials)
      .where(eq(schema.materials.lagerId, lagerId));
    expect(value).toBe(MAX_MATERIALS_PER_LAGER - 5);
  });

  it("begrenzt die Wägungen je Material", async () => {
    const lagerId = await lagerFuer(anna);
    const created = await callerFor(anna).material.create({
      ...PERSONAL,
      lagerId,
      name: "Vielgewogen",
      materialType: "PLA",
      nominalWeight: 1000,
    });
    const materialId = created.id;

    await db()
      .insert(schema.weighings)
      .values(
        Array.from({ length: MAX_WEIGHINGS_PER_MATERIAL }, () => ({
          materialId,
          grossWeight: 900,
        }))
      );

    await expect(
      callerFor(anna).material.addWeighing({
        ...PERSONAL,
        materialId,
        grossWeight: 850,
      })
    ).rejects.toThrow(/Wägungen/);
  });

  it("begrenzt die Verbräuche je Material", async () => {
    const lagerId = await lagerFuer(anna);
    const created = await callerFor(anna).material.create({
      ...PERSONAL,
      lagerId,
      name: "Vielgedruckt",
      materialType: "PLA",
      nominalWeight: 1000,
    });
    const materialId = created.id;

    await db()
      .insert(schema.consumptions)
      .values(
        Array.from({ length: MAX_CONSUMPTIONS_PER_MATERIAL }, () => ({
          materialId,
          weight: 1,
        }))
      );

    await expect(
      callerFor(anna).material.addConsumption({
        ...PERSONAL,
        materialId,
        weight: 1,
      })
    ).rejects.toThrow(/Verbräuche/);
  });

  it("begrenzt eigene Farben, Gebindearten und Dryboxen je Bereich", async () => {
    await db()
      .insert(schema.customColors)
      .values(
        Array.from({ length: MAX_CUSTOM_COLORS_PER_SCOPE }, (_, i) => ({
          userId: anna.id,
          organizationId: null,
          name: `Farbe ${i}`,
          nameKey: `farbe-${i}`,
          hex: "#112233",
        }))
      );
    await expect(
      callerFor(anna).appearance.createColor({
        ...PERSONAL,
        name: "Eine zu viel",
        hex: "#445566",
      })
    ).rejects.toThrow(/Farben/);

    await db()
      .insert(schema.containerTypes)
      .values(
        Array.from({ length: MAX_CONTAINER_TYPES_PER_SCOPE }, (_, i) => ({
          userId: anna.id,
          organizationId: null,
          name: `Gebinde ${i}`,
          tareWeight: 200,
        }))
      );
    await expect(
      callerFor(anna).containerType.create({
        ...PERSONAL,
        name: "Eine zu viel",
        form: "rolle",
        tareWeight: 200,
      })
    ).rejects.toThrow(/Gebindearten/);

    await db()
      .insert(schema.storageBoxes)
      .values(
        Array.from({ length: MAX_STORAGE_BOXES_PER_SCOPE }, (_, i) => ({
          userId: anna.id,
          organizationId: null,
          name: `Box ${i}`,
          tareWeight: 500,
        }))
      );
    await expect(
      callerFor(anna).storageBox.create({
        ...PERSONAL,
        name: "Eine zu viel",
        tareWeight: 500,
      })
    ).rejects.toThrow(/Dryboxen/);
  });

  it("schreibt jede Abweisung ins Protokoll, aber keine erlaubte Anlage", async () => {
    const lagerId = await lagerFuer(anna);
    await fuelleMaterialien(lagerId, anna.id, MAX_MATERIALS_PER_LAGER);

    await expect(
      callerFor(anna).material.create({
        ...PERSONAL,
        lagerId,
        name: "Abgewiesen",
        materialType: "PLA",
        nominalWeight: 1000,
      })
    ).rejects.toThrow();

    /*
      `recordAudit` schreibt bewusst ohne `await` (api/queries/audit.ts) – ein
      Protokolleintrag soll die Antwort nicht aufhalten. Hier muss der Test
      deshalb kurz warten, sonst prüft er die Tabelle, bevor der INSERT da ist.
    */
    await new Promise(resolve => setTimeout(resolve, 200));

    const rows = await db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.event, "limit.quota_exceeded"));
    expect(rows).toHaveLength(1);
    expect(rows[0].detail).toMatchObject({ quota: "materials_per_lager" });
    expect(rows[0].actorUserId).toBe(anna.id);
  });
});

describe("Sperre", () => {
  it("schließt das Fachliche und lässt die Betroffenenrechte offen", async () => {
    const lagerId = await lagerFuer(anna);
    await blockUser({ userId: anna.id, reason: "abuse", blockedBy: chef.id });
    const gesperrt = (await findUserByUnionId("anna-1"))!;

    await expect(
      callerFor(gesperrt).material.create({
        ...PERSONAL,
        lagerId,
        name: "Geht nicht",
        materialType: "PLA",
        nominalWeight: 1000,
      })
    ).rejects.toThrow(/blocked/i);

    await expect(callerFor(gesperrt).lager.list(PERSONAL)).rejects.toThrow(
      /blocked/i
    );

    /*
      Der Punkt, auf den es ankommt: Art. 15 und Art. 17 DSGVO überleben die
      Sperre. Wäre das nicht so, wäre die Sperre rechtswidrig – und auffallen
      würde es nur dem Gesperrten, der es nicht melden kann.
    */
    await expect(callerFor(gesperrt).account.export()).resolves.toBeTruthy();
    await expect(callerFor(gesperrt).auth.me()).resolves.toMatchObject({
      id: anna.id,
    });
    await expect(callerFor(gesperrt).unblock.status()).resolves.toMatchObject({
      blockedReason: "abuse",
    });
  });

  it("entwertet die Sitzungen und hebt sie beim Entsperren nicht wieder auf", async () => {
    const vorher = anna.tokenVersion;
    await blockUser({ userId: anna.id, reason: "spam", blockedBy: chef.id });
    const gesperrt = (await findUserByUnionId("anna-1"))!;
    expect(gesperrt.tokenVersion).toBe(vorher + 1);

    await unblockUser(anna.id);
    const frei = (await findUserByUnionId("anna-1"))!;
    expect(frei.blockedAt).toBeNull();
    // Ein Token von vor der Sperre wieder gelten zu lassen wäre die falsche
    // Richtung – der Zähler bleibt, wo er ist.
    expect(frei.tokenVersion).toBe(vorher + 1);
  });

  it("sperrt nicht zweimal", async () => {
    expect(
      await blockUser({ userId: anna.id, reason: "abuse", blockedBy: chef.id })
    ).toBe(true);
    expect(
      await blockUser({ userId: anna.id, reason: "spam", blockedBy: chef.id })
    ).toBe(false);
  });

  it("lässt einen Administrator weder sich selbst noch einen anderen sperren", async () => {
    await expect(
      callerFor(chef).admin.user.block({ userId: chef.id, reason: "abuse" })
    ).rejects.toThrow(/eigene Konto/);

    await upsertUser({ unionId: "zweit-1", name: "Zweit", role: "admin" });
    const zweit = (await findUserByUnionId("zweit-1"))!;
    await expect(
      callerFor(chef).admin.user.block({ userId: zweit.id, reason: "abuse" })
    ).rejects.toThrow(/Administratoren/);
  });
});

describe("Entsperr-Antrag", () => {
  it("läuft vom Stellen bis zum Annehmen und öffnet dabei das Konto", async () => {
    await callerFor(chef).admin.user.block({
      userId: anna.id,
      reason: "abuse",
    });
    const gesperrt = (await findUserByUnionId("anna-1"))!;

    const gestellt = await callerFor(gesperrt).unblock.request({
      message: "Das war ein Skript beim Import, tut mir leid.",
    });
    expect(gestellt.status).toBe("pending");

    const offen = await callerFor(chef).admin.user.unblockRequests({
      status: "pending",
      limit: 10,
    });
    expect(offen).toHaveLength(1);
    expect(offen[0].userName).toBe("Anna");

    await callerFor(chef).admin.user.reviewUnblockRequest({
      id: gestellt.id,
      decision: "approved",
    });

    const frei = (await findUserByUnionId("anna-1"))!;
    expect(frei.blockedAt).toBeNull();
    await expect(callerFor(frei).lager.list(PERSONAL)).resolves.toEqual([]);
  });

  it("lässt nur einen offenen Antrag zu", async () => {
    await blockUser({ userId: anna.id, reason: "abuse", blockedBy: chef.id });
    const gesperrt = (await findUserByUnionId("anna-1"))!;

    await callerFor(gesperrt).unblock.request({ message: "Erster Versuch" });
    /*
      Der partielle Unique-Index `unblock_requests_open_unique` steht von Hand
      in der Migration und in keinem Schema-Ausdruck – ohne diesen Test fiele
      sein Verschwinden erst auf, wenn die Warteschlange der Moderation voll
      ist.
    */
    await expect(
      callerFor(gesperrt).unblock.request({ message: "Zweiter Versuch" })
    ).rejects.toThrow(/bereits ein Antrag/);
  });

  it("verlangt für die Ablehnung eine Begründung", async () => {
    await blockUser({ userId: anna.id, reason: "abuse", blockedBy: chef.id });
    const gesperrt = (await findUserByUnionId("anna-1"))!;
    const gestellt = await callerFor(gesperrt).unblock.request({
      message: "Bitte prüfen",
    });

    await expect(
      callerFor(chef).admin.user.reviewUnblockRequest({
        id: gestellt.id,
        decision: "rejected",
      })
    ).rejects.toThrow(/Begründung/);

    await expect(
      callerFor(chef).admin.user.reviewUnblockRequest({
        id: gestellt.id,
        decision: "rejected",
        note: "Das Muster hält an.",
      })
    ).resolves.toMatchObject({ ok: true });

    // Ein zweites Mal bescheiden geht nicht – der Statuswechsel ist endgültig.
    await expect(
      callerFor(chef).admin.user.reviewUnblockRequest({
        id: gestellt.id,
        decision: "approved",
      })
    ).rejects.toThrow(/bereits bearbeitet/);
  });

  it("weist einen Antrag ab, wenn das Konto gar nicht gesperrt ist", async () => {
    await expect(
      callerFor(anna).unblock.request({ message: "Einfach so" })
    ).rejects.toThrow(/nicht gesperrt/);
  });

  it("steht in der Auskunft und verschwindet mit dem Konto", async () => {
    await blockUser({ userId: anna.id, reason: "abuse", blockedBy: chef.id });
    const gesperrt = (await findUserByUnionId("anna-1"))!;
    await callerFor(gesperrt).unblock.request({ message: "Bitte prüfen" });

    const auskunft = await exportUserData(anna.id);
    // Wie in `api/account.integration.test.ts`: Die Abschnitte sind im Typ
    // `unknown`, weil ihre Form aus dem Schema kommt und nicht aus dem Vertrag.
    const antraege = auskunft.unblockRequests as { message: string }[];
    expect(antraege).toHaveLength(1);
    expect(antraege[0].message).toBe("Bitte prüfen");

    await callerFor(gesperrt).account.delete({ confirmation: "Anna" });

    const [{ value }] = await db()
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.unblockRequests);
    expect(value).toBe(0);
  });

  it("löst die Zuordnung, wenn der sperrende Administrator sein Konto löscht", async () => {
    await callerFor(chef).admin.user.block({
      userId: anna.id,
      reason: "abuse",
    });
    await callerFor(chef).account.delete({ confirmation: "Chefin" });

    const gesperrt = (await findUserByUnionId("anna-1"))!;
    // Die Sperre überlebt, die Zuordnung geht – wie beim Einreicher
    // angenommener Preset-Vorschläge.
    expect(gesperrt.blockedAt).not.toBeNull();
    expect(gesperrt.blockedBy).toBeNull();
  });
});

describe("Missbrauchsübersicht", () => {
  it("zählt Abweisungen, Sperren und offene Anträge", async () => {
    await db()
      .insert(schema.auditLog)
      .values([
        { event: "limit.rate_limited", detail: { bucket: "material.create" } },
        { event: "limit.rate_limited", detail: { bucket: "material.create" } },
        { event: "limit.rate_limited", detail: { bucket: "friend.search" } },
        {
          event: "limit.quota_exceeded",
          detail: { quota: "materials_per_lager" },
        },
        { event: "registration.rate_limited", detail: { reason: "ip" } },
      ]);
    await blockUser({ userId: anna.id, reason: "abuse", blockedBy: chef.id });

    const overview = await getAbuseOverview();
    expect(overview.counts.rateLimited).toBe(3);
    expect(overview.counts.quotaExceeded).toBe(1);
    expect(overview.counts.registrationBlocked).toBe(1);
    expect(overview.blockedUsers).toBe(1);

    // Nach Eimer gruppiert und nach Häufigkeit sortiert.
    expect(overview.buckets[0]).toEqual({
      bucket: "material.create",
      hits: 2,
    });
    expect(overview.quotas).toEqual([
      { bucket: "materials_per_lager", hits: 1 },
    ]);

    // Zwei Konten aus dem Testaufbau, beide heute angelegt.
    expect(overview.registrations[0].registrations).toBe(2);
  });

  it("schweigt, solange nichts abgewiesen wurde", async () => {
    const overview = await getAbuseOverview();
    expect(overview.alerts).toEqual([]);
    expect(overview.buckets).toEqual([]);
    expect(overview.quotas).toEqual([]);
  });
});
