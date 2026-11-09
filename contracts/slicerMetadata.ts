import { unzlibSync } from "fflate";
import { normalizeMaterialType } from "./materials";
import { manufacturerMatches } from "./presets";
import { MAX_MATERIALS_PER_PRINT_JOB, MAX_PRINT_GRAMS } from "./printJobs";

/**
 * Slicer-Dateien auslesen (seit 4.5.0, Plan `docs/plan-prusa-integration.md`,
 * Phase A): Gramm je Filament, Druckzeit und Drucker aus einer G-Code-Datei
 * von PrusaSlicer, damit das Druckformular sie nicht abtippen lässt.
 *
 * Gelesen wird **im Browser**; die Datei geht nie an den Server. Deshalb steht
 * alles hier ohne DOM und ohne Node – der Browser reicht seine `File` über
 * `ByteSource` herein (`src/lib/slicerFile.ts`), die Tests einen Puffer.
 *
 * Zwei Formate:
 *
 * - **ASCII-G-Code.** PrusaSlicer schreibt Kennzahlen als Kommentare
 *   (`; filament used [g] = 0.75`), seit 2.6 zusätzlich in den Kopf, die
 *   vollständige Konfiguration (Farbe, Profilname, Hersteller) zwischen
 *   `; prusaslicer_config = begin` und `… end` an das **Ende**. Gelesen
 *   werden deshalb nur Anfang und Ende – G-Code ist schnell 100 MB groß.
 * - **Binär-G-Code (`.bgcode`)**, Spezifikation in libbgcode
 *   (`doc/specifications.md`): Kopf `GCDE`, dann Blöcke. Alle
 *   Metadaten-Blöcke stehen **vor** dem ersten G-Code-Block; gelesen wird bis
 *   dorthin und keinen Schritt weiter.
 */

/** Was das Formular aus einer Datei übernimmt */
export type SlicerJob = {
  format: "gcode" | "bgcode";
  /** „PrusaSlicer 2.8.1“ – `null`, wenn die Datei es nicht sagt */
  producer: string | null;
  fileName: string;
  /** Dateiname ohne Endung und ohne das Slicer-Suffix (`_0.4n_0.2mm_…`) */
  title: string;
  durationMinutes: number | null;
  /** `printer_model`, etwa „MK4S“ */
  printerModel: string | null;
  /** Je Slot mit Verbrauch eine Zeile; Slots mit 0 g entfallen */
  filaments: SlicerFilament[];
};

export type SlicerFilament = {
  /** 0-basiert, wie die Werkzeugnummer `T0`, `T1` … */
  slot: number;
  /** Ganze Gramm; was über 0 liegt, zählt mindestens als 1 g */
  grams: number;
  filamentType: string | null;
  /** `#rrggbb` in Kleinbuchstaben */
  colorHex: string | null;
  /** Profilname ohne Druckerzusatz: „Prusament PLA“ statt „… @MK4S“ */
  profileName: string | null;
  vendor: string | null;
};

/** Zugriff auf die Bytes einer Datei, ohne sie ganz zu laden */
export type ByteSource = {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
};

export const SLICER_FILE_ERRORS = [
  "unknown_format",
  "no_metadata",
  "corrupt",
] as const;
export type SlicerFileErrorCode = (typeof SLICER_FILE_ERRORS)[number];

export class SlicerFileError extends Error {
  readonly code: SlicerFileErrorCode;

  constructor(code: SlicerFileErrorCode, message: string) {
    super(message);
    this.name = "SlicerFileError";
    this.code = code;
  }
}

/** Anfang und Ende des ASCII-G-Codes, die gelesen werden */
export const GCODE_HEAD_BYTES = 64 * 1024;
export const GCODE_TAIL_BYTES = 512 * 1024;
/**
 * Grenzen für bgcode. Eine echte Datei hat vier Metadaten-Blöcke und eine
 * Handvoll Vorschaubilder; die Konfiguration entpackt zu rund 15 KB. Die
 * Grenzen halten eine kaputte oder böswillige Datei davon ab, das Formular
 * einzufrieren oder den Speicher zu füllen.
 */
export const BGCODE_MAX_BLOCKS = 256;
export const BGCODE_MAX_METADATA_BYTES = 1024 * 1024;

/**
 * Liest eine Slicer-Datei. Das Format erkennt die Funktion an den Bytes,
 * nicht an der Endung.
 */
export async function readSlicerFile(
  source: ByteSource,
  fileName: string
): Promise<SlicerJob> {
  const magic = await source.read(0, Math.min(4, source.size));
  if (source.size >= 10 && bytesEqual(magic, BGCODE_MAGIC)) {
    const meta = await readBgcodeMetadata(source);
    return slicerJobFromMetadata(meta, fileName, "bgcode");
  }
  const meta = await readGcodeMetadata(source);
  return slicerJobFromMetadata(meta, fileName, "gcode");
}

// ---------------------------------------------------------------------------
// ASCII-G-Code
// ---------------------------------------------------------------------------

/**
 * Schlüssel-Wert-Paare aus den Kommentarzeilen von Anfang und Ende.
 *
 * Das Ende gewinnt bei doppelten Schlüsseln: Dort steht die vollständige
 * Konfiguration, der Kopf ist ein Auszug. Eine Datei ohne Zeichen von einem
 * Slicer ist kein G-Code, den wir lesen können – auch ein Textdokument hat
 * keine Nullbytes.
 */
export async function readGcodeMetadata(
  source: ByteSource
): Promise<Map<string, string>> {
  const headLength = Math.min(GCODE_HEAD_BYTES, source.size);
  const head = decodeText(await source.read(0, headLength));
  if (head.includes("\u0000")) {
    throw new SlicerFileError(
      "unknown_format",
      "Die Datei ist weder G-Code noch Binär-G-Code."
    );
  }
  const truncated = source.size > headLength;
  const meta = parseCommentLines(head, false, truncated);
  if (truncated) {
    const tailStart = Math.max(headLength, source.size - GCODE_TAIL_BYTES);
    const tail = decodeText(
      await source.read(tailStart, source.size - tailStart)
    );
    // Die erste Zeile des Endstücks ist angeschnitten, die letzte des Anfangs auch
    for (const [key, value] of parseCommentLines(tail, true, false))
      meta.set(key, value);
  }
  const producer = head.match(/^; generated by (.+?)(?: on \d{4}-|\r?$)/m);
  if (producer) meta.set(PRODUCER_KEY, producer[1].trim());
  if (!meta.has(GRAMS_KEY) && !meta.has(PRODUCER_KEY)) {
    throw new SlicerFileError(
      "no_metadata",
      "In der Datei stehen keine Angaben eines Slicers."
    );
  }
  return meta;
}

/** `; key = value` – nur Kommentarzeilen, das Leerzeichen vor `=` ist Pflicht */
function parseCommentLines(
  text: string,
  skipFirstLine: boolean,
  skipLastLine: boolean
): Map<string, string> {
  const meta = new Map<string, string>();
  const lines = text.split(/\r?\n/);
  const end = skipLastLine ? lines.length - 1 : lines.length;
  for (let i = skipFirstLine ? 1 : 0; i < end; i++) {
    const match = lines[i].match(/^; ([^=;]+?) = (.*)$/);
    if (match) meta.set(match[1], match[2].trim());
  }
  return meta;
}

// ---------------------------------------------------------------------------
// Binär-G-Code
// ---------------------------------------------------------------------------

const BGCODE_MAGIC = new Uint8Array([0x47, 0x43, 0x44, 0x45]); // „GCDE“

const BLOCK_TYPE = {
  fileMetadata: 0,
  gcode: 1,
  slicerMetadata: 2,
  printerMetadata: 3,
  printMetadata: 4,
  thumbnail: 5,
} as const;

const COMPRESSION_NONE = 0;
const COMPRESSION_DEFLATE = 1;

/**
 * Alle Metadaten-Blöcke bis zum ersten G-Code-Block, zusammengeführt in der
 * Reihenfolge der Datei (Datei-, Drucker-, Druck-, Slicer-Metadaten).
 * Vorschaubilder werden übersprungen.
 *
 * Blockkopf: Typ (u16), Kompression (u16), entpackte Größe (u32) und – nur
 * bei Kompression – gepackte Größe (u32). Danach Parameter (Vorschaubild 6
 * Bytes, sonst 2), Daten und bei Prüfsummenart 1 eine CRC32 über Kopf,
 * Parameter und Daten. Alle Zahlen little-endian.
 */
export async function readBgcodeMetadata(
  source: ByteSource
): Promise<Map<string, string>> {
  const header = await source.read(0, 10);
  const view = dataView(header);
  const version = view.getUint32(4, true);
  const checksumType = view.getUint16(8, true);
  if (version !== 1 || checksumType > 1) {
    throw new SlicerFileError(
      "unknown_format",
      "Diese Fassung des Binär-G-Codes wird nicht unterstützt."
    );
  }
  const checksumBytes = checksumType === 1 ? 4 : 0;

  const meta = new Map<string, string>();
  let offset = 10;
  let sawMetadata = false;
  for (let blocks = 0; ; blocks++) {
    if (blocks >= BGCODE_MAX_BLOCKS) {
      throw new SlicerFileError("corrupt", "Zu viele Blöcke vor dem G-Code.");
    }
    if (offset + 8 > source.size) break; // Datei ohne G-Code – nimm, was da ist
    const head = await source.read(offset, Math.min(12, source.size - offset));
    const blockView = dataView(head);
    const type = blockView.getUint16(0, true);
    const compression = blockView.getUint16(2, true);
    const uncompressedSize = blockView.getUint32(4, true);
    if (type === BLOCK_TYPE.gcode) break;
    if (head.length < 12 && compression !== COMPRESSION_NONE) {
      throw new SlicerFileError("corrupt", "Die Datei ist abgeschnitten.");
    }
    const headerSize = compression === COMPRESSION_NONE ? 8 : 12;
    const dataSize =
      compression === COMPRESSION_NONE
        ? uncompressedSize
        : blockView.getUint32(8, true);
    const paramsSize = type === BLOCK_TYPE.thumbnail ? 6 : 2;
    const blockSize = headerSize + paramsSize + dataSize;
    if (type > BLOCK_TYPE.thumbnail || offset + blockSize > source.size) {
      throw new SlicerFileError("corrupt", "Die Datei ist beschädigt.");
    }

    if (type !== BLOCK_TYPE.thumbnail) {
      if (
        uncompressedSize > BGCODE_MAX_METADATA_BYTES ||
        dataSize > BGCODE_MAX_METADATA_BYTES
      ) {
        throw new SlicerFileError(
          "corrupt",
          "Ein Metadaten-Block ist zu groß."
        );
      }
      const block = await source.read(offset, blockSize + checksumBytes);
      if (checksumBytes) {
        const expected = dataView(block).getUint32(blockSize, true);
        if (crc32(block.subarray(0, blockSize)) !== expected) {
          throw new SlicerFileError("corrupt", "Die Prüfsumme stimmt nicht.");
        }
      }
      const encoding = dataView(block).getUint16(headerSize, true);
      const data = block.subarray(headerSize + paramsSize, blockSize);
      // Encoding 0 ist INI; Heatshrink kennt die Spezifikation nur für G-Code
      if (encoding === 0) {
        const text = inflateBlock(data, compression, uncompressedSize);
        if (text !== null) {
          for (const [key, value] of parseIniLines(text)) meta.set(key, value);
          sawMetadata = true;
        }
      }
    }
    offset += blockSize + checksumBytes;
  }
  if (!sawMetadata) {
    throw new SlicerFileError(
      "no_metadata",
      "In der Datei stehen keine Angaben eines Slicers."
    );
  }
  const producer = meta.get("Producer");
  if (producer) meta.set(PRODUCER_KEY, producer);
  return meta;
}

/**
 * Entpackt einen Block in einen Puffer der angekündigten Größe. `fflate`
 * schreibt nie über dessen Ende hinaus – eine Deflate-Bombe bleibt damit bei
 * höchstens `BGCODE_MAX_METADATA_BYTES`. Unbekannte Kompression: `null`.
 */
function inflateBlock(
  data: Uint8Array,
  compression: number,
  uncompressedSize: number
): string | null {
  if (compression === COMPRESSION_NONE) return decodeText(data);
  if (compression !== COMPRESSION_DEFLATE) return null;
  try {
    return decodeText(
      unzlibSync(data, { out: new Uint8Array(uncompressedSize) })
    );
  } catch {
    throw new SlicerFileError(
      "corrupt",
      "Ein Block lässt sich nicht entpacken."
    );
  }
}

/** `key=value` je Zeile – das INI der bgcode-Metadaten */
function parseIniLines(text: string): Map<string, string> {
  const meta = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index > 0) meta.set(line.slice(0, index).trim(), line.slice(index + 1));
  }
  return meta;
}

// ---------------------------------------------------------------------------
// Metadaten → Druck
// ---------------------------------------------------------------------------

const PRODUCER_KEY = "\u0000producer";
const GRAMS_KEY = "filament used [g]";

/**
 * Aus den Schlüsseln von PrusaSlicer das Ergebnis bauen. Bei mehreren
 * Filamenten (MMU, INDX, XL) stehen die Werte als Liste: Gramm mit Komma,
 * alles andere mit Semikolon, Profilnamen in Anführungszeichen.
 *
 * Zwei Eigenheiten, beide an einer echten Datei (Core One mit MMU3,
 * PrusaSlicer 2.9.7) gefunden:
 *
 * - **Die Farbe steht in `extruder_colour`**, sobald jemand sie setzt.
 *   `filament_colour` ist dann überall die Vorgabe `#FF8000`, die Vorschau des
 *   Slicers zeigt die Extruderfarbe. Bei vier Rollen desselben Materials ist
 *   sie das Einzige, was sie unterscheidet.
 * - **`filament_vendor` ist ein Einzelwert**, auch bei mehreren Filamenten.
 *   Wem er gehört, sagt die Datei nicht – bei mehreren Slots bleibt er weg;
 *   der Hersteller steckt ohnehin im Profilnamen je Slot.
 */
export function slicerJobFromMetadata(
  meta: Map<string, string>,
  fileName: string,
  format: SlicerJob["format"]
): SlicerJob {
  const grams = (meta.get(GRAMS_KEY) ?? "")
    .split(",")
    .map(value => Number(value.trim()));
  const types = splitList(meta.get("filament_type"));
  const colors = splitList(meta.get("filament_colour"));
  const extruderColors = splitList(meta.get("extruder_colour"));
  const profiles = splitList(meta.get("filament_settings_id"));
  const vendors = splitList(meta.get("filament_vendor"));
  const vendorOf = (slot: number) =>
    vendors.length > 1 || grams.length === 1 ? (vendors[slot] ?? null) : null;

  const filaments: SlicerFilament[] = [];
  grams.forEach((raw, slot) => {
    if (!Number.isFinite(raw) || raw <= 0) return;
    if (filaments.length >= MAX_MATERIALS_PER_PRINT_JOB) return;
    filaments.push({
      slot,
      grams: Math.min(MAX_PRINT_GRAMS, Math.max(1, Math.round(raw))),
      filamentType: types[slot] ?? null,
      colorHex:
        normalizeColor(extruderColors[slot]) ?? normalizeColor(colors[slot]),
      profileName: cleanProfileName(profiles[slot]),
      vendor: vendorOf(slot),
    });
  });

  return {
    format,
    producer: meta.get(PRODUCER_KEY) ?? null,
    fileName,
    title: titleFromFileName(fileName),
    durationMinutes: parseDuration(
      meta.get("estimated printing time (normal mode)")
    ),
    printerModel: meta.get("printer_model")?.trim() || null,
    filaments,
  };
}

/**
 * `PLA;PETG` → ["PLA", "PETG"]; `"Prusament PLA";"Generic PETG"` mit
 * Anführungszeichen, in denen auch ein Semikolon stehen darf. Leere Einträge
 * bleiben als `null`-Platzhalter stehen, damit die Slots nicht verrutschen.
 */
export function splitList(value: string | undefined): (string | null)[] {
  if (value === undefined) return [];
  const items: (string | null)[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "\\" && quoted && i + 1 < value.length) {
      current += value[++i];
    } else if (char === ";" && !quoted) {
      items.push(current.trim() || null);
      current = "";
    } else {
      current += char;
    }
  }
  items.push(current.trim() || null);
  return items;
}

/** „1d 2h 3m 4s“ → Minuten, gerundet; was über null liegt, ist mindestens 1 */
export function parseDuration(value: string | undefined): number | null {
  if (!value) return null;
  const units: Record<string, number> = { d: 86400, h: 3600, m: 60, s: 1 };
  let seconds = 0;
  let matched = false;
  for (const [, amount, unit] of value.matchAll(/(\d+)\s*([dhms])/g)) {
    seconds += Number(amount) * units[unit];
    matched = true;
  }
  if (!matched) return null;
  if (seconds === 0) return 0;
  return Math.max(1, Math.round(seconds / 60));
}

function normalizeColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.trim().match(/^#([0-9a-f]{6})$/i);
  return match ? `#${match[1].toLowerCase()}` : null;
}

/** „Prusament PLA @MK4S“ → „Prusament PLA“ */
function cleanProfileName(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/\s*@.*$/, "").trim() || null;
}

/**
 * `Benchy_0.4n_0.2mm_PLA_MK4S_1h2m.bgcode` → „Benchy“. Das Suffix ist die
 * Vorgabe der Ausgabevorlage von PrusaSlicer; wer sie geändert hat, behält
 * seinen Dateinamen.
 */
export function titleFromFileName(fileName: string): string {
  const base = fileName
    .replace(/^.*[\\/]/, "")
    .replace(/\.(b?gcode|gco|g)$/i, "");
  const stripped = base.replace(/_\d+(?:\.\d+)?n_\d+(?:\.\d+)?mm_.*$/, "");
  return (stripped || base).slice(0, 255);
}

// ---------------------------------------------------------------------------
// Vorschlag: welches Material?
// ---------------------------------------------------------------------------

export type SlicerMatchProduct = {
  id: number;
  name: string;
  materialType: string;
  manufacturer: string | null;
  color: string | null;
  /** Materialart des Lagers; ein Harz- oder Pulvermaterial passt nie */
  kind: string | null;
  activeCount: number;
};

export type SlicerMatch = {
  productId: number;
  score: number;
  /** Farbabstand zum Filament, `null` ohne Farbcode auf einer Seite */
  colorDistance: number | null;
};

/**
 * Die Farbe, die PrusaSlicer schreibt, solange niemand eine setzt. Für den
 * Vorschlag heißt sie „unbekannt“: Sonst schlösse sie jede schwarze Rolle aus.
 * Angezeigt wird sie trotzdem – sie steht so in der Datei.
 */
export const PRUSASLICER_DEFAULT_COLOR = "#ff8000";

/**
 * Schwellen in ΔE (`colorDistance`). Die Farbnamen am Material lösen auf
 * allgemeine Katalogtöne auf („Braun“ ist ein Braun, nicht das der Rolle);
 * nah heißt deshalb großzügig unter 35, deutlich anders ab 50.
 */
const COLOR_NEAR = 35;
const COLOR_FAR = 50;

/** Wörter eines Profilnamens, die nichts unterscheiden */
const GENERIC_WORDS = new Set(["generic", "filament", "the"]);

/**
 * Welche Materialien zu einem Filament aus dem G-Code passen, beste zuerst.
 *
 * **Ein Vorschlag, keine Zuordnung.** Die Materialart muss stimmen (über die
 * Vergleichsform, „Pla“ = „PLA“), sonst fällt das Material heraus. Punkte
 * gibt es für Hersteller, Wörter des Profilnamens im Namen des Materials und
 * eine ähnliche Farbe. Die Farbe zählt am wenigsten: PrusaSlicer schreibt
 * `#FF8000`, solange niemand eine Farbe gesetzt hat.
 */
export function rankProductsForFilament(
  filament: SlicerFilament,
  products: readonly SlicerMatchProduct[],
  resolveHex: (color: string | null) => string | null
): SlicerMatch[] {
  const type = filament.filamentType
    ? normalizeMaterialType(filament.filamentType)
    : null;
  const profileWords = words(filament.profileName).filter(
    word => !GENERIC_WORDS.has(word) && normalizeMaterialType(word) !== type
  );

  const matches: SlicerMatch[] = [];
  for (const product of products) {
    if (product.kind != null && product.kind !== "filament") continue;
    if (type && normalizeMaterialType(product.materialType) !== type) continue;
    let score = 1;
    if (
      manufacturerMatches(product.manufacturer, filament.vendor) ||
      manufacturerMatches(product.manufacturer, profileWords[0])
    )
      score += 3;
    const productWords = new Set(
      words(`${product.manufacturer ?? ""} ${product.name}`)
    );
    score += profileWords.filter(word => productWords.has(word)).length;
    const hex = resolveHex(product.color);
    const fileHex =
      filament.colorHex === PRUSASLICER_DEFAULT_COLOR
        ? null
        : filament.colorHex;
    const distance = hex && fileHex ? colorDistance(hex, fileHex) : null;
    if (distance !== null) {
      if (distance < COLOR_NEAR) score += 1;
      else if (distance > 60) score -= 1;
    }
    if (product.activeCount > 0) score += 1;
    matches.push({ productId: product.id, score, colorDistance: distance });
  }
  return matches.sort(
    (a, b) =>
      b.score - a.score ||
      (a.colorDistance ?? Infinity) - (b.colorDistance ?? Infinity) ||
      a.productId - b.productId
  );
}

/**
 * Der eine Vorschlag, den das Formular einträgt – nur, wenn er eindeutig
 * vorn liegt und mehr hat als die bloße Materialart. Sonst bleibt die Zeile
 * offen, und der Mensch wählt.
 *
 * Eine bekannte, deutlich andere Farbe (ΔE ab 50) verhindert den
 * Vorschlag: Gelb aus der Datei wird nicht zur grauen Rolle, nur weil die
 * braune und die grüne noch weiter weg sind.
 *
 * Bei Punktegleichstand entscheidet die Farbe, aber nur deutlich: um die
 * Hälfte näher als die nächste und selbst nah. Vier Rollen desselben Materials
 * (MMU) unterscheiden sich nur darin, und dunkle Töne liegen eng beieinander –
 * die feste Schwelle allein hielte Braun und Dunkelgrün für gleich gut.
 */
export function pickProductForFilament(
  filament: SlicerFilament,
  products: readonly SlicerMatchProduct[],
  resolveHex: (color: string | null) => string | null
): number | null {
  const [best, second] = rankProductsForFilament(
    filament,
    products,
    resolveHex
  );
  if (!best || best.score < 4) return null;
  if (best.colorDistance !== null && best.colorDistance >= COLOR_FAR)
    return null;
  if (second && second.score === best.score) {
    const near = best.colorDistance;
    const clearlyCloser =
      near !== null &&
      near < COLOR_NEAR &&
      (second.colorDistance === null || near * 1.5 < second.colorDistance);
    if (!clearlyCloser) return null;
  }
  return best.productId;
}

function words(value: string | null | undefined): string[] {
  return (value ?? "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}+]+/u)
    .filter(word => word.length > 1);
}

/**
 * Abstand zweier Farben als ΔE im CIELAB-Raum (CIE76): 0 gleich, um 2 kaum
 * zu unterscheiden, 100 Schwarz gegen Weiß.
 *
 * Nicht im RGB-Raum: Dort zählt bei dunklen Tönen die Helligkeit mehr als der
 * Farbton – das Dunkelbraun einer echten MMU-Datei (`#3A200B`) lag dort fast
 * gleich weit von „Braun“ wie von „Dunkelgrün“, in CIELAB ist es 20 gegen 45.
 */
export function colorDistance(a: string, b: string): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** sRGB → CIELAB mit Weißpunkt D65 */
function toLab(hex: string): [number, number, number] {
  const value = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
    .map(channel => channel / 255)
    .map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) =>
    t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function dataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

let crcTable: Uint32Array | null = null;

/** CRC32 (IEEE), wie zlib – für die Prüfsummen der bgcode-Blöcke */
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
