import { describe, expect, it } from "vitest";
import { visibilityAllows, type FriendVisibility } from "@contracts/friends";
import {
  resolveVisibility,
  toFriendMaterial,
  type FriendMaterialRow,
} from "./queries/friends";

/**
 * Die zwei Stellen, an denen ein Fehler keine kaputte Ansicht, sondern eine
 * Datenpanne wäre: die Richtung einer Freundschaft und die Menge der Felder,
 * die ein Freund zu sehen bekommt. Beide sind bewusst als reine Funktionen
 * gebaut, damit sie ohne Datenbank prüfbar sind.
 */

type DirectionRow = {
  userId: number;
  friendUserId: number;
  status: "pending" | "accepted" | "declined";
  visibilityFromUser: FriendVisibility;
  visibilityFromFriend: FriendVisibility;
};

/** Benutzer 1 hat die Freundschaft angelegt, Benutzer 2 wurde angefragt. */
function row(overrides: Partial<DirectionRow> = {}): DirectionRow {
  return {
    userId: 1,
    friendUserId: 2,
    status: "accepted",
    visibilityFromUser: "full",
    visibilityFromFriend: "search",
    ...overrides,
  };
}

describe("resolveVisibility", () => {
  /*
    Der eigentliche Regressionstest. Die beiden Stufen sind absichtlich
    **verschieden**: Wären sie gleich, käme ein Vertauschen der Spalten durch
    jeden Test hindurch.
  */
  it("ordnet jede Richtung der richtigen Spalte zu", () => {
    // `visibilityFromUser` ist die Freigabe, die userId (=1) erteilt.
    // Sie gilt, wenn 1 der Besitzer ist und 2 hinschaut.
    expect(resolveVisibility(row(), 2, 1)).toBe("full");
    // Umgekehrt gilt `visibilityFromFriend`.
    expect(resolveVisibility(row(), 1, 2)).toBe("search");
  });

  it("gibt ohne angenommene Freundschaft nichts frei", () => {
    for (const status of ["pending", "declined"] as const) {
      expect(resolveVisibility(row({ status }), 2, 1)).toBe("none");
      expect(resolveVisibility(row({ status }), 1, 2)).toBe("none");
    }
  });

  it("gibt ohne Freundschaft nichts frei", () => {
    expect(resolveVisibility(null, 2, 1)).toBe("none");
    expect(resolveVisibility(undefined, 2, 1)).toBe("none");
  });

  /*
    Schutz gegen den Aufruf mit einer Zeile, die zu einem anderen Paar gehört.
    Ohne die letzte Rückgabe in `resolveVisibility` fiele der Fall auf die
    zuletzt geprüfte Bedingung – und gäbe eine fremde Freigabe zurück.
  */
  it("gibt nichts frei, wenn die Zeile zu einem anderen Paar gehört", () => {
    expect(resolveVisibility(row(), 3, 1)).toBe("none");
    expect(resolveVisibility(row(), 2, 3)).toBe("none");
    expect(resolveVisibility(row(), 3, 4)).toBe("none");
  });

  it("behandelt beide Seiten unabhängig", () => {
    const asymmetric = row({
      visibilityFromUser: "none",
      visibilityFromFriend: "full",
    });
    expect(resolveVisibility(asymmetric, 2, 1)).toBe("none");
    expect(resolveVisibility(asymmetric, 1, 2)).toBe("full");
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

function materialRow(
  overrides: Partial<FriendMaterialRow> = {}
): FriendMaterialRow {
  return {
    id: 7,
    userId: 1,
    name: "PolyTerra PLA Schwarz",
    identifier: "P01",
    materialType: "PLA",
    manufacturer: "Polymaker",
    color: "Schwarz",
    nominalWeight: 1000,
    spoolType: { tareWeight: 140 },
    spoolPresetVariant: null,
    storageBox: null,
    weighings: [],
    ...overrides,
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
   * (Ortsangabe) und der Wägungsverlauf (Druckzeiten).
   */
  it("gibt genau die erlaubten Felder heraus", () => {
    const result = toFriendMaterial(materialRow(), "Alex");
    expect(Object.keys(result).sort()).toEqual([
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
    ]);
  });

  it("nimmt ohne Wägung die Nennmenge an", () => {
    const result = toFriendMaterial(materialRow(), "Alex");
    expect(result.remainingWeight).toBe(1000);
    expect(result.remainingPercent).toBe(100);
  });

  it("rechnet die Restmenge aus der letzten Wägung", () => {
    const result = toFriendMaterial(
      materialRow({ weighings: [{ grossWeight: 640 }] }),
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
        weighings: [{ grossWeight: 1440 }],
      }),
      "Alex"
    );
    // 1440 g − 140 g Rolle − 800 g Box = 500 g Material
    expect(result.remainingWeight).toBe(500);
    expect(result).not.toHaveProperty("storageBox");
    expect(result).not.toHaveProperty("storageBoxId");
  });

  it("bevorzugt die Preset-Variante vor dem eigenen Rollentyp", () => {
    const result = toFriendMaterial(
      materialRow({
        spoolType: { tareWeight: 140 },
        spoolPresetVariant: { tareWeight: 220 },
        weighings: [{ grossWeight: 720 }],
      }),
      "Alex"
    );
    // 720 g − 220 g (Preset gewinnt, siehe resolveSpoolTare) = 500 g
    expect(result.remainingWeight).toBe(500);
  });

  it("fällt nicht unter null", () => {
    const result = toFriendMaterial(
      materialRow({ weighings: [{ grossWeight: 100 }] }),
      "Alex"
    );
    expect(result.remainingWeight).toBe(0);
    expect(result.remainingPercent).toBe(0);
  });

  it("liefert ohne Nennmenge keinen Prozentwert", () => {
    const result = toFriendMaterial(
      materialRow({ nominalWeight: 0, weighings: [{ grossWeight: 500 }] }),
      "Alex"
    );
    expect(result.remainingPercent).toBeNull();
  });
});
