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
// Materialart-Bezeichnung
// ---------------------------------------------------------------------------

/**
 * Gängige 3D-Druck-Materialarten für die Vorschläge im Formular.
 *
 * Bis 2.9.0 lag die Liste in `src/types/index.ts`. Seit 2.9.1 braucht sie auch
 * der Server: Sie ist die erste Quelle einer Schreibweise in
 * `canonicalMaterialType`, und Formular und Router müssen dieselbe Liste in
 * derselben Reihenfolge sehen.
 */
export const COMMON_MATERIAL_TYPES = [
  "PLA",
  "PLA+",
  "PETG",
  "ABS",
  "ASA",
  "TPU",
  "PA (Nylon)",
  "PC",
  "PET",
  "HIPS",
  "PVA",
  "PP",
  "Resin",
] as const;

/** „  pla   silk “ → „pla silk“ – Leerraum bereinigt, sonst unverändert. */
function tidyMaterialType(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

/**
 * Vergleichsform einer Materialart: „ pla+ “ → „PLA+“.
 *
 * `materials.materialType` ist Freitext, und zwei Materialarten sind
 * **dieselbe**, wenn ihre Vergleichsform übereinstimmt – Groß-/Kleinschreibung
 * und Leerraum zählen nicht. Bis 2.9.0 galt das nur für den weichen Abgleich
 * mit dem Preset-Katalog (`materialTypeMatches` in `contracts/presets.ts`);
 * die Vorschlagsliste des Formulars und der Filter der Übersicht verglichen
 * exakt, also stand nach einem einmal getippten „Pla“ von da an eine zweite
 * Materialart neben „PLA“ (#36).
 *
 * Nur ein Schlüssel zum Vergleichen, nie das, was gespeichert wird: Welche
 * Schreibweise in der Datenbank steht, entscheidet `canonicalMaterialType`.
 */
export function normalizeMaterialType(input: string): string {
  return tidyMaterialType(input).toUpperCase();
}

/**
 * Die Schreibweise, unter der eine eingegebene Materialart gespeichert wird.
 *
 * Trifft die Vergleichsform der Eingabe eine der bekannten Schreibweisen,
 * gewinnt die bekannte – die **erste** in der Reihenfolge von `known`. Deshalb
 * steht `COMMON_MATERIAL_TYPES` überall davor: „pla“ wird „PLA“, auch wenn im
 * Bestand noch ein „Pla“ stünde. Sonst bleibt die Eingabe, wie sie ist, nur um
 * Leerraum bereinigt: „Nylon“ ist eine neue Materialart und wird nicht zu
 * „NYLON“ – diese Schreibweise hat sich jemand ausgesucht, und die nächste
 * Eingabe von „nylon“ im selben Bereich bekommt sie vorgesetzt.
 *
 * **Die einzige Stelle, an der diese Regel steht.** Der Server ruft sie in
 * jedem Schreibpfad mit der Vorschlagsliste und den Materialarten des Bereichs
 * auf (`knownMaterialTypes` in `api/materialRouter.ts`), das Formular mit
 * seiner Vorschlagsliste, die aus denselben zwei Quellen besteht. Beide kommen
 * damit auf dieselbe Schreibweise; die Migration `0019_material_type_case.sql`
 * hat den Altbestand nach derselben Rangfolge zusammengeführt.
 *
 * Der Preis: Eine Materialart lässt sich nicht **um**schreiben, solange sie im
 * Bereich vorkommt – wer „Nylon“ an einem Material zu „NYLON“ ändert, bekommt
 * „Nylon“ zurück. Für Abkürzungen, und das sind Materialarten, ist das die
 * richtige Seite des Kompromisses.
 */
export function canonicalMaterialType(
  input: string,
  known: Iterable<string>
): string {
  const cleaned = tidyMaterialType(input);
  const key = cleaned.toUpperCase();
  if (!key) return cleaned;
  for (const candidate of known) {
    if (normalizeMaterialType(candidate) === key) return candidate;
  }
  return cleaned;
}

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
 * Das heißt **nicht**, dass sie irgendwo als Beleg zählt: `containerFits`
 * (`contracts/presets.ts`) behandelt sie wie eine fehlende Form, weil „keine der
 * fünf passt“ keine Aussage über die Materialart ist. Hier nicht ausschließen,
 * dort nicht behaupten – beides folgt aus derselben Lesart.
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
 *
 * Die Frage ist bewusst nur die nach dem **Widerspruch**. Wer einen Beleg
 * braucht, nimmt `containerFits`; das ist der Unterschied, den die Anmerkung an
 * `FORMS_BY_KIND` beschreibt.
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

/**
 * 1750 → „1,75 mm“ bzw. „1.75 mm“.
 *
 * Das Trennzeichen kommt aus der Locale, nicht aus dem Code. Vorher stand hier
 * fest das deutsche Komma mit der Begründung „Locale-frei“ – das trug nur,
 * solange die App deutsch war: In `en-US` liest sich `1,75` als
 * eintausendsiebenhundertfünfzig, ein 1,75-mm-Filament stand also als
 * 1750-mm-Filament da.
 */
export function formatDiameter(um: number, locale: string): string {
  const mm = um / 1000;
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(mm)} mm`;
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

/**
 * Füllstand in Prozent (0–100, gerundet), `null` ohne Nennmenge.
 *
 * Eigene Funktion, weil zwei Stellen dieselbe Rundung brauchen: der Füllstand
 * eines Gebindes (`remainingAmount`) und die Vorgabe-Warnschwelle eines
 * Materials (`productStock`). Nur mit derselben Rundung warnt ein Material mit
 * genau einem Gebinde exakt so wie bis 3.1.0 das Gebinde selbst.
 */
export function fillPercent(
  remainingWeight: number,
  nominalWeight: number
): number | null {
  return nominalWeight > 0
    ? Math.min(
        100,
        Math.max(0, Math.round((remainingWeight / nominalWeight) * 100))
      )
    : null;
}

/** Restmenge und Prozentwert, wie sie überall gerechnet werden. */
export type RemainingAmount = {
  /** Gebindetara plus Drybox-Tara */
  tareWeight: number;
  remainingWeight: number;
  /** `null`, wenn keine Nennmenge hinterlegt ist */
  remainingPercent: number | null;
  secondary: SecondaryAmount | null;
  /** Welche Dichte in `secondary` eingegangen ist – für den Hinweis daneben */
  densityUsed: number | null;
};

/**
 * Restmenge, Prozentwert und Zweitanzeige aus den Rohwerten.
 *
 * **Die einzige Stelle, an der diese vier Zahlen entstehen.** Sie standen
 * zweimal da: einmal für den Besitzer (`computeMaterialStats`) und einmal für
 * Freunde (`toFriendMaterial`), jede von einer eigenen Testdatei festgenagelt.
 * Eine dritte Tara-Quelle, eine andere Rundung oder eine andere Regel für „noch
 * nicht gewogen“ hätte gereicht, damit dasselbe Material dem Besitzer und dem
 * Freund verschiedene Gramm und Meter meldet – bei grünen Tests auf beiden
 * Seiten. Die Zahl, die der Freund sieht, ist die, auf die er eine Leihbitte
 * stützt.
 *
 * Rein und ohne Datenbank, hier neben `secondaryAmount` und `resolveDensity`,
 * die beide Seiten schon importieren.
 */
export function remainingAmount(input: {
  nominalWeight: number;
  /** Leergewicht des Gebindes, üblicherweise aus `resolveContainerTare` */
  containerTareWeight: number;
  /** Leergewicht der Drybox, falls darin gewogen wurde */
  boxTareWeight?: number | null;
  /** Bruttogewicht der jüngsten Wägung; `null` = noch keine */
  grossWeight?: number | null;
  /**
   * Summe der Verbräuche seit der jüngsten Wägung in Gramm, üblicherweise aus
   * `consumedSince`. Ohne Wägung sind das **alle** Verbräuche des Materials.
   * Fehlt der Wert, gilt 0 – die Rechnung von vor 2.9.0.
   */
  consumedSinceWeighing?: number | null;
  materialType: string;
  /** Materialart des Lagers; `null` = unbekannt, dann keine Zweitanzeige */
  kind?: MaterialKind | null;
  densityGramsPerLiter?: number | null;
  diameterUm?: number | null;
}): RemainingAmount {
  const tareWeight = input.containerTareWeight + (input.boxTareWeight ?? 0);
  /*
    Basis ist die jüngste Wägung (Brutto minus Tara), sonst die Nennmenge; davon
    gehen die seither abgebuchten Verbräuche ab. Die Klemme auf 0 steht bewusst
    **nach** dem Abzug und nur hier: Ein Verbrauch darf die berechnete Restmenge
    übersteigen – der Slicer schätzt, und eine leere Rolle ist ein ehrlicher
    Zustand, kein Eingabefehler.
  */
  const base =
    input.grossWeight != null
      ? input.grossWeight - tareWeight
      : input.nominalWeight;
  const remainingWeight = Math.max(
    0,
    base - (input.consumedSinceWeighing ?? 0)
  );
  const remainingPercent = fillPercent(remainingWeight, input.nominalWeight);
  /*
    Ohne Materialart keine Zweitanzeige – und keine geratene. Das kann nur bei
    einem Material ohne Lager auftreten, also bei kaputtem Datenbestand.
  */
  const kind = input.kind ?? null;
  const densityUsed =
    kind != null
      ? resolveDensity({
          kind,
          materialType: input.materialType,
          densityGramsPerLiter: input.densityGramsPerLiter,
        })
      : null;
  const secondary =
    kind != null
      ? secondaryAmount({
          kind,
          grams: remainingWeight,
          density: densityUsed,
          diameterUm: input.diameterUm,
        })
      : null;
  return {
    tareWeight,
    remainingWeight,
    remainingPercent,
    secondary,
    densityUsed,
  };
}

// ---------------------------------------------------------------------------
// Verbräuche
// ---------------------------------------------------------------------------

/**
 * Summe der Verbräuche, die **seit der jüngsten Wägung** abgebucht wurden.
 *
 * Ein Verbrauch ist ein Delta („der Druck hat 42 g gebraucht“), keine
 * Messung. Er zählt, solange keine Wägung ihn überholt hat: Wer danach wiegt,
 * misst den Verbrauch mit, und die Wägung ist die Wahrheit. Ohne Wägung zählt
 * alles, gerechnet ab der Nennmenge.
 *
 * `>=` und nicht `>`: Bei gleichem Zeitstempel gilt die Wägung als zuerst
 * geschehen und der Verbrauch als danach – dieselbe Reihenfolge, die
 * `materialHistory` bei Gleichstand anwendet. Beide Fassungen müssen dieselbe
 * Zahl liefern; `api/consumption.test.ts` prüft das.
 *
 * Rein und ohne Datenbank, weil Besitzer- und Freundesansicht sie beide
 * brauchen – aus demselben Grund wie `remainingAmount`.
 */
export function consumedSince(
  /** `weighedAt` der jüngsten Wägung; `null` = noch keine */
  lastWeighedAt: Date | null,
  consumptions: readonly { weight: number; consumedAt: Date }[]
): number {
  const since = lastWeighedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  let sum = 0;
  for (const entry of consumptions) {
    if (entry.consumedAt.getTime() >= since) sum += entry.weight;
  }
  return sum;
}

/** Ein Eintrag im gemeinsamen Verlauf aus Wägungen und Verbräuchen. */
export type MaterialHistoryEntry =
  | {
      kind: "weighing";
      id: number;
      /** `weighedAt` */
      at: Date;
      createdAt: Date;
      note: string | null;
      grossWeight: number;
      /** Brutto minus Tara, nie negativ */
      netWeight: number;
      /** Restmenge nach diesem Eintrag */
      remainingAfter: number;
    }
  | {
      kind: "consumption";
      id: number;
      /** `consumedAt` */
      at: Date;
      createdAt: Date;
      note: string | null;
      /** Abgebuchte Menge in Gramm */
      weight: number;
      /** Restmenge nach diesem Eintrag */
      remainingAfter: number;
    };

/**
 * Wägungen und Verbräuche als **ein** Verlauf, neueste zuerst, mit der
 * Restmenge nach jedem Eintrag.
 *
 * Reihenfolge: nach Zeitpunkt, bei Gleichstand Wägung vor Verbrauch, dann
 * `id`. Der laufende Stand beginnt bei der Nennmenge; eine Wägung setzt ihn auf
 * Brutto minus Tara, ein Verbrauch zieht ab. Beides klemmt auf 0.
 *
 * `[0].remainingAfter` ist damit dieselbe Zahl, die `remainingAmount` aus der
 * jüngsten Wägung und `consumedSince` liefert – und die Zusicherung darüber
 * steht in `api/consumption.test.ts`. Hier gerechnet, damit die Detailseite
 * nicht ihre eigene Fassung von „Brutto minus Tara“ führt: Bis 2.8.0 stand sie
 * dort zweimal, einmal je Darstellung.
 */
export function materialHistory(input: {
  weighings: readonly {
    id: number;
    grossWeight: number;
    weighedAt: Date;
    createdAt: Date;
    note: string | null;
  }[];
  consumptions: readonly {
    id: number;
    weight: number;
    consumedAt: Date;
    createdAt: Date;
    note: string | null;
  }[];
  /** Gebindetara plus Drybox-Tara */
  tareWeight: number;
  nominalWeight: number;
}): MaterialHistoryEntry[] {
  // Verteilend über die Union, sonst blieben von den beiden Arten nur die
  // gemeinsamen Felder übrig.
  type Pending = MaterialHistoryEntry extends infer E
    ? E extends MaterialHistoryEntry
      ? Omit<E, "remainingAfter">
      : never
    : never;
  const pending: Pending[] = [
    ...input.weighings.map<Pending>(w => ({
      kind: "weighing",
      id: w.id,
      at: w.weighedAt,
      createdAt: w.createdAt,
      note: w.note,
      grossWeight: w.grossWeight,
      netWeight: Math.max(0, w.grossWeight - input.tareWeight),
    })),
    ...input.consumptions.map<Pending>(c => ({
      kind: "consumption",
      id: c.id,
      at: c.consumedAt,
      createdAt: c.createdAt,
      note: c.note,
      weight: c.weight,
    })),
  ];
  pending.sort(
    (a, b) =>
      a.at.getTime() - b.at.getTime() ||
      // Wägung vor Verbrauch – siehe `consumedSince`.
      Number(a.kind === "consumption") - Number(b.kind === "consumption") ||
      a.id - b.id
  );
  let running = input.nominalWeight;
  const entries = pending.map<MaterialHistoryEntry>(entry => {
    running =
      entry.kind === "weighing"
        ? entry.netWeight
        : Math.max(0, running - entry.weight);
    return { ...entry, remainingAfter: running };
  });
  return entries.reverse();
}

// ---------------------------------------------------------------------------
// Tendenz und Reichweite
// ---------------------------------------------------------------------------

export type ConsumptionTrend = {
  /** Verbrauch in Gramm je Woche über das betrachtete Fenster; 0 = kein Verbrauch */
  gramsPerWeek: number;
  /**
   * Wochen, bis bei gleichem Tempo nichts mehr übrig ist. `null`, wenn es kein
   * Tempo gibt – nichts verbraucht oder sogar mehr da als vorher.
   */
  weeksLeft: number | null;
};

/** Über wie viele Tage die Tendenz gerechnet wird, wenn nichts anderes gesagt ist. */
export const TREND_WINDOW_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Tendenz aus dem Verlauf: Gramm je Woche und Reichweite bei gleichem Tempo.
 *
 * Gerechnet wird über **zwei Punkte**, nicht über eine Regression: den
 * jüngsten Eintrag und den ältesten innerhalb des Fensters. Wer in den letzten
 * neunzig Tagen nur einmal gewogen hat, bekommt den letzten Eintrag davor als
 * Bezug – sonst hieße „selten wiegen“ „keine Tendenz“, und genau dann wäre sie
 * am nützlichsten. Zwei Punkte am selben Tag ergeben keine Aussage, auch nicht
 * eine falsche: dann `null`.
 *
 * Eine Wägung, die **mehr** meldet als der Bezug (neue Rolle, korrigierte Tara),
 * ist kein negativer Verbrauch, sondern kein Verbrauch – Tempo 0, Reichweite
 * unbekannt. Die Zahl ist eine Schätzung fürs Auge und geht nirgends in eine
 * Rechnung ein; die Restmenge selbst kommt weiterhin aus `remainingAmount`.
 *
 * `history` ist die Liste aus `materialHistory`: neueste zuerst, mit
 * `remainingAfter` je Eintrag.
 */
export function consumptionTrend(input: {
  history: readonly Pick<MaterialHistoryEntry, "at" | "remainingAfter">[];
  now?: Date;
  windowDays?: number;
}): ConsumptionTrend | null {
  const { history } = input;
  if (history.length < 2) return null;
  const windowDays = input.windowDays ?? TREND_WINDOW_DAYS;
  const now = input.now ?? new Date();
  const cutoff = now.getTime() - windowDays * DAY_MS;

  const newest = history[0];
  /*
    Der älteste Eintrag im Fenster; liegt nur der jüngste darin, der erste
    davor. `history` ist neueste zuerst, deshalb läuft die Suche vorwärts und
    merkt sich den letzten Treffer im Fenster.
  */
  let reference = newest;
  let leftWindow = false;
  for (let i = 1; i < history.length; i++) {
    const entry = history[i];
    if (entry.at.getTime() >= cutoff) {
      reference = entry;
    } else {
      if (reference === newest) reference = entry;
      leftWindow = true;
      break;
    }
  }
  if (reference === newest && !leftWindow) return null;

  const spanDays = (newest.at.getTime() - reference.at.getTime()) / DAY_MS;
  if (!(spanDays >= 1)) return null;

  const consumed = reference.remainingAfter - newest.remainingAfter;
  if (consumed <= 0) return { gramsPerWeek: 0, weeksLeft: null };

  const gramsPerWeek = (consumed / spanDays) * 7;
  return {
    gramsPerWeek,
    weeksLeft: newest.remainingAfter / gramsPerWeek,
  };
}

// ---------------------------------------------------------------------------
// Material und Gebinde (seit 4.0.0)
// ---------------------------------------------------------------------------

/**
 * Ab welchem Füllstand in Prozent ein Material als knapp gilt, wenn kein Lager
 * eine eigene Schwelle in Gramm setzt (`lager.lowStockGrams`).
 *
 * Bis 3.1.0 galt der Wert je Gebinde und stand in
 * `src/components/StockTiles.tsx`. Seit das Material die Gebinde bündelt, ist
 * er die **Vorgabe** von `productStock` und steht deshalb hier.
 */
export const LOW_STOCK_PERCENT = 25;

/** Höchstwert einer Warnschwelle in Gramm – 1 t ist kein Vorrat mehr, sondern ein Tippfehler. */
export const MAX_LOW_STOCK_GRAMS = 1_000_000;

/** Warnschwelle am Lager: ganze Gramm, `null` = Vorgabe */
export const lowStockGramsSchema = z
  .number()
  .int()
  .min(0, "Die Schwelle kann nicht negativ sein")
  .max(MAX_LOW_STOCK_GRAMS, "Die Schwelle ist unplausibel hoch")
  .nullable();

/** Bestand eines Materials über alle seine Gebinde. */
export type ProductStock = {
  /** Summe der Restmengen aller Gebinde in Gramm, über alle Lager */
  totalRemaining: number;
  /** Anzahl der Gebinde */
  count: number;
  /**
   * Die geltende Schwelle in Gramm – bei der Vorgabe nur zur Anzeige
   * gerundet, entschieden wird dort über den Prozentwert. `null` ohne Gebinde.
   */
  threshold: number | null;
  /** Woher die Schwelle kommt: ein Lager, die Vorgabe oder nichts */
  thresholdSource: "lager" | "default" | null;
  low: boolean;
};

/**
 * Ob ein Material knapp ist – **die einzige Stelle, an der diese Regel steht.**
 *
 * - Bestand ist die Summe der Restmengen **aller** Gebinde, über alle Lager:
 *   Wer die zweite Rolle im Keller hat, hat sie.
 * - Setzt mindestens eines der Lager, in denen das Material liegt, eine
 *   Schwelle in Gramm, gilt die **höchste**. Eine zu frühe Warnung kostet einen
 *   Klick, eine zu späte einen abgebrochenen Druck.
 * - Sonst gilt die Vorgabe: `LOW_STOCK_PERCENT` % der **größten** Nennmenge
 *   unter den Gebinden, mit derselben Rundung wie der Füllstand
 *   (`fillPercent`). Ein Material mit genau einem Gebinde warnt damit exakt
 *   so wie bis 3.1.0 das Gebinde selbst; `api/productStock.test.ts` nagelt
 *   diese Gleichheit fest.
 *
 * Der Füllstand je Gebinde (der Ring der Spule) bleibt davon unberührt – nur
 * die **Warnung** rechnet je Material.
 */
export function productStock(
  gebinde: readonly {
    remainingWeight: number;
    nominalWeight: number;
    /** `lowStockGrams` des Lagers, in dem das Gebinde liegt */
    lagerLowStockGrams: number | null | undefined;
  }[]
): ProductStock {
  if (gebinde.length === 0) {
    return {
      totalRemaining: 0,
      count: 0,
      threshold: null,
      thresholdSource: null,
      low: false,
    };
  }
  let totalRemaining = 0;
  let maxNominal = 0;
  let lagerThreshold: number | null = null;
  for (const g of gebinde) {
    totalRemaining += g.remainingWeight;
    maxNominal = Math.max(maxNominal, g.nominalWeight);
    if (g.lagerLowStockGrams != null) {
      lagerThreshold = Math.max(lagerThreshold ?? 0, g.lagerLowStockGrams);
    }
  }
  if (lagerThreshold != null) {
    return {
      totalRemaining,
      count: gebinde.length,
      threshold: lagerThreshold,
      thresholdSource: "lager",
      low: totalRemaining <= lagerThreshold,
    };
  }
  const percent = fillPercent(totalRemaining, maxNominal);
  return {
    totalRemaining,
    count: gebinde.length,
    threshold: Math.round((maxNominal * LOW_STOCK_PERCENT) / 100),
    thresholdSource: "default",
    low: percent != null && percent <= LOW_STOCK_PERCENT,
  };
}

/** Freitext zum Vergleichen: getrimmt, Leerraum zusammengefasst, klein. */
function compareForm(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Die Merkmale, an denen zwei Materialien als **dasselbe Produkt** erkannt
 * werden: Materialart und Stärke des Lagers, Materialart-Bezeichnung,
 * Hersteller, Farbe, Oberfläche.
 */
export type ProductIdentity = {
  kind: MaterialKind | null;
  diameterUm: number | null;
  materialType: string;
  manufacturer: string | null;
  color: string | null;
  texture: string | null;
};

/**
 * Vergleichsschlüssel eines Materials, oder `null`, wenn es zu vage ist.
 *
 * **Konservativ**: Ohne Hersteller **und** Farbe gibt es keinen Schlüssel –
 * „PLA“ allein ist kein Produkt, und zwei fälschlich zusammengelegte Rollen
 * sind schlimmer als zwei getrennte, weil die Warnung dann zu spät kommt.
 *
 * Dieselbe Regel steht als SQL in der Migration
 * `0022_material_products.sql` (Stand 4.0.0); der Import (`importMany`) und
 * die Vorschläge zum Zusammenführen (`mergeCandidates`) rufen diese Fassung.
 */
export function productKey(identity: ProductIdentity): string | null {
  const manufacturer = compareForm(identity.manufacturer);
  const color = compareForm(identity.color);
  if (!manufacturer || !color || identity.kind == null) return null;
  return [
    identity.kind,
    identity.diameterUm ?? "",
    normalizeMaterialType(identity.materialType),
    manufacturer,
    color,
    compareForm(identity.texture),
  ].join("\u001f");
}

/**
 * Materialien, die wie dasselbe Produkt aussehen – Vorschläge zum
 * Zusammenführen, **nie** automatisch.
 *
 * Gleich ist, was denselben `productKey` hat; zusätzlich, bei leerem
 * Hersteller oder leerer Farbe, derselbe Name bei gleicher Materialart,
 * Stärke und Bezeichnung. Den zweiten Fall legt die Migration bewusst nicht
 * zusammen, aber als Frage an den Menschen ist er gut.
 *
 * Liefert Gruppen mit mindestens zwei IDs, die älteste (kleinste ID) zuerst.
 */
export function mergeCandidates(
  products: readonly (ProductIdentity & { id: number; name: string })[]
): number[][] {
  const groups = new Map<string, number[]>();
  for (const p of products) {
    const key =
      productKey(p) ??
      (p.kind != null && compareForm(p.name)
        ? [
            "name",
            p.kind,
            p.diameterUm ?? "",
            normalizeMaterialType(p.materialType),
            compareForm(p.name),
          ].join("\u001f")
        : null);
    if (key == null) continue;
    const list = groups.get(key);
    if (list) list.push(p.id);
    else groups.set(key, [p.id]);
  }
  return [...groups.values()]
    .filter(ids => ids.length > 1)
    .map(ids => [...ids].sort((a, b) => a - b));
}
