import { crc32 as nodeCrc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  BGCODE_MAX_METADATA_BYTES,
  GCODE_HEAD_BYTES,
  GCODE_TAIL_BYTES,
  SlicerFileError,
  colorDistance,
  crc32,
  parseDuration,
  pickProductForFilament,
  rankProductsForFilament,
  readSlicerFile,
  splitList,
  titleFromFileName,
  type SlicerFilament,
  type SlicerMatchProduct,
} from "@contracts/slicerMetadata";
import {
  FILE_METADATA,
  buildBgcode,
  buildGcode,
  countingSource,
  gcodeBlock,
  iniText,
  printerMetadata,
} from "./test/slicerFixtures";

const PRINT_METADATA = iniText({
  "filament used [mm]": "252.22",
  "filament used [cm3]": "0.61",
  "filament used [g]": "12.75",
  "total filament used [g]": "12.75",
  "estimated printing time (normal mode)": "1h 2m 41s",
  "estimated printing time (silent mode)": "1h 5m 47s",
});

const SLICER_METADATA = iniText({
  binary_gcode: "1",
  filament_colour: "#1A1A1A",
  filament_settings_id: '"Prusament PLA @MK4S"',
  filament_type: "PLA",
  filament_vendor: "Prusa Polymers",
  post_process: "",
  printer_model: "MK4S",
});

/** So ordnet PrusaSlicer die Blöcke an */
function typicalBgcode(compression: number) {
  return buildBgcode([
    { type: 0, data: FILE_METADATA },
    { type: 3, data: printerMetadata({}) },
    { type: 5, data: new Uint8Array(300), params: new Uint8Array(6) },
    { type: 5, data: new Uint8Array(9000), params: new Uint8Array(6) },
    { type: 4, compression, data: PRINT_METADATA },
    { type: 2, compression, data: SLICER_METADATA },
    gcodeBlock(2_000_000),
    gcodeBlock(2_000_000),
  ]);
}

async function expectError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(SlicerFileError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe("Binär-G-Code", () => {
  it.each([0, 1])(
    "liest Kennzahlen und Konfiguration (Kompression %i)",
    async compression => {
      const job = await readSlicerFile(
        countingSource(typicalBgcode(compression)),
        "Benchy_0.4n_0.2mm_PLA_MK4S_1h3m.bgcode"
      );
      expect(job).toEqual({
        format: "bgcode",
        producer: "PrusaSlicer 2.8.1",
        fileName: "Benchy_0.4n_0.2mm_PLA_MK4S_1h3m.bgcode",
        title: "Benchy",
        durationMinutes: 63,
        printerModel: "MK4S",
        filaments: [
          {
            slot: 0,
            grams: 13,
            filamentType: "PLA",
            colorHex: "#1a1a1a",
            profileName: "Prusament PLA",
            vendor: "Prusa Polymers",
          },
        ],
      });
    }
  );

  it("liest nur bis zum ersten G-Code-Block", async () => {
    const source = countingSource(typicalBgcode(1));
    await readSlicerFile(source, "x.bgcode");
    expect(source.size).toBeGreaterThan(4_000_000);
    // Metadaten samt Blockköpfe der Vorschaubilder – die Bilder selbst nicht
    expect(source.bytesRead).toBeLessThan(2_000);
  });

  it("verteilt mehrere Filamente auf ihre Slots und lässt leere aus", async () => {
    const bytes = buildBgcode([
      { type: 0, data: FILE_METADATA },
      {
        type: 4,
        compression: 1,
        data: iniText({ "filament used [g]": "10.40, 0.00, 3.10, 0.2" }),
      },
      {
        type: 2,
        compression: 1,
        data: iniText({
          filament_type: "PLA;PLA;PETG;PLA",
          filament_colour: "#FF0000;#00FF00;#0000ff;",
          filament_settings_id:
            '"Prusament PLA @MK4S";"Generic PLA";"Mein; PETG";"Prusament PLA"',
          filament_vendor: "Prusa Polymers;Generic;;Prusa Polymers",
        }),
      },
      gcodeBlock(10),
    ]);
    const job = await readSlicerFile(countingSource(bytes), "mmu.bgcode");
    expect(job.filaments).toEqual([
      {
        slot: 0,
        grams: 10,
        filamentType: "PLA",
        colorHex: "#ff0000",
        profileName: "Prusament PLA",
        vendor: "Prusa Polymers",
      },
      {
        slot: 2,
        grams: 3,
        filamentType: "PETG",
        colorHex: "#0000ff",
        profileName: "Mein; PETG",
        vendor: null,
      },
      // 0,2 g sind kein Nichts – mindestens 1 g
      {
        slot: 3,
        grams: 1,
        filamentType: "PLA",
        colorHex: null,
        profileName: "Prusament PLA",
        vendor: "Prusa Polymers",
      },
    ]);
  });

  it("nimmt eine Datei ohne Prüfsummen", async () => {
    const bytes = buildBgcode(
      [{ type: 4, data: PRINT_METADATA }, gcodeBlock(10)],
      { checksumType: 0 }
    );
    const job = await readSlicerFile(countingSource(bytes), "a.bgcode");
    expect(job.filaments[0].grams).toBe(13);
  });

  it("lehnt eine falsche Prüfsumme ab", async () => {
    const bytes = buildBgcode([
      { type: 4, data: PRINT_METADATA, badChecksum: true },
      gcodeBlock(10),
    ]);
    await expectError(readSlicerFile(countingSource(bytes), "a"), "corrupt");
  });

  it("lehnt eine unbekannte Fassung ab", async () => {
    const bytes = buildBgcode([{ type: 4, data: PRINT_METADATA }], {
      version: 2,
    });
    await expectError(
      readSlicerFile(countingSource(bytes), "a"),
      "unknown_format"
    );
  });

  it("lehnt einen Block ab, der über das Dateiende hinausreicht", async () => {
    const bytes = buildBgcode([
      { type: 4, data: PRINT_METADATA, declaredUncompressed: 10_000_000 },
    ]);
    await expectError(readSlicerFile(countingSource(bytes), "a"), "corrupt");
  });

  it("lehnt einen zu großen Metadaten-Block ab, bevor er gelesen wird", async () => {
    const bytes = buildBgcode([
      {
        type: 2,
        compression: 1,
        data: "a=b\n",
        declaredUncompressed: BGCODE_MAX_METADATA_BYTES + 1,
      },
      gcodeBlock(10),
    ]);
    const source = countingSource(bytes);
    await expectError(readSlicerFile(source, "a"), "corrupt");
    expect(source.bytesRead).toBeLessThan(100);
  });

  it("entpackt nie mehr als angekündigt (Deflate-Bombe)", async () => {
    const bomb = `filament used [g]=5\n${"x".repeat(5_000_000)}`;
    const bytes = buildBgcode([
      { type: 4, compression: 1, data: bomb, declaredUncompressed: 20 },
      gcodeBlock(10),
    ]);
    const job = await readSlicerFile(countingSource(bytes), "a");
    expect(job.filaments[0].grams).toBe(5);
  });

  it("bricht bei zu vielen Blöcken vor dem G-Code ab", async () => {
    const thumbs = Array.from({ length: 300 }, () => ({
      type: 5,
      data: new Uint8Array(1),
      params: new Uint8Array(6),
    }));
    const bytes = buildBgcode([{ type: 4, data: PRINT_METADATA }, ...thumbs]);
    await expectError(readSlicerFile(countingSource(bytes), "a"), "corrupt");
  });

  it("lehnt einen unbekannten Blocktyp ab", async () => {
    const bytes = buildBgcode([{ type: 9, data: "a=b\n" }]);
    await expectError(readSlicerFile(countingSource(bytes), "a"), "corrupt");
  });

  it("meldet eine Datei ohne Metadaten", async () => {
    const bytes = buildBgcode([gcodeBlock(100)]);
    await expectError(
      readSlicerFile(countingSource(bytes), "a"),
      "no_metadata"
    );
  });

  it("überspringt Blöcke mit unbekannter Kompression", async () => {
    const bytes = buildBgcode([
      { type: 0, data: FILE_METADATA },
      { type: 4, compression: 3, data: "filament used [g]=9\n" },
      gcodeBlock(10),
    ]);
    const job = await readSlicerFile(countingSource(bytes), "a");
    expect(job.producer).toBe("PrusaSlicer 2.8.1");
    expect(job.filaments).toEqual([]);
  });
});

describe("ASCII-G-Code", () => {
  const config = {
    filament_colour: "#FF8000",
    filament_settings_id: '"Generic PETG @MINI"',
    filament_type: "PETG",
    filament_vendor: "Generic",
    printer_model: "MINI",
  };

  it("liest Kopf und Fuß einer großen Datei, ohne den Rumpf", async () => {
    const bytes = buildGcode({
      head: {
        printer_model: "MINI",
        filament_type: "PETG",
        "filament used [g]": "3.01",
        "estimated printing time (normal mode)": "32m 6s",
      },
      foot: { "filament used [g]": "3.01" },
      config,
      bodyBytes: 3_000_000,
    });
    const source = countingSource(bytes);
    const job = await readSlicerFile(
      source,
      "Box_0.4n_0.15mm_PETG_MINI_32m.gcode"
    );
    expect(job).toEqual({
      format: "gcode",
      producer: "PrusaSlicer 2.8.1",
      fileName: "Box_0.4n_0.15mm_PETG_MINI_32m.gcode",
      title: "Box",
      durationMinutes: 32,
      printerModel: "MINI",
      filaments: [
        {
          slot: 0,
          grams: 3,
          filamentType: "PETG",
          colorHex: "#ff8000",
          profileName: "Generic PETG",
          vendor: "Generic",
        },
      ],
    });
    expect(source.bytesRead).toBeLessThanOrEqual(
      GCODE_HEAD_BYTES + GCODE_TAIL_BYTES + 4
    );
  });

  it("findet die Kennzahlen auch nur im Fuß (vor PrusaSlicer 2.6)", async () => {
    const bytes = buildGcode({
      producer: "PrusaSlicer 2.5.2",
      foot: {
        "filament used [g]": "7.5",
        "estimated printing time (normal mode)": "1d 1h 0m 30s",
      },
      config,
      bodyBytes: 2_000_000,
    });
    const job = await readSlicerFile(countingSource(bytes), "a.gcode");
    expect(job.producer).toBe("PrusaSlicer 2.5.2");
    expect(job.durationMinutes).toBe(25 * 60 + 1);
    expect(job.filaments[0].grams).toBe(8);
  });

  it("liest eine kleine Datei ganz", async () => {
    const bytes = buildGcode({
      foot: { "filament used [g]": "1.2, 2.4" },
      config: {
        filament_type: "PLA;PLA",
        filament_colour: "#ffffff;#000000",
      },
    });
    const job = await readSlicerFile(countingSource(bytes), "a.gcode");
    expect(job.filaments.map(f => [f.slot, f.grams, f.colorHex])).toEqual([
      [0, 1, "#ffffff"],
      [1, 2, "#000000"],
    ]);
  });

  it("meldet Text ohne Angaben eines Slicers", async () => {
    const bytes = new Uint8Array(Buffer.from("G28\nG1 X10\n; Hallo\n"));
    await expectError(
      readSlicerFile(countingSource(bytes), "a.gcode"),
      "no_metadata"
    );
  });

  it("lehnt Binärdaten ab, die kein bgcode sind", async () => {
    const bytes = new Uint8Array(4000);
    bytes.set([0x50, 0x4b, 0x03, 0x04]); // ein ZIP, etwa eine 3MF
    await expectError(
      readSlicerFile(countingSource(bytes), "a.3mf"),
      "unknown_format"
    );
  });
});

describe("Hilfen", () => {
  it("rechnet die Druckzeit in Minuten", () => {
    expect(parseDuration("3m 41s")).toBe(4);
    expect(parseDuration("1h 2m 29s")).toBe(62);
    expect(parseDuration("2d 0h 0m 0s")).toBe(2880);
    expect(parseDuration("20s")).toBe(1);
    expect(parseDuration("0s")).toBe(0);
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("unbekannt")).toBeNull();
  });

  it("teilt Listen mit Anführungszeichen", () => {
    expect(splitList(undefined)).toEqual([]);
    expect(splitList("PLA")).toEqual(["PLA"]);
    expect(splitList('"A; B";"C \\" D";;E')).toEqual([
      "A; B",
      'C " D',
      null,
      "E",
    ]);
  });

  it("schneidet das Suffix der Ausgabevorlage ab", () => {
    expect(titleFromFileName("Benchy_0.4n_0.2mm_PLA_MK4S_1h3m.bgcode")).toBe(
      "Benchy"
    );
    expect(titleFromFileName("C:\\Drucke\\Halter v2.gcode")).toBe("Halter v2");
    expect(titleFromFileName("eigener_name.gcode")).toBe("eigener_name");
    expect(titleFromFileName("_0.4n_0.2mm_PLA.gcode")).toBe("_0.4n_0.2mm_PLA");
  });

  it("rechnet dieselbe CRC32 wie zlib", () => {
    const bytes = new Uint8Array(Buffer.from("filahub ✓ 1234567890"));
    expect(crc32(bytes)).toBe(nodeCrc32(bytes));
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("misst Farbabstände", () => {
    expect(colorDistance("#000000", "#000000")).toBe(0);
    expect(colorDistance("#000000", "#ffffff")).toBeGreaterThan(700);
    expect(colorDistance("#1a1a1a", "#000000")).toBeLessThan(100);
    expect(colorDistance("#ff8000", "#000000")).toBeGreaterThan(300);
  });
});

describe("Materialvorschlag", () => {
  const product = (
    id: number,
    patch: Partial<SlicerMatchProduct>
  ): SlicerMatchProduct => ({
    id,
    name: "PLA",
    materialType: "PLA",
    manufacturer: null,
    color: null,
    kind: "filament",
    activeCount: 1,
    ...patch,
  });
  const filament = (patch: Partial<SlicerFilament>): SlicerFilament => ({
    slot: 0,
    grams: 10,
    filamentType: "PLA",
    colorHex: null,
    profileName: null,
    vendor: null,
    ...patch,
  });
  const hexes: Record<string, string> = {
    Schwarz: "#000000",
    Orange: "#ff8000",
    Weiß: "#ffffff",
  };
  const resolve = (color: string | null) => (color ? hexes[color] : null);

  const products = [
    product(1, {
      name: "PolyTerra PLA Charcoal Black",
      manufacturer: "Polymaker",
      color: "Schwarz",
    }),
    product(2, {
      name: "Prusament PLA Galaxy Black",
      manufacturer: "Prusament",
      color: "Schwarz",
    }),
    product(3, {
      name: "Prusament PETG Orange",
      materialType: "PETG",
      manufacturer: "Prusament",
      color: "Orange",
    }),
    product(4, {
      name: "Resin Grau",
      materialType: "PLA",
      kind: "resin",
    }),
  ];

  it("wählt das Material von Hersteller und Profil", () => {
    const pick = pickProductForFilament(
      filament({
        profileName: "Prusament PLA Galaxy Black",
        vendor: "Prusa Polymers",
        colorHex: "#1a1a1a",
      }),
      products,
      resolve
    );
    expect(pick).toBe(2);
  });

  it("vergleicht die Materialart über die Vergleichsform", () => {
    const ranked = rankProductsForFilament(
      filament({ filamentType: "petg " }),
      products,
      resolve
    );
    expect(ranked.map(m => m.productId)).toEqual([3]);
  });

  it("schlägt nie ein Harz- oder Pulvermaterial vor", () => {
    const ranked = rankProductsForFilament(filament({}), products, resolve);
    expect(ranked.map(m => m.productId)).not.toContain(4);
  });

  it("trägt bei bloßer Materialart nichts ein", () => {
    expect(pickProductForFilament(filament({}), products, resolve)).toBeNull();
  });

  it("trägt bei einem Generic-Profil und passender Farbe allein nichts ein", () => {
    const pick = pickProductForFilament(
      filament({
        profileName: "Generic PLA",
        vendor: "Generic",
        colorHex: "#000000",
      }),
      products,
      resolve
    );
    expect(pick).toBeNull();
  });

  it("trägt bei Gleichstand nichts ein", () => {
    const twins = [
      product(10, { name: "Prusament PLA", manufacturer: "Prusament" }),
      product(11, { name: "Prusament PLA", manufacturer: "Prusament" }),
    ];
    expect(
      pickProductForFilament(
        filament({ profileName: "Prusament PLA" }),
        twins,
        resolve
      )
    ).toBeNull();
  });

  it("zieht Materialien mit Gebinde in Gebrauch vor", () => {
    const pair = [
      product(20, {
        name: "Prusament PLA",
        manufacturer: "Prusament",
        activeCount: 0,
      }),
      product(21, { name: "Prusament PLA", manufacturer: "Prusament" }),
    ];
    expect(
      pickProductForFilament(
        filament({ profileName: "Prusament PLA" }),
        pair,
        resolve
      )
    ).toBe(21);
  });
});
