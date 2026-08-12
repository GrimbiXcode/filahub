/**
 * Betroffenenrechte gegen eine echte PostgreSQL-Datenbank.
 *
 * Läuft nur mit `npm run test:integration` und gesetzter `TEST_DATABASE_URL`.
 *
 * Warum ausgerechnet hier Integrationstests und keine Funktionstests: Das
 * Schema kennt **keine** Fremdschlüssel. Es gibt also nichts, was verwaiste
 * Zeilen verhindert – dieser Test *ist* die referenzielle Integrität. Ein
 * Funktionstest mit Attrappen würde genau die Klasse von Fehlern durchlassen,
 * um die es geht.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ACCOUNT_EXPORT_SECTIONS } from "@contracts/account";
import { getDb } from "./queries/connection";
import { deleteUserAccount, exportUserData } from "./queries/account";
import { upsertUser, findUserByUnionId } from "./queries/users";
import { createProposal, closeProposal } from "./queries/presets";
import * as schema from "@db/schema";
import type { User } from "@db/schema";
import { closeDb, resetSchema } from "./test/integration-db";

const db = () => getDb();

/**
 * `createProposal` liefert `| undefined`, weil es nach dem Einfügen erneut
 * liest. Im Test ist das Ausbleiben ein Fehlschlag, kein Fall zum Behandeln.
 */
async function makeProposal(
  ...args: Parameters<typeof createProposal>
): Promise<NonNullable<Awaited<ReturnType<typeof createProposal>>>> {
  const proposal = await createProposal(...args);
  if (!proposal) throw new Error("Vorschlag wurde nicht angelegt");
  return proposal;
}

let owner: User;
let stranger: User;

beforeAll(async () => {
  await resetSchema();
}, 60_000);

afterAll(async () => {
  await closeDb();
});

/**
 * Legt für jeden Test zwei Konten mit vollem Bestand an. `stranger` dient
 * durchgehend als Kontrollgruppe: Was ihm gehört, darf eine fremde Löschung
 * nicht berühren.
 */
beforeEach(async () => {
  await resetSchema();

  await upsertUser({ unionId: "owner-1", name: "Besitzerin" });
  await upsertUser({ unionId: "stranger-1", name: "Fremde" });
  owner = (await findUserByUnionId("owner-1"))!;
  stranger = (await findUserByUnionId("stranger-1"))!;

  for (const user of [owner, stranger]) {
    const [lager] = await db()
      .insert(schema.lager)
      .values({
        userId: user.id,
        name: "Mein Lager",
        materialKind: "filament",
        filamentDiameterUm: 1750,
      })
      .returning();
    const [containerType] = await db()
      .insert(schema.containerTypes)
      .values({ userId: user.id, name: "Kartonrolle", tareWeight: 140 })
      .returning();
    const [box] = await db()
      .insert(schema.storageBoxes)
      .values({ userId: user.id, name: "Drybox", tareWeight: 1200 })
      .returning();
    const [material] = await db()
      .insert(schema.materials)
      .values({
        userId: user.id,
        lagerId: lager.id,
        name: "PLA schwarz",
        materialType: "PLA",
        nominalWeight: 1000,
        containerTypeId: containerType.id,
        storageBoxId: box.id,
        notes: "Freitext mit Personenbezug",
      })
      .returning();
    await db()
      .insert(schema.weighings)
      .values({ materialId: material.id, grossWeight: 1340 });
    await db()
      .insert(schema.hiddenContainerPresets)
      .values({ userId: user.id, scope: "manufacturer", refId: 1 });
    await db()
      .insert(schema.loginCodes)
      .values({
        code: "000123",
        telegramId: user.unionId,
        telegramName: user.name,
        expiresAt: new Date(Date.now() + 60_000),
      });
  }
});

describe("Datenexport (Art. 15/20 DSGVO)", () => {
  it("enthält jeden im Vertrag benannten Abschnitt", async () => {
    const dump = await exportUserData(owner.id);
    for (const section of ACCOUNT_EXPORT_SECTIONS) {
      expect(dump, `Abschnitt „${section}“ fehlt im Export`).toHaveProperty(
        section
      );
    }
  });

  /**
   * Der eigentliche Wächter: Wer eine Tabelle mit `userId` ergänzt und den
   * Export vergisst, liefert eine unvollständige Auskunft nach Art. 15 aus –
   * und merkt es ohne diesen Test nicht.
   *
   * Gefragt wird die Datenbank selbst, nicht das TypeScript-Schema: Sie ist
   * die Wahrheit darüber, wo Personenbezug tatsächlich liegt.
   */
  it("deckt alle Tabellen mit Personenbezug ab", async () => {
    /*
      `ILIKE '%userid%'` und nicht `= 'userId'`: Sonst müsste jede
      personenbezogene Spalte genau so heißen, und eine Tabelle, die ihre
      Empfänger-Spalte ehrlich `sharedWithUserId` nennt, rutschte durch – der
      Wächter wäre eine Benennungsvorschrift statt einer Prüfung.

      `DISTINCT`, weil eine Tabelle mit zwei Personenspalten sonst zweimal
      erschiene.
    */
    const result = await db().execute<{ table_name: string }>(sql`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE table_schema = current_schema() AND column_name ILIKE '%userid%'
      ORDER BY table_name
    `);
    const withUserId = result.rows.map(r => r.table_name);

    // Alphabetisch, wie die Abfrage sortiert.
    expect(withUserId).toEqual([
      "audit_log",
      "container_types",
      "friendships",
      "hidden_container_presets",
      "lager",
      "lager_shares",
      "loan_requests",
      "materials",
      /*
        Seit 2.5.0. `organizations` selbst steht bewusst **nicht** dabei: Die
        Tabelle hat keine Personenspalte, weil dort kein Eigentümer vermerkt
        ist – wer verwaltet, steht in `organization_members.role`.
        `organization_invitations` kommt über gleich zwei Spalten herein
        (`invitedUserId`, `invitedByUserId`); genau dafür ist das Prädikat
        aufgeweitet.
      */
      "organization_invitations",
      "organization_members",
      "preset_proposals",
      "storage_boxes",
    ]);

    /*
      Diese zwölf plus drei, die den Personenbezug über eine andere Spalte
      führen: `profile` (users.id), `weighings` (über das Material) und
      `loginCodes` (Telegram-ID). Ändert sich die linke Seite, muss die rechte
      nachziehen.

      Vier waren es bis 2.3.0 – `audit_log` gehörte dazu, weil seine Spalten
      `actorUserId`/`subjectUserId` am engen Namensvergleich vorbeikamen. Mit dem
      aufgeweiteten Prädikat findet die Abfrage sie selbst, und die
      handgepflegte Ausnahmeliste ist um einen Eintrag kürzer. Genau das ist der
      Sinn der Aufweitung: Was der Wächter selbst sieht, muss niemand pflegen.
    */
    expect([...ACCOUNT_EXPORT_SECTIONS].sort()).toEqual(
      [
        "auditLog",
        "friendships",
        "hiddenContainerPresets",
        "lager",
        "lagerShares",
        "loanRequests",
        "loginCodes",
        "materials",
        "organizationMemberships",
        "organizationInvitations",
        "presetProposals",
        "profile",
        "containerTypes",
        "storageBoxes",
        "weighings",
      ].sort()
    );
  });

  it("gibt ausschließlich eigene Daten heraus", async () => {
    const dump = await exportUserData(owner.id);
    const materials = dump.materials as { userId: number }[];
    expect(materials).toHaveLength(1);
    expect(materials.every(m => m.userId === owner.id)).toBe(true);

    const weighings = dump.weighings as unknown[];
    expect(weighings).toHaveLength(1);

    const codes = dump.loginCodes as { telegramId: string }[];
    expect(codes.every(c => c.telegramId === owner.unionId)).toBe(true);
  });

  it("kommt ohne eigene Rollen aus", async () => {
    await db().delete(schema.weighings);
    await db()
      .delete(schema.materials)
      .where(eq(schema.materials.userId, owner.id));

    // Regression: eine leere ID-Liste würde als `in ()` enden und Postgres
    // ließe die Abfrage scheitern.
    const dump = await exportUserData(owner.id);
    expect(dump.weighings).toEqual([]);
  });
});

describe("Kontolöschung (Art. 17 DSGVO)", () => {
  it("entfernt den gesamten eigenen Bestand", async () => {
    await deleteUserAccount(owner.id);

    const remaining = await Promise.all([
      db().query.materials.findMany({
        where: eq(schema.materials.userId, owner.id),
      }),
      db().query.containerTypes.findMany({
        where: eq(schema.containerTypes.userId, owner.id),
      }),
      db().query.storageBoxes.findMany({
        where: eq(schema.storageBoxes.userId, owner.id),
      }),
      db().query.hiddenContainerPresets.findMany({
        where: eq(schema.hiddenContainerPresets.userId, owner.id),
      }),
      db().query.loginCodes.findMany({
        where: eq(schema.loginCodes.telegramId, owner.unionId),
      }),
      db().query.users.findMany({ where: eq(schema.users.id, owner.id) }),
    ]);

    for (const rows of remaining) {
      expect(rows).toHaveLength(0);
    }
  });

  it("lässt keine verwaisten Wägungen zurück", async () => {
    await deleteUserAccount(owner.id);

    /*
      Ohne Fremdschlüssel wäre eine übrig gebliebene Wägung stumm: Sie zeigte
      auf eine `materialId`, die die Sequenz später neu vergibt – und die
      Wägung tauchte plötzlich bei einer fremden Rolle auf.
    */
    const all = await db().query.weighings.findMany();
    const materialIds = (await db().query.materials.findMany()).map(m => m.id);
    for (const weighing of all) {
      expect(materialIds).toContain(weighing.materialId);
    }
  });

  it("rührt die Daten anderer Konten nicht an", async () => {
    await deleteUserAccount(owner.id);

    const theirs = await db().query.materials.findMany({
      where: eq(schema.materials.userId, stranger.id),
    });
    expect(theirs).toHaveLength(1);

    const theirCodes = await db().query.loginCodes.findMany({
      where: eq(schema.loginCodes.telegramId, stranger.unionId),
    });
    expect(theirCodes).toHaveLength(1);
  });

  it("anonymisiert angenommene Vorschläge, statt sie zu löschen", async () => {
    const proposal = await makeProposal({
      userId: owner.id,
      kind: "new",
      targetType: "manufacturer",
      payload: { name: "Testhersteller", slug: "testhersteller" },
      comment: "Begründung mit Personenbezug",
    });
    await closeProposal(proposal.id, {
      status: "approved",
      reviewedBy: stranger.id,
      resultId: 4242,
    });

    const result = await deleteUserAccount(owner.id);
    expect(result.anonymizedProposals).toBe(1);

    const kept = await db().query.presetProposals.findFirst({
      where: eq(schema.presetProposals.id, proposal.id),
    });
    expect(kept).toBeDefined();
    expect(kept!.userId).toBeNull();
    expect(kept!.comment).toBeNull();
    // Der Katalogbezug bleibt – er ist globales Gemeingut ohne Personenbezug.
    expect(kept!.resultId).toBe(4242);
    expect(kept!.status).toBe("approved");
  });

  it("löscht offene und abgelehnte Vorschläge ganz", async () => {
    const open = await makeProposal({
      userId: owner.id,
      kind: "new",
      targetType: "manufacturer",
      payload: { name: "Offen", slug: "offen" },
    });
    const rejected = await makeProposal({
      userId: owner.id,
      kind: "new",
      targetType: "manufacturer",
      payload: { name: "Abgelehnt", slug: "abgelehnt" },
    });
    await closeProposal(rejected.id, {
      status: "rejected",
      reviewedBy: stranger.id,
    });

    await deleteUserAccount(owner.id);

    const rows = await db().query.presetProposals.findMany();
    const ids = rows.map(r => r.id);
    expect(ids).not.toContain(open.id);
    expect(ids).not.toContain(rejected.id);
  });

  it("streicht den Namen des Moderators aus fremden Vorschlägen", async () => {
    const proposal = await makeProposal({
      userId: stranger.id,
      kind: "new",
      targetType: "manufacturer",
      payload: { name: "Fremd", slug: "fremd" },
    });
    // Diesmal moderiert `owner` – und löscht danach sein Konto.
    await closeProposal(proposal.id, {
      status: "approved",
      reviewedBy: owner.id,
      resultId: 7,
    });

    await deleteUserAccount(owner.id);

    const kept = await db().query.presetProposals.findFirst({
      where: eq(schema.presetProposals.id, proposal.id),
    });
    expect(kept!.reviewedBy).toBeNull();
    // Der Vorschlag selbst gehört jemand anderem und bleibt vollständig.
    expect(kept!.userId).toBe(stranger.id);
  });

  it("löst Verweise auf eigene Rollentypen, bevor diese verschwinden", async () => {
    const containerType = await db().query.containerTypes.findFirst({
      where: eq(schema.containerTypes.userId, owner.id),
    });
    const proposal = await makeProposal({
      userId: owner.id,
      kind: "new",
      targetType: "variant",
      payload: { name: "Aus Rollentyp", slug: "aus-rollentyp" },
      sourceContainerTypeId: containerType!.id,
    });
    await closeProposal(proposal.id, {
      status: "approved",
      reviewedBy: stranger.id,
      resultId: 9,
    });

    await deleteUserAccount(owner.id);

    const kept = await db().query.presetProposals.findFirst({
      where: eq(schema.presetProposals.id, proposal.id),
    });
    // Hinge hier noch die alte ID, zeigte sie nach der nächsten Vergabe aus
    // derselben Sequenz auf einen fremden Rollentyp.
    expect(kept!.sourceContainerTypeId).toBeNull();
  });

  it("ist in sich abgeschlossen – ein zweiter Lauf schlägt fehl", async () => {
    await deleteUserAccount(owner.id);
    await expect(deleteUserAccount(owner.id)).rejects.toThrow();
  });

  it("anonymisiert das Sicherheitsprotokoll, statt es zu löschen", async () => {
    /*
      Würde das Protokoll mitgelöscht, wäre die Vorfallaufklärung mit einem
      Klick auszuhebeln: Wer sich unbefugt Zugang verschafft hat, löscht das
      Konto und damit die eigenen Spuren.
    */
    await db()
      .insert(schema.auditLog)
      .values([
        {
          event: "login.success",
          actorUserId: owner.id,
          telegramId: owner.unionId,
          ipHash: "a".repeat(64),
        },
        {
          event: "proposal.approved",
          actorUserId: stranger.id,
          subjectUserId: owner.id,
        },
      ]);

    await deleteUserAccount(owner.id);

    const entries = await db().query.auditLog.findMany();
    expect(entries).toHaveLength(2);

    const own = entries.find(e => e.event === "login.success")!;
    expect(own.actorUserId).toBeNull();
    expect(own.telegramId).toBeNull();
    // Ablauf und Adressfingerabdruck bleiben – ohne sie wäre nichts gewonnen.
    expect(own.ipHash).toBe("a".repeat(64));
    expect(own.at).toBeInstanceOf(Date);

    const foreign = entries.find(e => e.event === "proposal.approved")!;
    expect(foreign.subjectUserId).toBeNull();
    // Der fremde Handelnde bleibt unangetastet.
    expect(foreign.actorUserId).toBe(stranger.id);
  });

  it("hinterlässt keine offenen Login-Codes", async () => {
    await deleteUserAccount(owner.id);
    const open = await db().query.loginCodes.findMany({
      where: and(
        eq(schema.loginCodes.telegramId, owner.unionId),
        isNull(schema.loginCodes.usedAt)
      ),
    });
    expect(open).toHaveLength(0);
  });
});

/**
 * Der Sonderfall, den Art. 17 DSGVO erzwingt.
 *
 * Überall sonst verweigert die Anwendung den Schritt, der den letzten
 * Administrator einer Organisation entfernt. Ein Löschverlangen darf daran
 * nicht scheitern – also wird entschieden statt abgelehnt. Beide Ausgänge
 * stehen hier, und beide gehen still schief: Ohne den ersten bliebe eine
 * Organisation ohne jeden Verwalter zurück, ohne den zweiten Daten ohne jeden
 * Zugang.
 */
describe("Kontolöschung und Organisationen", () => {
  /** Legt eine Organisation mit den angegebenen Mitgliedern an. */
  async function makeOrganization(
    name: string,
    members: { userId: number; role: "admin" | "editor" }[]
  ) {
    const [org] = await db()
      .insert(schema.organizations)
      .values({ name })
      .returning();
    for (const member of members) {
      await db()
        .insert(schema.organizationMembers)
        .values({ organizationId: org.id, ...member });
    }
    return org;
  }

  it("befördert das älteste verbliebene Mitglied zum Administrator", async () => {
    const org = await makeOrganization("Werkstatt", [
      { userId: owner.id, role: "admin" },
      { userId: stranger.id, role: "editor" },
    ]);

    const result = await deleteUserAccount(owner.id);

    expect(result.organizations).toEqual([
      {
        organizationId: org.id,
        outcome: "promoted",
        newAdminUserId: stranger.id,
      },
    ]);
    const members = await db().query.organizationMembers.findMany({
      where: eq(schema.organizationMembers.organizationId, org.id),
    });
    expect(members).toHaveLength(1);
    expect(members[0].userId).toBe(stranger.id);
    expect(members[0].role).toBe("admin");
  });

  it("löscht die Organisation samt Bestand, wenn niemand übrig bleibt", async () => {
    const org = await makeOrganization("Alleingang", [
      { userId: owner.id, role: "admin" },
    ]);
    const [orgLager] = await db()
      .insert(schema.lager)
      .values({
        organizationId: org.id,
        name: "Gemeinsam",
        materialKind: "filament",
        filamentDiameterUm: 1750,
      })
      .returning();
    const [orgMaterial] = await db()
      .insert(schema.materials)
      .values({
        organizationId: org.id,
        lagerId: orgLager.id,
        name: "Org-PLA",
        materialType: "PLA",
        nominalWeight: 1000,
      })
      .returning();
    await db()
      .insert(schema.weighings)
      .values({ materialId: orgMaterial.id, grossWeight: 1200 });

    const result = await deleteUserAccount(owner.id);

    expect(result.organizations).toEqual([
      { organizationId: org.id, outcome: "deleted" },
    ]);
    // Nichts darf zurückbleiben – es gäbe keinen Weg mehr, es zu erreichen.
    expect(
      await db().query.organizations.findMany({
        where: eq(schema.organizations.id, org.id),
      })
    ).toHaveLength(0);
    expect(await orgRows("lager", org.id)).toBe(0);
    expect(await orgRows("materials", org.id)).toBe(0);
    expect(
      await db().query.weighings.findMany({
        where: eq(schema.weighings.materialId, orgMaterial.id),
      })
    ).toHaveLength(0);
  });

  /**
   * Die tragende Eigenschaft des ganzen Entwurfs: Der persönliche Löschlauf
   * filtert auf `userId`, und der ist bei Zeilen einer Organisation NULL – er
   * trifft sie also nicht. Ginge das schief, risse eine Kontolöschung den
   * Bestand einer Firma mit, an dem das Konto nur mitgearbeitet hat.
   */
  it("lässt den Bestand einer Organisation stehen, die weiterlebt", async () => {
    const org = await makeOrganization("Hochschul-Hub", [
      { userId: owner.id, role: "admin" },
      { userId: stranger.id, role: "editor" },
    ]);
    const [orgLager] = await db()
      .insert(schema.lager)
      .values({
        organizationId: org.id,
        name: "Hub-Lager",
        materialKind: "resin",
      })
      .returning();
    await db().insert(schema.materials).values({
      organizationId: org.id,
      lagerId: orgLager.id,
      name: "Org-Harz",
      materialType: "Standard",
      nominalWeight: 1000,
    });
    await db()
      .insert(schema.containerTypes)
      .values({ organizationId: org.id, name: "Org-Flasche", tareWeight: 90 });
    await db()
      .insert(schema.storageBoxes)
      .values({ organizationId: org.id, name: "Org-Box", tareWeight: 400 });

    await deleteUserAccount(owner.id);

    expect(await orgRows("lager", org.id)).toBe(1);
    expect(await orgRows("materials", org.id)).toBe(1);
    expect(await orgRows("container_types", org.id)).toBe(1);
    expect(await orgRows("storage_boxes", org.id)).toBe(1);
  });

  it("rührt Organisationen nicht an, in denen noch ein Administrator ist", async () => {
    const org = await makeOrganization("Zwei Verwalter", [
      { userId: owner.id, role: "admin" },
      { userId: stranger.id, role: "admin" },
    ]);

    const result = await deleteUserAccount(owner.id);

    // Kein Eintrag: Es war nichts zu entscheiden, nur die Mitgliedschaft geht.
    expect(result.organizations).toEqual([]);
    const members = await db().query.organizationMembers.findMany({
      where: eq(schema.organizationMembers.organizationId, org.id),
    });
    expect(members.map(m => m.userId)).toEqual([stranger.id]);
  });

  it("entfernt Einladungen in beide Richtungen", async () => {
    const org = await makeOrganization("Einladungen", [
      { userId: stranger.id, role: "admin" },
      { userId: owner.id, role: "admin" },
    ]);
    // Eine bekommene und eine selbst ausgesprochene.
    await db().insert(schema.organizationInvitations).values({
      organizationId: org.id,
      invitedUserId: owner.id,
      invitedByUserId: stranger.id,
      role: "editor",
      status: "declined",
    });
    await db().insert(schema.organizationInvitations).values({
      organizationId: org.id,
      invitedUserId: stranger.id,
      invitedByUserId: owner.id,
      role: "viewer",
      status: "declined",
    });

    await deleteUserAccount(owner.id);

    const left = await db().query.organizationInvitations.findMany({
      where: eq(schema.organizationInvitations.organizationId, org.id),
    });
    expect(left).toHaveLength(0);
  });
});

/**
 * Zeilen einer Fachtabelle, die einer bestimmten Organisation gehören.
 *
 * Über rohes SQL statt über `db().query.…`, weil sonst je Tabelle ein eigener
 * Aufruf mit eigenem Spaltenbezug nötig wäre – vier fast gleiche Blöcke, die
 * nur die Aussage verdecken. Der Tabellenname ist hier kein Freitext, sondern
 * steht wörtlich im Test.
 */
async function orgRows(
  table: "lager" | "materials" | "container_types" | "storage_boxes",
  organizationId: number
): Promise<number> {
  const result = await db().execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)}
        WHERE "organizationId" = ${organizationId}`
  );
  return result.rows[0].n;
}
