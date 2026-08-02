import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  bigint,
  boolean,
  int,
  date,
  json,
  index,
  unique,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  /** Telegram-User-ID als String, eindeutig (Login über Telegram) */
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  telegramUsername: varchar("telegramUsername", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ---------------------------------------------------------------------------
// Filament-Lager: Rollentypen (Verpackung/Spule), Lagerboxen (Drybox),
// Materialien und Wägungen
// ---------------------------------------------------------------------------

/** Einmal-Codes für den Telegram-Login (vom Bot erzeugt, auf der Website eingelöst) */
export const loginCodes = mysqlTable("login_codes", {
  id: serial("id").primaryKey(),
  /** 6-stelliger Code, den der Nutzer auf der Website eingibt */
  code: varchar("code", { length: 6 }).notNull(),
  /** Telegram-User-ID als String */
  telegramId: varchar("telegramId", { length: 64 }).notNull(),
  telegramUsername: varchar("telegramUsername", { length: 255 }),
  telegramName: varchar("telegramName", { length: 255 }),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LoginCode = typeof loginCodes.$inferSelect;

/** Rollentyp / Verpackung mit hinterlegtem Leergewicht (Tara) */
export const spoolTypes = mysqlTable("spool_types", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  manufacturer: varchar("manufacturer", { length: 255 }),
  /** Leergewicht der Rolle/Verpackung in Gramm */
  tareWeight: int("tareWeight").notNull(),
  /**
   * Herkunft: Preset-Variante, aus der dieser Rollentyp per
   * „Kopieren & anpassen“ entstanden ist (nur zur Nachverfolgung –
   * spätere Änderungen am Preset wirken sich nicht mehr aus).
   */
  sourceVariantId: bigint("sourceVariantId", { mode: "number", unsigned: true }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SpoolType = typeof spoolTypes.$inferSelect;
export type InsertSpoolType = typeof spoolTypes.$inferInsert;

/** Lagerbox / Drybox mit hinterlegtem Leergewicht (Tara) */
export const storageBoxes = mysqlTable("storage_boxes", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  location: varchar("location", { length: 255 }),
  /** Leergewicht der Box in Gramm */
  tareWeight: int("tareWeight").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StorageBox = typeof storageBoxes.$inferSelect;
export type InsertStorageBox = typeof storageBoxes.$inferInsert;

/** 3D-Druckmaterial (Filament-Rolle im Lager) */
export const materials = mysqlTable("materials", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  /** Kurz-Kennung zum schnellen Wiederfinden / Beschriften (z. B. „P01“) */
  identifier: varchar("identifier", { length: 50 }),
  /** Materialart, z. B. PLA, PETG, ABS */
  materialType: varchar("materialType", { length: 100 }).notNull(),
  manufacturer: varchar("manufacturer", { length: 255 }),
  color: varchar("color", { length: 100 }),
  /** Preis in Cent (z. B. 2499 = 24,99 €) */
  priceCents: int("priceCents"),
  /** Kaufdatum als ISO-String YYYY-MM-DD */
  purchaseDate: date("purchaseDate", { mode: "string" }),
  /** Nenn-Füllmenge laut Hersteller in Gramm (z. B. 1000) */
  nominalWeight: int("nominalWeight").notNull(),
  /** Gewählte eigene Rolle/Verpackung (Leergewicht) */
  spoolTypeId: bigint("spoolTypeId", { mode: "number", unsigned: true }),
  /**
   * Alternativ zu `spoolTypeId`: direkt referenzierte Preset-Variante aus dem
   * globalen Katalog. Es darf immer nur eines von beiden gesetzt sein.
   */
  spoolPresetVariantId: bigint("spoolPresetVariantId", {
    mode: "number",
    unsigned: true,
  }),
  /** Zugewiesene Lagerbox/Drybox (Leergewicht) */
  storageBoxId: bigint("storageBoxId", { mode: "number", unsigned: true }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type Material = typeof materials.$inferSelect;
export type InsertMaterial = typeof materials.$inferInsert;

/** Wägung eines Materials: gemessenes Bruttogewicht inkl. Rolle (+ Box) */
export const weighings = mysqlTable("weighings", {
  id: serial("id").primaryKey(),
  materialId: bigint("materialId", { mode: "number", unsigned: true }).notNull(),
  /** Gemessenes Gesamtgewicht (Material + Rolle + ggf. Box) in Gramm */
  grossWeight: int("grossWeight").notNull(),
  weighedAt: timestamp("weighedAt").defaultNow().notNull(),
  note: varchar("note", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Weighing = typeof weighings.$inferSelect;
export type InsertWeighing = typeof weighings.$inferInsert;

// ---------------------------------------------------------------------------
// Preset-Katalog: global gepflegte Hersteller und Spulen
//
//   Hersteller → Serie → Version → Variante (pro Netto-Materialgewicht)
//
// Die Ebenen sind bewusst getrennt: ein Hersteller hat mehrere Produktlinien
// (Serien), eine Serie kann über die Zeit mehrere Versionen haben (z. B.
// Wechsel von Kunststoff- auf Kartonspule) und je Version gibt es pro
// Netto-Materialgewicht (500 g / 1 kg / 3 kg) eine eigene Spule mit eigenem
// Leergewicht und eigenen Abmessungen.
//
// Abmessungen werden in ganzen Millimetern geführt (analog „Gewichte in
// Gramm“); halbe Millimeter werden gerundet.
// ---------------------------------------------------------------------------

/** Herkunft eines Katalogeintrags – steuert, ob das Seeding ihn noch anfassen darf */
export const PRESET_SOURCES = ["seed", "admin", "community"] as const;

/**
 * Gemeinsame Metaspalten aller Katalog-Ebenen.
 * Als Factory, damit jede Tabelle eigene Spalten-Builder bekommt – geteilte
 * Builder-Objekte führen in Drizzle zu falsch benannten Spalten.
 */
function presetMeta() {
  return {
    /** „seed“-Einträge darf das Seeding aktualisieren, alle anderen nie */
    source: mysqlEnum("source", PRESET_SOURCES).default("admin").notNull(),
    /** Revision der Seed-Daten, siehe PRESET_SEED_REVISION */
    seedRevision: int("seedRevision").default(0).notNull(),
    /** Deaktivierte Einträge bleiben referenzierbar, sind aber nicht mehr wählbar */
    active: boolean("active").default(true).notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  };
}

/** Hersteller im globalen Preset-Katalog (z. B. Polymaker, Bambu Lab) */
export const presetManufacturers = mysqlTable("preset_manufacturers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  /** Stabiler Schlüssel für Seed und Idempotenz, z. B. „polymaker“ */
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  website: varchar("website", { length: 500 }),
  ...presetMeta(),
});

export type PresetManufacturer = typeof presetManufacturers.$inferSelect;
export type InsertPresetManufacturer = typeof presetManufacturers.$inferInsert;

/** Produktlinie / Serie eines Herstellers (z. B. PolyTerra PLA) */
export const presetSpoolSeries = mysqlTable(
  "preset_spool_series",
  {
    id: serial("id").primaryKey(),
    manufacturerId: bigint("manufacturerId", {
      mode: "number",
      unsigned: true,
    }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    /** Stabiler Schlüssel innerhalb des Herstellers, z. B. „polyterra-pla“ */
    slug: varchar("slug", { length: 255 }).notNull(),
    ...presetMeta(),
  },
  (t) => [
    unique("preset_spool_series_slug_unique").on(t.manufacturerId, t.slug),
    index("preset_spool_series_manufacturer_idx").on(t.manufacturerId),
  ],
);

export type PresetSpoolSeries = typeof presetSpoolSeries.$inferSelect;
export type InsertPresetSpoolSeries = typeof presetSpoolSeries.$inferInsert;

/**
 * Materialarten, für die eine Serie gilt (z. B. PLA). Ohne Eintrag gilt die
 * Serie für alle Materialarten – so kann ein Hersteller pro Materialart eine
 * andere Spule führen.
 */
export const presetSeriesMaterialTypes = mysqlTable(
  "preset_series_material_types",
  {
    id: serial("id").primaryKey(),
    seriesId: bigint("seriesId", { mode: "number", unsigned: true }).notNull(),
    materialType: varchar("materialType", { length: 100 }).notNull(),
  },
  (t) => [
    unique("preset_series_material_types_unique").on(t.seriesId, t.materialType),
  ],
);

export type PresetSeriesMaterialType =
  typeof presetSeriesMaterialTypes.$inferSelect;

/** Material der Spule selbst */
export const PRESET_SPOOL_MATERIALS = [
  "kunststoff",
  "karton",
  "metall",
  "sonstiges",
] as const;

/** Revision einer Serie (z. B. „Kartonspule (ab 2023)“) */
export const presetSpoolVersions = mysqlTable(
  "preset_spool_versions",
  {
    id: serial("id").primaryKey(),
    seriesId: bigint("seriesId", { mode: "number", unsigned: true }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    /** Stabiler Schlüssel innerhalb der Serie, z. B. „karton-2023“ */
    slug: varchar("slug", { length: 255 }).notNull(),
    spoolMaterial: mysqlEnum("spoolMaterial", PRESET_SPOOL_MATERIALS),
    /** Gültig ab, ISO-String JJJJ-MM-TT */
    validFrom: date("validFrom", { mode: "string" }),
    /** Gültig bis; null = aktuell im Handel (daraus wird „aktuell“ abgeleitet) */
    validTo: date("validTo", { mode: "string" }),
    ...presetMeta(),
  },
  (t) => [
    unique("preset_spool_versions_slug_unique").on(t.seriesId, t.slug),
    index("preset_spool_versions_series_idx").on(t.seriesId),
  ],
);

export type PresetSpoolVersion = typeof presetSpoolVersions.$inferSelect;
export type InsertPresetSpoolVersion = typeof presetSpoolVersions.$inferInsert;

/** Spule einer Version für ein bestimmtes Netto-Materialgewicht */
export const presetSpoolVariants = mysqlTable(
  "preset_spool_variants",
  {
    id: serial("id").primaryKey(),
    versionId: bigint("versionId", { mode: "number", unsigned: true }).notNull(),
    /** Netto-Materialgewicht laut Hersteller in Gramm (z. B. 1000) */
    nominalWeight: int("nominalWeight").notNull(),
    /** Leergewicht der leeren Spule in Gramm */
    tareWeight: int("tareWeight").notNull(),
    /** Außendurchmesser in Millimetern */
    outerDiameterMm: int("outerDiameterMm"),
    /** Breite der Spule in Millimetern */
    widthMm: int("widthMm"),
    /** Durchmesser der Mittelbohrung in Millimetern */
    boreDiameterMm: int("boreDiameterMm"),
    /**
     * Vorberechnete Bezeichnung für Auswahllisten, z. B.
     * „Polymaker · PolyTerra PLA · Kartonspule (ab 2023) · 1 kg“.
     * Erspart der Auswahl einen Join über vier Ebenen; muss nach jeder
     * Umbenennung einer übergeordneten Ebene neu erzeugt werden
     * (`refreshVariantDisplayNames` in api/queries/presets.ts).
     */
    displayName: varchar("displayName", { length: 500 }).notNull(),
    ...presetMeta(),
  },
  (t) => [
    unique("preset_spool_variants_unique").on(t.versionId, t.nominalWeight),
    index("preset_spool_variants_version_idx").on(t.versionId),
  ],
);

export type PresetSpoolVariant = typeof presetSpoolVariants.$inferSelect;
export type InsertPresetSpoolVariant = typeof presetSpoolVariants.$inferInsert;

/** Ebenen, auf denen ein Benutzer Presets ausblenden kann */
export const PRESET_SCOPES = [
  "manufacturer",
  "series",
  "version",
  "variant",
] as const;

/**
 * Vom Benutzer ausgeblendete Presets. Wird auf einer höheren Ebene
 * ausgeblendet, verschwinden auch alle darunterliegenden Einträge.
 */
export const hiddenSpoolPresets = mysqlTable(
  "hidden_spool_presets",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    scope: mysqlEnum("scope", PRESET_SCOPES).notNull(),
    /** ID des Katalogeintrags auf der jeweiligen Ebene */
    refId: bigint("refId", { mode: "number", unsigned: true }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    unique("hidden_spool_presets_unique").on(t.userId, t.scope, t.refId),
    index("hidden_spool_presets_user_idx").on(t.userId),
  ],
);

export type HiddenSpoolPreset = typeof hiddenSpoolPresets.$inferSelect;

/** Art eines Vorschlags: neuer Katalogeintrag oder Änderung an einem bestehenden */
export const PRESET_PROPOSAL_KINDS = ["new", "change"] as const;
export const PRESET_PROPOSAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "withdrawn",
] as const;

/**
 * Community-Vorschlag für den Preset-Katalog. Benutzer reichen ein,
 * Administratoren moderieren.
 */
export const presetProposals = mysqlTable(
  "preset_proposals",
  {
    id: serial("id").primaryKey(),
    /** Einreicher */
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    kind: mysqlEnum("kind", PRESET_PROPOSAL_KINDS).notNull(),
    /** Katalogebene, auf die sich der Vorschlag bezieht */
    targetType: mysqlEnum("targetType", PRESET_SCOPES).notNull(),
    /** Nur bei kind = "change": betroffener Katalogeintrag */
    targetId: bigint("targetId", { mode: "number", unsigned: true }),
    /** Vorgeschlagene Werte, validiert über contracts/presets.ts */
    payload: json("payload").notNull(),
    /** Eigener Rollentyp, aus dem der Vorschlag entstanden ist */
    sourceSpoolTypeId: bigint("sourceSpoolTypeId", {
      mode: "number",
      unsigned: true,
    }),
    /** Begründung des Einreichers */
    comment: text("comment"),
    status: mysqlEnum("status", PRESET_PROPOSAL_STATUSES)
      .default("pending")
      .notNull(),
    reviewedBy: bigint("reviewedBy", { mode: "number", unsigned: true }),
    reviewedAt: timestamp("reviewedAt"),
    /** Begründung der Moderation (v. a. bei Ablehnung) */
    reviewNote: text("reviewNote"),
    /** Nach Annahme erzeugter bzw. aktualisierter Katalogeintrag */
    resultId: bigint("resultId", { mode: "number", unsigned: true }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("preset_proposals_status_idx").on(t.status),
    index("preset_proposals_user_idx").on(t.userId),
  ],
);

export type PresetProposal = typeof presetProposals.$inferSelect;
export type InsertPresetProposal = typeof presetProposals.$inferInsert;
