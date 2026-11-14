import { crc32, deflateSync } from "node:zlib";

/**
 * Kleine PNGs für die Tests der Vorschau – gebaut mit `node:zlib`, nicht mit
 * dem Code unter Test. Graustufen, 8 Bit, jede Zeile mit Filter 0.
 */
export function pngChunk(type: string, data: Uint8Array = new Uint8Array(0)) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

export function buildPng(
  options: {
    width?: number;
    height?: number;
    /** Chunks zwischen IHDR und IDAT, etwa `tEXt` */
    before?: Buffer[];
    /** Chunks zwischen IDAT und IEND */
    after?: Buffer[];
    /** Bytes hinter IEND */
    trailer?: Buffer;
  } = {}
): Uint8Array {
  const width = options.width ?? 32;
  const height = options.height ?? 24;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 0; // Graustufen
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      raw[y * (width + 1) + 1 + x] = (x * 7 + y * 13) & 0xff;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk("IHDR", ihdr),
      ...(options.before ?? []),
      pngChunk("IDAT", deflateSync(raw)),
      ...(options.after ?? []),
      pngChunk("IEND"),
      options.trailer ?? Buffer.alloc(0),
    ])
  );
}

/** Ein PNG mit Text- und Zeitstempel-Chunk, wie ein Slicer ihn schreiben könnte */
export function pngWithText(): Uint8Array {
  return buildPng({
    width: 300,
    height: 300,
    before: [
      pngChunk("tEXt", Buffer.from("Software\0PrusaSlicer", "latin1")),
      pngChunk("gAMA", Buffer.from([0, 0, 0xb1, 0x8f])),
    ],
    after: [pngChunk("tIME", Buffer.from([7, 234, 11, 14, 12, 0, 0]))],
  });
}
