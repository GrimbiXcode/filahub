/**
 * Freundschaften, geteiltes Lager und Ausleih-Anfragen gegen eine echte
 * PostgreSQL-Datenbank.
 *
 * Läuft nur mit `npm run test:integration` und gesetzter `TEST_DATABASE_URL`.
 *
 * Warum hier Integrationstests und nicht bloß Funktionstests: Dies ist die
 * erste Funktion, die die Mandantengrenze absichtlich überschreitet. Zwei der
 * drei Riegel sitzen in der Datenbank – der Ausdrucks-Index gegen die
 * gespiegelte Freundschaft und der partielle Index gegen doppelte offene
 * Anfragen – und die Spaltenprojektion prüft sich nur an echten Zeilen. Mit
 * Attrappen ließe sich genau die Klasse von Fehlern nicht ausschließen, um die
 * es geht: dass Daten bei jemandem ankommen, für den sie nicht bestimmt sind.
 *
 * Aufgerufen wird durchgehend über `callerFor`, also durch die echte
 * tRPC-Middleware – die Zugriffsprüfung ist Teil dessen, was hier geprüft wird.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { deleteUserAccount } from "./queries/account";
import { getDb } from "./queries/connection";
import { upsertUser, findUserByUnionId } from "./queries/users";
import * as schema from "@db/schema";
import type { User } from "@db/schema";
import { callerFor, closeDb, resetSchema } from "./test/integration-db";

const db = () => getDb();

/** Felder, die in **keiner** Antwort über ein fremdes Material auftauchen dürfen. */
const FORBIDDEN_FIELDS = [
  "priceCents",
  "notes",
  "purchaseDate",
  "storageBoxId",
  "storageBox",
  "weighings",
  "lastWeighing",
  "spoolTypeId",
  "createdAt",
  "updatedAt",
  /*
    Seit 2.2.0: Das Lager ist die Einheit, an der später die Freigabe hängt –
    heute hat der Empfänger dort nichts zu suchen. Sein Name ist Freitext und
    kann einen Ort verraten, die Dichte steckt fertig in `secondary`.
  */
  "lagerId",
  "lager",
  "densityGramsPerLiter",
];

let alex: User;
let bea: User;
let stranger: User;

beforeAll(async () => {
  await resetSchema();
}, 60_000);

afterAll(async () => {
  await closeDb();
});

/**
 * Drei Konten. `stranger` ist die Kontrollgruppe: Wer mit niemandem befreundet
 * ist, darf nichts sehen und von keiner Löschung berührt werden.
 *
 * Alex' Material liegt **in einer Drybox** mit 800 g Leergewicht und ist
 * gewogen – nur so lässt sich prüfen, dass die Box-Tara in die Restmenge
 * eingeht, obwohl die Box selbst verborgen bleibt.
 */
let alexMaterialId: number;

beforeEach(async () => {
  await resetSchema();

  await upsertUser({ unionId: "alex-1", name: "Alex" });
  await upsertUser({
    unionId: "bea-1",
    name: "Bea",
    telegramUsername: "bea_hh",
  });
  await upsertUser({ unionId: "stranger-1", name: "Fremde" });
  alex = (await findUserByUnionId("alex-1"))!;
  bea = (await findUserByUnionId("bea-1"))!;
  stranger = (await findUserByUnionId("stranger-1"))!;

  const [alexLager] = await db()
    .insert(schema.lager)
    .values({
      userId: alex.id,
      name: "Mein Lager",
      materialKind: "filament",
      filamentDiameterUm: 1750,
    })
    .returning();
  const [spoolType] = await db()
    .insert(schema.spoolTypes)
    .values({ userId: alex.id, name: "Kartonrolle", tareWeight: 140 })
    .returning();
  const [box] = await db()
    .insert(schema.storageBoxes)
    .values({
      userId: alex.id,
      name: "Drybox 1",
      location: "Regal links, Werkstatt",
      tareWeight: 800,
    })
    .returning();
  const [material] = await db()
    .insert(schema.materials)
    .values({
      userId: alex.id,
      lagerId: alexLager.id,
      name: "PolyTerra PLA Schwarz",
      identifier: "P01",
      materialType: "PLA",
      manufacturer: "Polymaker",
      color: "Schwarz",
      nominalWeight: 1000,
      priceCents: 2499,
      purchaseDate: "2026-01-15",
      spoolTypeId: spoolType.id,
      storageBoxId: box.id,
      notes: "Freitext mit Personenbezug",
    })
    .returning();
  alexMaterialId = material.id;
  // 1440 g brutto − 140 g Rolle − 800 g Box = 500 g Material
  await db()
    .insert(schema.weighings)
    .values({ materialId: material.id, grossWeight: 1440 });

  // Ein zweites Material, das auf „PETG“ hört – für die Trennschärfe der Suche
  await db().insert(schema.materials).values({
    userId: alex.id,
    lagerId: alexLager.id,
    name: "Prusament PETG Orange",
    materialType: "PETG",
    nominalWeight: 1000,
  });
});

/** Freundschaft anlegen und annehmen; danach beide Stufen setzen. */
async function befriend(options: {
  fromAlex: schema.Friendship["visibilityFromUser"];
  fromBea: schema.Friendship["visibilityFromUser"];
}) {
  const [row] = await db()
    .insert(schema.friendships)
    .values({
      userId: alex.id,
      friendUserId: bea.id,
      status: "accepted",
      visibilityFromUser: options.fromAlex,
      visibilityFromFriend: options.fromBea,
    })
    .returning();
  return row;
}

describe("Freundschaft schließen", () => {
  it("führt vom Freundescode über die Anfrage zur Annahme", async () => {
    const { code } = await callerFor(alex).friend.myCode();
    expect(code).toMatch(/^FH-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);

    const request = await callerFor(bea).friend.request({ code });
    expect(request.id).toBeGreaterThan(0);
    // Ohne Bot-Token gibt es keine Nachricht – der Vorgang gilt trotzdem.
    expect(request.notified).toBe(false);

    // Vor der Annahme ist nichts freigegeben.
    expect(
      await callerFor(bea).friend.searchMaterials({ query: "PLA" })
    ).toEqual([]);

    const pendingForAlex = await callerFor(alex).friend.list();
    expect(pendingForAlex).toHaveLength(1);
    expect(pendingForAlex[0].status).toBe("pending");
    expect(pendingForAlex[0].outgoing).toBe(false);

    await callerFor(alex).friend.respond({
      id: pendingForAlex[0].id,
      accept: true,
    });

    const accepted = await callerFor(alex).friend.list();
    expect(accepted[0].status).toBe("accepted");
    // Voreinstellung: gefunden werden, aber nicht das ganze Lager zeigen.
    expect(accepted[0].sharedByMe).toBe("search");
  });

  it("findet einen Freund über den exakten Telegram-Namen", async () => {
    const request = await callerFor(alex).friend.request({
      username: "@BEA_HH",
    });
    expect(request.id).toBeGreaterThan(0);
  });

  it("verzeiht beim Code Schreibweise und Bindestriche", async () => {
    const { code } = await callerFor(alex).friend.myCode();
    const sloppy = code.replace(/-/g, "").toLowerCase();
    await expect(
      callerFor(bea).friend.request({ code: sloppy })
    ).resolves.toMatchObject({ notified: false });
  });

  it("lehnt die Anfrage an sich selbst ab", async () => {
    const { code } = await callerFor(alex).friend.myCode();
    await expect(callerFor(alex).friend.request({ code })).rejects.toThrow(
      /nicht mit dir selbst/
    );
  });

  it("gibt bei unbekanntem Code und ungültigem Format dieselbe Antwort", async () => {
    // Sonst wäre die Meldung ein Orakel dafür, welche Codes vergeben sind.
    // Einzeln erzeugt und sofort erwartet: Zwei gleichzeitig erzeugte
    // Promises gelten für Node bis zum zweiten `await` als unbehandelt.
    for (const code of ["FH-2222-3333", "keincode"]) {
      await expect(callerFor(bea).friend.request({ code })).rejects.toThrow(
        /kein Konto/
      );
    }
  });

  /**
   * Der Ausdrucks-Index aus `0008_friends.sql`. Ohne ihn könnten (A,B) und
   * (B,A) gleichzeitig bestehen – zwei Freundschaften für dasselbe Paar mit
   * widersprüchlichen Sichtbarkeiten, und welche gilt, entschiede die
   * Sortierung.
   */
  it("verhindert die gespiegelte Freundschaft in der Datenbank", async () => {
    await db()
      .insert(schema.friendships)
      .values({ userId: alex.id, friendUserId: bea.id });
    await expect(
      db()
        .insert(schema.friendships)
        .values({ userId: bea.id, friendUserId: alex.id })
    ).rejects.toThrow();
  });

  it("weist eine zweite Anfrage über den Router ab", async () => {
    const { code } = await callerFor(alex).friend.myCode();
    await callerFor(bea).friend.request({ code });
    await expect(callerFor(bea).friend.request({ code })).rejects.toThrow(
      /bereits eine Anfrage/
    );
  });

  it("lässt eine abgelehnte Anfrage nicht wiederholen", async () => {
    const { code } = await callerFor(alex).friend.myCode();
    await callerFor(bea).friend.request({ code });
    const [pending] = await callerFor(alex).friend.list();
    await callerFor(alex).friend.respond({ id: pending.id, accept: false });

    // „Nein“ soll nicht bloß eine Verzögerung sein.
    await expect(callerFor(bea).friend.request({ code })).rejects.toThrow(
      /bereits eine Anfrage/
    );

    // Nach dem Auflösen ist der Weg wieder frei.
    await callerFor(alex).friend.remove({ id: pending.id });
    await expect(
      callerFor(bea).friend.request({ code })
    ).resolves.toMatchObject({ notified: false });
  });

  it("entwertet den alten Code beim Neuerzeugen", async () => {
    const { code: first } = await callerFor(alex).friend.myCode();
    const { code: second } = await callerFor(alex).friend.rotateCode();
    expect(second).not.toBe(first);
    await expect(
      callerFor(bea).friend.request({ code: first })
    ).rejects.toThrow(/kein Konto/);
    await expect(
      callerFor(bea).friend.request({ code: second })
    ).resolves.toMatchObject({ notified: false });
  });

  it("lässt nur den Angefragten annehmen", async () => {
    const { code } = await callerFor(alex).friend.myCode();
    const { id } = await callerFor(bea).friend.request({ code });
    // Bea hat gefragt, Bea darf nicht selbst annehmen.
    await expect(
      callerFor(bea).friend.respond({ id, accept: true })
    ).rejects.toThrow(/nicht gefunden/);
  });
});

describe("Sichtbarkeitsstufen", () => {
  it("gibt bei `none` nichts heraus", async () => {
    await befriend({ fromAlex: "none", fromBea: "full" });
    expect(
      await callerFor(bea).friend.searchMaterials({ query: "PLA" })
    ).toEqual([]);
    await expect(
      callerFor(bea).friend.inventory({ friendId: alex.id })
    ).rejects.toThrow(/nicht gefunden/);
  });

  it("liefert bei `search` nur Treffer und nie das ganze Lager", async () => {
    await befriend({ fromAlex: "search", fromBea: "none" });

    const hits = await callerFor(bea).friend.searchMaterials({ query: "PETG" });
    expect(hits).toHaveLength(1);
    expect(hits[0].name).toBe("Prusament PETG Orange");

    // Das PLA-Material ist da, taucht aber bei dieser Suche nicht auf.
    expect(hits.some(m => m.materialType === "PLA")).toBe(false);

    // Und das ganze Lager bleibt verschlossen.
    await expect(
      callerFor(bea).friend.inventory({ friendId: alex.id })
    ).rejects.toThrow(/nicht gefunden/);
  });

  /**
   * Der Kern der Stufe `search`: Ohne Pflicht-Suchbegriff wäre sie in der
   * Wirkung `full`. Geprüft wird der Riegel im Router (zod) – der zweite in
   * `findFriendMaterialsForSearch` liegt dahinter.
   */
  it("verweigert die Suche ohne ausreichenden Suchbegriff", async () => {
    await befriend({ fromAlex: "search", fromBea: "none" });
    for (const query of ["", "P"]) {
      await expect(
        callerFor(bea).friend.searchMaterials({ query })
      ).rejects.toThrow();
    }
  });

  /**
   * Ein `%` als Suchbegriff wäre ohne Maskierung ein Treffer auf alles – also
   * genau die vollständige Lagerliste, die die Stufe `search` verhindern soll.
   */
  it("lässt Platzhalter im Suchbegriff nicht durch", async () => {
    await befriend({ fromAlex: "search", fromBea: "none" });
    expect(
      await callerFor(bea).friend.searchMaterials({ query: "%%" })
    ).toEqual([]);
    expect(
      await callerFor(bea).friend.searchMaterials({ query: "__" })
    ).toEqual([]);
  });

  it("öffnet bei `full` das ganze Lager", async () => {
    await befriend({ fromAlex: "full", fromBea: "none" });
    const inventory = await callerFor(bea).friend.inventory({
      friendId: alex.id,
    });
    expect(inventory.ownerName).toBe("Alex");
    expect(inventory.materials).toHaveLength(2);
    // `full` schließt `search` ein.
    expect(
      await callerFor(bea).friend.searchMaterials({ query: "PLA" })
    ).toHaveLength(1);
  });

  /**
   * Die Asymmetrie, um die es der Sache nach geht: Beide Richtungen werden
   * unabhängig entschieden. Absichtlich mit **verschiedenen** Stufen – wären
   * sie gleich, käme ein Vertauschen der Spalten hier durch.
   */
  it("hält beide Richtungen auseinander", async () => {
    await befriend({ fromAlex: "full", fromBea: "none" });

    // Bea darf alles von Alex sehen …
    const inventory = await callerFor(bea).friend.inventory({
      friendId: alex.id,
    });
    expect(inventory.materials).toHaveLength(2);

    // … Alex aber nichts von Bea.
    await expect(
      callerFor(alex).friend.inventory({ friendId: bea.id })
    ).rejects.toThrow(/nicht gefunden/);

    // Und die Oberfläche zeigt beiden das Richtige an.
    const [forAlex] = await callerFor(alex).friend.list();
    expect(forAlex.sharedByMe).toBe("full");
    expect(forAlex.sharedWithMe).toBe("none");
    const [forBea] = await callerFor(bea).friend.list();
    expect(forBea.sharedByMe).toBe("none");
    expect(forBea.sharedWithMe).toBe("full");
  });

  it("ändert mit `setVisibility` nur das eigene Lager", async () => {
    const friendship = await befriend({ fromAlex: "full", fromBea: "none" });

    // Bea setzt *ihre* Freigabe – die von Alex darf sich nicht bewegen.
    await callerFor(bea).friend.setVisibility({
      id: friendship.id,
      visibility: "search",
    });

    const row = await db()
      .select()
      .from(schema.friendships)
      .where(eq(schema.friendships.id, friendship.id));
    expect(row[0].visibilityFromUser).toBe("full");
    expect(row[0].visibilityFromFriend).toBe("search");

    // Und umgekehrt.
    await callerFor(alex).friend.setVisibility({
      id: friendship.id,
      visibility: "none",
    });
    const after = await db()
      .select()
      .from(schema.friendships)
      .where(eq(schema.friendships.id, friendship.id));
    expect(after[0].visibilityFromUser).toBe("none");
    expect(after[0].visibilityFromFriend).toBe("search");
  });

  it("lässt Unbeteiligte nichts sehen", async () => {
    await befriend({ fromAlex: "full", fromBea: "full" });
    expect(
      await callerFor(stranger).friend.searchMaterials({ query: "PLA" })
    ).toEqual([]);
    await expect(
      callerFor(stranger).friend.inventory({ friendId: alex.id })
    ).rejects.toThrow(/nicht gefunden/);
  });
});

describe("Was ein Freund zu sehen bekommt", () => {
  /**
   * Die Zusicherung, die diese ganze Funktion trägt. Geprüft an **jeder**
   * Antwort, die fremdes Material enthält – nicht nur an einer: Ein neuer
   * Lesepfad, der die Projektion umgeht, fällt sonst nicht auf.
   */
  it("liefert in keiner Antwort verbotene Felder", async () => {
    await befriend({ fromAlex: "full", fromBea: "none" });
    const caller = callerFor(bea);

    const fromSearch = await caller.friend.searchMaterials({ query: "PLA" });
    const fromInventory = (await caller.friend.inventory({ friendId: alex.id }))
      .materials;

    expect(fromSearch).not.toHaveLength(0);
    expect(fromInventory).not.toHaveLength(0);

    for (const material of [...fromSearch, ...fromInventory]) {
      for (const field of FORBIDDEN_FIELDS) {
        expect(
          material,
          `„${field}“ darf ein Freund nicht sehen`
        ).not.toHaveProperty(field);
      }
      // Und positiv: genau diese Schlüssel, nicht mehr.
      expect(Object.keys(material).sort()).toEqual([
        "color",
        "id",
        "identifier",
        "manufacturer",
        "materialType",
        "name",
        "nominalWeight",
        "ownerId",
        "ownerName",
        "remainingPercent",
        "remainingWeight",
        "secondary",
        "texture",
      ]);
    }
  });

  /**
   * Die Zweitanzeige kommt fertig gerechnet aus dem Server – und darf die
   * Angaben, aus denen sie entsteht, nicht mitbringen.
   *
   * Alex' Lager führt 1,75 mm; 500 g PLA (nach Abzug von Rolle und Box) sind
   * dort rund 168 m. Käme die Stärke des Lagers nicht an, stünde hier eine
   * andere Zahl – bei 2,85 mm etwa 63 m.
   */
  it("liefert die Zweitanzeige aus dem Lager des Besitzers", async () => {
    await befriend({ fromAlex: "full", fromBea: "none" });
    const hits = await callerFor(bea).friend.searchMaterials({ query: "P01" });
    expect(hits).toHaveLength(1);
    expect(hits[0].secondary?.unit).toBe("m");
    expect(hits[0].secondary?.value).toBeCloseTo(167.6, 0);
  });

  /**
   * Die Oberfläche ist Teil der Materialidentität – und muss auffindbar sein,
   * seit sie nicht mehr in der Materialart steckt. Ohne sie im Suchprädikat
   * fände „wer mattes PETG sucht“ nichts.
   */
  it("findet fremdes Material über die Oberfläche", async () => {
    await befriend({ fromAlex: "search", fromBea: "none" });
    await db()
      .update(schema.materials)
      .set({ texture: "Silk" })
      .where(eq(schema.materials.id, alexMaterialId));

    const hits = await callerFor(bea).friend.searchMaterials({ query: "Silk" });
    expect(hits.map(h => h.id)).toEqual([alexMaterialId]);
    expect(hits[0].texture).toBe("Silk");
  });

  /**
   * Die stille Fehlerquelle: Die Lagerbox ist für Freunde unsichtbar, ihr
   * Leergewicht gehört aber in die Rechnung. Wer den Box-Join weglässt, „weil
   * Freunde die Box nicht sehen dürfen“, meldet 1300 g statt 500 g – also genau
   * die Zahl falsch, um die es in dieser Funktion geht.
   */
  it("rechnet die Tara der verborgenen Lagerbox mit ein", async () => {
    await befriend({ fromAlex: "full", fromBea: "none" });
    const hits = await callerFor(bea).friend.searchMaterials({ query: "P01" });
    expect(hits).toHaveLength(1);
    // 1440 g brutto − 140 g Rolle − 800 g Box
    expect(hits[0].remainingWeight).toBe(500);
    expect(hits[0].remainingPercent).toBe(50);

    // Dieselbe Zahl, die der Besitzer sieht.
    const own = await callerFor(alex).material.byId({ id: alexMaterialId });
    expect(hits[0].remainingWeight).toBe(own.remainingWeight);
  });

  it("durchsucht die Notizen nicht", async () => {
    // Man darf keine Treffer über einen Text erzielen, den man nicht sehen darf.
    await befriend({ fromAlex: "search", fromBea: "none" });
    expect(
      await callerFor(bea).friend.searchMaterials({ query: "Personenbezug" })
    ).toEqual([]);
  });

  it("findet über Bezeichnung, Kennung, Art, Hersteller und Farbe", async () => {
    await befriend({ fromAlex: "search", fromBea: "none" });
    const caller = callerFor(bea);
    for (const query of ["PolyTerra", "P01", "PLA", "Polymaker", "Schwarz"]) {
      const hits = await caller.friend.searchMaterials({ query });
      expect(hits.length, `„${query}“ hätte treffen sollen`).toBeGreaterThan(0);
    }
  });
});

describe("Ausleih-Anfragen", () => {
  it("führt vom Anfragen zum Zusagen", async () => {
    await befriend({ fromAlex: "search", fromBea: "none" });

    const created = await callerFor(bea).friend.requestLoan({
      materialId: alexMaterialId,
      message: "Bräuchte etwa 200 g.",
    });
    expect(created.id).toBeGreaterThan(0);

    const forAlex = await callerFor(alex).friend.loanRequests();
    expect(forAlex).toHaveLength(1);
    expect(forAlex[0].outgoing).toBe(false);
    expect(forAlex[0].materialName).toBe("PolyTerra PLA Schwarz");
    expect(forAlex[0].counterpartName).toBe("Bea");
    expect(forAlex[0].status).toBe("open");

    // Der Zähler für das Abzeichen zählt genau das.
    expect(await callerFor(alex).friend.pendingCount()).toEqual({ count: 1 });

    await callerFor(alex).friend.respondLoan({
      id: created.id,
      accept: true,
    });
    const answered = await callerFor(bea).friend.loanRequests();
    expect(answered[0].status).toBe("accepted");
    expect(answered[0].outgoing).toBe(true);
    expect(await callerFor(alex).friend.pendingCount()).toEqual({ count: 0 });
  });

  it("lässt nur eine offene Anfrage je Material zu", async () => {
    await befriend({ fromAlex: "search", fromBea: "none" });
    const caller = callerFor(bea);
    await caller.friend.requestLoan({ materialId: alexMaterialId });
    await expect(
      caller.friend.requestLoan({ materialId: alexMaterialId })
    ).rejects.toThrow(/schon eine Anfrage/);
  });

  /** Der partielle Unique-Index aus `0008_friends.sql`. */
  it("verhindert die zweite offene Anfrage auch in der Datenbank", async () => {
    const values = {
      userId: bea.id,
      ownerUserId: alex.id,
      materialId: alexMaterialId,
      materialName: "PolyTerra PLA Schwarz",
    };
    await db().insert(schema.loanRequests).values(values);
    await expect(
      db().insert(schema.loanRequests).values(values)
    ).rejects.toThrow();
  });

  it("erlaubt eine neue Anfrage nach dem Zurückziehen", async () => {
    await befriend({ fromAlex: "search", fromBea: "none" });
    const caller = callerFor(bea);
    const first = await caller.friend.requestLoan({
      materialId: alexMaterialId,
    });
    await caller.friend.withdrawLoan({ id: first.id });
    // Nach Wochen erneut zu fragen ist legitim.
    await expect(
      caller.friend.requestLoan({ materialId: alexMaterialId })
    ).resolves.toMatchObject({ notified: false });
  });

  /**
   * Zugleich der Schutz davor, Material-IDs durchzuprobieren: Ohne Freigabe ist
   * die Antwort dieselbe wie für ein Material, das es nicht gibt.
   */
  it("verweigert die Anfrage ohne Freigabe", async () => {
    await befriend({ fromAlex: "none", fromBea: "full" });
    await expect(
      callerFor(bea).friend.requestLoan({ materialId: alexMaterialId })
    ).rejects.toThrow(/nicht gefunden/);

    await expect(
      callerFor(stranger).friend.requestLoan({ materialId: alexMaterialId })
    ).rejects.toThrow(/nicht gefunden/);
  });

  it("lässt niemanden das eigene Material anfragen", async () => {
    await expect(
      callerFor(alex).friend.requestLoan({ materialId: alexMaterialId })
    ).rejects.toThrow(/nicht gefunden/);
  });

  it("lässt nur den Besitzer antworten und nur den Fragenden zurückziehen", async () => {
    await befriend({ fromAlex: "search", fromBea: "none" });
    const { id } = await callerFor(bea).friend.requestLoan({
      materialId: alexMaterialId,
    });

    // Bea hat gefragt, Bea darf nicht zusagen.
    await expect(
      callerFor(bea).friend.respondLoan({ id, accept: true })
    ).rejects.toThrow(/nicht gefunden/);
    // Und Alex zieht nicht die Anfrage eines anderen zurück.
    await expect(callerFor(alex).friend.withdrawLoan({ id })).rejects.toThrow(
      /nicht gefunden/
    );
  });

  it("behält die Bezeichnung, wenn das Material verschwindet", async () => {
    await befriend({ fromAlex: "search", fromBea: "none" });
    await callerFor(bea).friend.requestLoan({ materialId: alexMaterialId });
    await callerFor(alex).material.delete({ id: alexMaterialId });

    const [request] = await callerFor(bea).friend.loanRequests();
    expect(request.materialName).toBe("PolyTerra PLA Schwarz");
  });
});

describe("Kontolöschung", () => {
  /**
   * Beide Richtungen. Ohne die zweite blieben Zeilen stehen, in denen das
   * gelöschte Konto die Gegenseite war – und die zeigten mangels
   * Fremdschlüssel später auf eine neu vergebene ID, also auf einen fremden
   * Menschen.
   */
  it("räumt Freundschaften und Vorgänge in beiden Richtungen ab", async () => {
    await befriend({ fromAlex: "search", fromBea: "search" });
    await callerFor(bea).friend.requestLoan({ materialId: alexMaterialId });
    // Und eine Freundschaft, in der Bea die Anfragende war
    await db().insert(schema.friendships).values({
      userId: bea.id,
      friendUserId: stranger.id,
      status: "accepted",
    });

    // Bea löschen – sie ist einmal `friendUserId` und einmal `userId`.
    await deleteUserAccount(bea.id);

    const friendships = await db().select().from(schema.friendships);
    expect(friendships).toEqual([]);
    const loans = await db().select().from(schema.loanRequests);
    expect(loans).toEqual([]);

    // Alex und die Fremde bleiben unberührt.
    expect(await findUserByUnionId("alex-1")).toBeDefined();
    expect(await findUserByUnionId("stranger-1")).toBeDefined();
    const materials = await db()
      .select()
      .from(schema.materials)
      .where(eq(schema.materials.userId, alex.id));
    expect(materials).toHaveLength(2);
  });

  it("nimmt den Freundescode mit dem Konto mit", async () => {
    const { code } = await callerFor(bea).friend.myCode();
    await deleteUserAccount(bea.id);
    const rows = await db()
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.friendCode, code));
    expect(rows).toEqual([]);
  });

  it("nimmt die Anfrage des Löschenden beim Freund mit", async () => {
    await befriend({ fromAlex: "search", fromBea: "search" });
    await callerFor(bea).friend.requestLoan({ materialId: alexMaterialId });
    expect(await callerFor(alex).friend.loanRequests()).toHaveLength(1);

    await deleteUserAccount(bea.id);
    // Unvermeidlich: Die Zeile ist gemeinsames Datum beider Personen.
    expect(await callerFor(alex).friend.loanRequests()).toEqual([]);
    expect(await callerFor(alex).friend.pendingCount()).toEqual({ count: 0 });
  });
});

describe("Auskunft (Art. 15/20 DSGVO)", () => {
  it("enthält Freundschaften und Vorgänge samt Namen der Gegenseite", async () => {
    await befriend({ fromAlex: "search", fromBea: "full" });
    await callerFor(bea).friend.requestLoan({
      materialId: alexMaterialId,
      message: "Bräuchte etwas.",
    });

    // Über den Router, damit die Prüfung den echten Weg nimmt.
    const dump = await callerFor(bea).account.export();

    const friendships = dump.friendships as { counterpartName: string }[];
    expect(friendships).toHaveLength(1);
    // Ohne den Namen wäre die Zeile eine sinnlose Zahlenkolonne.
    expect(friendships[0].counterpartName).toBe("Alex");

    const loans = dump.loanRequests as {
      counterpartName: string;
      materialName: string;
    }[];
    expect(loans).toHaveLength(1);
    expect(loans[0].counterpartName).toBe("Alex");
    expect(loans[0].materialName).toBe("PolyTerra PLA Schwarz");
  });

  it("nennt auch die Freundschaft, die von der anderen Seite kam", async () => {
    await befriend({ fromAlex: "search", fromBea: "search" });
    // Alex hat die Zeile angelegt; für Bea ist sie die Gegenseite.
    const dump = await callerFor(bea).account.export();
    expect(dump.friendships as unknown[]).toHaveLength(1);
  });
});

describe("Schema", () => {
  it("legt die beiden handgeschriebenen Indizes an", async () => {
    // Sie stehen nur in der Migration, nicht im Drizzle-Schema – ein
    // `db:push` oder eine neu erzeugte Migration verliert sie leicht.
    const result = await db().execute<{ indexname: string }>(sql`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname IN ('friendships_pair_canonical_unique', 'loan_requests_open_unique')
      ORDER BY indexname
    `);
    expect(result.rows.map(r => r.indexname)).toEqual([
      "friendships_pair_canonical_unique",
      "loan_requests_open_unique",
    ]);
  });

  it("hält den Freundescode eindeutig", async () => {
    await db()
      .update(schema.users)
      .set({ friendCode: "FH-2222-3333" })
      .where(eq(schema.users.id, alex.id));
    await expect(
      db()
        .update(schema.users)
        .set({ friendCode: "FH-2222-3333" })
        .where(eq(schema.users.id, bea.id))
    ).rejects.toThrow();
  });

  it("protokolliert Änderungen an Zugriffsrechten", async () => {
    const friendship = await befriend({ fromAlex: "search", fromBea: "none" });
    await callerFor(alex).friend.setVisibility({
      id: friendship.id,
      visibility: "full",
    });

    // `recordAudit` schreibt absichtlich ohne `await` – kurz warten.
    await new Promise(resolve => setTimeout(resolve, 150));
    const rows = await db()
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.event, "friend.visibility_changed"),
          eq(schema.auditLog.actorUserId, alex.id)
        )
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].subjectUserId).toBe(bea.id);
  });

  it("protokolliert Ausleih-Anfragen nicht", async () => {
    // Sie sind Nutzung, nicht Sicherheit – siehe contracts/audit.ts.
    await befriend({ fromAlex: "search", fromBea: "none" });
    await callerFor(bea).friend.requestLoan({ materialId: alexMaterialId });
    await new Promise(resolve => setTimeout(resolve, 150));
    const rows = await db().select().from(schema.auditLog);
    expect(rows.filter(r => r.event.startsWith("loan"))).toEqual([]);
  });
});
