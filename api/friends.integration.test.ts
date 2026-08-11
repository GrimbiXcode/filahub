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
  "containerTypeId",
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
/** Alex' zweites Lager samt Inhalt – der Beleg, dass Freigaben je Lager gelten. */
let alexLagerId: number;
let alexResinLagerId: number;
let alexResinMaterialId: number;

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
  const [containerType] = await db()
    .insert(schema.containerTypes)
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
      containerTypeId: containerType.id,
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
  alexLagerId = alexLager.id;

  /*
    Ein **zweites** Lager mit eigenem Inhalt. Erst damit lässt sich prüfen, was
    seit 2.4.0 der Kern der Sache ist: Eine Freigabe gilt für ein Lager, nicht
    für den Bestand. Mit nur einem Lager wäre jeder Test dieser Datei auch dann
    grün, wenn die Freigabe weiter für alles gälte.
  */
  const [resinLager] = await db()
    .insert(schema.lager)
    .values({ userId: alex.id, name: "Harz", materialKind: "resin" })
    .returning();
  alexResinLagerId = resinLager.id;
  const [resinMaterial] = await db()
    .insert(schema.materials)
    .values({
      userId: alex.id,
      lagerId: resinLager.id,
      name: "Anycubic Resin Klar",
      materialType: "Standard-Resin",
      nominalWeight: 1000,
    })
    .returning();
  alexResinMaterialId = resinMaterial.id;
});

/**
 * Freundschaft zwischen Alex und Bea anlegen, annehmen und Alex' Lager
 * freigeben.
 *
 * Die Stufen stehen je Lager, weil sie im Modell je Lager stehen. `undefined`
 * heißt „keine Freigabezeile“, und das ist nicht dasselbe wie ein Wert `none`:
 * Fehlt die Zeile, ist es der Grundzustand; steht sie da, hat jemand
 * zurückgenommen. Beide müssen dasselbe bewirken, und beide kommen hier vor.
 */
async function befriend(
  options: {
    main?: schema.LagerShare["visibility"];
    resin?: schema.LagerShare["visibility"];
  } = {}
) {
  const [row] = await db()
    .insert(schema.friendships)
    .values({
      userId: alex.id,
      friendUserId: bea.id,
      status: "accepted",
      respondedAt: new Date(),
    })
    .returning();
  await share({ lagerId: alexLagerId, visibility: options.main });
  await share({ lagerId: alexResinLagerId, visibility: options.resin });
  return row;
}

/** Eine Freigabezeile für Bea, direkt in der Datenbank. `none` schreibt nichts. */
async function share(options: {
  lagerId: number;
  visibility?: schema.LagerShare["visibility"];
  recipientId?: number;
}) {
  if (options.visibility == null || options.visibility === "none") return;
  await db()
    .insert(schema.lagerShares)
    .values({
      lagerId: options.lagerId,
      sharedWithUserId: options.recipientId ?? bea.id,
      visibility: options.visibility,
    });
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
    /*
      Nach dem Annehmen ist **nichts** freigegeben – seit 2.4.0 gibt es keine
      Voreinstellung mehr, weil sie ein konkretes Lager öffnen würde. Die Liste
      trägt trotzdem eine Zeile je eigenem Lager: So muss die Oberfläche keinen
      Wert erfinden, und ein nicht freigegebenes Lager ist sichtbar nicht
      freigegeben statt gar nicht erwähnt.
    */
    expect(accepted[0].sharedByMe).toEqual([
      { lagerId: alexLagerId, visibility: "none" },
      { lagerId: alexResinLagerId, visibility: "none" },
    ]);
    expect(accepted[0].sharedWithMe).toBe("none");
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
    await befriend({ main: "none" });
    expect(
      await callerFor(bea).friend.searchMaterials({ query: "PLA" })
    ).toEqual([]);
    await expect(
      callerFor(bea).friend.inventory({ friendId: alex.id })
    ).rejects.toThrow(/nicht gefunden/);
  });

  it("liefert bei `search` nur Treffer und nie das ganze Lager", async () => {
    await befriend({ main: "search" });

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
    await befriend({ main: "search" });
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
    await befriend({ main: "search" });
    expect(
      await callerFor(bea).friend.searchMaterials({ query: "%%" })
    ).toEqual([]);
    expect(
      await callerFor(bea).friend.searchMaterials({ query: "__" })
    ).toEqual([]);
  });

  it("öffnet bei `full` das ganze Lager", async () => {
    await befriend({ main: "full" });
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
    await befriend({ main: "full" });

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
    expect(forAlex.sharedByMe).toEqual([
      { lagerId: alexLagerId, visibility: "full" },
      { lagerId: alexResinLagerId, visibility: "none" },
    ]);
    expect(forAlex.sharedWithMe).toBe("none");
    // Bea hat kein Lager, kann also nichts zeigen – und sieht alles von Alex.
    const [forBea] = await callerFor(bea).friend.list();
    expect(forBea.sharedByMe).toEqual([]);
    expect(forBea.sharedWithMe).toBe("full");
  });

  /**
   * `sharedWithMe` ist die **höchste** Stufe über alle Lager des Freundes.
   *
   * Bewusst eine einzige Stufe: Wie viele Lager er hat und welche er freigibt,
   * wäre eine Auskunft über seinen Bestand, die er nicht gegeben hat. Die
   * beiden Stufen sind hier verschieden, sonst belegte der Test nichts.
   */
  it("verdichtet fremde Freigaben auf die höchste Stufe", async () => {
    await befriend({ main: "search", resin: "full" });
    const [forBea] = await callerFor(bea).friend.list();
    expect(forBea.sharedWithMe).toBe("full");

    // Umgekehrt: Ohne `full` bleibt es bei `search`.
    await db().delete(schema.lagerShares);
    await share({ lagerId: alexLagerId, visibility: "search" });
    const [again] = await callerFor(bea).friend.list();
    expect(again.sharedWithMe).toBe("search");
  });

  /**
   * Die Freigabe gehört dem Lager, und ein Lager gehört genau einem Menschen.
   * Bea kann deshalb nur über **ihre** Lager verfügen – auch innerhalb einer
   * Freundschaft, in der Alex großzügiger ist.
   */
  it("lässt niemanden ein fremdes Lager freigeben", async () => {
    await befriend({ main: "full" });

    await expect(
      callerFor(bea).friend.setLagerVisibility({
        friendId: alex.id,
        lagerId: alexLagerId,
        visibility: "none",
      })
    ).rejects.toThrow(/nicht gefunden/);

    // Alex' eigene Freigabe hat sich nicht bewegt.
    const rows = await db().select().from(schema.lagerShares);
    expect(rows).toHaveLength(1);
    expect(rows[0].visibility).toBe("full");
  });

  it("setzt und nimmt die Freigabe eines eigenen Lagers zurück", async () => {
    await befriend();

    const caller = callerFor(alex);
    await caller.friend.setLagerVisibility({
      friendId: bea.id,
      lagerId: alexResinLagerId,
      visibility: "search",
    });
    expect(
      await callerFor(bea).friend.searchMaterials({ query: "Resin" })
    ).toHaveLength(1);

    // Heraufsetzen ist ein Upsert, keine zweite Zeile.
    await caller.friend.setLagerVisibility({
      friendId: bea.id,
      lagerId: alexResinLagerId,
      visibility: "full",
    });
    expect(await db().select().from(schema.lagerShares)).toHaveLength(1);

    /*
      Und `none` **löscht** die Zeile, statt sie zu schreiben: Die fehlende Zeile
      ist der Grundzustand, sonst müsste jede Abfrage zwei Fälle unterscheiden.
    */
    await caller.friend.setLagerVisibility({
      friendId: bea.id,
      lagerId: alexResinLagerId,
      visibility: "none",
    });
    expect(await db().select().from(schema.lagerShares)).toEqual([]);
    expect(
      await callerFor(bea).friend.searchMaterials({ query: "Resin" })
    ).toEqual([]);
  });

  /**
   * **Der Kern der Änderung.** Ein Lager freigegeben, das andere nicht: Die
   * Suche findet nur, was aus dem freigegebenen kommt, der Lagerblick zeigt nur
   * dessen Material, und ein Material aus dem verborgenen ist auch über die
   * Ausleih-Anfrage nicht erreichbar.
   *
   * Vor 2.4.0 hätte hier zwangsläufig alles oder nichts gestanden.
   */
  it("gibt genau das freigegebene Lager heraus, nicht den Bestand", async () => {
    await befriend({ resin: "full" });
    const caller = callerFor(bea);

    const found = await caller.friend.searchMaterials({ query: "Anycubic" });
    expect(found).toHaveLength(1);
    expect(await caller.friend.searchMaterials({ query: "PolyTerra" })).toEqual(
      []
    );
    expect(await caller.friend.searchMaterials({ query: "PETG" })).toEqual([]);

    const inventory = await caller.friend.inventory({ friendId: alex.id });
    expect(inventory.materials.map(m => m.name)).toEqual([
      "Anycubic Resin Klar",
    ]);

    /*
      `NOT_FOUND` und nicht `FORBIDDEN`: Die Antwort darf nicht verraten, dass
      es das Material gibt – sonst wären Material-IDs durchprobierbar.
    */
    await expect(
      caller.friend.requestLoan({ materialId: alexMaterialId })
    ).rejects.toThrow(/nicht gefunden/);
    // Aus dem freigegebenen Lager geht es.
    await expect(
      caller.friend.requestLoan({ materialId: alexResinMaterialId })
    ).resolves.toBeTruthy();
  });

  /**
   * Stufe `search` je Lager: Suchen ja, Lagerblick nein. Der Lagerblick verlangt
   * `full` **irgendeines** Lagers – gibt es keines, ist er `NOT_FOUND`.
   */
  it("trennt `search` und `full` je Lager", async () => {
    await befriend({ main: "search", resin: "search" });
    const caller = callerFor(bea);

    expect(await caller.friend.searchMaterials({ query: "PLA" })).toHaveLength(
      1
    );
    await expect(
      caller.friend.inventory({ friendId: alex.id })
    ).rejects.toThrow(/nicht gefunden/);

    // Ein einziges Lager auf `full` öffnet den Blick – aber nur auf dieses.
    await db().delete(schema.lagerShares);
    await share({ lagerId: alexResinLagerId, visibility: "full" });
    const inventory = await caller.friend.inventory({ friendId: alex.id });
    expect(inventory.materials.map(m => m.name)).toEqual([
      "Anycubic Resin Klar",
    ]);
  });

  /**
   * **Falle 1: Die aufgelöste Freundschaft.** Ohne die Kaskade in
   * `deleteFriendship` bliebe die Freigabezeile stehen, und eine erneut
   * geschlossene Freundschaft weckte alten Zugriff wieder auf – ohne dass
   * jemand etwas freigegeben hätte. Auffallen würde es niemandem: Der Lesepfad
   * findet dann eine angenommene Freundschaft **und** eine Freigabe.
   */
  it("weckt nach dem Auflösen und Neuschließen keinen Zugriff", async () => {
    const friendship = await befriend({ main: "full", resin: "full" });
    expect(await db().select().from(schema.lagerShares)).toHaveLength(2);

    await callerFor(alex).friend.remove({ id: friendship.id });
    expect(await db().select().from(schema.lagerShares)).toEqual([]);

    // Neu anfragen und annehmen – und nichts kehrt zurück.
    const { code } = await callerFor(alex).friend.myCode();
    const again = await callerFor(bea).friend.request({ code });
    await callerFor(alex).friend.respond({ id: again.id, accept: true });

    expect(
      await callerFor(bea).friend.searchMaterials({ query: "PLA" })
    ).toEqual([]);
    await expect(
      callerFor(bea).friend.inventory({ friendId: alex.id })
    ).rejects.toThrow(/nicht gefunden/);
  });

  /**
   * **Falle 2: Der Status ohne Kaskade.** Hier wird der Freundschaftsstatus
   * direkt in der Datenbank auf `declined` gesetzt, **ohne** die Freigabe
   * anzufassen – der Zustand, den es über die Oberfläche nicht gibt, den aber
   * ein späterer Umbau erzeugen könnte.
   *
   * Der Test prüft damit `resolveShare` am echten Lesepfad: Verschiebt jemand
   * die Statusprüfung ins SQL des Freigabe-Joins, wird er rot.
   */
  it("gewährt nichts, wenn die Freundschaft nicht angenommen ist", async () => {
    await befriend({ main: "full" });
    for (const status of ["declined", "pending"] as const) {
      await db().update(schema.friendships).set({ status });

      // Die Freigabezeile steht unverändert da.
      expect(await db().select().from(schema.lagerShares)).toHaveLength(1);

      const caller = callerFor(bea);
      expect(await caller.friend.searchMaterials({ query: "PLA" })).toEqual([]);
      await expect(
        caller.friend.inventory({ friendId: alex.id })
      ).rejects.toThrow(/nicht gefunden/);
      await expect(
        caller.friend.requestLoan({ materialId: alexMaterialId })
      ).rejects.toThrow(/nicht gefunden/);
    }
  });

  /**
   * **Die Kaskade aus der anderen Richtung.** Ein gelöschtes Lager entzieht den
   * Zugriff; bliebe die Freigabezeile stehen, zeigte ihre `lagerId` mangels
   * Fremdschlüssel irgendwann auf ein neu vergebenes Lager.
   */
  it("entzieht mit dem gelöschten Lager auch die Freigabe", async () => {
    await befriend({ main: "full", resin: "full" });

    // Löschen geht nur leer – das Harzmaterial muss zuerst weg.
    await db()
      .delete(schema.materials)
      .where(eq(schema.materials.id, alexResinMaterialId));
    await callerFor(alex).lager.delete({ id: alexResinLagerId });

    const rows = await db().select().from(schema.lagerShares);
    expect(rows.map(r => r.lagerId)).toEqual([alexLagerId]);

    // Und im Protokoll steht, wessen Zugriff endete.
    await new Promise(resolve => setTimeout(resolve, 150));
    const log = await db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.event, "friend.visibility_changed"));
    expect(log).toHaveLength(1);
    expect(log[0].subjectUserId).toBe(bea.id);
    expect(log[0].detail).toMatchObject({
      lagerId: alexResinLagerId,
      visibility: "none",
      reason: "lager_deleted",
    });
  });

  /** Die Zahl auf der Lager-Seite – die Gegenprobe zu „nichts freigegeben“. */
  it("zählt je Lager, mit wie vielen Freunden es geteilt ist", async () => {
    await befriend({ main: "full" });
    // Ein zweiter Empfänger für dasselbe Lager.
    await db().insert(schema.friendships).values({
      userId: alex.id,
      friendUserId: stranger.id,
      status: "accepted",
      respondedAt: new Date(),
    });
    await share({
      lagerId: alexLagerId,
      visibility: "search",
      recipientId: stranger.id,
    });

    const list = await callerFor(alex).lager.list();
    const byId = new Map(list.map(l => [l.id, l.sharedWith]));
    expect(byId.get(alexLagerId)).toBe(2);
    expect(byId.get(alexResinLagerId)).toBe(0);
  });

  it("lässt Unbeteiligte nichts sehen", async () => {
    await befriend({ main: "full" });
    expect(
      await callerFor(stranger).friend.searchMaterials({ query: "PLA" })
    ).toEqual([]);
    await expect(
      callerFor(stranger).friend.inventory({ friendId: alex.id })
    ).rejects.toThrow(/nicht gefunden/);
  });
});

/*
  Die zwei Regeln, die eine Ablehnung erst zu einer Ablehnung machen.
*/
describe("Ablehnung", () => {
  it("lässt nur den Ablehnenden die abgelehnte Zeile entfernen", async () => {
    const { code } = await callerFor(alex).friend.myCode();
    const request = await callerFor(bea).friend.request({ code });
    await callerFor(alex).friend.respond({ id: request.id, accept: false });

    /*
      Bea hat angefragt und wurde abgelehnt. Dürfte sie die Zeile löschen, wäre
      der Weg für eine neue Anfrage frei – „nein“ wäre nur eine Verzögerung, und
      Alex hätte kein Mittel dagegen.
    */
    await expect(
      callerFor(bea).friend.remove({ id: request.id })
    ).rejects.toThrow(/nicht gefunden/);
    await expect(callerFor(bea).friend.request({ code })).rejects.toThrow();

    // Alex darf – er hat entschieden und kann es sich anders überlegen.
    await expect(
      callerFor(alex).friend.remove({ id: request.id })
    ).resolves.toEqual({ ok: true });
  });

  it("gibt den Telegram-Namen erst mit der Annahme heraus", async () => {
    const { code } = await callerFor(alex).friend.myCode();
    const request = await callerFor(bea).friend.request({ code });

    /*
      Ein Freundescode ist zum Weitergeben gedacht. Wer ihn hat, darf anfragen –
      aber dadurch keine Kennung bekommen, mit der er die Person außerhalb der
      App direkt anschreibt.
    */
    const [pending] = await callerFor(bea).friend.list();
    expect(pending.status).toBe("pending");
    expect(pending.friendUsername).toBeNull();

    await callerFor(alex).friend.respond({ id: request.id, accept: true });
    const [accepted] = await callerFor(bea).friend.list();
    expect(accepted.friendUsername).toBeNull(); // Alex hat keinen gesetzt
    const [forAlex] = await callerFor(alex).friend.list();
    expect(forAlex.friendUsername).toBe("bea_hh");
  });
});

describe("Was ein Freund zu sehen bekommt", () => {
  /**
   * Die Zusicherung, die diese ganze Funktion trägt. Geprüft an **jeder**
   * Antwort, die fremdes Material enthält – nicht nur an einer: Ein neuer
   * Lesepfad, der die Projektion umgeht, fällt sonst nicht auf.
   */
  it("liefert in keiner Antwort verbotene Felder", async () => {
    await befriend({ main: "full" });
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
    await befriend({ main: "full" });
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
    await befriend({ main: "search" });
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
    await befriend({ main: "full" });
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
    await befriend({ main: "search" });
    expect(
      await callerFor(bea).friend.searchMaterials({ query: "Personenbezug" })
    ).toEqual([]);
  });

  it("findet über Bezeichnung, Kennung, Art, Hersteller und Farbe", async () => {
    await befriend({ main: "search" });
    const caller = callerFor(bea);
    for (const query of ["PolyTerra", "P01", "PLA", "Polymaker", "Schwarz"]) {
      const hits = await caller.friend.searchMaterials({ query });
      expect(hits.length, `„${query}“ hätte treffen sollen`).toBeGreaterThan(0);
    }
  });
});

describe("Ausleih-Anfragen", () => {
  it("führt vom Anfragen zum Zusagen", async () => {
    await befriend({ main: "search" });

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
    await befriend({ main: "search" });
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
    await befriend({ main: "search" });
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
    await befriend({ main: "none" });
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
    await befriend({ main: "search" });
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
    await befriend({ main: "search" });
    await callerFor(bea).friend.requestLoan({ materialId: alexMaterialId });
    await callerFor(alex).material.delete({ id: alexMaterialId });

    const [request] = await callerFor(bea).friend.loanRequests();
    expect(request.materialName).toBe("PolyTerra PLA Schwarz");
  });
});

/*
  Eine offene Ausleih-Anfrage darf die Freigabe nicht überleben: Sonst könnte der
  Besitzer noch zusagen und der Materialname ginge per Telegram an jemanden, dem
  der Zugriff entzogen wurde.
*/
describe("Entzogener Zugriff", () => {
  it("räumt offene Anfragen mit der zurückgenommenen Freigabe ab", async () => {
    await befriend({ main: "search" });
    await callerFor(bea).friend.requestLoan({ materialId: alexMaterialId });
    expect(await callerFor(alex).friend.loanRequests()).toHaveLength(1);

    await callerFor(alex).friend.setLagerVisibility({
      friendId: bea.id,
      lagerId: alexLagerId,
      visibility: "none",
    });
    expect(await callerFor(alex).friend.loanRequests()).toEqual([]);
    expect(await callerFor(bea).friend.loanRequests()).toEqual([]);
  });

  it("räumt offene Anfragen mit der aufgelösten Freundschaft ab", async () => {
    const friendship = await befriend({ main: "search" });
    await callerFor(bea).friend.requestLoan({ materialId: alexMaterialId });
    await callerFor(alex).friend.remove({ id: friendship.id });
    expect(await callerFor(alex).friend.loanRequests()).toEqual([]);
  });

  /*
    Der Riegel für alle Wege, die keine Kaskade abdeckt (etwa ein gelöschtes
    Lager): Eine Zusage prüft die Freigabe noch einmal.
  */
  it("lässt eine Anfrage ohne Freigabe nicht zusagen", async () => {
    await befriend({ main: "search" });
    const { id } = await callerFor(bea).friend.requestLoan({
      materialId: alexMaterialId,
    });
    // Freigabe direkt entfernen, ohne die Kaskade zu benutzen.
    await db().delete(schema.lagerShares);
    await expect(
      callerFor(alex).friend.respondLoan({ id, accept: true })
    ).rejects.toThrow(/nicht gefunden/);
    // Ablehnen bleibt möglich – es gibt nichts heraus.
    await expect(
      callerFor(alex).friend.respondLoan({ id, accept: false })
    ).resolves.toEqual({ ok: true });
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
    await befriend({ main: "search" });
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
    expect(materials).toHaveLength(3);
  });

  /**
   * Freigaben in **beiden** Richtungen: die, die das gelöschte Konto erteilt
   * hat, und die, die es bekommen hat. Bleibt eine stehen, zeigt ihre `lagerId`
   * oder ihr `sharedWithUserId` mangels Fremdschlüssel später auf eine neu
   * vergebene ID – jemand sähe einen fremden Bestand, den nie jemand für ihn
   * freigegeben hat.
   */
  it("räumt Lager-Freigaben in beiden Richtungen ab", async () => {
    await befriend({ main: "full", resin: "search" });

    // Und die Gegenrichtung: Bea gibt Alex ihr Lager frei.
    const [beaLager] = await db()
      .insert(schema.lager)
      .values({
        userId: bea.id,
        name: "Beas Lager",
        materialKind: "filament",
        filamentDiameterUm: 2850,
      })
      .returning();
    await share({
      lagerId: beaLager.id,
      visibility: "full",
      recipientId: alex.id,
    });
    expect(await db().select().from(schema.lagerShares)).toHaveLength(3);

    await deleteUserAccount(bea.id);
    expect(await db().select().from(schema.lagerShares)).toEqual([]);
    // Alex' Lager bleiben, nur die Freigaben an Bea sind fort.
    const lagerLeft = await db()
      .select({ id: schema.lager.id })
      .from(schema.lager);
    expect(lagerLeft.map(l => l.id).sort()).toEqual(
      [alexLagerId, alexResinLagerId].sort()
    );
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
    await befriend({ main: "search" });
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
    await befriend({ main: "search" });
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
    await befriend({ main: "search" });
    // Alex hat die Zeile angelegt; für Bea ist sie die Gegenseite.
    const dump = await callerFor(bea).account.export();
    expect(dump.friendships as unknown[]).toHaveLength(1);
  });

  /**
   * Freigaben in beiden Richtungen, mit `direction` daran: Die Zeile allein sagt
   * es nicht, weil der Eigentümer am Lager steht und nicht an der Freigabe.
   */
  it("enthält erteilte und bekommene Lager-Freigaben", async () => {
    await befriend({ main: "full" });

    const forAlex = (await callerFor(alex).account.export()).lagerShares as {
      direction: string;
      counterpartName: string | null;
    }[];
    expect(forAlex).toHaveLength(1);
    expect(forAlex[0].direction).toBe("granted");
    expect(forAlex[0].counterpartName).toBe("Bea");

    const forBea = (await callerFor(bea).account.export()).lagerShares as {
      direction: string;
    }[];
    expect(forBea).toHaveLength(1);
    expect(forBea[0].direction).toBe("received");
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

  /**
   * Was Migration `0012` bleibend hergestellt haben muss.
   *
   * **Was dieser Test nicht abdeckt:** die Übertragung der Zeilen selbst. Sie
   * läuft in Produktion genau einmal, und `resetSchema()` spielt alle
   * Migrationen auf eine leere Datenbank – da gibt es nichts zu übertragen.
   * Dafür gibt es die Probe an echten Daten (Skript aus der 2.4.0-Prüfung: eine
   * Datenbank auf Stand `0011` mit Freundschaften auf allen drei Stufen und in
   * beiden Richtungen, dann nur `0012`). Geprüft wird hier der Zustand, den
   * `0012` hinterlässt – und der ist dauerhaft nachprüfbar.
   */
  it("hat die Freigabestufen aus `friendships` entfernt", async () => {
    const result = await db().execute<{ column_name: string }>(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'friendships'
        AND column_name ILIKE 'visibility%'
    `);
    expect(result.rows).toEqual([]);
  });

  it("hält je Lager und Empfänger höchstens eine Stufe", async () => {
    /*
      Ohne den Schlüssel könnten zwei Zeilen widersprechen, und welche gilt,
      entschiede die Sortierung – derselbe Fehler, den der Ausdrucks-Index bei
      `friendships` verhindert.
    */
    await befriend({ main: "full" });
    await expect(
      db().insert(schema.lagerShares).values({
        lagerId: alexLagerId,
        sharedWithUserId: bea.id,
        visibility: "search",
      })
    ).rejects.toThrow();
  });

  it("legt die Indizes der Freigabetabelle an", async () => {
    const result = await db().execute<{ indexname: string }>(sql`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = current_schema() AND tablename = 'lager_shares'
      ORDER BY indexname
    `);
    expect(result.rows.map(r => r.indexname)).toEqual([
      "lager_shares_lager_idx",
      "lager_shares_pkey",
      "lager_shares_recipient_idx",
      "lager_shares_unique",
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

  it("protokolliert Änderungen an Zugriffsrechten samt Lager", async () => {
    await befriend({ main: "search" });
    await callerFor(alex).friend.setLagerVisibility({
      friendId: bea.id,
      lagerId: alexLagerId,
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
    /*
      Die Lager-ID gehört dazu: Ohne sie beantwortet der Eintrag nicht, wer
      Zugriff auf **was** bekam – und das ist die Frage, für die das Protokoll
      da ist.
    */
    expect(rows[0].detail).toMatchObject({
      lagerId: alexLagerId,
      visibility: "full",
    });
  });

  it("protokolliert Ausleih-Anfragen nicht", async () => {
    // Sie sind Nutzung, nicht Sicherheit – siehe contracts/audit.ts.
    await befriend({ main: "search" });
    await callerFor(bea).friend.requestLoan({ materialId: alexMaterialId });
    await new Promise(resolve => setTimeout(resolve, 150));
    const rows = await db().select().from(schema.auditLog);
    expect(rows.filter(r => r.event.startsWith("loan"))).toEqual([]);
  });
});
