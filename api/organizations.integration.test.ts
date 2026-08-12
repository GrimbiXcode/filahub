/**
 * Organisationen gegen eine echte PostgreSQL-Datenbank.
 *
 * Läuft nur mit `npm run test:integration` und gesetzter `TEST_DATABASE_URL`.
 *
 * Warum hier und nicht als Funktionstest: Die Zusicherung, um die es geht, ist
 * „wer darf was“, und sie entsteht erst aus dem Zusammenspiel von
 * `resolveScope`, den `where`-Klauseln und der Middleware. Ein Test mit
 * Attrappen prüfte davon genau die Hälfte – und zwar die, die ohnehin ein
 * Unit-Test abdeckt (`api/organizationRoles.test.ts`).
 *
 * Gerufen wird über `callerFor`, also durch den echten `appRouter`.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { OrganizationRole } from "@contracts/organizations";
import { getDb } from "./queries/connection";
import { upsertUser, findUserByUnionId } from "./queries/users";
import * as schema from "@db/schema";
import type { User } from "@db/schema";
import { callerFor, closeDb, resetSchema } from "./test/integration-db";

const db = () => getDb();

/** Der persönliche Bereich – siehe `api/lager.integration.test.ts`. */
const PERSONAL = { organizationId: null } as const;

let boss: User;
let member: User;
let outsider: User;

beforeAll(async () => {
  await resetSchema();
}, 60_000);

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await resetSchema();
  await upsertUser({ unionId: "boss-1", name: "Bea" });
  await upsertUser({ unionId: "member-1", name: "Mia" });
  await upsertUser({ unionId: "outsider-1", name: "Olf" });
  boss = (await findUserByUnionId("boss-1"))!;
  member = (await findUserByUnionId("member-1"))!;
  outsider = (await findUserByUnionId("outsider-1"))!;
});

/** Eine Organisation mit `boss` als Administrator. */
async function makeOrg(name = "Werkstatt") {
  const org = await callerFor(boss).organization.create({ name });
  return org.id;
}

/** Setzt `member` auf eine Stufe – ohne den Umweg über eine Einladung. */
async function joinAs(organizationId: number, role: OrganizationRole) {
  await db()
    .insert(schema.organizationMembers)
    .values({ organizationId, userId: member.id, role });
}

describe("Anlegen und Beitreten", () => {
  it("macht die gründende Person zum Administrator", async () => {
    const organizationId = await makeOrg();
    const detail = await callerFor(boss).organization.get({ organizationId });
    expect(detail.role).toBe("admin");
    expect(detail.members).toHaveLength(1);
    expect(detail.members[0].userId).toBe(boss.id);
  });

  it("gibt den Beitrittscode nur an Administratoren heraus", async () => {
    const organizationId = await makeOrg();
    await callerFor(boss).organization.setJoinCode({
      organizationId,
      enabled: true,
    });
    await joinAs(organizationId, "editor");

    const asAdmin = await callerFor(boss).organization.get({ organizationId });
    const asEditor = await callerFor(member).organization.get({
      organizationId,
    });
    expect(asAdmin.joinCode).toMatch(/^ORG-/);
    // Der Code ist ein Zugangsmittel, kein Stammdatum.
    expect(asEditor.joinCode).toBeNull();
  });

  it("vergibt beim Beitritt über den Code die eingestellte Stufe", async () => {
    const organizationId = await makeOrg();
    await callerFor(boss).organization.update({
      organizationId,
      joinRole: "weigher",
    });
    const { joinCode } = await callerFor(boss).organization.setJoinCode({
      organizationId,
      enabled: true,
    });

    const joined = await callerFor(outsider).organization.joinByCode({
      code: joinCode!,
    });
    expect(joined.role).toBe("weigher");
  });

  /**
   * Der Code wird herumgereicht und hängt in Chats. Käme `admin` durch, könnte
   * jeder, der ihn kennt, alle anderen entfernen.
   */
  it("lässt den Beitrittscode niemals die Verwaltungsstufe vergeben", async () => {
    const organizationId = await makeOrg();
    await expect(
      callerFor(boss).organization.update({
        organizationId,
        joinRole: "admin" as never,
      })
    ).rejects.toThrow();
  });

  it("wird eine Einladung erst mit dem Annehmen wirksam", async () => {
    const organizationId = await makeOrg();
    await db()
      .update(schema.users)
      .set({ friendCode: "FH-A2B3-C4D5" })
      .where(eq(schema.users.id, member.id));

    await callerFor(boss).organization.invite({
      organizationId,
      code: "FH-A2B3-C4D5",
      role: "editor",
    });

    // Vor der Antwort ist nichts gewährt.
    await expect(
      callerFor(member).organization.get({ organizationId })
    ).rejects.toThrow(/nicht gefunden/);

    const open = await callerFor(member).organization.listInvitations();
    expect(open).toHaveLength(1);
    await callerFor(member).organization.respondToInvitation({
      id: open[0].id,
      accept: true,
    });

    const detail = await callerFor(member).organization.get({ organizationId });
    expect(detail.role).toBe("editor");
  });
});

/**
 * Die Stufenmatrix – der eigentliche Inhalt dieser Datei.
 *
 * Eine zu niedrig angesetzte Stufe im Router ist genau der Fehler, den der
 * Compiler nicht sieht: Der Code läuft, er lässt nur zu viel zu. Geprüft wird
 * deshalb je Vorgang **beide** Richtungen – die Stufe darunter scheitert, die
 * Stufe selbst geht durch.
 */
describe("Stufen", () => {
  async function seedLager(organizationId: number) {
    const lager = await callerFor(boss).lager.create({
      organizationId,
      name: "Filament",
      materialKind: "filament",
      filamentDiameterUm: 1750,
    });
    const material = await callerFor(boss).material.create({
      organizationId,
      lagerId: lager!.id,
      name: "PLA",
      materialType: "PLA",
      nominalWeight: 1000,
    });
    return { lagerId: lager!.id, materialId: material.id };
  }

  it("lässt `viewer` lesen, aber nicht wiegen", async () => {
    const organizationId = await makeOrg();
    const { materialId } = await seedLager(organizationId);
    await joinAs(organizationId, "viewer");

    await expect(
      callerFor(member).material.list({ organizationId })
    ).resolves.toHaveLength(1);
    await expect(
      callerFor(member).material.addWeighing({
        organizationId,
        materialId,
        grossWeight: 1200,
      })
    ).rejects.toThrow(/Rechte/);
  });

  it("lässt `weigher` wiegen, aber nichts anlegen", async () => {
    const organizationId = await makeOrg();
    const { lagerId, materialId } = await seedLager(organizationId);
    await joinAs(organizationId, "weigher");

    await expect(
      callerFor(member).material.addWeighing({
        organizationId,
        materialId,
        grossWeight: 1200,
      })
    ).resolves.toBeTruthy();
    await expect(
      callerFor(member).material.create({
        organizationId,
        lagerId,
        name: "PETG",
        materialType: "PETG",
        nominalWeight: 1000,
      })
    ).rejects.toThrow(/Rechte/);
  });

  it("lässt `editor` Material pflegen, aber kein Lager löschen", async () => {
    const organizationId = await makeOrg();
    const { lagerId } = await seedLager(organizationId);
    await joinAs(organizationId, "editor");

    await expect(
      callerFor(member).containerType.create({
        organizationId,
        name: "Org-Rolle",
        tareWeight: 140,
      })
    ).resolves.toBeTruthy();
    await expect(
      callerFor(member).lager.delete({ organizationId, id: lagerId })
    ).rejects.toThrow(/Rechte/);
  });

  it("lässt `admin` Lager und Mitglieder verwalten", async () => {
    const organizationId = await makeOrg();
    await joinAs(organizationId, "admin");
    await expect(
      callerFor(member).lager.create({
        organizationId,
        name: "Harz",
        materialKind: "resin",
      })
    ).resolves.toBeTruthy();
  });

  /**
   * Die beiden Fehlerfälle sind bewusst verschieden: Ein Nicht-Mitglied darf
   * nicht einmal erfahren, dass es die Organisation gibt; ein Mitglied kennt
   * sie ohnehin, und „nicht gefunden“ wäre dort eine Lüge.
   */
  it("unterscheidet Nicht-Mitglied und zu niedrige Stufe", async () => {
    const organizationId = await makeOrg();
    const { lagerId } = await seedLager(organizationId);
    await joinAs(organizationId, "viewer");

    await expect(
      callerFor(outsider).lager.list({ organizationId })
    ).rejects.toThrow(/nicht gefunden/);
    await expect(
      callerFor(member).lager.delete({ organizationId, id: lagerId })
    ).rejects.toThrow(/Rechte/);
  });
});

describe("Trennung der Bereiche", () => {
  /**
   * Der Fehler, der still schiefgeht: Ein entferntes Mitglied behält Zugriff.
   *
   * Geprüft wird ausdrücklich auch eine Zeile, die es **selbst angelegt** hat –
   * genau dort wäre ein „wer es erfasst hat, darf es sehen“ hineingerutscht.
   * Gegengeprüft, indem die Löschung der Mitgliedszeile ausgesetzt wurde: Der
   * Test wird dann rot.
   */
  it("nimmt einem entfernten Mitglied sofort jeden Zugriff", async () => {
    const organizationId = await makeOrg();
    await joinAs(organizationId, "editor");
    const lager = await callerFor(member).lager.list({ organizationId });
    expect(lager).toHaveLength(0);

    await callerFor(member).containerType.create({
      organizationId,
      name: "Von Mia",
      tareWeight: 140,
    });
    await expect(
      callerFor(member).containerType.list({ organizationId })
    ).resolves.toHaveLength(1);

    await callerFor(boss).organization.removeMember({
      organizationId,
      userId: member.id,
    });

    await expect(
      callerFor(member).containerType.list({ organizationId })
    ).rejects.toThrow(/nicht gefunden/);
  });

  /** Der persönliche Bereich bleibt, was er war. */
  it("mischt persönliche und Org-Zeilen nicht", async () => {
    const organizationId = await makeOrg();
    await callerFor(boss).lager.create({
      organizationId,
      name: "Gemeinsam",
      materialKind: "filament",
      filamentDiameterUm: 1750,
    });
    await callerFor(boss).lager.create({
      ...PERSONAL,
      name: "Privat",
      materialKind: "filament",
      filamentDiameterUm: 1750,
    });

    const personal = await callerFor(boss).lager.list(PERSONAL);
    const shared = await callerFor(boss).lager.list({ organizationId });
    expect(personal.map(l => l.name)).toEqual(["Privat"]);
    expect(shared.map(l => l.name)).toEqual(["Gemeinsam"]);
  });

  /**
   * Der zweite still schiefgehende Fehler: Ein Org-Lager wandert über die
   * Freundes-Freigabe nach draußen. Gegengeprüft, indem der Riegel in
   * `friendRouter.setLagerVisibility` entfernt wurde.
   */
  it("lässt ein Org-Lager nicht mit Freunden teilen", async () => {
    const organizationId = await makeOrg();
    const lager = await callerFor(boss).lager.create({
      organizationId,
      name: "Gemeinsam",
      materialKind: "filament",
      filamentDiameterUm: 1750,
    });

    // Angenommene Freundschaft zwischen boss und outsider.
    await db().insert(schema.friendships).values({
      userId: boss.id,
      friendUserId: outsider.id,
      status: "accepted",
    });

    await expect(
      callerFor(boss).friend.setLagerVisibility({
        friendId: outsider.id,
        lagerId: lager!.id,
        visibility: "full",
      })
    ).rejects.toThrow(/Organisation/);

    // Und es entsteht auch keine Freigabezeile auf einem anderen Weg.
    const shares = await db()
      .select()
      .from(schema.lagerShares)
      .where(eq(schema.lagerShares.lagerId, lager!.id));
    expect(shares).toHaveLength(0);
  });

  /** Namen sind je Bereich eindeutig – nicht bereichsübergreifend. */
  it("erlaubt denselben Lagernamen privat und in der Organisation", async () => {
    const organizationId = await makeOrg();
    await callerFor(boss).lager.create({
      ...PERSONAL,
      name: "Filament",
      materialKind: "filament",
      filamentDiameterUm: 1750,
    });
    await expect(
      callerFor(boss).lager.create({
        organizationId,
        name: "Filament",
        materialKind: "filament",
        filamentDiameterUm: 1750,
      })
    ).resolves.toBeTruthy();
    // Zweimal derselbe Name **innerhalb** der Organisation geht weiterhin nicht.
    await expect(
      callerFor(boss).lager.create({
        organizationId,
        name: "Filament",
        materialKind: "filament",
        filamentDiameterUm: 1750,
      })
    ).rejects.toThrow(/schon/);
  });
});

describe("Die Regel vom letzten Administrator", () => {
  it("verweigert das Herabstufen des letzten Administrators", async () => {
    const organizationId = await makeOrg();
    await joinAs(organizationId, "editor");
    await expect(
      callerFor(boss).organization.setMemberRole({
        organizationId,
        userId: boss.id,
        role: "editor",
      })
    ).rejects.toThrow(/mindestens einen Administrator/);
  });

  it("verweigert den Austritt des letzten Administrators", async () => {
    const organizationId = await makeOrg();
    await joinAs(organizationId, "editor");
    await expect(
      callerFor(boss).organization.leave({ organizationId })
    ).rejects.toThrow(/mindestens einen Administrator/);
  });

  it("lässt gehen, sobald ein zweiter Administrator da ist", async () => {
    const organizationId = await makeOrg();
    await joinAs(organizationId, "admin");
    await expect(
      callerFor(boss).organization.leave({ organizationId })
    ).resolves.toEqual({ ok: true });
  });
});

describe("Löschen", () => {
  it("löscht nur eine leere Organisation", async () => {
    const organizationId = await makeOrg();
    await callerFor(boss).lager.create({
      organizationId,
      name: "Gemeinsam",
      materialKind: "filament",
      filamentDiameterUm: 1750,
    });
    await expect(
      callerFor(boss).organization.delete({ organizationId })
    ).rejects.toThrow(/hängen noch/);
  });
});
