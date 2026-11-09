import { describe, expect, it } from "vitest";
import {
  bulkGebindePatchSchema,
  hasBulkChanges,
  uniqueIds,
} from "@contracts/bulkEdit";

describe("bulkGebindePatchSchema", () => {
  it("nimmt die Felder des Gebindes, leer heißt leeren", () => {
    expect(
      bulkGebindePatchSchema.parse({
        priceCents: 2499,
        purchaseDate: null,
        nominalWeight: 1000,
        storageBoxId: null,
        archived: true,
      })
    ).toEqual({
      priceCents: 2499,
      purchaseDate: null,
      nominalWeight: 1000,
      storageBoxId: null,
      archived: true,
    });
  });

  /*
    Kennung und Lager gehen nur einzeln: Eine gemeinsame Kennung kollidierte
    am zweiten Gebinde, ein Umzug braucht die Prüfung je Material. Die Felder
    des Materials gelten schon für alle seine Gebinde.
  */
  it.each([
    ["identifier", "F01"],
    ["lagerId", 2],
    ["name", "PLA Schwarz"],
    ["containerTypeId", 3],
    ["notes", "x"],
  ])("lehnt %s ab", (key, value) => {
    expect(bulkGebindePatchSchema.safeParse({ [key]: value }).success).toBe(
      false
    );
  });

  it("prüft die Werte wie das Einzelformular", () => {
    expect(bulkGebindePatchSchema.safeParse({ priceCents: -1 }).success).toBe(
      false
    );
    expect(bulkGebindePatchSchema.safeParse({ nominalWeight: 0 }).success).toBe(
      false
    );
    expect(
      bulkGebindePatchSchema.safeParse({ nominalWeight: null }).success
    ).toBe(false);
    expect(
      bulkGebindePatchSchema.safeParse({ purchaseDate: "1.2.2026" }).success
    ).toBe(false);
  });
});

describe("hasBulkChanges", () => {
  it("ist nur mit mindestens einem gesetzten Feld wahr", () => {
    expect(hasBulkChanges({})).toBe(false);
    expect(hasBulkChanges({ priceCents: undefined })).toBe(false);
    // `null` ist eine Änderung: leeren
    expect(hasBulkChanges({ priceCents: null })).toBe(true);
    expect(hasBulkChanges({ archived: false })).toBe(true);
  });
});

describe("uniqueIds", () => {
  it("entfernt Dubletten und behält die Reihenfolge", () => {
    expect(uniqueIds([3, 1, 3, 2, 1])).toEqual([3, 1, 2]);
  });
});
