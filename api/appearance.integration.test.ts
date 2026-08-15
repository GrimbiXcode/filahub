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
import { eq } from "drizzle-orm";
import { deleteUserAccount } from "./queries/account";
import { getDb } from "./queries/connection";
import { upsertUser, findUserByUnionId } from "./queries/users";
import * as schema from "@db/schema";
import type { User } from "@db/schema";
import { callerFor, closeDb, resetSchema } from "./test/integration-db";

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

    const rows = await db()
      .select()
      .from(schema.materials)
      .where(eq(schema.materials.id, material.id));
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
