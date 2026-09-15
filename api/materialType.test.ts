import { describe, expect, it } from "vitest";
import {
  COMMON_MATERIAL_TYPES,
  canonicalMaterialType,
  normalizeMaterialType,
} from "@contracts/materials";

/**
 * Die Regel, nach der zwei Materialarten **dieselbe** sind – und welche
 * Schreibweise dann gespeichert wird. Server und Formular rufen dieselbe
 * Funktion auf; die SQL-Fassung derselben Rangfolge in
 * `0019_material_type_case.sql` prüft `api/materialType.integration.test.ts`.
 */

describe("normalizeMaterialType", () => {
  it("vereinheitlicht Schreibweise und Leerzeichen", () => {
    expect(normalizeMaterialType("  pla+ ")).toBe("PLA+");
    expect(normalizeMaterialType("pla   silk")).toBe("PLA SILK");
  });

  it("macht aus „Pla“ und „PLA“ dieselbe Materialart", () => {
    expect(normalizeMaterialType("Pla")).toBe(normalizeMaterialType("PLA"));
    expect(normalizeMaterialType("pa (nylon)")).toBe(
      normalizeMaterialType("PA (Nylon)")
    );
  });
});

describe("canonicalMaterialType", () => {
  it("nimmt die Schreibweise der Vorschlagsliste", () => {
    expect(canonicalMaterialType("pla", COMMON_MATERIAL_TYPES)).toBe("PLA");
    expect(canonicalMaterialType(" Petg ", COMMON_MATERIAL_TYPES)).toBe("PETG");
    expect(canonicalMaterialType("pa  (nylon)", COMMON_MATERIAL_TYPES)).toBe(
      "PA (Nylon)"
    );
  });

  it("nimmt sonst die Schreibweise aus dem Bestand", () => {
    expect(canonicalMaterialType("nylon", ["Nylon"])).toBe("Nylon");
    expect(canonicalMaterialType("NYLON", ["Nylon"])).toBe("Nylon");
  });

  it("lässt die erste Übereinstimmung gewinnen", () => {
    /*
      So reiht der Server die Quellen auf: Vorschlagsliste, dann Bestand. Ein
      „Pla“ im Bestand – wie es vor der Migration stand – zieht damit nicht
      an der Liste vorbei.
    */
    expect(
      canonicalMaterialType("pla", [...COMMON_MATERIAL_TYPES, "Pla"])
    ).toBe("PLA");
    expect(canonicalMaterialType("wood", ["Wood", "WOOD"])).toBe("Wood");
  });

  it("behält eine neue Materialart, wie sie getippt wurde", () => {
    expect(canonicalMaterialType("Wood", COMMON_MATERIAL_TYPES)).toBe("Wood");
    // Nur Leerraum wird bereinigt – die Groß-/Kleinschreibung bleibt.
    expect(canonicalMaterialType("  pla   silk ", [])).toBe("pla silk");
  });

  it("macht aus nichts nichts", () => {
    expect(canonicalMaterialType("   ", COMMON_MATERIAL_TYPES)).toBe("");
  });
});

describe("COMMON_MATERIAL_TYPES", () => {
  it("führt je Vergleichsform nur eine Schreibweise", () => {
    // Zwei Einträge mit derselben Vergleichsform hießen: Welche gewinnt,
    // hinge an der Reihenfolge der Liste.
    const keys = COMMON_MATERIAL_TYPES.map(normalizeMaterialType);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
