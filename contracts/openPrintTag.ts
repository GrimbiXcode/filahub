import { BUILTIN_COLORS } from "./appearance";
import type { FilamentPrintSettings } from "./printSettings";
import { filamentPrintSettingsSchema } from "./printSettings";
import { colorDistance } from "./slicerMetadata";

/**
 * OpenPrintTag lesen (seit 4.7.0, Plan `docs/plan-prusa-integration.md`,
 * Phase E) – das offene NFC-Format von Prusa für Filament- und Harzgebinde,
 * Spezifikation unter https://github.com/prusa3d/OpenPrintTag (MIT).
 *
 * Aufbau: ein NDEF-Record vom Typ `application/vnd.openprinttag`, darin
 * hintereinander CBOR-Maps mit Ganzzahl-Schlüsseln – die Meta-Sektion (wo die
 * Regionen liegen), die Haupt-Sektion (Hersteller, Material, Farbe, Gewicht,
 * Temperaturen; vom Hersteller beschrieben) und die optionale Hilfs-Sektion
 * (Verbrauch, vom Drucker beschrieben).
 *
 * Im Browser liefert Web NFC den Record schon ausgepackt (`record.data`);
 * `findOpenPrintTagPayload` liest dagegen den ganzen Speicher eines Tags
 * (Capability Container, TLV, NDEF) – für Tests gegen die Beispiel-Tags der
 * Spezifikation und für Lesegeräte, die nur Rohdaten liefern.
 *
 * **Nur lesen.** Schreiben (etwa den Verbrauch zurück) ist nicht Teil von
 * 4.7.0 – ein Fehler dabei beschädigte ein fremdes Tag.
 */

export const OPENPRINTTAG_MIME = "application/vnd.openprinttag";

/** Höchstgröße einer Sektion laut Spezifikation (3.1), mit Luft */
const MAX_SECTION_BYTES = 4096;
/** Schachtelungstiefe – die Spezifikation braucht zwei Ebenen */
const MAX_DEPTH = 8;

export class OpenPrintTagError extends Error {
  readonly code: "not_openprinttag" | "corrupt";

  constructor(code: "not_openprinttag" | "corrupt", message: string) {
    super(message);
    this.name = "OpenPrintTagError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// CBOR (RFC 8949) – nur lesen, nur was die Spezifikation braucht
// ---------------------------------------------------------------------------

export type CborValue =
  | number
  | string
  | boolean
  | null
  | undefined
  | Uint8Array
  | CborValue[]
  | Map<number | string, CborValue>;

/** Ein CBOR-Wert ab `offset`; `end` ist das Byte danach */
export function decodeCbor(
  bytes: Uint8Array,
  offset = 0,
  depth = 0
): { value: CborValue; end: number } {
  if (depth > MAX_DEPTH) throw corrupt("CBOR zu tief verschachtelt");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = offset;
  const need = (n: number) => {
    if (pos + n > bytes.length) throw corrupt("CBOR endet vorzeitig");
  };
  need(1);
  const initial = bytes[pos++];
  const major = initial >> 5;
  const info = initial & 0x1f;

  const readLength = (): number | null => {
    if (info < 24) return info;
    if (info === 24) {
      need(1);
      return bytes[pos++];
    }
    if (info === 25) {
      need(2);
      const v = view.getUint16(pos);
      pos += 2;
      return v;
    }
    if (info === 26) {
      need(4);
      const v = view.getUint32(pos);
      pos += 4;
      return v;
    }
    if (info === 27) {
      need(8);
      const v = Number(view.getBigUint64(pos));
      pos += 8;
      return v;
    }
    if (info === 31) return null; // unbestimmte Länge
    throw corrupt("CBOR-Länge ungültig");
  };

  const isBreak = () => bytes[pos] === 0xff;

  switch (major) {
    case 0: {
      const n = readLength();
      if (n === null) throw corrupt("CBOR-Zahl ohne Länge");
      return { value: n, end: pos };
    }
    case 1: {
      const n = readLength();
      if (n === null) throw corrupt("CBOR-Zahl ohne Länge");
      return { value: -1 - n, end: pos };
    }
    case 2:
    case 3: {
      const n = readLength();
      const parts: Uint8Array[] = [];
      if (n === null) {
        for (;;) {
          need(1);
          if (isBreak()) {
            pos++;
            break;
          }
          const chunk = decodeCbor(bytes, pos, depth + 1);
          pos = chunk.end;
          if (major === 2 && chunk.value instanceof Uint8Array)
            parts.push(chunk.value);
          else if (major === 3 && typeof chunk.value === "string")
            parts.push(new TextEncoder().encode(chunk.value));
          else throw corrupt("CBOR-Teilstück falschen Typs");
        }
      } else {
        if (n > MAX_SECTION_BYTES) throw corrupt("CBOR-Zeichenkette zu lang");
        need(n);
        parts.push(bytes.slice(pos, pos + n));
        pos += n;
      }
      const joined = concat(parts);
      return {
        value: major === 2 ? joined : new TextDecoder().decode(joined),
        end: pos,
      };
    }
    case 4: {
      const n = readLength();
      const items: CborValue[] = [];
      for (let i = 0; n === null || i < n; i++) {
        if (n === null) {
          need(1);
          if (isBreak()) {
            pos++;
            break;
          }
        }
        if (items.length > MAX_SECTION_BYTES)
          throw corrupt("CBOR-Liste zu lang");
        const item = decodeCbor(bytes, pos, depth + 1);
        items.push(item.value);
        pos = item.end;
      }
      return { value: items, end: pos };
    }
    case 5: {
      const n = readLength();
      const map = new Map<number | string, CborValue>();
      for (let i = 0; n === null || i < n; i++) {
        if (n === null) {
          need(1);
          if (isBreak()) {
            pos++;
            break;
          }
        }
        if (map.size > MAX_SECTION_BYTES) throw corrupt("CBOR-Map zu groß");
        const key = decodeCbor(bytes, pos, depth + 1);
        const value = decodeCbor(bytes, key.end, depth + 1);
        pos = value.end;
        if (typeof key.value === "number" || typeof key.value === "string")
          map.set(key.value, value.value);
      }
      return { value: map, end: pos };
    }
    case 6: {
      // Tag: der Wert dahinter zählt, die Kennung nicht
      readLength();
      const inner = decodeCbor(bytes, pos, depth + 1);
      return inner;
    }
    default: {
      if (info === 20) return { value: false, end: pos };
      if (info === 21) return { value: true, end: pos };
      if (info === 22) return { value: null, end: pos };
      if (info === 23) return { value: undefined, end: pos };
      if (info === 25) {
        need(2);
        const v = halfFloat(view.getUint16(pos));
        return { value: v, end: pos + 2 };
      }
      if (info === 26) {
        need(4);
        return { value: view.getFloat32(pos), end: pos + 4 };
      }
      if (info === 27) {
        need(8);
        return { value: view.getFloat64(pos), end: pos + 8 };
      }
      if (info < 24) return { value: undefined, end: pos };
      throw corrupt("CBOR-Wert unbekannt");
    }
  }
}

function halfFloat(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

function concat(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function corrupt(message: string) {
  return new OpenPrintTagError("corrupt", message);
}

// ---------------------------------------------------------------------------
// Tag-Speicher → NDEF-Record
// ---------------------------------------------------------------------------

/**
 * Sucht im Speicher eines NFC-V-Tags den OpenPrintTag-Record: Capability
 * Container (4 oder 8 Byte), dann TLV-Blöcke bis zum NDEF-TLV (Typ 0x03),
 * darin die NDEF-Records.
 */
export function findOpenPrintTagPayload(memory: Uint8Array): Uint8Array {
  if (memory.length < 8 || (memory[0] !== 0xe1 && memory[0] !== 0xe2))
    throw new OpenPrintTagError(
      "not_openprinttag",
      "Kein Capability Container eines NFC-Tags"
    );
  // CC: 8 Byte, wenn das Größenbyte 0 ist (erweiterte Form)
  let pos = memory[2] === 0 ? 8 : 4;
  while (pos < memory.length) {
    const type = memory[pos++];
    if (type === 0x00) continue; // Füllbyte
    if (type === 0xfe) break; // Ende
    let length = memory[pos++];
    if (length === 0xff) {
      length = (memory[pos] << 8) | memory[pos + 1];
      pos += 2;
    }
    if (type === 0x03)
      return findInNdefMessage(memory.subarray(pos, pos + length));
    pos += length;
  }
  throw new OpenPrintTagError("not_openprinttag", "Kein NDEF auf dem Tag");
}

/** Die NDEF-Records einer Nachricht durchgehen (NFC Forum NDEF 1.0) */
export function findInNdefMessage(message: Uint8Array): Uint8Array {
  let pos = 0;
  while (pos < message.length) {
    const header = message[pos++];
    const shortRecord = (header & 0x10) !== 0;
    const hasId = (header & 0x08) !== 0;
    const tnf = header & 0x07;
    const typeLength = message[pos++];
    let payloadLength: number;
    if (shortRecord) payloadLength = message[pos++];
    else {
      payloadLength =
        ((message[pos] << 24) >>> 0) +
        (message[pos + 1] << 16) +
        (message[pos + 2] << 8) +
        message[pos + 3];
      pos += 4;
    }
    const idLength = hasId ? message[pos++] : 0;
    const type = new TextDecoder().decode(
      message.subarray(pos, pos + typeLength)
    );
    pos += typeLength + idLength;
    const payload = message.subarray(pos, pos + payloadLength);
    pos += payloadLength;
    if (tnf === 2 && type === OPENPRINTTAG_MIME) return payload;
    if (header & 0x40) break; // letzter Record
  }
  throw new OpenPrintTagError(
    "not_openprinttag",
    "Auf dem Tag steht kein OpenPrintTag"
  );
}

// ---------------------------------------------------------------------------
// Sektionen und Felder
// ---------------------------------------------------------------------------

export type OpenPrintTagSections = {
  meta: Map<number | string, CborValue>;
  main: Map<number | string, CborValue>;
  aux: Map<number | string, CborValue> | null;
};

/** Meta-, Haupt- und Hilfs-Sektion aus dem Inhalt des Records */
export function parseOpenPrintTag(payload: Uint8Array): OpenPrintTagSections {
  const meta = decodeCbor(payload, 0);
  if (!(meta.value instanceof Map)) throw corrupt("Meta-Sektion ist keine Map");
  const mainOffset = asNumber(meta.value.get(0)) ?? meta.end;
  const main = decodeCbor(payload, mainOffset);
  if (!(main.value instanceof Map))
    throw corrupt("Haupt-Sektion ist keine Map");
  let aux: Map<number | string, CborValue> | null = null;
  const auxOffset = asNumber(meta.value.get(2));
  if (auxOffset != null && auxOffset < payload.length) {
    try {
      const decoded = decodeCbor(payload, auxOffset);
      if (decoded.value instanceof Map) aux = decoded.value;
    } catch {
      // Eine kaputte Hilfs-Sektion (vom Drucker beschrieben) ist kein Grund,
      // die Angaben des Herstellers nicht zu lesen
    }
  }
  return { meta: meta.value, main: main.value, aux };
}

/** Schlüssel der Haupt-Sektion (`data/main_fields.yaml`) */
const MAIN = {
  materialClass: 8,
  materialType: 9,
  materialName: 10,
  brandName: 11,
  nominalNettoWeight: 16,
  actualNettoWeight: 17,
  emptyContainerWeight: 18,
  primaryColor: 19,
  density: 29,
  filamentDiameter: 30,
  minPrintTemperature: 34,
  maxPrintTemperature: 35,
  minBedTemperature: 37,
  maxBedTemperature: 38,
  chamberTemperature: 41,
  materialAbbreviation: 52,
  dryingTemperature: 57,
  dryingTime: 58,
} as const;

/** Schlüssel der Hilfs-Sektion */
const AUX_CONSUMED_WEIGHT = 0;

/**
 * Materialarten der Spezifikation (`data/material_type_enum.yaml`, MIT).
 * Unbekannte Schlüssel – die Spezifikation darf neue ergänzen – bleiben
 * `null`; dann zählt `material_abbreviation`.
 */
export const OPENPRINTTAG_MATERIAL_TYPES: Record<number, string> = {
  0: "PLA",
  1: "PETG",
  2: "TPU",
  3: "ABS",
  4: "ASA",
  5: "PC",
  6: "PCTG",
  7: "PP",
  8: "PA6",
  9: "PA11",
  10: "PA12",
  11: "PA66",
  12: "CPE",
  13: "TPE",
  14: "HIPS",
  15: "PHA",
  16: "PET",
  17: "PEI",
  18: "PBT",
  19: "PVB",
  20: "PVA",
  21: "PEKK",
  22: "PEEK",
  23: "BVOH",
  24: "TPC",
  25: "PPS",
  26: "PPSU",
  27: "PVC",
  28: "PEBA",
  29: "PVDF",
  30: "PPA",
  31: "PCL",
  32: "PES",
  33: "PMMA",
  34: "POM",
  35: "PPE",
  36: "PS",
  37: "PSU",
  38: "TPI",
  39: "SBS",
  40: "OBC",
  41: "EVA",
  42: "PA612",
};

/** Was filahub von einem Tag übernimmt */
export type OpenPrintTagMaterial = {
  kind: "filament" | "resin" | null;
  manufacturer: string | null;
  /** Produktname, wie der Hersteller ihn schreibt („PLA Galaxy Black“) */
  name: string | null;
  materialType: string | null;
  colorHex: string | null;
  /** Nennmenge in Gramm (1000 für eine 1-kg-Rolle) */
  nominalWeight: number | null;
  /** Gewogene Füllmenge ab Werk, falls angegeben */
  actualWeight: number | null;
  emptyContainerWeight: number | null;
  densityGramsPerLiter: number | null;
  filamentDiameterUm: number | null;
  /** Vom Drucker verbraucht (Hilfs-Sektion), falls er es schreibt */
  consumedWeight: number | null;
  /** Druckwerte vom Hersteller – nur Werte innerhalb der Bereiche von filahub */
  printSettings: FilamentPrintSettings | null;
};

/**
 * Die Felder eines Tags in der Form von filahub. Was fehlt oder unplausibel
 * ist, wird `null` – ein Tag ist eine Angabe des Herstellers, kein Vertrag.
 */
export function openPrintTagToMaterial(
  sections: OpenPrintTagSections
): OpenPrintTagMaterial {
  const { main, aux } = sections;
  const num = (key: number) => asNumber(main.get(key));
  const text = (key: number) => {
    const value = main.get(key);
    return typeof value === "string" && value.trim()
      ? value.trim().slice(0, 255)
      : null;
  };
  const materialClass = num(MAIN.materialClass);
  const typeKey = num(MAIN.materialType);
  const positiveRound = (value: number | null, max: number) =>
    value != null && value > 0 && value <= max ? Math.round(value) : null;
  const density = num(MAIN.density);
  const diameter = num(MAIN.filamentDiameter);
  const kind =
    materialClass === 0 ? "filament" : materialClass === 1 ? "resin" : null;

  return {
    kind,
    manufacturer: text(MAIN.brandName),
    name: text(MAIN.materialName),
    materialType:
      (typeKey != null ? OPENPRINTTAG_MATERIAL_TYPES[typeKey] : undefined) ??
      text(MAIN.materialAbbreviation),
    colorHex: colorFromBytes(main.get(MAIN.primaryColor)),
    nominalWeight: positiveRound(num(MAIN.nominalNettoWeight), 100_000),
    actualWeight: positiveRound(num(MAIN.actualNettoWeight), 100_000),
    emptyContainerWeight: positiveRound(num(MAIN.emptyContainerWeight), 10_000),
    densityGramsPerLiter:
      density != null && density > 0 && density < 25
        ? Math.round(density * 1000)
        : null,
    filamentDiameterUm:
      diameter != null && diameter > 0 && diameter < 10
        ? Math.round(diameter * 1000)
        : null,
    consumedWeight:
      aux && asNumber(aux.get(AUX_CONSUMED_WEIGHT)) != null
        ? Math.max(0, Math.round(asNumber(aux.get(AUX_CONSUMED_WEIGHT))!))
        : null,
    printSettings: kind === "filament" ? printSettingsFromTag(num) : null,
  };
}

/** Druckwerte des Tags, je Feld gegen die Bereiche von filahub geprüft */
function printSettingsFromTag(
  num: (key: number) => number | null
): FilamentPrintSettings | null {
  const settings: FilamentPrintSettings = { kind: "filament" };
  const set = (
    field: Exclude<keyof FilamentPrintSettings, "kind" | "enclosureRequired">,
    value: number | null
  ) => {
    if (value == null) return;
    const rounded = Math.round(value);
    if (filamentPrintSettingsSchema.shape[field].safeParse(rounded).success)
      settings[field] = rounded;
  };
  set("nozzleMinC", num(MAIN.minPrintTemperature));
  set("nozzleMaxC", num(MAIN.maxPrintTemperature));
  set("bedMinC", num(MAIN.minBedTemperature));
  set("bedMaxC", num(MAIN.maxBedTemperature));
  // 20 °C heißt bei Prusa „nicht heizen“ – dieselbe Regel wie beim Profil
  const chamber = num(MAIN.chamberTemperature);
  if (chamber != null && chamber >= 30) set("chamberC", chamber);
  set("dryingC", num(MAIN.dryingTemperature));
  set("dryingMinutes", num(MAIN.dryingTime));
  // Eine verdrehte Spanne (min > max) wäre ein Fehler auf dem Tag – weglassen
  if (
    settings.nozzleMinC != null &&
    settings.nozzleMaxC != null &&
    settings.nozzleMinC > settings.nozzleMaxC
  ) {
    delete settings.nozzleMinC;
    delete settings.nozzleMaxC;
  }
  if (
    settings.bedMinC != null &&
    settings.bedMaxC != null &&
    settings.bedMinC > settings.bedMaxC
  ) {
    delete settings.bedMinC;
    delete settings.bedMaxC;
  }
  return Object.keys(settings).length > 1 ? settings : null;
}

function asNumber(value: CborValue): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** `color_rgba`: Byte-Zeichenkette mit 3 oder 4 Byte */
function colorFromBytes(value: CborValue): string | null {
  if (!(value instanceof Uint8Array) || value.length < 3 || value.length > 4)
    return null;
  return `#${[...value.subarray(0, 3)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Alles in einem: Inhalt des Records → Material */
export function readOpenPrintTag(payload: Uint8Array): OpenPrintTagMaterial {
  return openPrintTagToMaterial(parseOpenPrintTag(payload));
}

/**
 * Der passende Farbname aus dem mitgelieferten Katalog – nur wenn er wirklich
 * nah liegt (ΔE unter 20). Sonst `null`: Der Farbcode bleibt dann ein
 * Vorschlag für eine eigene Farbe.
 */
export function nearestBuiltinColorName(
  hex: string,
  language: "de" | "en"
): string | null {
  let best: { name: string; distance: number } | null = null;
  for (const color of BUILTIN_COLORS) {
    const distance = colorDistance(hex, color.hex);
    if (!best || distance < best.distance) {
      // Deutsch steht vorn, Englisch hinten (`BUILTIN_COLORS`)
      const name =
        language === "de"
          ? color.names[0]
          : color.names[color.names.length - 1];
      best = { name, distance };
    }
  }
  return best && best.distance < 20 ? best.name : null;
}
