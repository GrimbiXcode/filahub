import { describe, expect, it } from "vitest";
import { visibilityAllows } from "@contracts/friends";
import {
  resolveShare,
  toFriendMaterial,
  type FriendMaterialRow,
} from "./queries/friends";

/**
 * Die zwei Stellen, an denen ein Fehler keine kaputte Ansicht, sondern eine
 * Datenpanne wäre: ob eine Freigabe gilt, und die Menge der Felder, die ein
 * Freund zu sehen bekommt. Beide sind bewusst als reine Funktionen gebaut,
 * damit sie ohne Datenbank prüfbar sind.
 */

describe("resolveShare", () => {
  it("gibt bei angenommener Freundschaft die freigegebene Stufe zurück", () => {
    for (const level of ["search", "full"] as const) {
      expect(
        resolveShare({ friendshipStatus: "accepted", shareVisibility: level })
      ).toBe(level);
    }
  });

  /**
   * **Der Riegel.** Freigabe und Freundschaft stehen in zwei Tabellen; die
   * Statusprüfung passiert bewusst hier und nicht im SQL. Verschiebt sie jemand
   * dorthin, behält eine abgelehnte oder offene Anfrage ihren Zugriff – und
   * dieser Test ist die einzige Stelle, an der das auffällt.
   */
  it("gibt ohne angenommene Freundschaft nichts frei", () => {
    for (const status of ["pending", "declined"] as const) {
      expect(
        resolveShare({ friendshipStatus: status, shareVisibility: "full" })
      ).toBe("none");
    }
  });

  /** Keine Freundschaftszeile – etwa nach dem Auflösen. */
  it("gibt ohne Freundschaft nichts frei", () => {
    expect(
      resolveShare({ friendshipStatus: null, shareVisibility: "full" })
    ).toBe("none");
    expect(
      resolveShare({ friendshipStatus: undefined, shareVisibility: "full" })
    ).toBe("none");
  });

  /*
    Die fehlende Zeile **ist** der Grundzustand: Es gibt keine `none`-Zeilen,
    wer zurücknimmt, löscht. Fiele das hier auf einen anderen Wert, wäre ein
    nicht freigegebenes Lager offen.
  */
  it("behandelt eine fehlende Freigabe als `none`", () => {
    expect(
      resolveShare({ friendshipStatus: "accepted", shareVisibility: null })
    ).toBe("none");
    expect(
      resolveShare({ friendshipStatus: "accepted", shareVisibility: undefined })
    ).toBe("none");
  });

  /*
    Eine ausdrücklich gespeicherte `none` gibt es nicht, sie darf aber auch
    nichts freigeben, falls doch eine Zeile existiert.
  */
  it("gibt bei Stufe `none` nichts frei", () => {
    expect(
      resolveShare({ friendshipStatus: "accepted", shareVisibility: "none" })
    ).toBe("none");
  });
});

describe("visibilityAllows", () => {
  it("lässt `full` für alles gelten", () => {
    expect(visibilityAllows("full", "search")).toBe(true);
    expect(visibilityAllows("full", "full")).toBe(true);
  });

  it("lässt `search` nicht als `full` durchgehen", () => {
    expect(visibilityAllows("search", "search")).toBe(true);
    expect(visibilityAllows("search", "full")).toBe(false);
  });

  it("lässt `none` nichts durch", () => {
    expect(visibilityAllows("none", "search")).toBe(false);
    expect(visibilityAllows("none", "full")).toBe(false);
  });
});

/** Fester Zeitpunkt der Wägung in den Fixtures – Verbräuche liegen davor oder danach. */
const WEIGHED_AT = new Date("2026-03-01T12:00:00Z");

/** Die Felder, die seit 4.0.0 am Material stehen – in den Fixtures flach überschreibbar */
type ProductOverrides = Partial<FriendMaterialRow["product"]>;

function materialRow(
  overrides: Partial<Omit<FriendMaterialRow, "product">> & ProductOverrides = {}
): FriendMaterialRow {
  const {
    name,
    materialType,
    manufacturer,
    color,
    texture,
    densityGramsPerLiter,
    ...rest
  } = overrides;
  const product: FriendMaterialRow["product"] = {
    name: "PolyTerra PLA Schwarz",
    materialType: "PLA",
    manufacturer: "Polymaker",
    color: "Schwarz",
    texture: null,
    densityGramsPerLiter: null,
  };
  const given: ProductOverrides = {
    name,
    materialType,
    manufacturer,
    color,
    texture,
    densityGramsPerLiter,
  };
  for (const key of Object.keys(given) as (keyof ProductOverrides)[]) {
    if (key in overrides) Object.assign(product, { [key]: given[key] });
  }
  return {
    id: 7,
    userId: 1,
    lagerId: 3,
    identifier: "P01",
    nominalWeight: 1000,
    product,
    containerType: { tareWeight: 140 },
    containerPresetVariant: null,
    storageBox: null,
    lager: { materialKind: "filament", filamentDiameterUm: 1750 },
    weighings: [],
    consumptions: [],
    ...rest,
  };
}

describe("toFriendMaterial", () => {
  /**
   * **Der wichtigste Test dieser Datei.**
   *
   * `FriendMaterial` ist handgeschrieben und nicht aus dem Schema abgeleitet,
   * damit eine neue Spalte in `materials` nicht von selbst bei Freunden landet.
   * Diese Zusicherung ist die Bremse dahinter: Wer ein Feld ergänzt, muss es
   * hier eintragen – und dabei einmal darüber nachdenken, ob es ein Freund
   * sehen darf.
   *
   * Verboten sind namentlich `priceCents` (Geldbeträge nie), `notes`
   * (Freitext), `purchaseDate` (Kaufverhalten), alles zur Lagerbox
   * (Ortsangabe), der Wägungsverlauf (Druckzeiten) – und seit 2.2.0 `lagerId`,
   * der Lagername (Freitext, kann einen Ort verraten) sowie die Dichte (steckt
   * in `secondary`).
   *
   * **Diese Liste ist in 2.4.0 unverändert geblieben**, obwohl das Lager dort
   * zur Einheit der Freigabe wurde. Das ist Absicht: Die Liste eines Freundes
   * bleibt flach, also braucht der Empfänger die Lager-Kennung nicht. Musste
   * dieser Test für eine Freigabe-Änderung angefasst werden, ist etwas an der
   * Projektion passiert, das dort nicht passieren sollte.
   *
   * **In 2.7.0 sind zwei Felder dazugekommen**, `colorHex` und `textureKind`.
   * Das war eine Entscheidung und kein Durchrutscher: Sie tragen keine neue
   * Auskunft, sondern die Darstellung von `color` und `texture`, die schon
   * hinausgehen. Aufgelöst wird dafür mit dem Katalog des **Besitzers** – mit
   * dem des Betrachters bekäme „Signalrot“ die Farbe, die *er* darunter
   * versteht.
   */
  it("gibt genau die erlaubten Felder heraus", () => {
    const result = toFriendMaterial(materialRow(), "Alex");
    expect(Object.keys(result).sort()).toEqual([
      "color",
      "colorHex",
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
      "textureKind",
    ]);
  });

  /*
    Aufgelöst wird mit dem Katalog des Besitzers, und ohne Katalog bleibt es
    beim mitgelieferten. Unbekannte Farbe heißt `null` – geraten wird nichts,
    sonst zeigte die Liste eines Freundes eine Farbe, die niemand hinterlegt
    hat.
  */
  it("löst Farbe und Oberfläche mit dem Katalog des Besitzers auf", () => {
    const eigene = toFriendMaterial(
      materialRow({ color: "Signalrot", texture: "Sparkle" }),
      "Alex",
      {
        colors: new Map([["signalrot", "#ff0000"]]),
        textures: new Map([["sparkle", "metallic"]]),
      }
    );
    expect(eigene.colorHex).toBe("#ff0000");
    expect(eigene.textureKind).toBe("metallic");

    const ohne = toFriendMaterial(
      materialRow({ color: "Signalrot", texture: "Sparkle" }),
      "Alex"
    );
    expect(ohne.colorHex).toBeNull();
    expect(ohne.textureKind).toBe("plain");
  });

  /*
    Die Zweitanzeige geht fertig gerechnet hinaus – die Angaben, aus denen sie
    entsteht, bleiben drinnen. Die Prüfung nagelt beides zugleich fest, weil
    ein durchgeschleiftes `lager`-Objekt sonst unbemerkt bliebe.
  */
  it("rechnet die Zweitanzeige, ohne Lager oder Dichte zu verraten", () => {
    const result = toFriendMaterial(
      materialRow({ densityGramsPerLiter: 1240 }),
      "Alex"
    );
    expect(result.secondary?.unit).toBe("m");
    expect(result.secondary?.value).toBeCloseTo(335.3, 0);
    expect(JSON.stringify(result)).not.toContain("lager");
    expect(JSON.stringify(result)).not.toContain("1240");
    // Auch nicht die bloße Kennung: Sie ist geladen (die Freigabe hängt daran),
    // darf aber nicht hinausgehen.
    expect(result).not.toHaveProperty("lagerId");
  });

  it("liefert bei der Materialart Pulver keine Zweitanzeige", () => {
    const result = toFriendMaterial(
      materialRow({
        lager: { materialKind: "powder", filamentDiameterUm: null },
      }),
      "Alex"
    );
    expect(result.secondary).toBeNull();
  });

  /**
   * Die Oberfläche ist Teil der Materialidentität wie die Farbe – und der
   * Grund, warum die Freundes-Suche auch auf sie prüft.
   */
  it("gibt die Oberfläche heraus", () => {
    const result = toFriendMaterial(materialRow({ texture: "Silk" }), "Alex");
    expect(result.texture).toBe("Silk");
  });

  it("nimmt ohne Wägung die Nennmenge an", () => {
    const result = toFriendMaterial(materialRow(), "Alex");
    expect(result.remainingWeight).toBe(1000);
    expect(result.remainingPercent).toBe(100);
  });

  it("rechnet die Restmenge aus der letzten Wägung", () => {
    const result = toFriendMaterial(
      materialRow({ weighings: [{ grossWeight: 640, weighedAt: WEIGHED_AT }] }),
      "Alex"
    );
    // 640 g brutto − 140 g Rollentara = 500 g Material
    expect(result.remainingWeight).toBe(500);
    expect(result.remainingPercent).toBe(50);
  });

  /*
    Die stille Fehlerquelle, um die es der Sache nach geht: Die Lagerbox ist für
    Freunde unsichtbar, ihr Leergewicht gehört aber in die Rechnung. Wer den
    Box-Join weglässt, „weil Freunde die Box nicht sehen dürfen“, meldet eine um
    das Boxgewicht zu hohe Restmenge – also genau die Zahl falsch, um die es in
    der ganzen Funktion geht.
  */
  it("zieht die Tara der Lagerbox ab, ohne sie herauszugeben", () => {
    const result = toFriendMaterial(
      materialRow({
        storageBox: { tareWeight: 800 },
        weighings: [{ grossWeight: 1440, weighedAt: WEIGHED_AT }],
      }),
      "Alex"
    );
    // 1440 g − 140 g Rolle − 800 g Box = 500 g Material
    expect(result.remainingWeight).toBe(500);
    expect(result).not.toHaveProperty("storageBox");
    expect(result).not.toHaveProperty("storageBoxId");
  });

  /*
    Seit 2.9.0 dieselbe stille Fehlerquelle ein zweites Mal: Verbräuche sind für
    Freunde unsichtbar, gehören aber in die Rechnung. Ohne sie meldete der
    Freund die Restmenge von vor dem letzten Druck.
  */
  it("zieht Verbräuche seit der letzten Wägung ab, ohne sie herauszugeben", () => {
    const result = toFriendMaterial(
      materialRow({
        storageBox: { tareWeight: 800 },
        weighings: [{ grossWeight: 1440, weighedAt: WEIGHED_AT }],
        consumptions: [
          // Vor der Wägung: von ihr überholt, zählt nicht.
          { weight: 300, consumedAt: new Date("2026-02-01T12:00:00Z") },
          { weight: 100, consumedAt: new Date("2026-03-02T12:00:00Z") },
        ],
      }),
      "Alex"
    );
    // 1440 g − 140 g Rolle − 800 g Box − 100 g seither = 400 g Material
    expect(result.remainingWeight).toBe(400);
    expect(result.remainingPercent).toBe(40);
    expect(result).not.toHaveProperty("consumptions");
    expect(result).not.toHaveProperty("consumedSinceWeighing");
  });

  it("bevorzugt die Preset-Variante vor dem eigenen Rollentyp", () => {
    const result = toFriendMaterial(
      materialRow({
        containerType: { tareWeight: 140 },
        containerPresetVariant: { tareWeight: 220 },
        weighings: [{ grossWeight: 720, weighedAt: WEIGHED_AT }],
      }),
      "Alex"
    );
    // 720 g − 220 g (Preset gewinnt, siehe resolveContainerTare) = 500 g
    expect(result.remainingWeight).toBe(500);
  });

  it("fällt nicht unter null", () => {
    const result = toFriendMaterial(
      materialRow({ weighings: [{ grossWeight: 100, weighedAt: WEIGHED_AT }] }),
      "Alex"
    );
    expect(result.remainingWeight).toBe(0);
    expect(result.remainingPercent).toBe(0);
  });

  it("liefert ohne Nennmenge keinen Prozentwert", () => {
    const result = toFriendMaterial(
      materialRow({
        nominalWeight: 0,
        weighings: [{ grossWeight: 500, weighedAt: WEIGHED_AT }],
      }),
      "Alex"
    );
    expect(result.remainingPercent).toBeNull();
  });
});

/**
 * Druckeinstellungen gehen vorerst nicht an Freunde (4.1.0). Sie stehen in
 * einer eigenen Tabelle, damit sie nur hinausgehen können, wenn jemand sie
 * **ausdrücklich** lädt. Diese Zusicherung ist der Riegel dagegen, dass das
 * nebenbei geschieht: Wer sie für Freunde freigeben will, ändert diesen Test
 * mit – und schreibt dazu eine eigene Projektion samt Freigabe je Lager
 * (siehe `docs/plan-material-gebinde-druckhistorie.md`, Phase 2).
 */
describe("Druckeinstellungen bei Freunden", () => {
  it("werden in den Freundes-Lesepfaden nicht geladen", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./queries/friends.ts", import.meta.url),
      "utf8"
    );
    expect(source).not.toMatch(/materialPrintSettings|material_print_settings/);
    expect(source).not.toMatch(/printSettings/);
  });
});
