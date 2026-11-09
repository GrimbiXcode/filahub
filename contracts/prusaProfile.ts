import type { FilamentPrintSettings } from "./printSettings";
import { filamentPrintSettingsSchema } from "./printSettings";
import { splitList } from "./slicerMetadata";

/**
 * Filamentprofile von PrusaSlicer ↔ Druckeinstellungen (seit 4.7.0, Plan
 * `docs/plan-prusa-integration.md`, Phase D).
 *
 * Gelesen und geschrieben wird im Browser; nichts davon geht an den Server
 * außer den Werten, die jemand speichert (`product.setPrintSettings`).
 *
 * Drei Formen kommen herein, alle INI (`key = value`):
 *
 * - **Ein Benutzerprofil** aus dem Konfigurationsverzeichnis
 *   (`filament/<Name>.ini`) – ohne Abschnitte, ein Filament.
 * - **„Konfiguration exportieren“** – die ganze Konfiguration ohne
 *   Abschnitte. Bei mehreren Filamenten (MMU, XL) stehen Zahlen als
 *   Kommaliste (`temperature = 220,220`), Texte mit Semikolon
 *   (`filament_type = PLA;PETG`).
 * - **Ein Konfigurationspaket** (Bundle) mit Abschnitten
 *   `[filament:<Name>]`, `[print:…]`, `[printer:…]`, `[presets]`.
 */

/** Ein Filamentprofil mit den Werten genau dieses Filaments */
export type PrusaFilamentProfile = {
  name: string | null;
  values: ReadonlyMap<string, string>;
};

/** Was die Datei nicht ist oder nicht hat */
export class PrusaProfileError extends Error {
  readonly code: "no_filament";

  constructor(code: "no_filament", message: string) {
    super(message);
    this.name = "PrusaProfileError";
    this.code = code;
  }
}

/** Mehr liest der Browser nicht ein – ein Bundle mit allen Profilen hat ~1 MB */
export const MAX_PRUSA_PROFILE_BYTES = 4 * 1024 * 1024;

/** Schlüssel, an denen ein Filamentprofil zu erkennen ist */
const FILAMENT_KEYS = ["filament_type", "temperature", "filament_settings_id"];

/**
 * Alle Filamentprofile einer Datei. Doppelte (eine MMU mit fünfmal demselben
 * Profil) erscheinen einmal; abstrakte Vorlagen eines Bundles (`*PLA*`) gar
 * nicht – sie sind Bausteine, keine Profile.
 */
export function readPrusaProfiles(text: string): PrusaFilamentProfile[] {
  const { sections, loose } = parseIni(text.replace(/^\uFEFF/, ""));
  const profiles: PrusaFilamentProfile[] = [];

  for (const section of sections) {
    const match = section.name.match(/^filament:(.+)$/);
    if (!match || match[1].trim().startsWith("*")) continue;
    profiles.push({ name: match[1].trim(), values: section.values });
  }
  if (profiles.length === 0 && FILAMENT_KEYS.some(key => loose.has(key))) {
    profiles.push(...splitByFilament(loose));
  }
  if (profiles.length === 0) {
    throw new PrusaProfileError(
      "no_filament",
      "In der Datei steht kein Filamentprofil von PrusaSlicer."
    );
  }
  return dedupe(profiles);
}

/** `[abschnitt]` und `key = value`; Kommentare mit `#` oder `;` */
function parseIni(text: string): {
  sections: { name: string; values: Map<string, string> }[];
  loose: Map<string, string>;
} {
  const sections: { name: string; values: Map<string, string> }[] = [];
  const loose = new Map<string, string>();
  let current = loose;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const header = line.match(/^\[(.+)\]$/);
    if (header) {
      const section = { name: header[1].trim(), values: new Map() };
      sections.push(section);
      current = section.values;
      continue;
    }
    const index = line.indexOf("=");
    if (index > 0)
      current.set(line.slice(0, index).trim(), line.slice(index + 1).trim());
  }
  return { sections, loose };
}

/**
 * Die Werte des i-ten Filaments aus einer Konfiguration ohne Abschnitte. Die
 * Zahl der Filamente steht in `filament_settings_id` (sonst in
 * `temperature`); ein Einzelwert gilt für alle.
 */
function splitByFilament(values: Map<string, string>): PrusaFilamentProfile[] {
  const names = splitList(values.get("filament_settings_id"));
  const count = Math.max(
    names.length,
    (values.get("temperature") ?? "").split(",").length,
    1
  );
  return Array.from({ length: count }, (_, slot) => {
    const own = new Map<string, string>();
    for (const key of PROFILE_KEYS) {
      const value = pickSlot(values.get(key), slot);
      if (value !== undefined) own.set(key, value);
    }
    return { name: cleanName(names[slot] ?? null), values: own };
  });
}

function pickSlot(raw: string | undefined, slot: number): string | undefined {
  if (raw === undefined) return undefined;
  const parts =
    raw.includes(";") || raw.startsWith('"')
      ? splitList(raw).map(part => part ?? "")
      : raw.split(",");
  if (parts.length === 1) return parts[0].trim();
  return parts[slot]?.trim();
}

function cleanName(value: string | null): string | null {
  if (!value) return null;
  const name = value
    .replace(/^"|"$/g, "")
    .replace(/\s*@.*$/, "")
    .trim();
  return name || null;
}

function dedupe(profiles: PrusaFilamentProfile[]): PrusaFilamentProfile[] {
  const seen = new Set<string>();
  return profiles.filter(profile => {
    const key = JSON.stringify([profile.name, [...profile.values]]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Profil → Druckeinstellungen
// ---------------------------------------------------------------------------

/** Die Schlüssel, die filahub liest und schreibt */
const PROFILE_KEYS = [
  "filament_settings_id",
  "filament_type",
  "filament_vendor",
  "filament_colour",
  "filament_density",
  "temperature",
  "first_layer_temperature",
  "bed_temperature",
  "first_layer_bed_temperature",
  "chamber_temperature",
  "max_fan_speed",
  "extrusion_multiplier",
  "filament_retract_length",
] as const;

export type ImportedPrintSettings = {
  settings: FilamentPrintSettings;
  /** Dichte in g/l – nur ein Angebot, das Material wird nicht still geändert */
  densityGramsPerLiter: number | null;
  filamentType: string | null;
  /** Werte, die außerhalb der Bereiche von filahub liegen und wegfallen */
  outOfRange: (keyof FilamentPrintSettings)[];
};

/**
 * Die Werte eines Profils in den Feldern von filahub:
 *
 * | PrusaSlicer                                      | filahub                     |
 * | ------------------------------------------------ | --------------------------- |
 * | `temperature`, `first_layer_temperature`         | Düse von/bis (min/max)      |
 * | `bed_temperature`, `first_layer_bed_temperature` | Bett von/bis (min/max)      |
 * | `chamber_temperature` (ab 30 °C)                 | Bauraum                     |
 * | `max_fan_speed`                                  | Lüfter                      |
 * | `extrusion_multiplier`                           | Fluss in %                  |
 * | `filament_retract_length` (nicht `nil`)          | Rückzug in 1/100 mm         |
 * | `filament_density` (g/cm³)                       | Dichte am Material (g/l)    |
 *
 * - **0 °C heißt „nicht setzen“** – PrusaSlicer schreibt dann keinen Befehl.
 * - **Bauraum unter 30 °C fällt weg.** Die Profile des Core One tragen 20 °C
 *   für PLA – gemeint ist „nicht heizen“, nicht eine Vorgabe.
 * - **`filament_max_volumetric_speed` hat kein Gegenstück.** mm³/s in mm/s
 *   umzurechnen bräuchte Linienbreite und Schichthöhe des Druckprofils.
 * - **Trocknen und geschlossener Bauraum** stehen in keinem Profil.
 */
export function printSettingsFromProfile(
  profile: PrusaFilamentProfile
): ImportedPrintSettings {
  const get = (key: (typeof PROFILE_KEYS)[number]) => profile.values.get(key);
  const outOfRange: (keyof FilamentPrintSettings)[] = [];
  const settings: FilamentPrintSettings = { kind: "filament" };

  const set = (
    field: Exclude<keyof FilamentPrintSettings, "kind" | "enclosureRequired">,
    value: number | null
  ) => {
    if (value === null) return;
    const shape = filamentPrintSettingsSchema.shape[field];
    if (shape.safeParse(value).success) settings[field] = value;
    else outOfRange.push(field);
  };

  const nozzle = positives(
    number(get("temperature")),
    number(get("first_layer_temperature"))
  );
  if (nozzle.length) {
    set("nozzleMinC", Math.round(Math.min(...nozzle)));
    set("nozzleMaxC", Math.round(Math.max(...nozzle)));
  }
  const bed = positives(
    number(get("bed_temperature")),
    number(get("first_layer_bed_temperature"))
  );
  if (bed.length) {
    set("bedMinC", Math.round(Math.min(...bed)));
    set("bedMaxC", Math.round(Math.max(...bed)));
  }
  const chamber = number(get("chamber_temperature"));
  if (chamber !== null && chamber >= 30) set("chamberC", Math.round(chamber));
  const fan = number(get("max_fan_speed"));
  if (fan !== null) set("fanPercent", Math.round(fan));
  const flow = number(get("extrusion_multiplier"));
  if (flow !== null && flow > 0) set("flowPercent", Math.round(flow * 100));
  const retraction = number(get("filament_retract_length"));
  if (retraction !== null)
    set("retractionHundredthsMm", Math.round(retraction * 100));

  const density = number(get("filament_density"));
  return {
    settings,
    densityGramsPerLiter:
      density !== null && density > 0 && density < 25
        ? Math.round(density * 1000)
        : null,
    filamentType: get("filament_type") || null,
    outOfRange,
  };
}

/** „nil“, leer und Unsinn → `null` */
function number(value: string | undefined): number | null {
  if (value === undefined || value === "" || value === "nil") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positives(...values: (number | null)[]): number[] {
  return values.filter((value): value is number => value !== null && value > 0);
}

/**
 * Welches Profil zu einem Material passt: das mit den meisten gemeinsamen
 * Wörtern im Namen. Nur eine Vorauswahl – der Dialog lässt jedes wählen.
 */
export function bestProfileIndex(
  profiles: readonly PrusaFilamentProfile[],
  productName: string
): number {
  const wanted = new Set(words(productName));
  let best = 0;
  let bestScore = -1;
  profiles.forEach((profile, index) => {
    const score = words(profile.name ?? "").filter(w => wanted.has(w)).length;
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}+]+/u)
    .filter(word => word.length > 1);
}

// ---------------------------------------------------------------------------
// Druckeinstellungen → Profil
// ---------------------------------------------------------------------------

export type ProfileExportInput = {
  name: string;
  manufacturer: string | null;
  materialType: string;
  colorHex: string | null;
  densityGramsPerLiter: number | null;
  settings: FilamentPrintSettings | null;
};

/**
 * Ein Konfigurationspaket mit **einem** Filamentprofil – in PrusaSlicer über
 * „Datei → Importieren → Konfigurationspaket importieren“. Nur die Schlüssel
 * aus der Tabelle bei `printSettingsFromProfile`; alles andere nimmt
 * PrusaSlicer aus seinen Vorgaben.
 *
 * **Die Spanne wird zu zwei Werten:** die erste Schicht bekommt das obere
 * Ende, alle weiteren die Mitte. Das ist die Gewohnheit der Prusa-Profile
 * (erste Schicht heißer) und hält den Druck in der Spanne des Herstellers.
 * Zurückgelesen wird daraus „Mitte bis oberes Ende“ – der Weg ist nicht
 * verlustfrei, aber bleibt in der ursprünglichen Spanne.
 */
export function prusaBundleFromPrintSettings(
  input: ProfileExportInput,
  header: string
): string {
  const s = input.settings;
  const lines: string[] = [];
  const add = (key: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "") return;
    lines.push(
      `${key} = ${typeof value === "number" ? decimal(value) : value}`
    );
  };

  add("filament_type", oneLine(input.materialType));
  add("filament_vendor", oneLine(input.manufacturer ?? ""));
  add("filament_colour", input.colorHex?.toUpperCase());
  if (input.densityGramsPerLiter)
    add("filament_density", input.densityGramsPerLiter / 1000);
  if (s) {
    const [nozzleLayer, nozzleFirst] = layerValues(s.nozzleMinC, s.nozzleMaxC);
    add("temperature", nozzleLayer);
    add("first_layer_temperature", nozzleFirst);
    const [bedLayer, bedFirst] = layerValues(s.bedMinC, s.bedMaxC);
    add("bed_temperature", bedLayer);
    add("first_layer_bed_temperature", bedFirst);
    add("chamber_temperature", s.chamberC);
    add("max_fan_speed", s.fanPercent);
    if (s.flowPercent != null) add("extrusion_multiplier", s.flowPercent / 100);
    if (s.retractionHundredthsMm != null)
      add("filament_retract_length", s.retractionHundredthsMm / 100);
  }

  return [
    ...header.split("\n").map(line => `# ${line}`),
    "",
    `[filament:${profileName(input)}]`,
    ...lines,
    "",
  ].join("\n");
}

/** [alle weiteren Schichten, erste Schicht] aus „von … bis …“ */
function layerValues(
  min: number | undefined,
  max: number | undefined
): [number | null, number | null] {
  if (min != null && max != null) return [Math.round((min + max) / 2), max];
  const only = min ?? max ?? null;
  return [only, only];
}

/** „Polymaker PolyTerra PLA (filahub)“ – ohne Zeichen, die ein Dateiname nicht verträgt */
export function profileName(
  input: Pick<ProfileExportInput, "name" | "manufacturer">
): string {
  const base =
    input.manufacturer &&
    !input.name.toLowerCase().startsWith(input.manufacturer.toLowerCase())
      ? `${input.manufacturer} ${input.name}`
      : input.name;
  const clean = oneLine(base)
    .replace(/[[\]\\/:*?"<>|@]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return `${clean || "Material"} (filahub)`;
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** 0.95 statt 0.9500000001, Punkt statt Komma – wie PrusaSlicer es schreibt */
function decimal(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}
