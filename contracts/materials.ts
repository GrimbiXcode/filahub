import { z } from "zod";

/**
 * Materialarten, Lager und abgeleitete Mengenangaben.
 *
 * Wie die übrigen Dateien in `contracts/` von Client, Server und Tests
 * importierbar; zur Laufzeit wird nichts aus `@db` oder `api/` geladen – nur zod
 * und eigene Logik.
 *
 * Die Aufzählungen hier sind **nicht** aus `db/schema.ts` gespiegelt, sondern
 * werden dort importiert: `pgEnum` bekommt genau diese Konstante. Damit läuft
 * die Abhängigkeit nur in eine Richtung (`db/` → `contracts/`), und zwei Listen
 * können nicht auseinanderlaufen. Dasselbe Muster nutzt `contracts/friends.ts`.
 */

// ---------------------------------------------------------------------------
// Materialart
// ---------------------------------------------------------------------------

/**
 * Was für ein Druckmaterial ein Lager aufnimmt.
 *
 * Bewusst strukturiert und nicht Freitext – anders als `materials.materialType`
 * („PLA", „PLA+", „Standard Resin"), das die Chemie beschreibt und deshalb offen
 * bleiben muss. Die Art hier steuert Verhalten: welche Felder ein Lager hat und
 * in welcher Zweiteinheit gerechnet wird. Ein unbekannter Wert wäre da kein
 * Komfortverlust, sondern eine Lücke in der Logik.
 */
export const MATERIAL_KINDS = ["filament", "powder", "resin"] as const;

export type MaterialKind = (typeof MATERIAL_KINDS)[number];

export const materialKindSchema = z.enum(MATERIAL_KINDS);

// ---------------------------------------------------------------------------
// Gebindeform
// ---------------------------------------------------------------------------

/**
 * Form des Gebindes, in dem das Material steckt.
 *
 * Strukturiert wie die Materialart und aus demselben Grund: Die Form steuert,
 * was das Formular zeigt (eine Flasche hat keine Mittelbohrung) und was in der
 * Auswahl nach oben sortiert wird. Freitext wäre dafür nicht auswertbar.
 *
 * `sonstiges` ist die Auffangform und ausdrücklich vorgesehen – nicht jedes
 * Gebinde der Welt passt in fünf Kästchen, und ein Benutzer soll deswegen nicht
 * am Anlegen scheitern.
 */
export const CONTAINER_FORMS = [
  "rolle",
  "beutel",
  "flasche",
  "eimer",
  "kartusche",
  "sonstiges",
] as const;

export type ContainerForm = (typeof CONTAINER_FORMS)[number];

export const containerFormSchema = z.enum(CONTAINER_FORMS);

/**
 * Welche Formen zu einer Materialart üblicherweise gehören.
 *
 * **Sortierhilfe, kein Filter.** Die Gebindeauswahl reiht passende Formen nach
 * oben und zeigt die übrigen darunter weiter an – dieselbe Entscheidung wie bei
 * der Materialart in `materialTypeMatches`, mit derselben Begründung: Eine harte
 * Filterung ließe ein Gebinde verschwinden, das der Benutzer bewusst so
 * angelegt hat, und er hätte keine Möglichkeit, es zu wählen.
 *
 * `sonstiges` steht in keiner Liste, gilt aber überall als passend (siehe
 * `formFitsKind`): Eine Auffangform darf nicht ausgerechnet dort einsortiert
 * werden, wo sie nicht hingehört.
 *
 * Grundlage der Zuordnung sind die Gebinde, in denen das Material tatsächlich
 * verkauft wird – Filament auf Rollen und als Refill-Coil im Beutel, Sinterpulver
 * laut Sinterit in Flaschen (2 kg), Metallbehältern (6 kg) und Eimern (10 kg),
 * Harz in Flaschen und bei geschlossenen Systemen in Kartuschen.
 */
export const FORMS_BY_KIND: Record<MaterialKind, readonly ContainerForm[]> = {
  filament: ["rolle", "beutel"],
  powder: ["beutel", "eimer", "flasche"],
  resin: ["flasche", "kartusche"],
};

/**
 * Passt diese Form zu der Materialart? `sonstiges` und ein unbekanntes Lager
 * passen immer – im Zweifel wird einsortiert statt ausgeschlossen.
 */
export function formFitsKind(
  form: ContainerForm | null | undefined,
  kind: MaterialKind | null | undefined
): boolean {
  if (form == null || kind == null) return true;
  if (form === "sonstiges") return true;
  return FORMS_BY_KIND[kind].includes(form);
}

// ---------------------------------------------------------------------------
// Lager
// ---------------------------------------------------------------------------

/**
 * Wie viele Lager ein Benutzer anlegen darf.
 *
 * Vorerst **global für alle Konten** und hart verdrahtet – bewusst nicht als
 * Spalte an `users`, die überall denselben Wert enthielte. Denkbar ist, die
 * Grenze später pro Konto zu heben (etwa als bezahlte Funktion); dann wird aus
 * dieser Konstante die Vorgabe und daneben tritt ein Kontowert. Diese Stelle ist
 * der Ansatzpunkt dafür.
 *
 * **Keine Datenbank-Zusicherung.** Ein Zähler lässt sich weder als Unique- noch
 * als partieller Index ausdrücken; geprüft wird in `lager.create`. Zwei
 * gleichzeitige Anfragen können daher ein Lager zu viel erzeugen. Das ist die
 * einzige Regel dieser Funktion, die nicht die Datenbank garantiert.
 */
export const MAX_LAGER_PER_USER = 5;

/**
 * Gängige Filamentdurchmesser in **Mikrometern**.
 *
 * Abweichung von der Projektregel „Abmessungen in ganzen Millimetern": 1,75 mm
 * ist als Integer-Millimeter nicht darstellbar, und ein Gleitkommawert für eine
 * Größe, die in die Längenrechnung eingeht, wäre die schlechtere Wahl.
 * Mikrometer sind die kleinste Einheit, in der beide gängigen Stärken
 * ganzzahlig sind.
 */
export const FILAMENT_DIAMETERS_UM = [1750, 2850] as const;

export type FilamentDiameterUm = (typeof FILAMENT_DIAMETERS_UM)[number];

export const filamentDiameterSchema = z.union([
  z.literal(1750),
  z.literal(2850),
]);

/** 1750 → „1,75 mm". Locale-frei: zwei Werte, beide mit Komma im Deutschen. */
export function formatDiameter(um: number): string {
  const mm = um / 1000;
  return `${mm.toFixed(2).replace(".", ",")} mm`;
}

/**
 * Prüft, ob Materialart und Durchmesser zueinander passen.
 *
 * Reine Funktion, damit die Regel ohne Datenbank prüfbar ist: Nur Filament hat
 * einen Durchmesser, und dort nur einen der beiden gängigen. Bei allen anderen
 * Arten muss die Spalte leer bleiben – ein Durchmesser an einem Pulverlager
 * wäre eine Angabe, die nichts bedeutet und irgendwann als Wahrheit gelesen
 * wird.
 */
export function lagerConfigIsValid(config: {
  materialKind: MaterialKind;
  filamentDiameterUm?: number | null;
}): boolean {
  if (config.materialKind !== "filament") {
    return config.filamentDiameterUm == null;
  }
  return (
    config.filamentDiameterUm != null &&
    (FILAMENT_DIAMETERS_UM as readonly number[]).includes(
      config.filamentDiameterUm
    )
  );
}

// ---------------------------------------------------------------------------
// Textur
// ---------------------------------------------------------------------------

/**
 * Vorschläge für die Oberflächeneigenschaft – **kein Filter und kein Enum**.
 *
 * Gespeichert wird Freitext, aus demselben Grund, aus dem `materialType`
 * Freitext ist: Der Hersteller, der sich „Sparkle" ausdenkt, muss eintragbar
 * bleiben. Die Liste dient nur der Vervollständigung und wird im Formular mit
 * den Werten aus dem eigenen Bestand vereint.
 *
 * Bis 2.1.0 wurde die Textur in `materialType` geschmuggelt („PLA Silk"). Das
 * hatte einen sichtbaren Preis: Der Materialart-Filter auf der Übersicht
 * vergleicht exakt, also waren „PLA" und „PLA Silk" zwei unverbundene Einträge,
 * die sich gegenseitig nie fanden.
 */
export const COMMON_TEXTURES = [
  "Matt",
  "Silk",
  "Glänzend",
  "Transparent",
  "Metallic",
  "Leuchtend",
  "Holzoptik",
  "Carbon",
] as const;

// ---------------------------------------------------------------------------
// Dichte und Zweiteinheit
// ---------------------------------------------------------------------------

/**
 * Dichten in Gramm je Liter (= kg/m³), nach Materialart als Rückfallebene.
 *
 * Pulver hat bewusst keinen Wert: Schüttdichte hängt von Korngröße und
 * Verdichtung ab, ein Literwert wäre dort geraten. Lieber keine Angabe als eine
 * falsche.
 */
const DENSITY_BY_KIND: Record<MaterialKind, number | null> = {
  filament: 1240, // wie PLA – die häufigste Wahl
  resin: 1100,
  powder: null,
};

/**
 * Feinere Dichten je Materialart-Bezeichnung. Der Schlüssel wird
 * großgeschrieben und ohne Zusätze verglichen, damit „pla+" und „PLA Silk"
 * denselben Eintrag treffen wie „PLA".
 */
const DENSITY_BY_MATERIAL_TYPE: Record<string, number> = {
  PLA: 1240,
  PETG: 1270,
  PCTG: 1230,
  ABS: 1040,
  ASA: 1070,
  TPU: 1210,
  PA: 1140,
  NYLON: 1140,
  PC: 1200,
  PET: 1380,
  HIPS: 1040,
  PVA: 1230,
  PP: 900,
  PVB: 1090,
  RESIN: 1100,
};

/** „ PLA+ Silk " → „PLA" – der Grundtyp für den Dichte-Vergleich. */
function densityKey(materialType: string): string {
  const normalized = materialType.trim().toUpperCase();
  // Erst der ganze Ausdruck, dann das erste Wort ohne „+"-Zusatz. So trifft
  // „PA-CF" auf „PA" und „PLA Silk" auf „PLA".
  const firstWord = normalized.split(/[\s\-_]/, 1)[0] ?? "";
  return firstWord.replace(/\+$/, "");
}

/**
 * Dichte eines Materials in Gramm je Liter, oder `null`.
 *
 * **Einzige Stelle, an der die Priorität festgelegt ist** – eigener Wert am
 * Material, sonst die Tabelle nach Materialart-Bezeichnung, sonst die
 * Materialart des Lagers. Analog zu `resolveContainerTare` in `contracts/presets.ts`
 * bewusst rein und von Server und Client gemeinsam genutzt, damit die
 * Zweitanzeige nicht an zwei Orten verschieden herauskommt.
 */
export function resolveDensity(input: {
  kind: MaterialKind;
  materialType?: string | null;
  densityGramsPerLiter?: number | null;
}): number | null {
  if (input.densityGramsPerLiter != null && input.densityGramsPerLiter > 0) {
    return input.densityGramsPerLiter;
  }
  if (input.materialType) {
    const byType = DENSITY_BY_MATERIAL_TYPE[densityKey(input.materialType)];
    if (byType != null) return byType;
  }
  return DENSITY_BY_KIND[input.kind];
}

/** Einheit der Zweitanzeige: Meter beim Filament, Liter beim Harz. */
export type SecondaryUnit = "m" | "l";

export type SecondaryAmount = {
  unit: SecondaryUnit;
  /** Meter bzw. Liter, ungerundet – gerundet wird erst beim Formatieren. */
  value: number;
};

/**
 * Rechnet eine Masse in die Zweiteinheit der Materialart um.
 *
 * Filament wird nach Länge verbraucht, Harz nach Volumen, Pulver nach Masse –
 * deshalb gibt es je Art eine andere (oder keine) zweite Zahl:
 *
 * - **Filament → Meter.** `Länge = Masse / (Dichte · π · (d/2)²)`. Der
 *   Durchmesser ist hier kein Beiwerk: 1 kg PLA sind bei 1,75 mm rund 335 m,
 *   bei 2,85 mm nur rund 126 m.
 * - **Harz → Liter.** `Volumen = Masse / Dichte`.
 * - **Pulver → nichts.** Schüttdichte ist zu unzuverlässig (siehe
 *   `DENSITY_BY_KIND`).
 *
 * Gibt `null` zurück, sobald ein nötiger Wert fehlt – **nie** einen geratenen.
 * Eine falsche Längenangabe wäre schlimmer als keine, weil sie geglaubt wird.
 *
 * Gramm bleiben die gespeicherte und die eingegebene Einheit; dies ist
 * ausschließlich eine Anzeige und geht nie in die Restmengenrechnung ein.
 */
export function secondaryAmount(input: {
  kind: MaterialKind;
  grams: number | null | undefined;
  /** Gramm je Liter, üblicherweise aus `resolveDensity` */
  density: number | null | undefined;
  /** Nur beim Filament nötig, in Mikrometern */
  diameterUm?: number | null;
}): SecondaryAmount | null {
  const { kind, grams, density } = input;
  if (grams == null || !Number.isFinite(grams) || grams < 0) return null;
  if (density == null || !Number.isFinite(density) || density <= 0) return null;

  if (kind === "powder") return null;

  // Volumen in Litern – für Harz das Ergebnis, für Filament ein Zwischenschritt.
  const liters = grams / density;

  if (kind === "resin") return { unit: "l", value: liters };

  const diameterUm = input.diameterUm;
  if (diameterUm == null || !Number.isFinite(diameterUm) || diameterUm <= 0) {
    return null;
  }
  /*
    1 Liter = 1 dm³ = 1_000_000 mm³. Über Millimeter gerechnet, weil der
    Durchmesser in Mikrometern kommt und so keine dritte Einheit dazukommt.
  */
  const volumeMm3 = liters * 1_000_000;
  const radiusMm = diameterUm / 2000;
  const areaMm2 = Math.PI * radiusMm * radiusMm;
  const lengthMm = volumeMm3 / areaMm2;
  return { unit: "m", value: lengthMm / 1000 };
}
