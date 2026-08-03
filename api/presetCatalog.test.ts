import { describe, expect, it } from "vitest";
import { slugSchema, variantFieldsSchema } from "@contracts/presets";
import { PRESET_SEED_REVISION, presetSeedCatalog } from "@db/presets/catalog";
import { seedAction } from "./queries/presetSeed";

/**
 * Prüft die Daten des Startkatalogs ohne Datenbank. Fängt genau die Fehler,
 * die sonst erst nach dem Deploy in echten Nutzerdaten auffallen würden.
 */
describe("Startkatalog", () => {
  it("enthält Einträge", () => {
    expect(presetSeedCatalog.length).toBeGreaterThan(0);
  });

  it("hat eindeutige Hersteller-Schlüssel", () => {
    const slugs = presetSeedCatalog.map(m => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("hat je Hersteller eindeutige Serien-Schlüssel", () => {
    for (const manufacturer of presetSeedCatalog) {
      const slugs = manufacturer.series.map(s => s.slug);
      expect(new Set(slugs).size, `Serien von ${manufacturer.slug}`).toBe(
        slugs.length
      );
    }
  });

  it("hat je Serie eindeutige Versions-Schlüssel", () => {
    for (const manufacturer of presetSeedCatalog) {
      for (const series of manufacturer.series) {
        const slugs = series.versions.map(v => v.slug);
        expect(new Set(slugs).size, `Ausführungen von ${series.slug}`).toBe(
          slugs.length
        );
      }
    }
  });

  it("hat je Ausführung höchstens eine Variante pro Nenngewicht", () => {
    for (const manufacturer of presetSeedCatalog) {
      for (const series of manufacturer.series) {
        for (const version of series.versions) {
          const weights = version.variants.map(v => v.nominalWeight);
          expect(new Set(weights).size, `Varianten von ${version.slug}`).toBe(
            weights.length
          );
        }
      }
    }
  });

  it("verwendet ausschließlich gültige Schlüssel", () => {
    for (const manufacturer of presetSeedCatalog) {
      expect(
        slugSchema.safeParse(manufacturer.slug).success,
        manufacturer.slug
      ).toBe(true);
      for (const series of manufacturer.series) {
        expect(slugSchema.safeParse(series.slug).success, series.slug).toBe(
          true
        );
        for (const version of series.versions) {
          expect(slugSchema.safeParse(version.slug).success, version.slug).toBe(
            true
          );
        }
      }
    }
  });

  it("enthält nur plausible Varianten", () => {
    for (const manufacturer of presetSeedCatalog) {
      for (const series of manufacturer.series) {
        for (const version of series.versions) {
          expect(
            version.variants.length,
            `${version.slug} ohne Größen`
          ).toBeGreaterThan(0);
          for (const variant of version.variants) {
            const result = variantFieldsSchema.safeParse(variant);
            expect(
              result.success,
              `${manufacturer.slug}/${version.slug}/${variant.nominalWeight}: ${result.error?.issues[0]?.message}`
            ).toBe(true);
          }
        }
      }
    }
  });

  it("hat gültige Gültigkeitszeiträume", () => {
    for (const manufacturer of presetSeedCatalog) {
      for (const series of manufacturer.series) {
        for (const version of series.versions) {
          if (version.validFrom && version.validTo) {
            expect(version.validFrom <= version.validTo, version.slug).toBe(
              true
            );
          }
        }
      }
    }
  });

  it("führt Materialarten bereits in Großbuchstaben", () => {
    for (const manufacturer of presetSeedCatalog) {
      for (const series of manufacturer.series) {
        for (const type of series.materialTypes) {
          expect(type).toBe(type.toUpperCase());
        }
      }
    }
  });
});

describe("seedAction", () => {
  it("fasst Einträge von Administratoren und aus der Community nie an", () => {
    expect(seedAction({ source: "admin", seedRevision: 0 })).toBe("skip");
    expect(seedAction({ source: "community", seedRevision: 0 })).toBe("skip");
  });

  it("aktualisiert eigene Seed-Einträge nur bei veralteter Revision", () => {
    expect(
      seedAction({ source: "seed", seedRevision: PRESET_SEED_REVISION - 1 })
    ).toBe("update");
    expect(
      seedAction({ source: "seed", seedRevision: PRESET_SEED_REVISION })
    ).toBe("skip");
    expect(
      seedAction({ source: "seed", seedRevision: PRESET_SEED_REVISION + 1 })
    ).toBe("skip");
  });
});
