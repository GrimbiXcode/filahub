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
import {
  WEIGHING_CORRECTION_MINUTES,
  type OrganizationRole,
} from "@contracts/organizations";
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

  it("findet den Freundescode auch ohne Bindestriche", async () => {
    const organizationId = await makeOrg();
    await db()
      .update(schema.users)
      .set({ friendCode: "FH-A2B3-C4D5" })
      .where(eq(schema.users.id, member.id));

    // Genau das, was jemand aus einem Chat kopiert und von Hand eintippt.
    await expect(
      callerFor(boss).organization.invite({
        organizationId,
        code: "fh a2b3c4d5",
        role: "viewer",
      })
    ).resolves.toMatchObject({ name: "Mia" });
  });

  it("lädt kein bestehendes Mitglied noch einmal ein", async () => {
    const organizationId = await makeOrg();
    await joinAs(organizationId, "viewer");
    await db()
      .update(schema.users)
      .set({ friendCode: "FH-A2B3-C4D5" })
      .where(eq(schema.users.id, member.id));

    await expect(
      callerFor(boss).organization.invite({
        organizationId,
        code: "FH-A2B3-C4D5",
        role: "editor",
      })
    ).rejects.toThrow(/bereits Mitglied/);
  });

  /**
   * Die Einladung überlebt die Vollmacht nicht.
   *
   * Ohne diesen Riegel behielte ein entfernter Administrator über eine offene
   * `admin`-Einladung Einfluss auf die Organisation – und die verbliebenen
   * Administratoren sähen es nicht kommen.
   */
  it("verwirft eine Einladung, deren Urheber nicht mehr verwaltet", async () => {
    const organizationId = await makeOrg();
    await joinAs(organizationId, "admin");
    await db()
      .update(schema.users)
      .set({ friendCode: "FH-A2B3-C4D5" })
      .where(eq(schema.users.id, outsider.id));

    await callerFor(boss).organization.invite({
      organizationId,
      code: "FH-A2B3-C4D5",
      role: "admin",
    });
    // Der Einladende verliert die Verwaltungsstufe, bevor geantwortet wird.
    await callerFor(member).organization.setMemberRole({
      organizationId,
      userId: boss.id,
      role: "viewer",
    });

    const open = await callerFor(outsider).organization.listInvitations();
    await expect(
      callerFor(outsider).organization.respondToInvitation({
        id: open[0].id,
        accept: true,
      })
    ).rejects.toThrow(/gilt nicht mehr/);
    await expect(
      callerFor(outsider).organization.get({ organizationId })
    ).rejects.toThrow(/nicht gefunden/);
  });

  it("lässt eine offene Einladung zurückziehen", async () => {
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

    const detail = await callerFor(boss).organization.get({ organizationId });
    expect(detail.invitations).toHaveLength(1);
    await callerFor(boss).organization.revokeInvitation({
      organizationId,
      id: detail.invitations[0].id,
    });

    expect(await callerFor(member).organization.listInvitations()).toHaveLength(
      0
    );
    // Und der Platz ist für eine neue Einladung wieder frei.
    await expect(
      callerFor(boss).organization.invite({
        organizationId,
        code: "FH-A2B3-C4D5",
        role: "viewer",
      })
    ).resolves.toBeTruthy();
  });

  /**
   * Scheitert das Aufnehmen, bleibt die Einladung offen.
   *
   * Bis 2.5.0 liefen Beantworten und Aufnehmen in getrennten Transaktionen: Die
   * Einladung stand danach auf `accepted`, ohne dass jemand beigetreten wäre –
   * verbraucht, und wegen des partiellen Unique-Index auf `pending` nicht
   * einmal neu auszustellen.
   */
  it("verbraucht eine Einladung nicht, wenn das Aufnehmen scheitert", async () => {
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
    // Inzwischen über den offenen Code beigetreten – das Aufnehmen muss scheitern.
    await joinAs(organizationId, "viewer");

    const open = await callerFor(member).organization.listInvitations();
    await expect(
      callerFor(member).organization.respondToInvitation({
        id: open[0].id,
        accept: true,
      })
    ).rejects.toThrow(/bereits Mitglied/);

    // Die Einladung steht noch offen, und die alte Stufe ist unverändert.
    expect(await callerFor(member).organization.listInvitations()).toHaveLength(
      1
    );
    const detail = await callerFor(member).organization.get({ organizationId });
    expect(detail.role).toBe("viewer");
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
    await expect(
      callerFor(member).organization.setMemberRole({
        organizationId,
        userId: boss.id,
        role: "editor",
      })
    ).resolves.toEqual({ ok: true });
  });

  /**
   * Die Gegenrichtung für **jede** Verwaltungsprozedur, einzeln.
   *
   * Der Grund für die Ausführlichkeit: Ohne sie bliebe die Suite grün, wenn
   * jemand aus einer dieser Prozeduren die Zeile `resolveScope(…, "admin")`
   * entfernt – und ein `editor` könnte anschließend den Administrator
   * entfernen und die Organisation übernehmen. Die Stufenprüfung steht im
   * Router und nicht im SQL; der Compiler sieht davon nichts, und die
   * Abfragetests sehen es auch nicht. Bleibt dieser Test.
   *
   * Geprüft wird mit `editor` – der höchsten Stufe, die es **nicht** darf. Wer
   * hier scheitert, scheitert erst recht als `viewer`.
   */
  it("verwehrt `editor` jeden Verwaltungsvorgang", async () => {
    const organizationId = await makeOrg();
    await joinAs(organizationId, "editor");
    const asMember = callerFor(member);

    await expect(
      asMember.organization.update({ organizationId, name: "Umbenannt" })
    ).rejects.toThrow(/Rechte/);
    await expect(
      asMember.organization.delete({ organizationId })
    ).rejects.toThrow(/Rechte/);
    await expect(
      asMember.organization.setJoinCode({ organizationId, enabled: true })
    ).rejects.toThrow(/Rechte/);
    await expect(
      asMember.organization.invite({
        organizationId,
        telegramUsername: "olf",
        role: "viewer",
      })
    ).rejects.toThrow(/Rechte/);
    await expect(
      asMember.organization.setMemberRole({
        organizationId,
        userId: boss.id,
        role: "viewer",
      })
    ).rejects.toThrow(/Rechte/);
    await expect(
      asMember.organization.removeMember({ organizationId, userId: boss.id })
    ).rejects.toThrow(/Rechte/);
    await expect(
      asMember.organization.revokeInvitation({ organizationId, id: 1 })
    ).rejects.toThrow(/Rechte/);

    // Und nichts davon hat gewirkt.
    const detail = await callerFor(boss).organization.get({ organizationId });
    expect(detail.name).toBe("Werkstatt");
    expect(detail.joinCode).toBeNull();
    expect(detail.members).toHaveLength(2);
    expect(detail.members.find(m => m.userId === boss.id)?.role).toBe("admin");
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

  /**
   * Derselbe Riegel darf kein Orakel sein.
   *
   * Die erklärende Meldung bekommt nur, wer die Organisation ohnehin kennt. Wer
   * fremde IDs durchprobiert, unterschiede sonst an der Antwort „gibt es nicht“
   * von „gehört einer Organisation“ – und erführe aus einer Prozedur, die nur
   * den eigenen Bestand betrifft, etwas über fremden.
   */
  it("verrät einem Nicht-Mitglied nicht, dass es das Org-Lager gibt", async () => {
    const organizationId = await makeOrg();
    const lager = await callerFor(boss).lager.create({
      organizationId,
      name: "Filament",
      materialKind: "filament",
      filamentDiameterUm: 1750,
    });
    await db().insert(schema.friendships).values({
      userId: outsider.id,
      friendUserId: member.id,
      status: "accepted",
    });

    await expect(
      callerFor(outsider).friend.setLagerVisibility({
        friendId: member.id,
        lagerId: lager!.id,
        visibility: "full",
      })
    ).rejects.toThrow(/nicht gefunden/);
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

/**
 * Korrigieren, nicht aufräumen.
 *
 * `weigher` ist die Stufe, die man freigebig vergibt – und sie erlaubte bis
 * 2.5.0, jede Wägung jedes Materials zu löschen. In Schleife war damit die
 * gesamte Wägungsgeschichte weg: unwiderruflich, und ohne Spur, weil Wiegen
 * bewusst nicht protokolliert wird.
 *
 * Geprüft wird hier durch die echte Middleware, weil die Regel aus zwei Teilen
 * besteht, die getrennt liegen: die Stufe aus `resolveScope` und die Bedingung
 * aus `mayDeleteWeighing`. Der Funktionstest daneben
 * (`api/weighingCorrection.test.ts`) prüft die Bedingung allein.
 */
describe("Wägungen korrigieren", () => {
  /** Ein Org-Material mit einer Wägung; gibt beide IDs zurück. */
  async function seedWeighing(organizationId: number) {
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
    const weighing = await callerFor(boss).material.addWeighing({
      organizationId,
      materialId: material.id,
      grossWeight: 1200,
    });
    return { materialId: material.id, weighingId: weighing!.id };
  }

  /** Schiebt `createdAt` zurück – der einzige Weg, „alt" zu erzeugen. */
  async function backdate(weighingId: number, minutes: number) {
    await db()
      .update(schema.weighings)
      .set({ createdAt: new Date(Date.now() - minutes * 60_000) })
      .where(eq(schema.weighings.id, weighingId));
  }

  it("lässt `weigher` die eben erfasste Wägung löschen", async () => {
    const organizationId = await makeOrg();
    const { weighingId } = await seedWeighing(organizationId);
    await joinAs(organizationId, "weigher");

    await expect(
      callerFor(member).material.deleteWeighing({
        organizationId,
        id: weighingId,
      })
    ).resolves.toBeTruthy();
  });

  it("verwehrt `weigher` eine Wägung außerhalb des Fensters", async () => {
    const organizationId = await makeOrg();
    const { weighingId } = await seedWeighing(organizationId);
    await backdate(weighingId, WEIGHING_CORRECTION_MINUTES + 5);
    await joinAs(organizationId, "weigher");

    await expect(
      callerFor(member).material.deleteWeighing({
        organizationId,
        id: weighingId,
      })
    ).rejects.toThrow(/älter als/);

    // Und sie steht noch.
    const detail = await callerFor(member).material.byId({
      organizationId,
      id: (await callerFor(member).material.list({ organizationId }))[0].id,
    });
    expect(detail!.weighings).toHaveLength(1);
  });

  /*
    Der Fall, der die Schleife schließt: Wer die letzte löschte, machte die
    vorletzte zur letzten. Sie ist dann aber alt – und zusätzlich greift diese
    Bedingung schon vorher.
  */
  it("verwehrt `weigher` eine Wägung mitten aus dem Verlauf", async () => {
    const organizationId = await makeOrg();
    const { materialId, weighingId: erste } =
      await seedWeighing(organizationId);
    await callerFor(boss).material.addWeighing({
      organizationId,
      materialId,
      grossWeight: 1100,
    });
    await joinAs(organizationId, "weigher");

    // Beide frisch – abgelehnt wird allein, weil `erste` nicht die letzte ist.
    await expect(
      callerFor(member).material.deleteWeighing({ organizationId, id: erste })
    ).rejects.toThrow(/zuletzt erfasste/);
  });

  it("lässt `editor` auch alte Wägungen löschen", async () => {
    const organizationId = await makeOrg();
    const { weighingId } = await seedWeighing(organizationId);
    await backdate(weighingId, 60 * 24);
    await joinAs(organizationId, "editor");

    await expect(
      callerFor(member).material.deleteWeighing({
        organizationId,
        id: weighingId,
      })
    ).resolves.toBeTruthy();
  });

  /*
    Im eigenen Bestand gilt man als `admin` (`scopeRole`). Die Regel darf dort
    nicht greifen – sonst nähme dieses Feature persönlichen Konten etwas weg,
    das sie seit jeher haben.
  */
  it("lässt den persönlichen Bereich unberührt", async () => {
    const lager = await callerFor(boss).lager.create({
      ...PERSONAL,
      name: "Privat",
      materialKind: "filament",
      filamentDiameterUm: 1750,
    });
    const material = await callerFor(boss).material.create({
      ...PERSONAL,
      lagerId: lager!.id,
      name: "PETG",
      materialType: "PETG",
      nominalWeight: 1000,
    });
    const weighing = await callerFor(boss).material.addWeighing({
      ...PERSONAL,
      materialId: material.id,
      grossWeight: 1200,
    });
    await backdate(weighing!.id, 60 * 24);

    await expect(
      callerFor(boss).material.deleteWeighing({ ...PERSONAL, id: weighing!.id })
    ).resolves.toBeTruthy();
  });

  /*
    Ein `viewer` scheitert weiterhin an der Stufe und nicht an der
    Korrekturregel – die Meldung muss die von `resolveScope` sein.
  */
  it("weist `viewer` schon an der Stufe ab", async () => {
    const organizationId = await makeOrg();
    const { weighingId } = await seedWeighing(organizationId);
    await joinAs(organizationId, "viewer");

    await expect(
      callerFor(member).material.deleteWeighing({
        organizationId,
        id: weighingId,
      })
    ).rejects.toThrow(/Rechte/);
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

  /**
   * „Leer“ heißt: **kein** Bestand, nicht bloß kein Lager.
   *
   * Bis 2.5.0 zählte die Prüfung allein die Lager – und `deleteOrganizationCascade`
   * riss danach Gebindearten und Dryboxen mit, die niemand gesehen hatte. Eine
   * Werkstatt, die ihre Tara-Werte gepflegt, aber noch kein Lager angelegt hat,
   * verlöre sie ohne Rückfrage.
   */
  it("zählt auch Gebindearten und Dryboxen als Bestand", async () => {
    const organizationId = await makeOrg();
    const created = await callerFor(boss).containerType.create({
      organizationId,
      name: "Org-Rolle",
      tareWeight: 140,
    });
    await expect(
      callerFor(boss).organization.delete({ organizationId })
    ).rejects.toThrow(/hängen noch/);

    await callerFor(boss).containerType.delete({
      organizationId,
      id: created!.id,
    });
    await callerFor(boss).storageBox.create({
      organizationId,
      name: "Drybox",
      tareWeight: 500,
    });
    await expect(
      callerFor(boss).organization.delete({ organizationId })
    ).rejects.toThrow(/hängen noch/);
  });
});
