import { describe, expect, it } from "vitest";
import {
  importManyInputSchema,
  importPayloadSchema,
  importPositionSchema,
} from "@contracts/import";

const gueltigePosition = {
  hersteller: "Prusament",
  typ: "PETG",
  farbe: "Galaxy Black",
  nenngewicht: 1000,
  preis: 29.99,
  anzahl: 2,
};

describe("importPayloadSchema", () => {
  it("akzeptiert ein gültiges Payload", () => {
    const ergebnis = importPayloadSchema.safeParse({
      bestelldatum: "2026-07-20",
      positionen: [gueltigePosition],
    });
    expect(ergebnis.success).toBe(true);
  });

  it("akzeptiert ein Payload ohne optionale Felder", () => {
    const ergebnis = importPayloadSchema.safeParse({
      positionen: [{ typ: "PLA", nenngewicht: 1000 }],
    });
    expect(ergebnis.success).toBe(true);
  });

  it("setzt anzahl standardmäßig auf 1", () => {
    const ergebnis = importPositionSchema.parse({
      typ: "PLA",
      nenngewicht: 1000,
    });
    expect(ergebnis.anzahl).toBe(1);
  });

  it("lehnt eine Position ohne typ ab", () => {
    const ergebnis = importPayloadSchema.safeParse({
      positionen: [{ nenngewicht: 1000 }],
    });
    expect(ergebnis.success).toBe(false);
  });

  it("lehnt nenngewicht <= 0 ab", () => {
    for (const nenngewicht of [0, -100]) {
      const ergebnis = importPayloadSchema.safeParse({
        positionen: [{ typ: "PLA", nenngewicht }],
      });
      expect(ergebnis.success).toBe(false);
    }
  });

  it("lehnt mehr als 100 Positionen ab", () => {
    const ergebnis = importPayloadSchema.safeParse({
      positionen: Array.from({ length: 101 }, () => ({
        typ: "PLA",
        nenngewicht: 1000,
      })),
    });
    expect(ergebnis.success).toBe(false);
  });

  it("lehnt ein ungültiges bestelldatum ab", () => {
    for (const bestelldatum of ["20.07.2026", "2026-7-20", "gestern"]) {
      const ergebnis = importPayloadSchema.safeParse({
        bestelldatum,
        positionen: [{ typ: "PLA", nenngewicht: 1000 }],
      });
      expect(ergebnis.success).toBe(false);
    }
  });
});

describe("importManyInputSchema", () => {
  it("akzeptiert Items mit Preis in Cent", () => {
    const ergebnis = importManyInputSchema.safeParse({
      purchaseDate: "2026-07-20",
      items: [{ typ: "PETG", nenngewicht: 1000, priceCents: 2999, anzahl: 3 }],
    });
    expect(ergebnis.success).toBe(true);
    if (ergebnis.success) {
      expect(ergebnis.data.items[0].priceCents).toBe(2999);
    }
  });

  it("lehnt ein leeres items-Array ab", () => {
    const ergebnis = importManyInputSchema.safeParse({ items: [] });
    expect(ergebnis.success).toBe(false);
  });
});
