import type { SpoolMaterial } from "@contracts/presets";

/**
 * Startkatalog für Hersteller und Spulen.
 *
 * Reine Daten ohne Datenbankzugriff – dadurch in Tests ohne Infrastruktur
 * prüfbar (siehe api/presetCatalog.test.ts).
 *
 * Die Leergewichte sind Herstellerangaben bzw. gut belegte Messwerte:
 *   - Polymaker Kartonspule 1 kg: 140 ± 7 g, Ø 200 mm, Breite 65,6 mm, Bohrung 55 mm
 *   - Polymaker Kunststoffspule 3 kg: 425 ± 21 g, Ø 250 mm, Breite 117 mm
 *   - Polymaker Kunststoffspule 1 kg (vor der Umstellung auf Karton): ca. 215 g
 *   - Prusament Kunststoffspule 1 kg: 201 g
 *   - Bambu Lab wiederverwendbare Kunststoffspule: 250 g
 *   - eSUN Kunststoffspule 1 kg: ca. 200 g (aktuell) bzw. ca. 224 g (ältere Serie)
 *
 * Kartonspulen ziehen Feuchtigkeit und schwanken um einige Gramm – wer es
 * genau braucht, wiegt die leere Rolle und legt einen eigenen Rollentyp an.
 *
 * Bewusst klein gehalten: ein falscher Startwert ist schlechter als ein
 * fehlender Eintrag. Erweiterungen kommen über Vorschläge aus der Community
 * oder über die Administration.
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
  name: string;
  spoolMaterial: SpoolMaterial;
  validFrom?: string;
  validTo?: string;
  variants: SeedVariant[];
};

export type SeedSeries = {
  slug: string;
  name: string;
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
export const PRESET_SEED_REVISION = 1;

export const presetSeedCatalog: SeedManufacturer[] = [
  {
    slug: "polymaker",
    name: "Polymaker",
    website: "https://polymaker.com",
    series: [
      {
        slug: "polyterra-pla",
        name: "PolyTerra PLA",
        materialTypes: ["PLA"],
        versions: [
          {
            slug: "karton-ab-2021",
            name: "Kartonspule (ab 2021)",
            spoolMaterial: "karton",
            validFrom: "2021-01-01",
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
          {
            slug: "kunststoff-bis-2020",
            name: "Kunststoffspule (bis 2020)",
            spoolMaterial: "kunststoff",
            validTo: "2020-12-31",
            variants: [{ nominalWeight: 1000, tareWeight: 215 }],
          },
        ],
      },
      {
        slug: "polylite",
        name: "PolyLite",
        materialTypes: ["PLA", "PETG", "ABS", "ASA"],
        versions: [
          {
            slug: "kunststoffspule",
            name: "Kunststoffspule",
            spoolMaterial: "kunststoff",
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
            spoolMaterial: "kunststoff",
            variants: [{ nominalWeight: 1000, tareWeight: 201 }],
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
        materialTypes: [],
        versions: [
          {
            slug: "wiederverwendbare-spule",
            name: "Wiederverwendbare Kunststoffspule",
            spoolMaterial: "kunststoff",
            variants: [{ nominalWeight: 1000, tareWeight: 250 }],
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
        materialTypes: ["PLA", "PETG", "ABS"],
        versions: [
          {
            slug: "kunststoffspule-aktuell",
            name: "Kunststoffspule (aktuell)",
            spoolMaterial: "kunststoff",
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
            spoolMaterial: "kunststoff",
            validTo: "2020-12-31",
            variants: [{ nominalWeight: 1000, tareWeight: 224 }],
          },
        ],
      },
    ],
  },
];
