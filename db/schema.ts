import {
  FRIEND_VISIBILITIES,
  FRIENDSHIP_STATUSES,
  LOAN_REQUEST_STATUSES,
} from "@contracts/friends";
import { CONTAINER_FORMS, MATERIAL_KINDS } from "@contracts/materials";
import { CONTAINER_MATERIALS, type NameI18n } from "@contracts/presets";
import {
  pgTable,
  pgEnum,
  bigserial,
  varchar,
  text,
  timestamp,
  bigint,
  boolean,
  integer,
  date,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";

/**
 * Zeitstempel-Spalte in UTC.
 *
 * `timestamptz` statt `timestamp`: Postgres speichert bei `timestamp without
 * time zone` genau das, was geschrieben wurde – je nach `TimeZone` der
 * Verbindung verschöbe sich der Wert. `timestamptz` normalisiert auf UTC und
 * entspricht damit dem Verhalten, das die Anwendung schon immer erwartet.
 */
function tsColumn(name: string) {
  return timestamp(name, { withTimezone: true, mode: "date" });
}

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  /** Telegram-User-ID als String, eindeutig (Login über Telegram) */
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  telegramUsername: varchar("telegramUsername", { length: 255 }),
  /*
    Keine E-Mail-Adresse: Die Anmeldung läuft ausschließlich über Telegram, die
    App hat für eine Adresse keinen Zweck. Die Spalte existierte bis 1.1.1 aus
    der Altdatenbank heraus, wurde nie beschrieben und ist entfernt worden.
    Wer sie wieder einführt, braucht einen Zweck, eine Rechtsgrundlage und
    einen Eintrag in der Datenschutzerklärung.
  */
  avatar: text("avatar"),
  role: userRoleEnum("role").default("user").notNull(),
  /** Anzeigewährung als ISO-4217-Code (siehe contracts/locale.ts) */
  currency: varchar("currency", { length: 3 }).default("EUR").notNull(),
  /** BCP-47-Locale für Zahlen- und Datumsformate; NULL = Locale des Browsers */
  locale: varchar("locale", { length: 35 }),
  /**
   * Oberflächensprache („de“/„en“, siehe contracts/i18n.ts); NULL = Sprache
   * des Browsers. Bewusst getrennt von `locale`: Sprache und Zahlenformat
   * sind zwei verschiedene Entscheidungen.
   */
  language: varchar("language", { length: 5 }),
  /**
   * Höchste Release-Note-Version, die der Benutzer gesehen hat (`0.7.0`).
   * NULL = noch keine gesehen → alle Neuerungen gelten als ungelesen.
   */
  lastSeenReleaseVersion: varchar("lastSeenReleaseVersion", { length: 32 }),
  /**
   * Teilbarer Code, über den andere eine Freundschaftsanfrage stellen können
   * (Format `FH-XXXX-XXXX`, siehe contracts/friends.ts).
   *
   * `NULL`, solange der Benutzer die Freundesseite nie geöffnet hat: Wer die
   * Funktion nicht nutzt, bekommt auch kein zusätzliches Merkmal. Neu erzeugen
   * macht den alten Code sofort wertlos – ein Code, den man verteilt hat, muss
   * zurückholbar sein.
   */
  friendCode: varchar("friendCode", { length: 16 }).unique(),
  /**
   * Zähler zum Entwerten ausgegebener Sitzungen.
   *
   * Das Session-Token trägt den Stand mit, unter dem es ausgestellt wurde.
   * Wird der Zähler erhöht, sind alle älteren Token ungültig – ohne dass es
   * dafür eine Sperrliste bräuchte. Der Vergleich ist gratis, weil
   * `authenticateRequest` die Benutzerzeile ohnehin bei jedem Request lädt.
   */
  tokenVersion: integer("tokenVersion").default(0).notNull(),
  createdAt: tsColumn("createdAt").defaultNow().notNull(),
  updatedAt: tsColumn("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: tsColumn("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ---------------------------------------------------------------------------
// Materiallager: Lager, Gebindearten, Dryboxen, Materialien und
// Wägungen
// ---------------------------------------------------------------------------

/** Einmal-Codes für den Telegram-Login (vom Bot erzeugt, auf der Website eingelöst) */
export const loginCodes = pgTable("login_codes", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  /** 6-stelliger Code, den der Nutzer auf der Website eingibt */
  code: varchar("code", { length: 6 }).notNull(),
  /** Telegram-User-ID als String */
  telegramId: varchar("telegramId", { length: 64 }).notNull(),
  telegramUsername: varchar("telegramUsername", { length: 255 }),
  telegramName: varchar("telegramName", { length: 255 }),
  expiresAt: tsColumn("expiresAt").notNull(),
  usedAt: tsColumn("usedAt"),
  createdAt: tsColumn("createdAt").defaultNow().notNull(),
});

export type LoginCode = typeof loginCodes.$inferSelect;

/*
  Die Werte stehen in `contracts/materials.ts` und werden hier nur zu einem
  Postgres-Enum gemacht – nicht wie bei den Preset-Ebenen gespiegelt. Client und
  Server lesen damit dieselbe Liste.
*/
export const materialKindEnum = pgEnum("material_kind", MATERIAL_KINDS);

/**
 * Lager: die Ebene über den Materialien.
 *
 * Ein Lager fasst zusammen, was zusammen gehört, und trägt die Konfiguration,
 * die für alles darin gilt – welche Materialart, und beim Filament welche
 * Stärke. Bis 2.1.0 gab es diese Ebene nicht; jeder Benutzer hatte genau einen
 * ungenannten Bestand.
 *
 * **Materialart und Durchmesser stehen bewusst hier und nicht am Material.**
 * Eine Kopie am Material wäre eine zweite Wahrheit, die irgendwann widerspricht
 * – und die Abfragen laden das Lager ohnehin, wenn sie die Zweitanzeige
 * brauchen.
 *
 * Nicht verwechseln mit `storage_boxes` (Drybox): Das ist ein physischer
 * Behälter *innerhalb* eines Lagers, der beim Wiegen mit auf die Waage kommt.
 */
export const lager = pgTable(
  "lager",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("userId", { mode: "number" }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    /** Welche Materialart hier liegt – steuert Felder und Zweiteinheit */
    materialKind: materialKindEnum("materialKind").notNull(),
    /**
     * Nur bei `filament`: die Stärke dieses Lagers in **Mikrometern**
     * (1750 oder 2850); `NULL` bei allen anderen Materialarten. Geprüft wird
     * das in `lagerConfigIsValid` (`contracts/materials.ts`).
     *
     * Ein Wert, keine Liste: Wer beide Stärken vorrätig hat, legt zwei Lager an
     * – genau dafür sind sie da. Eine Mehrfachauswahl würde die Frage „welche
     * Stärke gilt für dieses Material?" wieder offen lassen, und dann bräuchte
     * das Material doch eine eigene Spalte.
     *
     * Mikrometer und nicht Millimeter (Projektregel „Abmessungen in ganzen
     * Millimetern"): 1,75 mm ist als Integer-Millimeter nicht darstellbar, und
     * ein Gleitkommawert für eine Größe, die in die Längenrechnung eingeht,
     * wäre die schlechtere Wahl.
     */
    filamentDiameterUm: integer("filamentDiameterUm"),
    notes: text("notes"),
    createdAt: tsColumn("createdAt").defaultNow().notNull(),
    updatedAt: tsColumn("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [
    /*
      Namen sind je Benutzer eindeutig – zwei Lager „Harz" wären in der Auswahl
      nicht unterscheidbar. Die Obergrenze von fünf steht dagegen **nicht** hier:
      Ein Zähler ist als Index nicht ausdrückbar, siehe MAX_LAGER_PER_USER.
    */
    unique("lager_name_per_user_unique").on(t.userId, t.name),
    index("lager_user_idx").on(t.userId),
  ]
);

export type Lager = typeof lager.$inferSelect;
export type InsertLager = typeof lager.$inferInsert;

/** Form des Gebindes; Werte und Zuordnung in `contracts/materials.ts`. */
export const containerFormEnum = pgEnum("container_form", CONTAINER_FORMS);

/**
 * Gebindeart mit hinterlegtem Leergewicht (Tara).
 *
 * Bis 2.2.0 hieß die Tabelle `spool_types`. Der Name war eine Annahme über den
 * Inhalt: Wer Pulver in Eimern führt, hat keine Rollentypen. Die Struktur hat
 * sich beim Umbenennen nicht geändert – ein Name und ein Leergewicht passen auf
 * jedes Gebinde.
 */
export const containerTypes = pgTable("container_types", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("userId", { mode: "number" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  manufacturer: varchar("manufacturer", { length: 255 }),
  /**
   * Form des Gebindes.
   *
   * `rolle` als Vorgabe, und die Migration trägt sie für jeden bestehenden
   * Eintrag ein: Bis 2.2.0 konnte hier nichts anderes stehen, das ist keine
   * Annahme, sondern der tatsächliche Stand.
   */
  form: containerFormEnum("form").default("rolle").notNull(),
  /** Leergewicht des leeren Gebindes in Gramm */
  tareWeight: integer("tareWeight").notNull(),
  /**
   * Herkunft: Preset-Variante, aus der diese Gebindeart per
   * „Kopieren & anpassen“ entstanden ist (nur zur Nachverfolgung –
   * spätere Änderungen am Preset wirken sich nicht mehr aus).
   */
  sourceVariantId: bigint("sourceVariantId", { mode: "number" }),
  notes: text("notes"),
  createdAt: tsColumn("createdAt").defaultNow().notNull(),
});

export type ContainerType = typeof containerTypes.$inferSelect;
export type InsertContainerType = typeof containerTypes.$inferInsert;

/** Lagerbox / Drybox mit hinterlegtem Leergewicht (Tara) */
export const storageBoxes = pgTable("storage_boxes", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("userId", { mode: "number" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  location: varchar("location", { length: 255 }),
  /** Leergewicht der Box in Gramm */
  tareWeight: integer("tareWeight").notNull(),
  notes: text("notes"),
  createdAt: tsColumn("createdAt").defaultNow().notNull(),
});

export type StorageBox = typeof storageBoxes.$inferSelect;
export type InsertStorageBox = typeof storageBoxes.$inferInsert;

/** 3D-Druckmaterial (Gebinde in einem Lager) */
export const materials = pgTable(
  "materials",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("userId", { mode: "number" }).notNull(),
    /**
     * Zugehöriges Lager. Pflicht – die Migration `0009_lager.sql` legt für jeden
     * bestehenden Benutzer ein Lager an und trägt es hier ein.
     *
     * `userId` bleibt daneben stehen, obwohl es über das Lager erreichbar wäre:
     * Jede Abfrage filtert darauf (siehe `materials_user_idx`), und ein Join für
     * die Mandantenprüfung wäre an der heikelsten Stelle der Anwendung ein
     * Rückschritt.
     */
    lagerId: bigint("lagerId", { mode: "number" }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    /** Kurz-Kennung zum schnellen Wiederfinden / Beschriften (z. B. „P01“) */
    identifier: varchar("identifier", { length: 50 }),
    /** Materialart, z. B. PLA, PETG, ABS */
    materialType: varchar("materialType", { length: 100 }).notNull(),
    manufacturer: varchar("manufacturer", { length: 255 }),
    color: varchar("color", { length: 100 }),
    /**
     * Oberfläche als Freitext („Matt", „Silk", „Glänzend").
     *
     * Freitext und kein Enum, aus demselben Grund wie `materialType`: Der
     * Hersteller, der sich „Sparkle" ausdenkt, muss eintragbar bleiben.
     * Vorschläge liefert `COMMON_TEXTURES` (`contracts/materials.ts`).
     *
     * Bis 2.1.0 landete das in `materialType` („PLA Silk"). Das hatte einen
     * sichtbaren Preis: Der Materialart-Filter vergleicht exakt, also waren
     * „PLA" und „PLA Silk" zwei Einträge, die sich nie fanden.
     */
    texture: varchar("texture", { length: 100 }),
    /** Preis in Cent (z. B. 2499 = 24,99 €) */
    priceCents: integer("priceCents"),
    /** Kaufdatum als ISO-String YYYY-MM-DD */
    purchaseDate: date("purchaseDate", { mode: "string" }),
    /** Nenn-Füllmenge laut Hersteller in Gramm (z. B. 1000) */
    nominalWeight: integer("nominalWeight").notNull(),
    /**
     * Dichte in Gramm je Liter. `NULL` = Vorgabe benutzen, siehe
     * `resolveDensity` (`contracts/materials.ts`).
     *
     * Ausschließlich für die Zweitanzeige (Meter beim Filament, Liter beim
     * Harz). Geht **nie** in die Restmengenrechnung ein – die bleibt bei
     * „Brutto minus Tara" in Gramm, weil nur das gewogen wird.
     */
    densityGramsPerLiter: integer("densityGramsPerLiter"),
    /** Gewählte eigene Gebindeart (Leergewicht) */
    containerTypeId: bigint("containerTypeId", { mode: "number" }),
    /**
     * Alternativ zu `containerTypeId`: direkt referenzierte Preset-Variante aus
     * dem globalen Katalog. Es darf immer nur eines von beiden gesetzt sein.
     */
    containerPresetVariantId: bigint("containerPresetVariantId", {
      mode: "number",
    }),
    /** Zugewiesene Lagerbox/Drybox (Leergewicht) */
    storageBoxId: bigint("storageBoxId", { mode: "number" }),
    notes: text("notes"),
    createdAt: tsColumn("createdAt").defaultNow().notNull(),
    updatedAt: tsColumn("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [
    // Jede Abfrage filtert nach Besitzer; der Löschlauf beim Kontolöschen
    // ebenfalls.
    index("materials_user_idx").on(t.userId),
    /*
      Seit 2.2.0 filtert der Lesepfad zusätzlich auf das Lager, und die Prüfung
      „ist dieses Lager leer?" beim Löschen ebenso. Ohne Index wäre beides ein
      Full Scan über den gesamten Bestand aller Benutzer.
    */
    index("materials_lager_idx").on(t.lagerId),
  ]
);

export type Material = typeof materials.$inferSelect;
export type InsertMaterial = typeof materials.$inferInsert;

/** Wägung eines Materials: gemessenes Bruttogewicht inkl. Gebinde (+ Box) */
export const weighings = pgTable(
  "weighings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    materialId: bigint("materialId", { mode: "number" }).notNull(),
    /** Gemessenes Gesamtgewicht (Material + Gebinde + ggf. Box) in Gramm */
    grossWeight: integer("grossWeight").notNull(),
    weighedAt: tsColumn("weighedAt").defaultNow().notNull(),
    note: varchar("note", { length: 500 }),
    createdAt: tsColumn("createdAt").defaultNow().notNull(),
  },
  // Wägungen hängen am Material – ohne Index wäre das Löschen eines Kontos
  // ein Full Scan pro Material.
  t => [index("weighings_material_idx").on(t.materialId)]
);

export type Weighing = typeof weighings.$inferSelect;
export type InsertWeighing = typeof weighings.$inferInsert;

// ---------------------------------------------------------------------------
// Preset-Katalog: global gepflegte Hersteller und Gebinde
//
//   Hersteller → Serie → Version → Variante (pro Netto-Materialgewicht)
//
// Die Ebenen sind bewusst getrennt: ein Hersteller hat mehrere Produktlinien
// (Serien), eine Serie kann über die Zeit mehrere Versionen haben (z. B.
// Wechsel von Kunststoff- auf Kartonspule) und je Version gibt es pro
// Netto-Materialgewicht (500 g / 1 kg / 3 kg) ein eigenes Gebinde mit eigenem
// Leergewicht und eigenen Abmessungen.
//
// Abmessungen werden in ganzen Millimetern geführt (analog „Gewichte in
// Gramm“); halbe Millimeter werden gerundet.
// ---------------------------------------------------------------------------

/** Herkunft eines Katalogeintrags – steuert, ob das Seeding ihn noch anfassen darf */
export const PRESET_SOURCES = ["seed", "admin", "community"] as const;

export const presetSourceEnum = pgEnum("preset_source", PRESET_SOURCES);

/**
 * Gemeinsame Metaspalten aller Katalog-Ebenen.
 * Als Factory, damit jede Tabelle eigene Spalten-Builder bekommt – geteilte
 * Builder-Objekte führen in Drizzle zu falsch benannten Spalten.
 */
function presetMeta() {
  return {
    /** „seed“-Einträge darf das Seeding aktualisieren, alle anderen nie */
    source: presetSourceEnum("source").default("admin").notNull(),
    /** Revision der Seed-Daten, siehe PRESET_SEED_REVISION */
    seedRevision: integer("seedRevision").default(0).notNull(),
    /** Deaktivierte Einträge bleiben referenzierbar, sind aber nicht mehr wählbar */
    active: boolean("active").default(true).notNull(),
    notes: text("notes"),
    createdAt: tsColumn("createdAt").defaultNow().notNull(),
    updatedAt: tsColumn("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  };
}

/** Hersteller im globalen Preset-Katalog (z. B. Polymaker, Bambu Lab) */
export const presetManufacturers = pgTable("preset_manufacturers", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  /** Stabiler Schlüssel für Seed und Idempotenz, z. B. „polymaker“ */
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  website: varchar("website", { length: 500 }),
  ...presetMeta(),
});

export type PresetManufacturer = typeof presetManufacturers.$inferSelect;
export type InsertPresetManufacturer = typeof presetManufacturers.$inferInsert;

/** Produktlinie / Serie eines Herstellers (z. B. PolyTerra PLA) */
export const presetContainerSeries = pgTable(
  "preset_container_series",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    manufacturerId: bigint("manufacturerId", { mode: "number" }).notNull(),
    /** Grundname – Pflicht, speist den Slug und ist die Rückfallebene */
    name: varchar("name", { length: 255 }).notNull(),
    /** Übersetzungen abweichend vom Grundname (siehe contracts/presets.ts) */
    nameI18n: jsonb("nameI18n").$type<NameI18n>(),
    /** Stabiler Schlüssel innerhalb des Herstellers, z. B. „polyterra-pla“ */
    slug: varchar("slug", { length: 255 }).notNull(),
    ...presetMeta(),
  },
  t => [
    unique("preset_container_series_slug_unique").on(t.manufacturerId, t.slug),
    index("preset_container_series_manufacturer_idx").on(t.manufacturerId),
  ]
);

export type PresetContainerSeries = typeof presetContainerSeries.$inferSelect;
export type InsertPresetContainerSeries =
  typeof presetContainerSeries.$inferInsert;

/**
 * Materialarten, für die eine Serie gilt (z. B. PLA). Ohne Eintrag gilt die
 * Serie für alle Materialarten – so kann ein Hersteller pro Materialart ein
 * anderes Gebinde führen.
 */
export const presetSeriesMaterialTypes = pgTable(
  "preset_series_material_types",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    seriesId: bigint("seriesId", { mode: "number" }).notNull(),
    materialType: varchar("materialType", { length: 100 }).notNull(),
  },
  t => [
    unique("preset_series_material_types_unique").on(
      t.seriesId,
      t.materialType
    ),
  ]
);

export type PresetSeriesMaterialType =
  typeof presetSeriesMaterialTypes.$inferSelect;

/*
  Werkstoff des Gebindes. Die Liste stand bis 2.2.0 hier **und** als
  `CONTAINER_MATERIALS` in `contracts/presets.ts` – zwei Kopien, von denen beim
  Umbenennen eine liegen geblieben wäre. Jetzt gilt dieselbe Richtung wie bei
  `MATERIAL_KINDS`: die Liste gehört in die Contracts, hier wird nur der
  Postgres-Typ daraus.
*/
export const presetContainerMaterialEnum = pgEnum(
  "preset_container_material",
  CONTAINER_MATERIALS
);

/** Revision einer Serie (z. B. „Kartonspule (ab 2023)“) */
export const presetContainerVersions = pgTable(
  "preset_container_versions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    seriesId: bigint("seriesId", { mode: "number" }).notNull(),
    /** Grundname – Pflicht, speist den Slug und ist die Rückfallebene */
    name: varchar("name", { length: 255 }).notNull(),
    /** Übersetzungen abweichend vom Grundname (siehe contracts/presets.ts) */
    nameI18n: jsonb("nameI18n").$type<NameI18n>(),
    /** Stabiler Schlüssel innerhalb der Serie, z. B. „karton-2023“ */
    slug: varchar("slug", { length: 255 }).notNull(),
    /**
     * Form des Gebindes. `NULL` bei allem, was vor 2.3.0 angelegt wurde – die
     * Migration setzt hier bewusst **nichts**: Der Startkatalog führt zwar
     * ausschließlich Spulen, aber Einträge von Administratoren und aus der
     * Community können alles sein, und eine geratene Form wäre eine Angabe, die
     * irgendwann als gepflegt gelesen wird.
     *
     * Die Form gehört an die Ausführung und nicht an die Variante: „Kartonspule
     * (ab 2021)" hat vier Größen und ist viermal eine Rolle.
     */
    form: containerFormEnum("form"),
    containerMaterial: presetContainerMaterialEnum("containerMaterial"),
    /** Gültig ab, ISO-String JJJJ-MM-TT */
    validFrom: date("validFrom", { mode: "string" }),
    /** Gültig bis; null = aktuell im Handel (daraus wird „aktuell“ abgeleitet) */
    validTo: date("validTo", { mode: "string" }),
    ...presetMeta(),
  },
  t => [
    unique("preset_container_versions_slug_unique").on(t.seriesId, t.slug),
    index("preset_container_versions_series_idx").on(t.seriesId),
  ]
);

export type PresetContainerVersion =
  typeof presetContainerVersions.$inferSelect;
export type InsertPresetContainerVersion =
  typeof presetContainerVersions.$inferInsert;

/** Gebinde einer Version für ein bestimmtes Netto-Materialgewicht */
export const presetContainerVariants = pgTable(
  "preset_container_variants",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    versionId: bigint("versionId", { mode: "number" }).notNull(),
    /** Netto-Materialgewicht laut Hersteller in Gramm (z. B. 1000) */
    nominalWeight: integer("nominalWeight").notNull(),
    /** Leergewicht des leeren Gebindes in Gramm */
    tareWeight: integer("tareWeight").notNull(),
    /** Außendurchmesser in Millimetern */
    outerDiameterMm: integer("outerDiameterMm"),
    /** Breite in Millimetern */
    widthMm: integer("widthMm"),
    /** Durchmesser der Mittelbohrung in Millimetern */
    boreDiameterMm: integer("boreDiameterMm"),
    ...presetMeta(),
  },
  t => [
    unique("preset_container_variants_unique").on(t.versionId, t.nominalWeight),
    index("preset_container_variants_version_idx").on(t.versionId),
  ]
);

export type PresetContainerVariant =
  typeof presetContainerVariants.$inferSelect;
export type InsertPresetContainerVariant =
  typeof presetContainerVariants.$inferInsert;

/** Ebenen, auf denen ein Benutzer Presets ausblenden kann */
export const PRESET_SCOPES = [
  "manufacturer",
  "series",
  "version",
  "variant",
] as const;

/**
 * Katalogebene. Ein einziger Typ, den sich `hidden_container_presets.scope` und
 * `preset_proposals.targetType` teilen – so können die beiden Spalten nicht
 * auseinanderlaufen.
 */
export const presetScopeEnum = pgEnum("preset_scope", PRESET_SCOPES);

/**
 * Vom Benutzer ausgeblendete Presets. Wird auf einer höheren Ebene
 * ausgeblendet, verschwinden auch alle darunterliegenden Einträge.
 */
export const hiddenContainerPresets = pgTable(
  "hidden_container_presets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("userId", { mode: "number" }).notNull(),
    scope: presetScopeEnum("scope").notNull(),
    /** ID des Katalogeintrags auf der jeweiligen Ebene */
    refId: bigint("refId", { mode: "number" }).notNull(),
    createdAt: tsColumn("createdAt").defaultNow().notNull(),
  },
  t => [
    unique("hidden_container_presets_unique").on(t.userId, t.scope, t.refId),
    index("hidden_container_presets_user_idx").on(t.userId),
  ]
);

export type HiddenContainerPreset = typeof hiddenContainerPresets.$inferSelect;

/** Art eines Vorschlags: neuer Katalogeintrag oder Änderung an einem bestehenden */
export const PRESET_PROPOSAL_KINDS = ["new", "change"] as const;
export const PRESET_PROPOSAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "withdrawn",
] as const;

export const presetProposalKindEnum = pgEnum(
  "preset_proposal_kind",
  PRESET_PROPOSAL_KINDS
);
export const presetProposalStatusEnum = pgEnum(
  "preset_proposal_status",
  PRESET_PROPOSAL_STATUSES
);

/**
 * Community-Vorschlag für den Preset-Katalog. Benutzer reichen ein,
 * Administratoren moderieren.
 */
export const presetProposals = pgTable(
  "preset_proposals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /**
     * Einreicher. `NULL`, wenn das Konto gelöscht wurde: Angenommene
     * Vorschläge bleiben als Moderationsnachweis erhalten, die Identität des
     * Einreichers verschwindet aber mit dem Konto (Art. 17 DSGVO).
     */
    userId: bigint("userId", { mode: "number" }),
    kind: presetProposalKindEnum("kind").notNull(),
    /** Katalogebene, auf die sich der Vorschlag bezieht */
    targetType: presetScopeEnum("targetType").notNull(),
    /** Nur bei kind = "change": betroffener Katalogeintrag */
    targetId: bigint("targetId", { mode: "number" }),
    /** Vorgeschlagene Werte, validiert über contracts/presets.ts */
    payload: jsonb("payload").notNull(),
    /** Eigene Gebindeart, aus der der Vorschlag entstanden ist */
    sourceContainerTypeId: bigint("sourceContainerTypeId", { mode: "number" }),
    /** Begründung des Einreichers */
    comment: text("comment"),
    status: presetProposalStatusEnum("status").default("pending").notNull(),
    reviewedBy: bigint("reviewedBy", { mode: "number" }),
    reviewedAt: tsColumn("reviewedAt"),
    /** Begründung der Moderation (v. a. bei Ablehnung) */
    reviewNote: text("reviewNote"),
    /** Nach Annahme erzeugter bzw. aktualisierter Katalogeintrag */
    resultId: bigint("resultId", { mode: "number" }),
    createdAt: tsColumn("createdAt").defaultNow().notNull(),
    updatedAt: tsColumn("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [
    index("preset_proposals_status_idx").on(t.status),
    index("preset_proposals_user_idx").on(t.userId),
  ]
);

export type PresetProposal = typeof presetProposals.$inferSelect;
export type InsertPresetProposal = typeof presetProposals.$inferInsert;

// ---------------------------------------------------------------------------
// Sicherheitsprotokoll
// ---------------------------------------------------------------------------

/**
 * Audit-Log: sicherheitsrelevante Ereignisse.
 *
 * Vorher ließ sich ein Vorfall aus den Aufzeichnungen der Anwendung heraus
 * gar nicht rekonstruieren – es gab nur Zeitstempel in den Fachtabellen.
 *
 * Das Protokoll ist selbst personenbezogen und deshalb bewusst schmal
 * gehalten: Ereignistyp, Zeitpunkt, Beteiligte, ein strukturiertes Detail.
 * Kein Freitext, keine Klartext-IP, keine Nutzungsdaten. Aufbewahrung
 * 90 Tage, siehe AUDIT_RETENTION_DAYS in contracts/audit.ts.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: tsColumn("at").defaultNow().notNull(),
    /** Ereignisname aus AUDIT_EVENTS (contracts/audit.ts) */
    event: varchar("event", { length: 64 }).notNull(),
    /**
     * Wer gehandelt hat. `NULL`, wenn niemand angemeldet war – etwa bei einem
     * fehlgeschlagenen Anmeldeversuch – oder wenn das Konto gelöscht wurde.
     */
    actorUserId: bigint("actorUserId", { mode: "number" }),
    /** Wen es betraf, falls abweichend vom Handelnden. */
    subjectUserId: bigint("subjectUserId", { mode: "number" }),
    /**
     * Telegram-ID bei Ereignissen vor der Anmeldung – dort gibt es noch kein
     * Konto, auf das sich verweisen ließe.
     */
    telegramId: varchar("telegramId", { length: 64 }),
    /**
     * HMAC-SHA256 der Client-Adresse mit `APP_SECRET`, nie die Adresse selbst.
     *
     * Ein einfacher Hash brächte hier nichts: Der IPv4-Raum hat 2^32 Werte und
     * ist in Minuten durchprobiert. Erst der Schlüssel macht die Zuordnung für
     * Dritte unmöglich – wiedererkennen lässt sich dieselbe Adresse trotzdem,
     * und genau das braucht die Aufklärung.
     */
    ipHash: varchar("ipHash", { length: 64 }),
    /** Strukturierte Zusatzangaben, bewusst kein Freitextfeld. */
    detail: jsonb("detail"),
  },
  t => [
    index("audit_log_at_idx").on(t.at),
    index("audit_log_event_at_idx").on(t.event, t.at),
    index("audit_log_actor_idx").on(t.actorUserId),
  ]
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type InsertAuditLogEntry = typeof auditLog.$inferInsert;

// ---------------------------------------------------------------------------
// Community: Freundschaften und Ausleih-Anfragen
//
// Die erste Stelle, an der Fachdaten eines Benutzers absichtlich bei einem
// anderen ankommen. Bis hierhin gilt für jede Tabelle „`userId` filtern und
// fertig“; ab hier entscheidet eine Freundschaft mit, wer was sehen darf.
//
// Deshalb heißt die Spalte des Antragstellers in beiden Tabellen `userId` und
// nicht `requesterId`: Der Wächter in `api/account.integration.test.ts` sucht
// im `information_schema` nach genau diesem Spaltennamen und schlägt an,
// solange Auskunft und Löschung die neue Tabelle nicht kennen. Ein hübscherer
// Name würde still durchrutschen.
// ---------------------------------------------------------------------------

/*
  Die Aufzählungen stehen in `contracts/friends.ts` und werden hier nur zu
  Postgres-Enums gemacht – nicht wie bei den Preset-Ebenen gespiegelt. Client
  und Server lesen damit dieselbe Liste, und ein neuer Wert kann nicht in der
  einen Datei stehen und in der anderen fehlen.
*/
export const friendVisibilityEnum = pgEnum(
  "friend_visibility",
  FRIEND_VISIBILITIES
);

export const friendshipStatusEnum = pgEnum(
  "friendship_status",
  FRIENDSHIP_STATUSES
);

/**
 * Freundschaft zwischen zwei Benutzern – **eine** Zeile je Paar.
 *
 * Die Sichtbarkeit ist bewusst asymmetrisch: Jede Seite entscheidet allein
 * über ihr eigenes Lager. Eine gemeinsame Stufe wäre einfacher, hieße aber,
 * dass der eine die Freigabe des anderen ändern kann.
 *
 * Welche der beiden Spalten für eine Richtung gilt, löst **ausschließlich**
 * `resolveVisibility` in `api/queries/friends.ts` auf. Jeder weitere Vergleich
 * über `userId`/`friendUserId` wäre eine zweite Wahrheit – und ein vertauschtes
 * Feld hier ist keine kaputte Ansicht, sondern eine Datenpanne.
 */
export const friendships = pgTable(
  "friendships",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** Wer die Anfrage gestellt hat (siehe Kommentar über der Tabelle) */
    userId: bigint("userId", { mode: "number" }).notNull(),
    /** Wer angefragt wurde */
    friendUserId: bigint("friendUserId", { mode: "number" }).notNull(),
    status: friendshipStatusEnum("status").default("pending").notNull(),
    /** Was `friendUserId` vom Lager von `userId` sehen darf */
    visibilityFromUser: friendVisibilityEnum("visibilityFromUser")
      .default("search")
      .notNull(),
    /** Was `userId` vom Lager von `friendUserId` sehen darf */
    visibilityFromFriend: friendVisibilityEnum("visibilityFromFriend")
      .default("search")
      .notNull(),
    respondedAt: tsColumn("respondedAt"),
    createdAt: tsColumn("createdAt").defaultNow().notNull(),
    updatedAt: tsColumn("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [
    /*
      Verhindert die doppelte Zeile in *einer* Richtung. Die gespiegelte Zeile
      (B, A) fängt das nicht – dafür gibt es zusätzlich einen Ausdrucks-Index
      über LEAST/GREATEST, der von Hand in der Migration steht (drizzle-kit
      kann ihn nicht erzeugen). Ohne ihn könnten zwei gleichzeitige Anfragen in
      beide Richtungen zwei Freundschaften mit widersprüchlichen
      Sichtbarkeiten anlegen, und welche gilt, entschiede die Sortierung.
    */
    unique("friendships_pair_unique").on(t.userId, t.friendUserId),
    index("friendships_user_idx").on(t.userId),
    index("friendships_friend_idx").on(t.friendUserId),
  ]
);

export type Friendship = typeof friendships.$inferSelect;
export type InsertFriendship = typeof friendships.$inferInsert;

export const loanRequestStatusEnum = pgEnum(
  "loan_request_status",
  LOAN_REQUEST_STATUSES
);

/**
 * Anfrage, ein Material eines Freundes auszuleihen.
 *
 * Der Vorgang lebt in der App; Telegram schickt nur den Hinweis darauf. Damit
 * bleibt der Stand für beide Seiten sichtbar, und die Anfrage geht nicht
 * verloren, wenn der Bot den Empfänger nicht erreichen kann.
 */
export const loanRequests = pgTable(
  "loan_requests",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** Wer fragt (siehe Kommentar über `friendships`) */
    userId: bigint("userId", { mode: "number" }).notNull(),
    /** Wem das Material gehört */
    ownerUserId: bigint("ownerUserId", { mode: "number" }).notNull(),
    materialId: bigint("materialId", { mode: "number" }).notNull(),
    /**
     * Bezeichnung zum Zeitpunkt der Anfrage. Denormalisiert wie der
     * JSON-Schnappschuss in `preset_proposals`: Wird das Material umbenannt oder
     * gelöscht, muss der Vorgang lesbar bleiben – sonst stünde in der Liste
     * beider Seiten irgendwann eine nackte ID.
     */
    materialName: varchar("materialName", { length: 255 }).notNull(),
    message: varchar("message", { length: 300 }),
    status: loanRequestStatusEnum("status").default("open").notNull(),
    respondedAt: tsColumn("respondedAt"),
    createdAt: tsColumn("createdAt").defaultNow().notNull(),
    updatedAt: tsColumn("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  /*
    Beide Richtungen werden gelesen (eingehend und ausgehend) und beim
    Kontolöschen abgeräumt – ohne Indizes wäre das je Konto ein Full Scan.
    Die Regel „höchstens eine *offene* Anfrage je Person und Material“ steckt
    in einem partiellen Unique-Index, der von Hand in der Migration steht.
  */
  t => [
    index("loan_requests_owner_idx").on(t.ownerUserId),
    index("loan_requests_user_idx").on(t.userId),
  ]
);

export type LoanRequest = typeof loanRequests.$inferSelect;
export type InsertLoanRequest = typeof loanRequests.$inferInsert;
