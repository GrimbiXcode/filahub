import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  OpenPrintTagError,
  decodeCbor,
  findInNdefMessage,
  findOpenPrintTagPayload,
  nearestBuiltinColorName,
  parseOpenPrintTag,
  readOpenPrintTag,
} from "@contracts/openPrintTag";

/**
 * Gegen die Beispiel-Tags der Spezifikation (`api/test/fixtures/openprinttag/`,
 * MIT). Die erwarteten Werte stehen dort in `tests/encode_decode/*_input.yaml`.
 */
const tag = (name: string) =>
  new Uint8Array(
    readFileSync(
      path.join(import.meta.dirname, "test/fixtures/openprinttag", name)
    )
  );
const read = (name: string) =>
  readOpenPrintTag(findOpenPrintTagPayload(tag(name)));

describe("OpenPrintTag", () => {
  it("liest ein Prusament-PLA-Tag", () => {
    expect(read("01.bin")).toEqual({
      kind: "filament",
      manufacturer: "Prusament",
      name: "PLA Prusa Galaxy Black",
      materialType: "PLA",
      colorHex: "#3d3e3d",
      nominalWeight: 1000,
      actualWeight: 1012,
      emptyContainerWeight: 280,
      densityGramsPerLiter: 1240,
      filamentDiameterUm: null,
      consumedWeight: null,
      printSettings: {
        kind: "filament",
        nozzleMinC: 205,
        nozzleMaxC: 225,
        bedMinC: 40,
        bedMaxC: 60,
      },
    });
  });

  it("übernimmt einen Bauraum ab 30 °C", () => {
    const petg = read("02.bin");
    expect(petg).toMatchObject({
      manufacturer: "Prusament",
      name: "PETG Jet Black",
      materialType: "PETG",
      colorHex: "#24292a",
      densityGramsPerLiter: 1270,
      actualWeight: 1050,
    });
    expect(petg.printSettings).toEqual({
      kind: "filament",
      nozzleMinC: 240,
      nozzleMaxC: 260,
      bedMinC: 70,
      bedMaxC: 90,
      chamberC: 35,
    });
  });

  it("liest Hochtemperatur-Material und lässt unmögliche Werte weg", () => {
    const pekk = read("04.bin");
    expect(pekk).toMatchObject({
      manufacturer: "3DXTech",
      name: "CarbonX PEKK-A+CF15 Black",
      materialType: "PEKK",
      nominalWeight: 750,
      densityGramsPerLiter: 1390,
    });
    // 90 °C Bauraum, Düse 360–390, Bett 120–140: alles in den Bereichen
    expect(pekk.printSettings).toEqual({
      kind: "filament",
      nozzleMinC: 360,
      nozzleMaxC: 390,
      bedMinC: 120,
      bedMaxC: 140,
      chamberC: 90,
    });
  });

  it("überspringt unbekannte Schlüssel und kommt mit fast leeren Tags aus", () => {
    const sparse = read("05.bin");
    expect(sparse).toMatchObject({
      kind: "filament",
      manufacturer: null,
      name: null,
      materialType: null,
      printSettings: null,
    });
  });

  it("liest die Hilfs-Sektion getrennt", () => {
    const sections = parseOpenPrintTag(findOpenPrintTagPayload(tag("01.bin")));
    expect(sections.meta.get(2)).toBe(210);
    expect(sections.aux).toBeInstanceOf(Map);
  });

  it("lehnt Fremdes ab", () => {
    expect(() => findOpenPrintTagPayload(new Uint8Array(20))).toThrow(
      OpenPrintTagError
    );
    // NDEF mit nur einem URI-Record
    const uri = new Uint8Array([
      0xd1, 0x01, 0x04, 0x55, 0x04, 0x61, 0x2e, 0x62,
    ]);
    expect(() => findInNdefMessage(uri)).toThrow(/kein OpenPrintTag/);
    // Abgeschnittenes CBOR
    expect(() => decodeCbor(new Uint8Array([0xa2, 0x01]))).toThrow(
      OpenPrintTagError
    );
  });

  it("dekodiert CBOR wie RFC 8949", () => {
    const cases: [number[], unknown][] = [
      [[0x17], 23],
      [[0x19, 0x03, 0xe8], 1000],
      [[0x38, 0x63], -100],
      [[0xf9, 0x3c, 0x00], 1],
      [[0xf9, 0x3e, 0x00], 1.5],
      [[0xfa, 0x47, 0xc3, 0x50, 0x00], 100000],
      [[0x63, 0x50, 0x4c, 0x41], "PLA"],
      [
        [0x82, 0x01, 0x02],
        [1, 2],
      ],
      [
        [0x9f, 0x01, 0x02, 0xff],
        [1, 2],
      ],
      [[0xf5], true],
      [[0xf6], null],
    ];
    for (const [bytes, expected] of cases)
      expect(decodeCbor(new Uint8Array(bytes)).value).toEqual(expected);
    const map = decodeCbor(new Uint8Array([0xbf, 0x01, 0x02, 0xff])).value;
    expect(map).toEqual(new Map([[1, 2]]));
  });

  it("findet einen nahen Farbnamen – und keinen, wenn keiner passt", () => {
    expect(nearestBuiltinColorName("#1c1c1e", "de")).toBe("Schwarz");
    expect(nearestBuiltinColorName("#1d1d20", "en")).toBe("Black");
    expect(nearestBuiltinColorName("#3d3e3d", "de")).toBe("Anthrazit");
    expect(nearestBuiltinColorName("#ff00ff", "de")).toBeNull();
  });
});
