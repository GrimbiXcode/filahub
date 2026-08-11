import { describe, expect, it } from "vitest";
import {
  manufacturerFieldsSchema,
  materialTypesSchema,
  proposalChangePayloadSchema,
  proposalNewPayloadSchema,
  seriesFieldsSchema,
  slugSchema,
  variantFieldsSchema,
  versionFieldsSchema,
} from "@contracts/presets";

const validVariant = {
  nominalWeight: 1000,
  tareWeight: 140,
  outerDiameterMm: 200,
  widthMm: 66,
  boreDiameterMm: 55,
};

describe("slugSchema", () => {
  it("akzeptiert Kleinbuchstaben, Ziffern und Bindestriche", () => {
    expect(slugSchema.safeParse("polyterra-pla-1kg").success).toBe(true);
  });

  it("lehnt Großbuchstaben und Leerzeichen ab", () => {
    expect(slugSchema.safeParse("PolyTerra").success).toBe(false);
    expect(slugSchema.safeParse("poly terra").success).toBe(false);
  });
});

describe("materialTypesSchema", () => {
  it("vereinheitlicht die Schreibweise", () => {
    const result = materialTypesSchema.parse([" pla ", "petg"]);
    expect(result).toEqual(["PLA", "PETG"]);
  });

  it("erlaubt höchstens 20 Einträge", () => {
    expect(materialTypesSchema.safeParse(Array(21).fill("PLA")).success).toBe(
      false
    );
  });
});

describe("manufacturerFieldsSchema", () => {
  it("verlangt einen Namen", () => {
    const result = manufacturerFieldsSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Herstellername ist erforderlich"
    );
  });

  it("lehnt eine ungültige URL ab", () => {
    const result = manufacturerFieldsSchema.safeParse({
      name: "Polymaker",
      website: "keine-url",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Bitte eine gültige URL angeben"
    );
  });
});

describe("seriesFieldsSchema", () => {
  it("setzt Materialarten standardmäßig auf leer", () => {
    const result = seriesFieldsSchema.parse({ name: "PolyTerra PLA" });
    expect(result.materialTypes).toEqual([]);
  });
});

describe("versionFieldsSchema", () => {
  it("akzeptiert einen gültigen Zeitraum", () => {
    expect(
      versionFieldsSchema.safeParse({
        name: "Kartonspule",
        validFrom: "2021-01-01",
        validTo: "2023-12-31",
      }).success
    ).toBe(true);
  });

  it("lehnt ein Gültigkeitsende vor dem Beginn ab", () => {
    const result = versionFieldsSchema.safeParse({
      name: "Kartonspule",
      validFrom: "2023-01-01",
      validTo: "2021-12-31",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "„Gültig ab“ muss vor „Gültig bis“ liegen"
    );
    expect(result.error?.issues[0]?.path).toEqual(["validTo"]);
  });

  it("lehnt ein falsches Datumsformat ab", () => {
    expect(
      versionFieldsSchema.safeParse({ name: "X", validFrom: "01.01.2021" })
        .success
    ).toBe(false);
  });
});

describe("variantFieldsSchema", () => {
  it("akzeptiert plausible Werte", () => {
    expect(variantFieldsSchema.safeParse(validVariant).success).toBe(true);
  });

  it("lehnt ein Nenngewicht <= 0 ab", () => {
    const result = variantFieldsSchema.safeParse({
      ...validVariant,
      nominalWeight: 0,
    });
    expect(result.success).toBe(false);
  });

  it("lehnt ein Leergewicht >= Nenngewicht ab", () => {
    const result = variantFieldsSchema.safeParse({
      ...validVariant,
      tareWeight: 1000,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Das Leergewicht muss kleiner als das Nenngewicht sein"
    );
  });

  it("lehnt eine Bohrung >= Außendurchmesser ab", () => {
    const result = variantFieldsSchema.safeParse({
      ...validVariant,
      boreDiameterMm: 200,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Die Bohrung muss kleiner als der Außendurchmesser sein"
    );
  });

  it("erlaubt fehlende Abmessungen", () => {
    expect(
      variantFieldsSchema.safeParse({ nominalWeight: 1000, tareWeight: 140 })
        .success
    ).toBe(true);
  });
});

describe("proposalNewPayloadSchema", () => {
  const payload = {
    kind: "new",
    manufacturer: { name: "Sunlu" },
    series: { name: "PLA Meta", materialTypes: ["pla"] },
    version: { name: "Kunststoffspule", containerMaterial: "kunststoff" },
    variant: { nominalWeight: 1000, tareWeight: 178 },
  };

  it("akzeptiert einen vollständigen Pfad und normalisiert Materialarten", () => {
    const result = proposalNewPayloadSchema.parse(payload);
    expect(result.series.materialTypes).toEqual(["PLA"]);
  });

  it("verlangt einen Herstellernamen", () => {
    const result = proposalNewPayloadSchema.safeParse({
      ...payload,
      manufacturer: { name: "" },
    });
    expect(result.success).toBe(false);
  });

  it("lehnt ein unbekanntes Spulenmaterial ab", () => {
    const result = proposalNewPayloadSchema.safeParse({
      ...payload,
      version: { name: "X", containerMaterial: "holz" },
    });
    expect(result.success).toBe(false);
  });
});

describe("proposalChangePayloadSchema", () => {
  it("akzeptiert einen Teil-Patch je Ebene", () => {
    expect(
      proposalChangePayloadSchema.safeParse({
        kind: "change",
        scope: "variant",
        patch: { tareWeight: 138 },
      }).success
    ).toBe(true);
    expect(
      proposalChangePayloadSchema.safeParse({
        kind: "change",
        scope: "manufacturer",
        patch: { name: "Polymaker Ltd." },
      }).success
    ).toBe(true);
  });

  it("lehnt einen leeren Patch ab", () => {
    const result = proposalChangePayloadSchema.safeParse({
      kind: "change",
      scope: "variant",
      patch: {},
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Der Vorschlag enthält keine Änderungen"
    );
  });

  it("lehnt eine unbekannte Ebene ab", () => {
    expect(
      proposalChangePayloadSchema.safeParse({
        kind: "change",
        scope: "farbe",
        patch: { name: "X" },
      }).success
    ).toBe(false);
  });
});
