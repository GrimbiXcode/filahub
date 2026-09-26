/**
 * Dateien zu Drucken (seit 4.3.0): Fotos und 3MF-Projekte.
 *
 * Der Typ einer Datei steht **nicht** in ihrer Endung und nicht im
 * `Content-Type` der Anfrage – beides bestimmt der Absender. Er wird hier aus
 * den ersten Bytes gelesen (Magic Bytes), und nur, was dabei als Foto
 * (JPEG, PNG, WebP) oder als 3MF erkannt wird, kommt überhaupt auf die Platte.
 * **Kein SVG, kein HTML:** Beides wäre Skript im eigenen Ursprung.
 *
 * Wie alles in `contracts/` ohne Node-Abhängigkeit; Server und Tests teilen
 * sich die Funktionen.
 */

export const PRINT_FILE_KINDS = ["image", "model_3mf"] as const;
export type PrintFileKind = (typeof PRINT_FILE_KINDS)[number];

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export type ImageMimeType = "image/jpeg" | "image/png" | "image/webp";

/** Der registrierte Medientyp für 3MF (IANA, 2018) */
export const MODEL_3MF_MIME_TYPE = "model/3mf";

/** Lange Kante, auf die der Browser Fotos vor dem Hochladen verkleinert */
export const IMAGE_MAX_EDGE = 2048;
/** Lange Kante der Vorschau in Listen und Galerie */
export const THUMBNAIL_MAX_EDGE = 480;

export type DetectedImage = {
  kind: "image";
  mimeType: ImageMimeType;
  width: number;
  height: number;
  /**
   * Ob die Datei Metadaten trägt, die einen Ort verraten können: EXIF (samt
   * GPS), XMP, IPTC, Text-Chunks. Der Browser kodiert jedes Foto vor dem
   * Hochladen neu und schreibt dabei nichts davon – eine Datei mit Metadaten
   * ist also nicht über die App gekommen und wird abgelehnt.
   *
   * Bewusst „irgendwelche Metadaten“ und nicht „GPS im EXIF“: Die Position
   * steht auch in XMP (`exif:GPSLatitude`) oder als Freitext, und eine Prüfung
   * auf alles davon wäre ein TIFF- und XML-Leser für einen Fall, den der
   * eigene Client nie erzeugt.
   */
  hasMetadata: boolean;
};

export type DetectedModel = {
  kind: "model_3mf";
  mimeType: typeof MODEL_3MF_MIME_TYPE;
};

export type DetectedFile = DetectedImage | DetectedModel;

const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32be = (b: Uint8Array, o: number) =>
  ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const u32le = (b: Uint8Array, o: number) =>
  b[o] + (b[o + 1] << 8) + (b[o + 2] << 16) + ((b[o + 3] << 24) >>> 0);
const ascii = (b: Uint8Array, o: number, n: number) =>
  String.fromCharCode(...b.subarray(o, o + n));

function validDimensions(width: number, height: number): boolean {
  return (
    width > 0 &&
    height > 0 &&
    width <= MAX_IMAGE_DIMENSION &&
    height <= MAX_IMAGE_DIMENSION
  );
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((value, i) => bytes[i] === value);
}

/** Größte Kantenlänge, die angenommen wird – die Spalten sind `integer` */
export const MAX_IMAGE_DIMENSION = 65_535;

type JpegSegment = { marker: number; start: number; end: number };

/**
 * Zerlegt ein JPEG in seine Segmente, bis zum Bildende (EOI). Die
 * Bilddaten nach jedem SOS gehören zum SOS-Segment; ein progressives JPEG hat
 * mehrere davon, und zwischen ihnen dürfen wieder Segmente stehen – auch
 * EXIF. Deshalb geht der Lauf bis zum Ende und nicht nur bis zum ersten SOS.
 * `null`, wenn die Datei kein vollständiges JPEG ist.
 */
function walkJpeg(
  bytes: Uint8Array
): { segments: JpegSegment[]; end: number } | null {
  const segments: JpegSegment[] = [{ marker: 0xd8, start: 0, end: 2 }];
  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    // Füllbytes vor einem Marker
    while (offset + 1 < bytes.length && bytes[offset + 1] === 0xff) offset++;
    if (offset + 1 >= bytes.length) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xd9) {
      segments.push({ marker, start: offset, end: offset + 2 });
      return { segments, end: offset + 2 };
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      segments.push({ marker, start: offset, end: offset + 2 });
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) return null;
    const length = u16be(bytes, offset + 2);
    let end = offset + 2 + length;
    if (length < 2 || end > bytes.length) return null;
    if (marker === 0xda) {
      // Bilddaten bis zum nächsten echten Marker (FF 00 und RST gehören dazu)
      let i = end;
      while (i + 1 < bytes.length) {
        if (bytes[i] === 0xff) {
          const next = bytes[i + 1];
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
            i += 2;
            continue;
          }
          break;
        }
        i++;
      }
      if (i + 1 >= bytes.length) return null;
      end = i;
    }
    segments.push({ marker, start: offset, end });
    offset = end;
  }
  return null;
}

/**
 * Ob ein JPEG-Segment Metadaten trägt. Erlaubt sind APP0 (JFIF), APP2 nur mit
 * Farbprofil (`ICC_PROFILE`; dort kann sonst auch XMP stehen) und APP14 nur
 * als `Adobe`-Farbangabe. Alle übrigen APP-Segmente – EXIF und XMP in APP1,
 * IPTC in APP13 – und Kommentare zählen als Metadaten.
 */
function isJpegMetadata(bytes: Uint8Array, segment: JpegSegment): boolean {
  const { marker, start } = segment;
  if (marker === 0xfe) return true;
  if (marker < 0xe0 || marker > 0xef) return false;
  if (marker === 0xe0) return false;
  if (marker === 0xe2) return ascii(bytes, start + 4, 12) !== "ICC_PROFILE\0";
  if (marker === 0xee) return ascii(bytes, start + 4, 5) !== "Adobe";
  return true;
}

function readJpeg(bytes: Uint8Array): DetectedImage | null {
  const walked = walkJpeg(bytes);
  if (!walked) return null;
  let width = 0;
  let height = 0;
  // Alles nach dem Bildende – etwa ein zweites Bild samt EXIF (MPF) – zählt
  let hasMetadata = walked.end < bytes.length;
  for (const segment of walked.segments) {
    const { marker, start } = segment;
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof && width === 0 && segment.end - start >= 9) {
      height = u16be(bytes, start + 5);
      width = u16be(bytes, start + 7);
    }
    if (isJpegMetadata(bytes, segment)) hasMetadata = true;
  }
  if (!validDimensions(width, height)) return null;
  return { kind: "image", mimeType: "image/jpeg", width, height, hasMetadata };
}

/**
 * Entfernt Metadaten aus einem JPEG: alle Segmente, die `isJpegMetadata`
 * meldet, und alles nach dem Bildende. Die Bilddaten bleiben Byte für Byte.
 *
 * Gebraucht im Browser nach dem Neukodieren: Safari schreibt beim Kodieren
 * aus einem Canvas einen EXIF-Block (Farbraum, Maße – keinen Ort), den der
 * Server sonst ablehnte. `null`, wenn die Datei kein lesbares JPEG ist.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  const walked = walkJpeg(bytes);
  if (!walked) return null;
  const kept = walked.segments.filter(s => !isJpegMetadata(bytes, s));
  const out = new Uint8Array(kept.reduce((n, s) => n + s.end - s.start, 0));
  let offset = 0;
  for (const s of kept) {
    out.set(bytes.subarray(s.start, s.end), offset);
    offset += s.end - s.start;
  }
  return out;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Chunks, die Text oder EXIF tragen – darin kann ein Ort stehen */
const PNG_METADATA_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt"]);

function readPng(bytes: Uint8Array): DetectedImage | null {
  // IHDR muss der erste Chunk sein
  if (bytes.length < 33 || ascii(bytes, 12, 4) !== "IHDR") return null;
  const width = u32be(bytes, 16);
  const height = u32be(bytes, 20);
  let hasMetadata = false;
  let offset = 8;
  let ended = false;
  while (offset + 12 <= bytes.length) {
    const length = u32be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    if (PNG_METADATA_CHUNKS.has(type)) hasMetadata = true;
    offset += 12 + length;
    if (type === "IEND") {
      ended = true;
      break;
    }
  }
  if (!ended) return null;
  // Bytes nach dem Ende tragen nichts zum Bild bei – aber womöglich Text
  if (offset < bytes.length) hasMetadata = true;
  if (!validDimensions(width, height)) return null;
  return { kind: "image", mimeType: "image/png", width, height, hasMetadata };
}

function readWebp(bytes: Uint8Array): DetectedImage | null {
  let width = 0;
  let height = 0;
  let hasMetadata = false;
  let offset = 12;
  // Nur innerhalb des RIFF-Containers lesen; was dahinter steht, zählt
  const riffEnd = 8 + u32le(bytes, 4);
  if (riffEnd > bytes.length) return null;
  if (riffEnd + (riffEnd % 2) < bytes.length) hasMetadata = true;
  while (offset + 8 <= riffEnd) {
    const type = ascii(bytes, offset, 4);
    const size = u32le(bytes, offset + 4);
    const data = offset + 8;
    if (type === "VP8X" && data + 10 <= bytes.length) {
      width =
        1 +
        (bytes[data + 4] | (bytes[data + 5] << 8) | (bytes[data + 6] << 16));
      height =
        1 +
        (bytes[data + 7] | (bytes[data + 8] << 8) | (bytes[data + 9] << 16));
    } else if (type === "VP8 " && data + 10 <= bytes.length && width === 0) {
      // Schlüsselbild: 3 Bytes Rahmenkopf, Startcode 9D 01 2A, dann die Maße
      if (
        bytes[data + 3] !== 0x9d ||
        bytes[data + 4] !== 0x01 ||
        bytes[data + 5] !== 0x2a
      )
        return null;
      width = u16le(bytes, data + 6) & 0x3fff;
      height = u16le(bytes, data + 8) & 0x3fff;
    } else if (type === "VP8L" && data + 5 <= bytes.length && width === 0) {
      if (bytes[data] !== 0x2f) return null;
      const bits = u32le(bytes, data + 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    } else if (type === "EXIF" || type === "XMP ") {
      hasMetadata = true;
    }
    offset = data + size + (size % 2);
  }
  if (!validDimensions(width, height)) return null;
  return { kind: "image", mimeType: "image/webp", width, height, hasMetadata };
}

/** Höchstzahl der Einträge, die im Inhaltsverzeichnis einer ZIP gelesen werden */
const MAX_ZIP_ENTRIES = 10_000;

/**
 * Die Namen im zentralen Verzeichnis einer ZIP-Datei – ohne etwas zu
 * entpacken. `null`, wenn die Datei kein lesbares ZIP ist.
 */
export function zipEntryNames(bytes: Uint8Array): string[] | null {
  // Ende des zentralen Verzeichnisses: höchstens 22 + 65535 Bytes vor Schluss
  const minStart = Math.max(0, bytes.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= minStart; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  let count = u16le(bytes, eocd + 10);
  let cdOffset = u32le(bytes, eocd + 16);
  // ZIP64: Die echten Werte stehen im eigenen Datensatz davor
  if (count === 0xffff || cdOffset === 0xffffffff) {
    const locator = eocd - 20;
    if (locator < 0 || u32le(bytes, locator) !== 0x07064b50) return null;
    const record = Number(
      BigInt(u32le(bytes, locator + 8)) +
        (BigInt(u32le(bytes, locator + 12)) << 32n)
    );
    if (record + 56 > bytes.length || u32le(bytes, record) !== 0x06064b50)
      return null;
    count = Number(
      BigInt(u32le(bytes, record + 32)) +
        (BigInt(u32le(bytes, record + 36)) << 32n)
    );
    cdOffset = Number(
      BigInt(u32le(bytes, record + 48)) +
        (BigInt(u32le(bytes, record + 52)) << 32n)
    );
  }
  if (count > MAX_ZIP_ENTRIES) return null;
  const names: string[] = [];
  let offset = cdOffset;
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || u32le(bytes, offset) !== 0x02014b50)
      return null;
    const nameLength = u16le(bytes, offset + 28);
    const extraLength = u16le(bytes, offset + 30);
    const commentLength = u16le(bytes, offset + 32);
    if (offset + 46 + nameLength > bytes.length) return null;
    names.push(
      decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    );
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

/**
 * Eine 3MF ist ein ZIP mit mindestens einem Modell unter `3D/`. Ein beliebiges
 * ZIP (Office-Dokument, Archiv) wird damit nicht als 3MF angenommen.
 */
function read3mf(bytes: Uint8Array): DetectedModel | null {
  const names = zipEntryNames(bytes);
  if (!names) return null;
  return names.some(name => /^3D\/[^/]+\.model$/i.test(name))
    ? { kind: "model_3mf", mimeType: MODEL_3MF_MIME_TYPE }
    : null;
}

/** Erkennt Foto oder 3MF an den Bytes; alles andere ist `null`. */
export function detectPrintFile(bytes: Uint8Array): DetectedFile | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return readJpeg(bytes);
  if (startsWith(bytes, PNG_SIGNATURE)) return readPng(bytes);
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  )
    return readWebp(bytes);
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return read3mf(bytes);
  return null;
}

/**
 * Der hochgeladene Name, nur zur Anzeige und für den Download: ohne Pfad,
 * ohne Steuerzeichen, gekürzt. Auf der Platte heißt die Datei nie so – dort
 * steht ein zufälliger Schlüssel.
 */
export function sanitizeFileName(raw: string, fallback = "datei"): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  if (!clean || clean === "." || clean === "..") return fallback;
  if (clean.length <= 200) return clean;
  const dot = clean.lastIndexOf(".");
  const ext = dot > 0 && clean.length - dot <= 10 ? clean.slice(dot) : "";
  return clean.slice(0, 200 - ext.length) + ext;
}

/**
 * `Content-Disposition` mit ASCII-Ersatz und UTF-8-Namen (RFC 6266/5987) –
 * sonst kommen Umlaute als Zeichensalat an.
 */
export function contentDisposition(
  type: "inline" | "attachment",
  fileName: string
): string {
  const fallback = fileName
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/[\\"]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * Löschen einer Datei: dieselbe Regel wie bei Wägungen – `editor` jede,
 * `weigher` nur die zuletzt hochgeladene des Drucks und nur kurz danach.
 */
export { mayDeleteWeighing as mayDeletePrintFile } from "./organizations";
