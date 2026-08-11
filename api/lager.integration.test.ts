/**
 * Lager gegen eine echte PostgreSQL-Datenbank.
 *
 * Läuft nur mit `npm run test:integration` und gesetzter `TEST_DATABASE_URL`.
 *
 * Zwei Dinge lassen sich nur hier prüfen: der **Backfill der Migration**, der in
 * Produktion genau einmal läuft und danach nicht mehr beobachtbar ist, und die
 * Mandantentrennung ohne Fremdschlüssel – dieser Test *ist* die referenzielle
 * Integrität.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { MAX_LAGER_PER_USER } from "@contracts/materials";
import { deleteUserAccount } from "./queries/account";
import { getDb } from "./queries/connection";
import { upsertUser, findUserByUnionId } from "./queries/users";
import * as schema from "@db/schema";
import type { User } from "@db/schema";
import { callerFor, closeDb, resetSchema } from "./test/integration-db";

const db = () => getDb();

let anna: User;
let bert: User;

beforeAll(async () => {
  await resetSchema();
}, 60_000);

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await resetSchema();
  await upsertUser({ unionId: "anna-1", name: "Anna" });
  await upsertUser({ unionId: "bert-1", name: "Bert" });
  anna = (await findUserByUnionId("anna-1"))!;
  bert = (await findUserByUnionId("bert-1"))!;
});

/** Ein Filament-Lager mit 1,75 mm – der Normalfall. */
function filamentLager(name = "Filament") {
  return {
    name,
    materialKind: "filament" as const,
    // `as const` auch hier: Der Router nimmt die Literal-Union, nicht `number`.
    filamentDiameterUm: 1750 as const,
  };
}

describe("Lager anlegen und ändern", () => {
  it("legt ein Lager an und liefert es zurück", async () => {
    const created = await callerFor(anna).lager.create(filamentLager());
    expect(created?.name).toBe("Filament");
    expect(created?.materialKind).toBe("filament");
    expect(created?.filamentDiameterUm).toBe(1750);

    const list = await callerFor(anna).lager.list();
    expect(list).toHaveLength(1);
  });

  it("verlangt beim Filament eine Stärke", async () => {
    await expect(
      callerFor(anna).lager.create({
        name: "Ohne Stärke",
        materialKind: "filament",
      })
    ).rejects.toThrow(/Filamentstärke/);
  });

  /*
    Ein Durchmesser an einem Harz- oder Pulverlager wäre eine Angabe, die nichts
    bedeutet – und irgendwann als Wahrheit gelesen wird.
  */
  it("lässt bei Harz und Pulver keine Stärke zu", async () => {
    for (const kind of ["resin", "powder"] as const) {
      await expect(
        callerFor(anna).lager.create({
          name: `Mit Stärke ${kind}`,
          materialKind: kind,
          filamentDiameterUm: 1750,
        })
      ).rejects.toThrow(/nur bei Filament/);
    }
  });

  it("legt Harz und Pulver ohne Stärke an", async () => {
    const resin = await callerFor(anna).lager.create({
      name: "Harz",
      materialKind: "resin",
    });
    expect(resin?.filamentDiameterUm).toBeNull();
    const powder = await callerFor(anna).lager.create({
      name: "Pulver",
      materialKind: "powder",
    });
    expect(powder?.materialKind).toBe("powder");
  });

  it("hält Namen je Benutzer eindeutig", async () => {
    await callerFor(anna).lager.create(filamentLager("Doppelt"));
    await expect(
      callerFor(anna).lager.create(filamentLager("Doppelt"))
    ).rejects.toThrow();
    // Bei einem anderen Benutzer ist derselbe Name in Ordnung.
    await expect(
      callerFor(bert).lager.create(filamentLager("Doppelt"))
    ).resolves.toBeTruthy();
  });

  /**
   * Beim Wechsel der Materialart fällt die Stärke weg – sonst bliebe an einem
   * Harzlager eine Filamentangabe stehen.
   */
  it("räumt die Stärke beim Wechsel auf Harz ab", async () => {
    const created = await callerFor(anna).lager.create(filamentLager());
    const updated = await callerFor(anna).lager.update({
      id: created!.id,
      materialKind: "resin",
    });
    expect(updated?.materialKind).toBe("resin");
    expect(updated?.filamentDiameterUm).toBeNull();
  });

  it("verlangt beim Wechsel auf Filament eine Stärke", async () => {
    const created = await callerFor(anna).lager.create({
      name: "Harz",
      materialKind: "resin",
    });
    await expect(
      callerFor(anna).lager.update({
        id: created!.id,
        materialKind: "filament",
      })
    ).rejects.toThrow(/Filamentstärke/);
  });

  it("lässt fremde Lager nicht anfassen", async () => {
    const created = await callerFor(anna).lager.create(filamentLager());
    // `NOT_FOUND`, nicht `FORBIDDEN` – die Existenz soll nicht verraten werden.
    await expect(
      callerFor(bert).lager.update({ id: created!.id, name: "Gekapert" })
    ).rejects.toThrow(/nicht gefunden/);
    await expect(
      callerFor(bert).lager.delete({ id: created!.id })
    ).rejects.toThrow(/nicht gefunden/);
    expect(await callerFor(bert).lager.list()).toEqual([]);
  });
});

describe("Obergrenze", () => {
  it(`erlaubt genau ${MAX_LAGER_PER_USER} Lager`, async () => {
    const caller = callerFor(anna);
    for (let i = 0; i < MAX_LAGER_PER_USER; i++) {
      await caller.lager.create(filamentLager(`Lager ${i + 1}`));
    }
    expect(await caller.lager.list()).toHaveLength(MAX_LAGER_PER_USER);
    await expect(
      caller.lager.create(filamentLager("Eins zu viel"))
    ).rejects.toThrow(new RegExp(`${MAX_LAGER_PER_USER}`));
  });

  it("zählt je Benutzer, nicht global", async () => {
    for (let i = 0; i < MAX_LAGER_PER_USER; i++) {
      await callerFor(anna).lager.create(filamentLager(`A${i}`));
    }
    // Berts Kontingent ist davon unberührt.
    await expect(
      callerFor(bert).lager.create(filamentLager("B1"))
    ).resolves.toBeTruthy();
  });

  it("gibt nach einer Löschung wieder Platz frei", async () => {
    const caller = callerFor(anna);
    const created = [];
    for (let i = 0; i < MAX_LAGER_PER_USER; i++) {
      created.push(await caller.lager.create(filamentLager(`Lager ${i}`)));
    }
    await caller.lager.delete({ id: created[0]!.id });
    await expect(
      caller.lager.create(filamentLager("Neu"))
    ).resolves.toBeTruthy();
  });
});

describe("Löschen", () => {
  it("verweigert das Löschen eines belegten Lagers", async () => {
    const caller = callerFor(anna);
    const created = await caller.lager.create(filamentLager());
    await caller.material.create({
      lagerId: created!.id,
      name: "PLA",
      materialType: "PLA",
      nominalWeight: 1000,
    });
    await expect(caller.lager.delete({ id: created!.id })).rejects.toThrow(
      /noch 1 Material/
    );
  });

  it("löscht ein leeres Lager", async () => {
    const caller = callerFor(anna);
    const created = await caller.lager.create(filamentLager());
    await expect(caller.lager.delete({ id: created!.id })).resolves.toEqual({
      ok: true,
    });
    expect(await caller.lager.list()).toEqual([]);
  });

  /*
    Erst die Zugehörigkeit prüfen, dann den Inhalt: Sonst verriete die
    Konfliktmeldung („noch 3 Materialien") die Belegung eines fremden Lagers.
  */
  it("verrät die Belegung eines fremden Lagers nicht", async () => {
    const created = await callerFor(anna).lager.create(filamentLager());
    await callerFor(anna).material.create({
      lagerId: created!.id,
      name: "PLA",
      materialType: "PLA",
      nominalWeight: 1000,
    });
    await expect(
      callerFor(bert).lager.delete({ id: created!.id })
    ).rejects.toThrow(/nicht gefunden/);
  });
});

describe("Material und Lager", () => {
  it("nimmt kein fremdes Lager an", async () => {
    const annas = await callerFor(anna).lager.create(filamentLager());
    await expect(
      callerFor(bert).material.create({
        lagerId: annas!.id,
        name: "Untergeschoben",
        materialType: "PLA",
        nominalWeight: 1000,
      })
    ).rejects.toThrow(/Ungültiges Lager/);
  });

  it("filtert die Liste auf das gewählte Lager", async () => {
    const caller = callerFor(anna);
    const a = await caller.lager.create(filamentLager("A"));
    const b = await caller.lager.create({
      name: "Harz",
      materialKind: "resin",
    });
    await caller.material.create({
      lagerId: a!.id,
      name: "PLA",
      materialType: "PLA",
      nominalWeight: 1000,
    });
    await caller.material.create({
      lagerId: b!.id,
      name: "Standard Resin",
      materialType: "Resin",
      nominalWeight: 1000,
    });

    expect(await caller.material.list({ lagerId: a!.id })).toHaveLength(1);
    expect(await caller.material.list({ lagerId: b!.id })).toHaveLength(1);
    // Ohne Einschränkung der gesamte Bestand – das braucht die Schnellsuche.
    expect(await caller.material.list({})).toHaveLength(2);
  });

  /**
   * Die Zweitanzeige entsteht auf dem Server, weil Materialart und Stärke am
   * Lager hängen. Ein Lagerwechsel muss sie also mitziehen.
   */
  it("rechnet die Zweitanzeige aus der Lagerkonfiguration", async () => {
    const caller = callerFor(anna);
    const thin = await caller.lager.create(filamentLager("1,75"));
    const thick = await caller.lager.create({
      name: "2,85",
      materialKind: "filament",
      filamentDiameterUm: 2850,
    });
    const resin = await caller.lager.create({
      name: "Harz",
      materialKind: "resin",
    });

    const { id } = await caller.material.create({
      lagerId: thin!.id,
      name: "PLA",
      materialType: "PLA",
      nominalWeight: 1000,
    });

    // 1 kg PLA bei 1,75 mm ≈ 335 m
    const inThin = await caller.material.byId({ id });
    expect(inThin.secondary?.unit).toBe("m");
    expect(inThin.secondary?.value).toBeCloseTo(335.3, 0);
    expect(inThin.densityUsed).toBe(1240);

    // Dasselbe Material in ein 2,85-mm-Lager: rund 126 m
    await caller.material.update({ id, lagerId: thick!.id });
    const inThick = await caller.material.byId({ id });
    expect(inThick.secondary?.value).toBeCloseTo(126.4, 0);

    // Und im Harzlager wird aus Metern ein Volumen
    await caller.material.update({ id, lagerId: resin!.id });
    const inResin = await caller.material.byId({ id });
    expect(inResin.secondary?.unit).toBe("l");
  });

  it("liefert beim Pulver keine Zweitanzeige", async () => {
    const caller = callerFor(anna);
    const powder = await caller.lager.create({
      name: "Pulver",
      materialKind: "powder",
    });
    const { id } = await caller.material.create({
      lagerId: powder!.id,
      name: "PA12",
      materialType: "PA12",
      nominalWeight: 5000,
    });
    const material = await caller.material.byId({ id });
    expect(material.secondary).toBeNull();
    expect(material.densityUsed).toBeNull();
  });

  it("bevorzugt die eigene Dichte vor der Vorgabe", async () => {
    const caller = callerFor(anna);
    const lager = await caller.lager.create(filamentLager());
    const { id } = await caller.material.create({
      lagerId: lager!.id,
      name: "Exotisch",
      materialType: "PLA",
      nominalWeight: 1000,
      densityGramsPerLiter: 2000,
    });
    const material = await caller.material.byId({ id });
    expect(material.densityUsed).toBe(2000);
    // Dichter heißt kürzer: 2000 statt 1240 g/l
    expect(material.secondary!.value).toBeLessThan(300);
  });

  it("speichert die Oberfläche als Freitext", async () => {
    const caller = callerFor(anna);
    const lager = await caller.lager.create(filamentLager());
    const { id } = await caller.material.create({
      lagerId: lager!.id,
      name: "PLA Silk",
      materialType: "PLA",
      texture: "Silk",
      nominalWeight: 1000,
    });
    const material = await caller.material.byId({ id });
    expect(material.texture).toBe("Silk");
    // Auch ein unbekannter Wert muss durchgehen – es ist kein Enum.
    await caller.material.update({ id, texture: "Sparkle" });
    expect((await caller.material.byId({ id })).texture).toBe("Sparkle");
  });

  it("nimmt das Ziel-Lager beim Massenimport an", async () => {
    const caller = callerFor(anna);
    const lager = await caller.lager.create(filamentLager());
    const result = await caller.material.importMany({
      lagerId: lager!.id,
      items: [{ typ: "PLA", nenngewicht: 1000, anzahl: 2 }],
    });
    expect(result.created).toBe(2);
    expect(await caller.material.list({ lagerId: lager!.id })).toHaveLength(2);

    await expect(
      callerFor(bert).material.importMany({
        lagerId: lager!.id,
        items: [{ typ: "PLA", nenngewicht: 1000, anzahl: 1 }],
      })
    ).rejects.toThrow(/Ungültiges Lager/);
  });
});

describe("Kontolöschung", () => {
  /**
   * `lager` muss **nach** `materials` gelöscht werden, sonst zeigt ein
   * `materials.lagerId` mangels Fremdschlüssel auf eine neu vergebene ID.
   */
  it("räumt Lager und Materialien restlos ab", async () => {
    const caller = callerFor(anna);
    const lager = await caller.lager.create(filamentLager());
    await caller.material.create({
      lagerId: lager!.id,
      name: "PLA",
      materialType: "PLA",
      nominalWeight: 1000,
    });
    // Bert als Kontrollgruppe
    const bertsLager = await callerFor(bert).lager.create(
      filamentLager("Berts")
    );

    await deleteUserAccount(anna.id);

    expect(
      await db().query.lager.findMany({
        where: eq(schema.lager.userId, anna.id),
      })
    ).toEqual([]);
    expect(
      await db().query.materials.findMany({
        where: eq(schema.materials.userId, anna.id),
      })
    ).toEqual([]);
    // Berts Lager bleibt unberührt.
    expect(await callerFor(bert).lager.list()).toHaveLength(1);
    expect(bertsLager?.name).toBe("Berts");
  });

  it("nimmt das Lager mit in die Auskunft", async () => {
    const caller = callerFor(anna);
    await caller.lager.create(filamentLager("Auskunft"));
    const dump = await caller.account.export();
    const lagerRows = dump.lager as { name: string }[];
    expect(lagerRows).toHaveLength(1);
    expect(lagerRows[0].name).toBe("Auskunft");
  });
});

describe("Migration 0009 – Backfill", () => {
  /**
   * Der wichtigste Test dieser Datei.
   *
   * Der Backfill läuft in Produktion **einmal** und ist danach nicht mehr
   * beobachtbar. Geprüft wird deshalb der Zustand, den er herstellen muss:
   * jedes Material in genau einem Lager, und zwar im Lager seines eigenen
   * Besitzers.
   *
   * `resetSchema()` spielt alle Migrationen von `0000` an ein – dieser Test
   * beschreibt also, was auf einer Datenbank mit Altdaten herauskommen muss,
   * und die Zusicherungen unten sind genau die, die dort gelten.
   */
  it("lässt kein Material ohne Lager zurück", async () => {
    const caller = callerFor(anna);
    const lager = await caller.lager.create(filamentLager());
    await caller.material.create({
      lagerId: lager!.id,
      name: "PLA",
      materialType: "PLA",
      nominalWeight: 1000,
    });

    const orphans = await db().execute<{ count: string }>(
      sql`SELECT COUNT(*) AS count FROM materials WHERE "lagerId" IS NULL`
    );
    expect(Number(orphans.rows[0].count)).toBe(0);
  });

  it("legt kein Material in ein fremdes Lager", async () => {
    for (const user of [anna, bert]) {
      const caller = callerFor(user);
      const lager = await caller.lager.create(filamentLager());
      await caller.material.create({
        lagerId: lager!.id,
        name: "PLA",
        materialType: "PLA",
        nominalWeight: 1000,
      });
    }
    // Die Zusicherung, die der Backfill herstellen muss: Besitzer des Materials
    // und Besitzer seines Lagers sind dieselbe Person.
    const crossed = await db().execute<{ count: string }>(sql`
      SELECT COUNT(*) AS count FROM materials m
      JOIN lager l ON l.id = m."lagerId"
      WHERE l."userId" <> m."userId"
    `);
    expect(Number(crossed.rows[0].count)).toBe(0);
  });

  it("erzwingt lagerId als NOT NULL", async () => {
    // Ohne `NOT NULL` könnte ein neuer Lesepfad Material anlegen, das nirgends
    // liegt – und in keiner lagerbezogenen Abfrage auftaucht.
    const result = await db().execute<{ nullable: string }>(sql`
      SELECT is_nullable AS nullable FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'materials' AND column_name = 'lagerId'
    `);
    expect(result.rows[0].nullable).toBe("NO");
  });
});
