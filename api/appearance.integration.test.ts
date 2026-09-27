/**
 * Eigene Farben und Oberflächen gegen eine echte PostgreSQL-Datenbank.
 *
 * Läuft nur mit `npm run test:integration` und gesetzter `TEST_DATABASE_URL`.
 *
 * Drei Dinge lassen sich nur hier prüfen: die **partiellen Unique-Indizes** je
 * Bereich (in Postgres sind NULL-Werte in einem Unique-Index voneinander
 * verschieden – der einfache Schlüssel hätte still durchgelassen, was hier
 * scheitern muss), die Mandantentrennung ohne Fremdschlüssel, und dass Löschen
 * dem Material nichts antut.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { deleteUserAccount } from "./queries/account";
import { getDb, migrateDb } from "./queries/connection";
import { upsertUser, findUserByUnionId } from "./queries/users";
import { TEXTURE_KINDS } from "@contracts/appearance";
import * as schema from "@db/schema";
import type { User } from "@db/schema";
import {
  callerFor,
  closeDb,
  migrateUntil,
  resetSchema,
} from "./test/integration-db";

const db = () => getDb();

const PERSONAL = { organizationId: null } as const;

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

describe("Eigene Farben", () => {
  it("legt an und liefert die Vergleichsform gleich mit", async () => {
    const created = await callerFor(anna).appearance.createColor({
      ...PERSONAL,
      name: "  Signal Rot ",
      hex: "#FF0000",
    });
    expect(created?.name).toBe("Signal Rot");
    // Getrimmt vom zod-Schema, kleingeschrieben von `normalizeHex`.
    expect(created?.hex).toBe("#ff0000");
    expect(created?.nameKey).toBe("signal rot");
  });

  it("nimmt die Kurzform eines Farbcodes an", async () => {
    const created = await callerFor(anna).appearance.createColor({
      ...PERSONAL,
      name: "Weiß",
      hex: "#FFF",
    });
    expect(created?.hex).toBe("#ffffff");
  });

  /*
    Der eigentliche Grund für die gespeicherte Vergleichsform: „Grün“ und
    „gruen“ sind zwei Namen, „Grün“ und „grun“ derselbe. Ohne den Index fände
    das niemand, bis zwei Einträge nebeneinanderstünden und die Auflösung
    zufällig einen von beiden nähme.
  */
  it("lässt denselben Namen kein zweites Mal zu", async () => {
    await callerFor(anna).appearance.createColor({
      ...PERSONAL,
      name: "Grün",
      hex: "#00ff00",
    });
    await expect(
      callerFor(anna).appearance.createColor({
        ...PERSONAL,
        name: "  GRUN  ",
        hex: "#00aa00",
      })
    ).rejects.toThrow(/bereits hinterlegt/);
  });

  /*
    Der zweite Weg in denselben Index: umbenennen statt anlegen. Eigene
    Fehlerbehandlung im Router, deshalb ein eigener Test – die erste Fassung
    unterschied sich zwischen beiden Pfaden.
  */
  it("lässt auch beim Umbenennen keinen doppelten Namen zu", async () => {
    await callerFor(anna).appearance.createColor({
      ...PERSONAL,
      name: "Grün",
      hex: "#00ff00",
    });
    const blau = await callerFor(anna).appearance.createColor({
      ...PERSONAL,
      name: "Blau",
      hex: "#0000ff",
    });
    await expect(
      callerFor(anna).appearance.updateColor({
        ...PERSONAL,
        id: blau!.id,
        name: "grun",
      })
    ).rejects.toThrow(/bereits hinterlegt/);
  });

  /**
   * Ein Name, dessen **Vergleichsform** die Spalte sprengt, muss an der
   * Eingabeprüfung scheitern – nicht an Postgres.
   *
   * Fünfundzwanzigmal „Weiß" sind hundert Zeichen und damit erlaubt; der
   * Schlüssel daraus hat hundertfünfundzwanzig. Vor der Prüfung lief das in
   * einen `22001`, den `asConflict` nicht kennt, also ging der Rohfehler samt
   * SQL-Text **und Parametern** hinaus. Der Test prüft deshalb nicht nur, dass
   * es scheitert, sondern **woran**.
   */
  it("lässt keinen Namen durch, dessen Vergleichsform zu lang wird", async () => {
    const name = "Weiß".repeat(25);
    const call = callerFor(anna).appearance.createColor({
      ...PERSONAL,
      name,
      hex: "#ffffff",
    });
    await expect(call).rejects.toThrow();
    await expect(call).rejects.not.toThrow(/insert into|params:/);
  });

  it("hält die Bestände zweier Menschen auseinander", async () => {
    await callerFor(anna).appearance.createColor({
      ...PERSONAL,
      name: "Signalrot",
      hex: "#ff0000",
    });
    // Derselbe Name bei jemand anderem ist kein Konflikt.
    await callerFor(bert).appearance.createColor({
      ...PERSONAL,
      name: "Signalrot",
      hex: "#0000ff",
    });

    const beiAnna = await callerFor(anna).appearance.list(PERSONAL);
    const beiBert = await callerFor(bert).appearance.list(PERSONAL);
    expect(beiAnna.colors.map(c => c.hex)).toEqual(["#ff0000"]);
    expect(beiBert.colors.map(c => c.hex)).toEqual(["#0000ff"]);
  });

  it("lässt niemanden eine fremde Farbe ändern oder löschen", async () => {
    const fremd = await callerFor(bert).appearance.createColor({
      ...PERSONAL,
      name: "Blau",
      hex: "#0000ff",
    });
    await expect(
      callerFor(anna).appearance.updateColor({
        ...PERSONAL,
        id: fremd!.id,
        hex: "#ff0000",
      })
    ).rejects.toThrow(/nicht gefunden/);

    /*
      Löschen meldet **kein** `NOT_FOUND`: Es trifft schlicht keine Zeile, weil
      der Bereichsfilter in der `WHERE`-Klausel steht. Geprüft wird deshalb die
      Wirkung, nicht die Meldung – die fremde Zeile muss stehen bleiben.
    */
    await callerFor(anna).appearance.deleteColor({
      ...PERSONAL,
      id: fremd!.id,
    });
    const beiBert = await callerFor(bert).appearance.list(PERSONAL);
    expect(beiBert.colors).toHaveLength(1);
  });
});

describe("Eigene Oberflächen", () => {
  it("ordnet einen eigenen Namen einem mitgelieferten Muster zu", async () => {
    const created = await callerFor(anna).appearance.createTexture({
      ...PERSONAL,
      name: "Sparkle",
      kind: "metallic",
    });
    expect(created?.kind).toBe("metallic");
    expect(created?.nameKey).toBe("sparkle");
  });

  it("lässt denselben Namen kein zweites Mal zu", async () => {
    await callerFor(anna).appearance.createTexture({
      ...PERSONAL,
      name: "Sparkle",
      kind: "metallic",
    });
    await expect(
      callerFor(anna).appearance.createTexture({
        ...PERSONAL,
        name: "sparkle",
        kind: "glossy",
      })
    ).rejects.toThrow(/bereits hinterlegt/);
  });
});

describe("Löschen", () => {
  /**
   * **Die Zusicherung hinter dem Entwurf:** Das Material trägt den Farbnamen
   * als Freitext, nicht als Verweis. Eine gelöschte Farbe darf ihm deshalb
   * nichts nehmen – es fällt nur die Darstellung auf das Rückfallfeld zurück.
   */
  it("lässt die Materialien unberührt", async () => {
    const lager = await callerFor(anna).lager.create({
      ...PERSONAL,
      name: "Filament",
      materialKind: "filament",
      filamentDiameterUm: 1750,
    });
    const material = await callerFor(anna).material.create({
      ...PERSONAL,
      lagerId: lager!.id,
      name: "PLA Signalrot",
      materialType: "PLA",
      color: "Signalrot",
      nominalWeight: 1000,
    });
    const color = await callerFor(anna).appearance.createColor({
      ...PERSONAL,
      name: "Signalrot",
      hex: "#ff0000",
    });

    const usage = await callerFor(anna).appearance.usage({
      ...PERSONAL,
      column: "color",
      name: "Signalrot",
    });
    expect(usage.count).toBe(1);

    await callerFor(anna).appearance.deleteColor({
      ...PERSONAL,
      id: color!.id,
    });

    // Die Farbe steht seit 4.0.0 am Material, nicht am Gebinde.
    const rows = await db()
      .select()
      .from(schema.materialProducts)
      .where(eq(schema.materialProducts.id, material.productId));
    expect(rows).toHaveLength(1);
    expect(rows[0].color).toBe("Signalrot");
  });
});

describe("Kontolöschung", () => {
  it("nimmt die eigenen Farben und Oberflächen mit", async () => {
    await callerFor(anna).appearance.createColor({
      ...PERSONAL,
      name: "Signalrot",
      hex: "#ff0000",
    });
    await callerFor(anna).appearance.createTexture({
      ...PERSONAL,
      name: "Sparkle",
      kind: "metallic",
    });
    await deleteUserAccount(anna.id);

    const colors = await db().select().from(schema.customColors);
    const textures = await db().select().from(schema.customTextures);
    expect(colors).toHaveLength(0);
    expect(textures).toHaveLength(0);
  });
});

describe("Musterarten seit 4.5.0", () => {
  it("nimmt die neuen Musterarten an", async () => {
    for (const kind of ["speckle", "sparkle", "marble", "satin", "fiber"]) {
      const created = await callerFor(anna).appearance.createTexture({
        ...PERSONAL,
        name: `Eigen ${kind}`,
        kind: kind as "speckle",
      });
      expect(created?.kind).toBe(kind);
    }
  });

  it("lehnt die alte Musterart „carbon“ ab", async () => {
    await expect(
      callerFor(anna).appearance.createTexture({
        ...PERSONAL,
        name: "Alt",
        kind: "carbon" as "fiber",
      })
    ).rejects.toThrow();
  });
});

/*
  `0026_texture_kinds.sql` ist von Hand geschrieben: drizzle-kit hätte den Typ
  gelöscht und neu angelegt, und der Rückguss wäre an jeder vorhandenen
  `carbon`-Zeile gescheitert. Geprüft wird deshalb genau der Fall, an dem die
  erzeugte Fassung zerbrochen wäre – eine eigene Oberfläche mit `carbon` im
  Altbestand –, und zwar über denselben Weg wie in Produktion (`migrateDb`
  wendet die ausstehende Migration an).
*/
describe("Migration 0026 – carbon wird fiber", () => {
  beforeEach(async () => {
    await migrateUntil(26);
  }, 60_000);

  afterAll(async () => {
    await resetSchema();
  }, 60_000);

  it("benennt vorhandene Zeilen um und kennt die neuen Werte", async () => {
    const user = await db().execute<{ id: string }>(sql`
      INSERT INTO "users" ("unionId", "name") VALUES ('alt-1', 'Alt')
      RETURNING "id"`);
    const userId = Number(user.rows[0].id);
    await db().execute(sql`
      INSERT INTO "custom_textures" ("userId", "name", "nameKey", "kind")
      VALUES (${userId}, 'Kohle', 'kohle', 'carbon'),
             (${userId}, 'Seide', 'seide', 'silk')`);

    await migrateDb();

    const rows = await db()
      .select({
        name: schema.customTextures.name,
        kind: schema.customTextures.kind,
      })
      .from(schema.customTextures)
      .orderBy(schema.customTextures.name);
    expect(rows).toEqual([
      { name: "Kohle", kind: "fiber" },
      { name: "Seide", kind: "silk" },
    ]);

    const values = await db().execute<{ value: string }>(sql`
      SELECT unnest(enum_range(NULL::texture_kind))::text AS value`);
    // Reihenfolge und Werte wie im Code – `ADD VALUE` hängt ans Ende an.
    expect(values.rows.map(row => row.value)).toEqual([...TEXTURE_KINDS]);
  });

  it("läuft auf einer leeren Datenbank durch", async () => {
    await migrateDb();
    const count = await db().execute<{ c: string }>(
      sql`SELECT count(*) AS c FROM "custom_textures"`
    );
    expect(count.rows[0].c).toBe("0");
  });
});

describe("Farbbild (seit 4.7.0)", () => {
  const dual = {
    schemaVersion: 1 as const,
    layout: "coextruded" as const,
    colors: [{ hex: "#c8a02c" }, { hex: "#b6bcc4" }, { hex: "#a45c33" }],
  };

  it("leitet die Leitfarbe aus dem Farbbild ab", async () => {
    const created = await callerFor(anna).appearance.createColor({
      ...PERSONAL,
      name: "Dreiklang",
      spec: dual,
    });
    expect(created?.hex).toBe("#c8a02c");
    expect(created?.spec?.colors).toHaveLength(3);

    const { colors } = await callerFor(anna).appearance.list(PERSONAL);
    expect(colors[0].spec?.layout).toBe("coextruded");
  });

  it("lehnt Farbcode und Farbbild zugleich ab, und keines von beiden", async () => {
    await expect(
      callerFor(anna).appearance.createColor({
        ...PERSONAL,
        name: "Doppelt",
        hex: "#ff0000",
        spec: dual,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      callerFor(anna).appearance.createColor({ ...PERSONAL, name: "Leer" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("lehnt ein Farbbild mit zu vielen Farben ab", async () => {
    await expect(
      callerFor(anna).appearance.createColor({
        ...PERSONAL,
        name: "Fünf",
        spec: {
          ...dual,
          colors: [...dual.colors, { hex: "#000000" }, { hex: "#ffffff" }],
        },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("speichert ein einfarbiges Farbbild als bloßen Farbcode", async () => {
    const created = await callerFor(anna).appearance.createColor({
      ...PERSONAL,
      name: "Nur eine",
      spec: { schemaVersion: 1, layout: "solid", colors: [{ hex: "#123456" }] },
    });
    expect(created?.hex).toBe("#123456");
    expect(created?.spec).toBeNull();
  });

  it("wechselt beim Ändern zwischen Farbbild und Farbcode", async () => {
    const created = await callerFor(anna).appearance.createColor({
      ...PERSONAL,
      name: "Wechsel",
      hex: "#111111",
    });
    const withSpec = await callerFor(anna).appearance.updateColor({
      ...PERSONAL,
      id: created!.id,
      spec: dual,
    });
    expect(withSpec.hex).toBe("#c8a02c");
    expect(withSpec.spec?.layout).toBe("coextruded");

    const backToHex = await callerFor(anna).appearance.updateColor({
      ...PERSONAL,
      id: created!.id,
      hex: "#222222",
    });
    expect(backToHex.hex).toBe("#222222");
    expect(backToHex.spec).toBeNull();

    // Nur umbenennen lässt Farbcode und Farbbild stehen.
    await callerFor(anna).appearance.updateColor({
      ...PERSONAL,
      id: created!.id,
      spec: dual,
    });
    const renamed = await callerFor(anna).appearance.updateColor({
      ...PERSONAL,
      id: created!.id,
      name: "Umbenannt",
    });
    expect(renamed.name).toBe("Umbenannt");
    expect(renamed.spec?.colors).toHaveLength(3);
  });

  it("liest ein kaputtes gespeichertes Farbbild als null", async () => {
    const created = await callerFor(anna).appearance.createColor({
      ...PERSONAL,
      name: "Kaputt",
      spec: dual,
    });
    await db()
      .update(schema.customColors)
      .set({ spec: { schemaVersion: 99 } })
      .where(eq(schema.customColors.id, created!.id));
    const { colors } = await callerFor(anna).appearance.list(PERSONAL);
    expect(colors.find(c => c.id === created!.id)?.spec).toBeNull();
    expect(colors.find(c => c.id === created!.id)?.hex).toBe("#c8a02c");
  });

  it("sieht die Farbbilder eines anderen Bereichs nicht", async () => {
    await callerFor(anna).appearance.createColor({
      ...PERSONAL,
      name: "Privat",
      spec: dual,
    });
    const { colors } = await callerFor(bert).appearance.list(PERSONAL);
    expect(colors).toHaveLength(0);
  });
});

describe("Wirkungen (seit 4.8.0)", () => {
  it("speichert eine einfarbige Farbe mit Wirkung als Farbbild", async () => {
    const created = await callerFor(anna).appearance.createColor({
      ...PERSONAL,
      name: "UV Weiß",
      spec: {
        schemaVersion: 1,
        layout: "solid",
        colors: [{ hex: "#f5f5f5" }],
        effects: [
          { kind: "photochromic", to: { hex: "#7b3fb8", name: "Violett" } },
          { kind: "thermochromic", to: { hex: "#ffffff" }, thresholdC: 31 },
        ],
      },
    });
    // Eine Farbe, aber mit Wirkung: kein bloßer Farbcode.
    expect(created?.spec?.effects.map(effect => effect.kind)).toEqual([
      "photochromic",
      "thermochromic",
    ]);
    expect(created?.hex).toBe("#f5f5f5");
  });

  it("lehnt eine Wirkung ohne Zielfarbe ab", async () => {
    await expect(
      callerFor(anna).appearance.createColor({
        ...PERSONAL,
        name: "UV ohne Ziel",
        spec: {
          schemaVersion: 1,
          layout: "solid",
          colors: [{ hex: "#f5f5f5" }],
          effects: [{ kind: "photochromic" }],
        },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
