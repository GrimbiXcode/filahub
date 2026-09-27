import { describe, expect, it } from "vitest";
import {
  contentDisposition,
  detectPrintFile,
  sanitizeFileName,
  stripJpegMetadata,
  zipEntryNames,
} from "@contracts/printFiles";
import { mayDeleteWeighing } from "@contracts/organizations";
import { mayDeletePrintFile } from "@contracts/printFiles";

/*
  Die Erkennung entscheidet, was auf die Platte darf. Die Fixtures sind von
  Hand gebaute Köpfe – genau die Bytes, die gelesen werden, und nichts sonst.
*/

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap(p =>
      typeof p === "string" ? [...p].map(c => c.charCodeAt(0)) : p
    )
  );
const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [
  (n >>> 24) & 0xff,
  (n >> 16) & 0xff,
  (n >> 8) & 0xff,
  n & 0xff,
];
const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const le32 = (n: number) => [
  n & 0xff,
  (n >> 8) & 0xff,
  (n >> 16) & 0xff,
  (n >>> 24) & 0xff,
];

function jpeg(
  extraSegments: number[][] = [],
  /** Zwischen zwei Scans (progressiv) und nach dem Bildende */
  more: { betweenScans?: number[][]; trailing?: number[] } = {}
) {
  const app0 = [
    0xff,
    0xe0,
    ...be16(16),
    ..."JFIF\0".split("").map(c => c.charCodeAt(0)),
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
  ];
  const sof0 = [
    0xff,
    0xc0,
    ...be16(17),
    8,
    ...be16(600),
    ...be16(800),
    3,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
  ];
  const sos = [0xff, 0xda, ...be16(8), 1, 1, 0, 0, 0x3f, 0];
  const second = more.betweenScans
    ? [...more.betweenScans.flat(), ...sos, 0x56, 0xff, 0x00, 0x78]
    : [];
  return bytes(
    [0xff, 0xd8],
    app0,
    ...extraSegments,
    sof0,
    sos,
    // Bilddaten samt maskiertem FF 00 und einem Neustart-Marker
    [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x9a],
    second,
    [0xff, 0xd9],
    more.trailing ?? []
  );
}

function pngChunk(type: string, data: number[]) {
  return [
    ...be32(data.length),
    ...[...type].map(c => c.charCodeAt(0)),
    ...data,
    0,
    0,
    0,
    0,
  ];
}

function png(extra: number[][] = []) {
  const ihdr = pngChunk("IHDR", [...be32(1024), ...be32(768), 8, 6, 0, 0, 0]);
  return bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ihdr,
    ...extra,
    pngChunk("IDAT", [1, 2, 3]),
    pngChunk("IEND", [])
  );
}

function riffChunk(type: string, data: number[]) {
  const pad = data.length % 2 ? [0] : [];
  return [
    ...[...type].map(c => c.charCodeAt(0)),
    ...le32(data.length),
    ...data,
    ...pad,
  ];
}

function webp(chunks: number[][]) {
  const body = chunks.flat();
  return bytes("RIFF", le32(4 + body.length), "WEBP", body);
}

/** Minimales ZIP ohne Kompression – nur Kopf, Verzeichnis und Schluss */
function zip(names: string[]) {
  const local: number[] = [];
  const central: number[] = [];
  for (const name of names) {
    const n = [...name].map(c => c.charCodeAt(0));
    const offset = local.length;
    local.push(
      ...le32(0x04034b50),
      ...le16(20),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      ...le32(0),
      ...le32(0),
      ...le32(0),
      ...le16(n.length),
      ...le16(0),
      ...n
    );
    central.push(
      ...le32(0x02014b50),
      ...le16(20),
      ...le16(20),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      ...le32(0),
      ...le32(0),
      ...le32(0),
      ...le16(n.length),
      ...le16(0),
      ...le16(0),
      ...le16(0),
      ...le16(0),
      ...le32(0),
      ...le32(offset),
      ...n
    );
  }
  const eocd = [
    ...le32(0x06054b50),
    0,
    0,
    0,
    0,
    ...le16(names.length),
    ...le16(names.length),
    ...le32(central.length),
    ...le32(local.length),
    ...le16(0),
  ];
  return bytes(local, central, eocd);
}

describe("detectPrintFile", () => {
  it("liest JPEG mit Maßen und ohne Metadaten", () => {
    expect(detectPrintFile(jpeg())).toEqual({
      kind: "image",
      mimeType: "image/jpeg",
      width: 800,
      height: 600,
      hasMetadata: false,
    });
  });

  it("erkennt EXIF, XMP und IPTC im JPEG als Metadaten", () => {
    const exif = [
      0xff,
      0xe1,
      ...be16(10),
      ..."Exif\0\0".split("").map(c => c.charCodeAt(0)),
      0,
      0,
    ];
    const iptc = [0xff, 0xed, ...be16(4), 0, 0];
    expect(detectPrintFile(jpeg([exif]))).toMatchObject({ hasMetadata: true });
    expect(detectPrintFile(jpeg([iptc]))).toMatchObject({ hasMetadata: true });
    // Farbprofil (APP2) ist Darstellung, keine Metadaten
    const icc = [
      0xff,
      0xe2,
      ...be16(16),
      ..."ICC_PROFILE\0".split("").map(c => c.charCodeAt(0)),
      0,
      0,
    ];
    expect(detectPrintFile(jpeg([icc]))).toMatchObject({ hasMetadata: false });
  });

  it("liest PNG und erkennt Text- und EXIF-Chunks", () => {
    expect(detectPrintFile(png())).toEqual({
      kind: "image",
      mimeType: "image/png",
      width: 1024,
      height: 768,
      hasMetadata: false,
    });
    expect(detectPrintFile(png([pngChunk("eXIf", [1, 2])]))).toMatchObject({
      hasMetadata: true,
    });
    expect(
      detectPrintFile(
        png([
          pngChunk("iTXt", [
            ...[..."XML:com.adobe.xmp"].map(c => c.charCodeAt(0)),
          ]),
        ])
      )
    ).toMatchObject({ hasMetadata: true });
  });

  it("liest WebP in allen drei Formen", () => {
    const vp8 = riffChunk("VP8 ", [
      0,
      0,
      0,
      0x9d,
      0x01,
      0x2a,
      ...le16(640),
      ...le16(480),
      0,
      0,
    ]);
    expect(detectPrintFile(webp([vp8]))).toMatchObject({
      mimeType: "image/webp",
      width: 640,
      height: 480,
      hasMetadata: false,
    });
    const w = 300 - 1;
    const h = 200 - 1;
    const bits = w | (h << 14);
    const vp8l = riffChunk("VP8L", [0x2f, ...le32(bits), 0]);
    expect(detectPrintFile(webp([vp8l]))).toMatchObject({
      width: 300,
      height: 200,
    });
    const vp8x = riffChunk("VP8X", [
      0,
      0,
      0,
      0,
      ...[1999 & 0xff, (1999 >> 8) & 0xff, 0],
      ...[999 & 0xff, (999 >> 8) & 0xff, 0],
    ]);
    const exif = riffChunk("EXIF", [1, 2, 3]);
    expect(detectPrintFile(webp([vp8x, vp8, exif]))).toMatchObject({
      width: 2000,
      height: 1000,
      hasMetadata: true,
    });
  });

  it("nimmt ein ZIP nur als 3MF, wenn ein Modell unter 3D/ liegt", () => {
    expect(
      detectPrintFile(
        zip([
          "[Content_Types].xml",
          "_rels/.rels",
          "3D/3dmodel.model",
          "Metadata/thumbnail.png",
        ])
      )
    ).toEqual({
      kind: "model_3mf",
      mimeType: "model/3mf",
    });
    // Ein Office-Dokument ist auch ein ZIP
    expect(
      detectPrintFile(zip(["[Content_Types].xml", "word/document.xml"]))
    ).toBeNull();
    expect(zipEntryNames(zip(["a", "b/c"]))).toEqual(["a", "b/c"]);
  });

  it("lehnt SVG, HTML, PDF und Abgeschnittenes ab", () => {
    expect(
      detectPrintFile(bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))
    ).toBeNull();
    expect(
      detectPrintFile(bytes("<!DOCTYPE html><script>alert(1)</script>"))
    ).toBeNull();
    expect(detectPrintFile(bytes("%PDF-1.7"))).toBeNull();
    expect(detectPrintFile(bytes([0xff, 0xd8, 0xff]))).toBeNull();
    expect(detectPrintFile(bytes([0x50, 0x4b, 0x03, 0x04, 0, 0]))).toBeNull();
    expect(detectPrintFile(new Uint8Array())).toBeNull();
  });
});

describe("Lücken der Metadatenprüfung (Review 4.3.0)", () => {
  const exif = [
    0xff,
    0xe1,
    ...be16(10),
    ..."Exif\0\0".split("").map(c => c.charCodeAt(0)),
    0,
    0,
  ];

  it("findet EXIF zwischen zwei Scans und Bytes nach dem Bildende", () => {
    expect(detectPrintFile(jpeg([], { betweenScans: [[]] }))).toMatchObject({
      hasMetadata: false,
    });
    expect(detectPrintFile(jpeg([], { betweenScans: [exif] }))).toMatchObject({
      hasMetadata: true,
    });
    // Ein zweites Bild samt EXIF hinter dem ersten (MPF)
    expect(
      detectPrintFile(jpeg([], { trailing: [...jpeg([exif])] }))
    ).toMatchObject({ hasMetadata: true });
  });

  it("nimmt APP2 nur als Farbprofil", () => {
    const xmpInApp2 = [
      0xff,
      0xe2,
      ...be16(8),
      ..."XMP\0\0\0".split("").map(c => c.charCodeAt(0)),
    ];
    expect(detectPrintFile(jpeg([xmpInApp2]))).toMatchObject({
      hasMetadata: true,
    });
  });

  it("findet Text hinter dem PNG- und dem WebP-Ende", () => {
    const withTrailer = new Uint8Array([
      ...png(),
      ...pngChunk("tEXt", [0x41, 0, 0x42]),
    ]);
    expect(detectPrintFile(withTrailer)).toMatchObject({ hasMetadata: true });
    const vp8 = riffChunk("VP8 ", [
      0,
      0,
      0,
      0x9d,
      0x01,
      0x2a,
      ...le16(64),
      ...le16(48),
      0,
      0,
    ]);
    const tail = new Uint8Array([...webp([vp8]), ...riffChunk("EXIF", [1, 2])]);
    expect(detectPrintFile(tail)).toMatchObject({ hasMetadata: true });
  });

  it("lehnt Maße ab, die keine Spalte fasst", () => {
    const huge = bytes(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      pngChunk("IHDR", [...be32(2 ** 31), ...be32(10), 8, 6, 0, 0, 0]),
      pngChunk("IEND", [])
    );
    expect(detectPrintFile(huge)).toBeNull();
  });

  it("entfernt Metadaten aus einem JPEG und lässt die Bilddaten stehen", () => {
    const dirty = jpeg([exif], { betweenScans: [exif], trailing: [1, 2, 3] });
    const clean = stripJpegMetadata(dirty)!;
    expect(detectPrintFile(clean)).toMatchObject({
      width: 800,
      height: 600,
      hasMetadata: false,
    });
    expect(clean).toEqual(jpeg([], { betweenScans: [[]] }));
    expect(stripJpegMetadata(bytes("kein jpeg"))).toBeNull();
  });
});

describe("Dateinamen", () => {
  it("entfernt Pfade und Steuerzeichen", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\a\\Benchy.3mf")).toBe("Benchy.3mf");
    expect(sanitizeFileName('a"b\u0000c.png')).toBe("abc.png");
    expect(sanitizeFileName("..")).toBe("datei");
    const long = `${"x".repeat(300)}.3mf`;
    expect(sanitizeFileName(long)).toHaveLength(200);
    expect(sanitizeFileName(long).endsWith(".3mf")).toBe(true);
  });

  it("schreibt Content-Disposition mit UTF-8-Namen", () => {
    expect(contentDisposition("attachment", "Gehäuse v2.3mf")).toBe(
      "attachment; filename=\"Geh_use v2.3mf\"; filename*=UTF-8''Geh%C3%A4use%20v2.3mf"
    );
  });

  it("löscht nach derselben Regel wie Wägungen", () => {
    expect(mayDeletePrintFile).toBe(mayDeleteWeighing);
  });
});
