import type { NameI18n, ContainerMaterial } from "@contracts/presets";

/**
 * Startkatalog für Hersteller und Spulen.
 *
 * Reine Daten ohne Datenbankzugriff – dadurch in Tests ohne Infrastruktur
 * prüfbar (siehe api/presetCatalog.test.ts).
 *
 * Quellen der Leergewichte
 * ------------------------
 * Grundlage ist ContainermanDB (https://github.com/Donkie/ContainermanDB, MIT), die
 * gepflegte Filamentdatenbank hinter Containerman. Sie führt das Leergewicht je
 * Produktlinie und Spulengröße und wird laufend aus Herstellerangaben und
 * Nachmessungen korrigiert. Gegengeprüft wurde stichprobenartig gegen
 * Herstellerseiten und die Übersichten von ContainerVault
 * (https://www.containervault.com/guides/empty-container-weights.html) und
 * MatterHackers (https://help.matterhackers.com/article/129-empty-container-weights).
 *
 * Einzelne gut belegte Eckwerte:
 *   - Polymaker Kartonspule 1 kg: 140 ± 7 g, Ø 200 mm, Breite 65,6 mm, Bohrung 55 mm
 *   - Polymaker Kartonspule 3 kg: 425 ± 21 g, Ø 250 mm, Breite 117 mm
 *   - Prusament Standardspule 1 kg: 201 g
 *   - Bambu Lab wiederverwendbare Kunststoffspule: 250 g
 *   - eSUN Kunststoffspule 1 kg: ca. 200 g (aktuell) bzw. ca. 224 g (ältere Serie)
 *
 * Grenzen der Daten
 * -----------------
 * Kartonspulen ziehen Feuchtigkeit und schwanken um einige Gramm. Hersteller
 * ändern Spulen außerdem ohne Ankündigung, teils zwischen zwei Chargen
 * derselben Farbe. Die Werte hier sind deshalb Startwerte, keine Messung der
 * Rolle in der Hand – wer es genau braucht, wiegt die leere Spule und legt
 * einen eigenen Rollentyp an.
 *
 * Wo eine Produktlinie physisch dieselbe Spule nutzt (etwa Prusament über
 * PLA, PETG, ASA und PVB hinweg), steht bewusst überall derselbe Wert: eine
 * Spule hat ein Gewicht, und je Materialart abweichende Zahlen wären nur das
 * Rauschen der jeweiligen Nachmessung.
 *
 * Aufgenommen wird nur, was sich belegen lässt: ein falscher Startwert ist
 * schlechter als ein fehlender Eintrag. Deshalb fehlen hier Hersteller und
 * Sondergrößen, zu denen die Quellen sich widersprechen. Erweiterungen kommen
 * über Vorschläge aus der Community oder über die Administration.
 */

export type SeedVariant = {
  nominalWeight: number;
  tareWeight: number;
  outerDiameterMm?: number;
  widthMm?: number;
  boreDiameterMm?: number;
  notes?: string;
};

export type SeedVersion = {
  slug: string;
  /** Grundname (deutsch); Übersetzungen stehen in `nameI18n` */
  name: string;
  nameI18n?: NameI18n;
  containerMaterial: ContainerMaterial;
  validFrom?: string;
  validTo?: string;
  variants: SeedVariant[];
};

export type SeedSeries = {
  slug: string;
  /** Grundname (deutsch); Übersetzungen stehen in `nameI18n` */
  name: string;
  /**
   * Nur nötig, wo der Name beschreibend ist. Produktnamen wie „PolyTerra PLA“
   * sind Eigennamen und bleiben in jeder Sprache gleich.
   */
  nameI18n?: NameI18n;
  materialTypes: string[];
  versions: SeedVersion[];
};

export type SeedManufacturer = {
  slug: string;
  name: string;
  website?: string;
  series: SeedSeries[];
};

/**
 * Bei inhaltlichen Korrekturen am Startkatalog erhöhen. Nur dann werden
 * bereits geseedete Einträge überschrieben – von Administratoren oder aus
 * der Community geänderte Einträge bleiben davon immer unberührt.
 */
export const PRESET_SEED_REVISION = 4;

export const presetSeedCatalog: SeedManufacturer[] = [
  {
    slug: "polymaker",
    name: "Polymaker",
    website: "https://polymaker.com",
    series: [
      {
        slug: "polyterra-pla",
        /*
         * Polymaker hat die PLA-Ästhetiklinien ab Ende 2024 auf „Panchroma“
         * umbenannt: PolyTerra PLA wurde Panchroma Matte, PolyTerra PLA+
         * wurde Satin, die Effekte aus PolyLite wurden Galaxy und Starlight.
         * Laut Polymaker-Wiki nur ein neuer Name, dieselbe Rezeptur und
         * dieselbe Spule – deshalb bleibt es ein Eintrag. Beide Namen stehen
         * im Label, sonst findet weder die alte noch die neue Rolle hierher.
         */
        name: "Panchroma (früher PolyTerra PLA)",
        nameI18n: { en: "Panchroma (formerly PolyTerra PLA)" },
        materialTypes: ["PLA"],
        versions: [
          {
            slug: "karton-ab-2021",
            name: "Kartonspule (ab 2021)",
            nameI18n: { en: "Cardboard container (from 2021)" },
            containerMaterial: "karton",
            validFrom: "2021-01-01",
            variants: [
              {
                nominalWeight: 1000,
                tareWeight: 140,
                outerDiameterMm: 200,
                widthMm: 66,
                boreDiameterMm: 55,
              },
              {
                nominalWeight: 3000,
                tareWeight: 425,
                outerDiameterMm: 250,
                widthMm: 117,
                boreDiameterMm: 55,
              },
            ],
          },
          {
            slug: "kunststoffspule-5-kg",
            name: "Kunststoffspule (5 kg)",
            nameI18n: { en: "Plastic container (5 kg)" },
            containerMaterial: "kunststoff",
            variants: [{ nominalWeight: 5000, tareWeight: 819 }],
          },
          {
            slug: "kunststoff-bis-2020",
            name: "Kunststoffspule (bis 2020)",
            nameI18n: { en: "Plastic container (until 2020)" },
            containerMaterial: "kunststoff",
            validTo: "2020-12-31",
            variants: [{ nominalWeight: 1000, tareWeight: 215 }],
          },
        ],
      },
      {
        slug: "polylite",
        name: "PolyLite",
        materialTypes: ["PLA", "PETG", "ABS", "ASA", "PC"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            validTo: "2022-12-31",
            variants: [
              { nominalWeight: 1000, tareWeight: 215 },
              {
                nominalWeight: 3000,
                tareWeight: 425,
                outerDiameterMm: 250,
                widthMm: 117,
                boreDiameterMm: 55,
              },
            ],
          },
          {
            slug: "kartonspule",
            name: "Kartonspule",
            nameI18n: { en: "Cardboard container" },
            containerMaterial: "karton",
            validFrom: "2023-01-01",
            variants: [
              {
                nominalWeight: 1000,
                tareWeight: 140,
                outerDiameterMm: 200,
                widthMm: 66,
                boreDiameterMm: 55,
              },
              {
                nominalWeight: 3000,
                tareWeight: 425,
                outerDiameterMm: 250,
                widthMm: 117,
                boreDiameterMm: 55,
              },
            ],
          },
          {
            slug: "kunststoffspule-5-kg",
            name: "Kunststoffspule (5 kg)",
            nameI18n: { en: "Plastic container (5 kg)" },
            containerMaterial: "kunststoff",
            variants: [{ nominalWeight: 5000, tareWeight: 819 }],
          },
        ],
      },
      {
        slug: "polymax",
        name: "PolyMax",
        materialTypes: ["PLA", "PETG", "PC"],
        versions: [
          {
            slug: "kartonspule",
            name: "Kartonspule",
            nameI18n: { en: "Cardboard container" },
            containerMaterial: "karton",
            variants: [
              { nominalWeight: 750, tareWeight: 125 },
              {
                nominalWeight: 3000,
                tareWeight: 425,
                outerDiameterMm: 250,
                widthMm: 117,
                boreDiameterMm: 55,
              },
            ],
          },
        ],
      },
      {
        slug: "polysonic-pla",
        name: "PolySonic PLA",
        materialTypes: ["PLA"],
        versions: [
          {
            slug: "kartonspule",
            name: "Kartonspule",
            nameI18n: { en: "Cardboard container" },
            containerMaterial: "karton",
            variants: [
              {
                nominalWeight: 1000,
                tareWeight: 140,
                outerDiameterMm: 200,
                widthMm: 66,
                boreDiameterMm: 55,
              },
            ],
          },
        ],
      },
      {
        slug: "polyflex-tpu",
        name: "PolyFlex TPU",
        materialTypes: ["TPU"],
        versions: [
          {
            slug: "kartonspule",
            name: "Kartonspule",
            nameI18n: { en: "Cardboard container" },
            containerMaterial: "karton",
            variants: [
              { nominalWeight: 750, tareWeight: 125 },
              { nominalWeight: 1000, tareWeight: 140 },
            ],
          },
        ],
      },
      {
        slug: "fiberon",
        name: "Fiberon",
        materialTypes: ["PA", "PA-CF", "PA-GF"],
        versions: [
          {
            slug: "kartonspule",
            name: "Kartonspule",
            nameI18n: { en: "Cardboard container" },
            containerMaterial: "karton",
            variants: [
              { nominalWeight: 500, tareWeight: 190 },
              { nominalWeight: 2000, tareWeight: 370 },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "prusament",
    name: "Prusament",
    website: "https://prusament.com",
    series: [
      {
        slug: "prusament-pla",
        name: "Prusament PLA",
        materialTypes: ["PLA"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [
              {
                nominalWeight: 1000,
                tareWeight: 201,
                notes:
                  "Der Papierkern zieht Feuchtigkeit; Nachmessungen liegen zwischen 193 und 207 g.",
              },
              { nominalWeight: 2000, tareWeight: 219 },
            ],
          },
        ],
      },
      {
        slug: "prusament-petg",
        name: "Prusament PETG",
        materialTypes: ["PETG"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [
              { nominalWeight: 1000, tareWeight: 201 },
              { nominalWeight: 2000, tareWeight: 219 },
            ],
          },
        ],
      },
      {
        slug: "prusament-asa",
        name: "Prusament ASA",
        materialTypes: ["ASA"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [{ nominalWeight: 800, tareWeight: 201 }],
          },
        ],
      },
      {
        slug: "prusament-pvb",
        name: "Prusament PVB",
        materialTypes: ["PVB"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [{ nominalWeight: 1000, tareWeight: 201 }],
          },
        ],
      },
      {
        slug: "prusament-tpu",
        name: "Prusament TPU",
        materialTypes: ["TPU"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [{ nominalWeight: 500, tareWeight: 220 }],
          },
        ],
      },
    ],
  },
  {
    slug: "bambu-lab",
    name: "Bambu Lab",
    website: "https://bambulab.com",
    series: [
      {
        slug: "filament-mit-spule",
        name: "Filament mit Spule",
        nameI18n: { en: "Filament with container" },
        materialTypes: [],
        versions: [
          {
            slug: "wiederverwendbare-spule",
            name: "Wiederverwendbare Kunststoffspule",
            nameI18n: { en: "Reusable plastic container" },
            containerMaterial: "kunststoff",
            variants: [
              { nominalWeight: 500, tareWeight: 250 },
              { nominalWeight: 1000, tareWeight: 250 },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "esun",
    name: "eSUN",
    website: "https://esun3d.com",
    series: [
      {
        slug: "standardspule",
        name: "Standardspule",
        nameI18n: { en: "Standard container" },
        materialTypes: ["PLA", "PETG", "ABS"],
        versions: [
          {
            slug: "kunststoffspule-aktuell",
            name: "Kunststoffspule (aktuell)",
            nameI18n: { en: "Plastic container (current)" },
            containerMaterial: "kunststoff",
            variants: [
              {
                nominalWeight: 1000,
                tareWeight: 200,
                outerDiameterMm: 200,
                boreDiameterMm: 52,
              },
            ],
          },
          {
            slug: "kunststoffspule-aelter",
            name: "Kunststoffspule (ältere Serie)",
            nameI18n: { en: "Plastic container (older series)" },
            containerMaterial: "kunststoff",
            validTo: "2020-12-31",
            variants: [{ nominalWeight: 1000, tareWeight: 224 }],
          },
          {
            slug: "kartonspule",
            name: "Kartonspule",
            nameI18n: { en: "Cardboard container" },
            containerMaterial: "karton",
            validFrom: "2023-01-01",
            variants: [
              {
                nominalWeight: 1000,
                tareWeight: 170,
                notes:
                  "Für PLA, PLA+ und PLA-Matte; PETG, ABS+ und TPU laufen weiter auf der Kunststoffspule.",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "sunlu",
    name: "SUNLU",
    website: "https://sunlu.com",
    series: [
      {
        slug: "standardspule",
        name: "Standardspule",
        nameI18n: { en: "Standard container" },
        materialTypes: ["PLA", "PLA+", "PETG", "ABS", "TPU"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [{ nominalWeight: 1000, tareWeight: 130 }],
          },
        ],
      },
      {
        slug: "high-speed-matte-petg",
        name: "High Speed Matte PETG",
        materialTypes: ["PETG"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [{ nominalWeight: 1000, tareWeight: 168 }],
          },
        ],
      },
    ],
  },
  {
    slug: "overture",
    name: "Overture",
    website: "https://overture3d.com",
    series: [
      {
        slug: "pla",
        name: "PLA (auch Matte, Silk, Rock)",
        nameI18n: { en: "PLA (incl. Matte, Silk, Rock)" },
        materialTypes: ["PLA"],
        versions: [
          {
            slug: "kartonspule",
            name: "Kartonspule",
            nameI18n: { en: "Cardboard container" },
            containerMaterial: "karton",
            variants: [{ nominalWeight: 1000, tareWeight: 155 }],
          },
        ],
      },
      {
        slug: "petg",
        name: "PETG und ASA",
        nameI18n: { en: "PETG and ASA" },
        materialTypes: ["PETG", "ASA"],
        versions: [
          {
            slug: "kartonspule",
            name: "Kartonspule",
            nameI18n: { en: "Cardboard container" },
            containerMaterial: "karton",
            variants: [{ nominalWeight: 1000, tareWeight: 132 }],
          },
        ],
      },
      {
        slug: "abs",
        name: "ABS",
        materialTypes: ["ABS"],
        versions: [
          {
            slug: "kartonspule",
            name: "Kartonspule",
            nameI18n: { en: "Cardboard container" },
            containerMaterial: "karton",
            variants: [{ nominalWeight: 1000, tareWeight: 147 }],
          },
        ],
      },
      {
        slug: "tpu",
        name: "TPU High Speed 95A",
        materialTypes: ["TPU"],
        versions: [
          {
            slug: "kartonspule",
            name: "Kartonspule",
            nameI18n: { en: "Cardboard container" },
            containerMaterial: "karton",
            variants: [{ nominalWeight: 1000, tareWeight: 174 }],
          },
        ],
      },
    ],
  },
  {
    slug: "elegoo",
    name: "ELEGOO",
    website: "https://elegoo.com",
    series: [
      {
        slug: "standardspule",
        name: "Standardspule",
        nameI18n: { en: "Standard container" },
        materialTypes: ["PLA", "PLA+", "PETG", "ASA"],
        versions: [
          {
            slug: "kartonspule",
            name: "Kartonspule",
            nameI18n: { en: "Cardboard container" },
            containerMaterial: "karton",
            variants: [{ nominalWeight: 1000, tareWeight: 154 }],
          },
        ],
      },
    ],
  },
  {
    slug: "anycubic",
    name: "Anycubic",
    website: "https://anycubic.com",
    series: [
      {
        slug: "standardspule",
        name: "Standardspule",
        nameI18n: { en: "Standard container" },
        materialTypes: ["PLA", "PLA+", "PETG", "ABS", "TPU"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [{ nominalWeight: 1000, tareWeight: 127 }],
          },
          {
            slug: "kartonspule",
            name: "Kartonspule",
            nameI18n: { en: "Cardboard container" },
            containerMaterial: "karton",
            variants: [{ nominalWeight: 1000, tareWeight: 125 }],
          },
        ],
      },
    ],
  },
  {
    slug: "creality",
    name: "Creality",
    website: "https://creality.com",
    series: [
      {
        slug: "hyper",
        name: "Hyper (PLA, ABS)",
        materialTypes: ["PLA", "ABS"],
        versions: [
          {
            slug: "kartonspule",
            name: "Kartonspule",
            nameI18n: { en: "Cardboard container" },
            containerMaterial: "karton",
            variants: [{ nominalWeight: 1000, tareWeight: 120 }],
          },
        ],
      },
      {
        slug: "cr-petg",
        name: "CR-PETG",
        materialTypes: ["PETG"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [{ nominalWeight: 1000, tareWeight: 225 }],
          },
        ],
      },
    ],
  },
  {
    slug: "hatchbox",
    name: "HATCHBOX",
    website: "https://hatchbox3d.com",
    series: [
      {
        slug: "standardspule",
        name: "Standardspule",
        nameI18n: { en: "Standard container" },
        materialTypes: ["PLA", "ABS"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [{ nominalWeight: 1000, tareWeight: 251 }],
          },
        ],
      },
    ],
  },
  {
    slug: "extrudr",
    name: "Extrudr",
    website: "https://extrudr.com",
    series: [
      {
        slug: "standardspule",
        name: "Standardspule",
        nameI18n: { en: "Standard container" },
        materialTypes: ["PLA", "PETG", "ASA", "ABS", "TPU", "PCTG"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [
              {
                nominalWeight: 1000,
                tareWeight: 260,
                notes:
                  "Dieselbe Spule trägt je nach Material 500 bis 1100 g Filament.",
              },
              { nominalWeight: 2500, tareWeight: 600 },
              { nominalWeight: 5000, tareWeight: 820 },
              { nominalWeight: 10000, tareWeight: 1020 },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "fillamentum",
    name: "Fillamentum",
    website: "https://fillamentum.com",
    series: [
      {
        slug: "extrafill",
        name: "Extrafill",
        materialTypes: ["PLA", "ASA"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [
              { nominalWeight: 750, tareWeight: 230 },
              { nominalWeight: 2500, tareWeight: 590 },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "formfutura",
    name: "FormFutura",
    website: "https://formfutura.com",
    series: [
      {
        slug: "easyfil-pla",
        name: "EasyFil PLA",
        materialTypes: ["PLA"],
        versions: [
          {
            slug: "kartonspule",
            name: "Kartonspule",
            nameI18n: { en: "Cardboard container" },
            containerMaterial: "karton",
            variants: [
              { nominalWeight: 250, tareWeight: 130 },
              { nominalWeight: 750, tareWeight: 160 },
              { nominalWeight: 1000, tareWeight: 210 },
              { nominalWeight: 2300, tareWeight: 265 },
            ],
          },
        ],
      },
      {
        slug: "reform-rpet",
        name: "ReForm rPET",
        materialTypes: ["PETG"],
        versions: [
          {
            slug: "kartonspule",
            name: "Kartonspule",
            nameI18n: { en: "Cardboard container" },
            containerMaterial: "karton",
            variants: [
              { nominalWeight: 500, tareWeight: 130 },
              { nominalWeight: 750, tareWeight: 150 },
              { nominalWeight: 1000, tareWeight: 185 },
              { nominalWeight: 2300, tareWeight: 265 },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "spectrum",
    name: "Spectrum",
    website: "https://spectrumfilaments.com",
    series: [
      {
        slug: "standardspule",
        name: "Standardspule",
        nameI18n: { en: "Standard container" },
        materialTypes: ["PLA", "PETG", "PCTG", "ASA"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [{ nominalWeight: 1000, tareWeight: 245 }],
          },
        ],
      },
    ],
  },
  {
    slug: "devil-design",
    name: "Devil Design",
    website: "https://devildesign.com",
    series: [
      {
        slug: "standardspule",
        name: "Standardspule",
        nameI18n: { en: "Standard container" },
        materialTypes: ["PLA", "PETG", "ABS+", "ASA", "HIPS", "TPU"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [{ nominalWeight: 1000, tareWeight: 260 }],
          },
        ],
      },
    ],
  },
  {
    slug: "das-filament",
    name: "Das Filament",
    website: "https://dasfilament.de",
    series: [
      {
        slug: "pla",
        name: "PLA",
        materialTypes: ["PLA"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [{ nominalWeight: 800, tareWeight: 212 }],
          },
        ],
      },
      {
        slug: "petg",
        name: "PETG",
        materialTypes: ["PETG"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [{ nominalWeight: 800, tareWeight: 250 }],
          },
        ],
      },
    ],
  },
  {
    slug: "3djake",
    name: "3DJAKE",
    website: "https://3djake.de",
    series: [
      {
        slug: "ecopla",
        name: "ecoPLA (auch ASA)",
        nameI18n: { en: "ecoPLA (incl. ASA)" },
        materialTypes: ["PLA", "ASA"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [{ nominalWeight: 1000, tareWeight: 240 }],
          },
        ],
      },
      {
        slug: "petg",
        name: "PETG und PCTG",
        nameI18n: { en: "PETG and PCTG" },
        materialTypes: ["PETG", "PCTG"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [{ nominalWeight: 1000, tareWeight: 231 }],
          },
        ],
      },
    ],
  },
  {
    slug: "add-north",
    name: "add:north",
    website: "https://addnorth.com",
    series: [
      {
        slug: "standardspule",
        name: "Standardspule",
        nameI18n: { en: "Standard container" },
        materialTypes: ["PLA", "PETG", "ABS", "PA", "TPU"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [
              { nominalWeight: 500, tareWeight: 175 },
              { nominalWeight: 750, tareWeight: 207 },
              { nominalWeight: 1000, tareWeight: 238 },
              { nominalWeight: 2300, tareWeight: 600 },
              { nominalWeight: 5000, tareWeight: 780 },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "azurefilm",
    name: "AzureFilm",
    website: "https://azurefilm.si",
    series: [
      {
        slug: "standardspule",
        name: "Standardspule",
        nameI18n: { en: "Standard container" },
        materialTypes: ["PLA", "PETG", "PCTG", "ASA", "ABS", "TPU"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [{ nominalWeight: 1000, tareWeight: 164 }],
          },
        ],
      },
    ],
  },
  {
    slug: "rosa3d",
    name: "Rosa3D",
    website: "https://rosa3d.pl",
    series: [
      {
        slug: "standardspule",
        name: "Standardspule",
        nameI18n: { en: "Standard container" },
        materialTypes: ["PLA", "ABS", "ASA"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [
              { nominalWeight: 1000, tareWeight: 250 },
              { nominalWeight: 2500, tareWeight: 700 },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "r3d",
    name: "R3D",
    website: "https://r3dprint.com",
    series: [
      {
        slug: "standardspule",
        name: "Standardspule",
        nameI18n: { en: "Standard container" },
        materialTypes: ["PLA", "PETG", "ABS", "ASA", "TPU"],
        versions: [
          {
            /*
             * Nur die Kunststoffspule: ContainermanDB führt daneben eine
             * Kartonspule, nennt dafür aber im selben Datensatz 100 g und
             * 140 g – und die anderen Sammlungen kennen für R3D gar keine.
             * Ein widersprüchlicher Startwert wäre schlechter als keiner.
             */
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [
              { nominalWeight: 1000, tareWeight: 127 },
              { nominalWeight: 3000, tareWeight: 320 },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "jayo",
    name: "JAYO",
    website: "https://jayo3d.com",
    series: [
      {
        slug: "standardspule",
        name: "Standardspule",
        nameI18n: { en: "Standard container" },
        materialTypes: ["PLA", "PLA+", "PETG", "TPU"],
        versions: [
          {
            slug: "kartonspule",
            name: "Kartonspule",
            nameI18n: { en: "Cardboard container" },
            containerMaterial: "karton",
            variants: [
              {
                nominalWeight: 1100,
                tareWeight: 120,
                notes: "JAYO liefert 1,1 kg Filament je Rolle.",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "flashforge",
    name: "FlashForge",
    website: "https://flashforge.com",
    series: [
      {
        slug: "pla",
        name: "PLA",
        materialTypes: ["PLA"],
        versions: [
          {
            slug: "standardspule",
            name: "Standardspule",
            nameI18n: { en: "Standard container" },
            containerMaterial: "kunststoff",
            variants: [
              { nominalWeight: 500, tareWeight: 142 },
              { nominalWeight: 1000, tareWeight: 170 },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "eryone",
    name: "Eryone",
    website: "https://eryone3d.com",
    series: [
      {
        slug: "standardspule",
        name: "Standardspule",
        nameI18n: { en: "Standard container" },
        materialTypes: ["PLA", "PETG"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [{ nominalWeight: 1000, tareWeight: 187 }],
          },
        ],
      },
    ],
  },
  {
    slug: "amazon-basics",
    name: "Amazon Basics",
    series: [
      {
        slug: "pla",
        name: "PLA",
        materialTypes: ["PLA"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [{ nominalWeight: 1000, tareWeight: 232 }],
          },
        ],
      },
      {
        slug: "abs",
        name: "ABS",
        materialTypes: ["ABS"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [{ nominalWeight: 1000, tareWeight: 252 }],
          },
        ],
      },
    ],
  },
  {
    slug: "tinmorry",
    name: "TINMORRY",
    website: "https://tinmorry.com",
    series: [
      {
        slug: "standardspule",
        name: "Standardspule",
        nameI18n: { en: "Standard container" },
        materialTypes: ["PLA", "PETG"],
        versions: [
          {
            slug: "kartonspule",
            name: "Kartonspule",
            nameI18n: { en: "Cardboard container" },
            containerMaterial: "karton",
            variants: [{ nominalWeight: 1000, tareWeight: 160 }],
          },
        ],
      },
    ],
  },
  {
    slug: "geeetech",
    name: "GEEETECH",
    website: "https://geeetech.com",
    series: [
      {
        slug: "standardspule",
        name: "Standardspule",
        nameI18n: { en: "Standard container" },
        materialTypes: ["PLA", "PETG"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [{ nominalWeight: 1000, tareWeight: 180 }],
          },
        ],
      },
    ],
  },
  {
    slug: "qidi-tech",
    name: "QIDI Tech",
    website: "https://qidi3d.com",
    series: [
      {
        slug: "standardspule",
        name: "Standardspule",
        nameI18n: { en: "Standard container" },
        materialTypes: ["PETG", "ASA", "PA-CF", "PPS-CF"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            nameI18n: { en: "Plastic container" },
            containerMaterial: "kunststoff",
            variants: [
              { nominalWeight: 750, tareWeight: 245 },
              { nominalWeight: 1000, tareWeight: 245 },
            ],
          },
        ],
      },
    ],
  },
];
