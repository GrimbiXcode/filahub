import type { NameI18n } from "@contracts/presets";
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
// Filament-Lager: Rollentypen (Verpackung/Spule), Lagerboxen (Drybox),
// Materialien und Wägungen
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

/** Rollentyp / Verpackung mit hinterlegtem Leergewicht (Tara) */
export const spoolTypes = pgTable("spool_types", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("userId", { mode: "number" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  manufacturer: varchar("manufacturer", { length: 255 }),
  /** Leergewicht der Rolle/Verpackung in Gramm */
  tareWeight: integer("tareWeight").notNull(),
  /**
   * Herkunft: Preset-Variante, aus der dieser Rollentyp per
   * „Kopieren & anpassen“ entstanden ist (nur zur Nachverfolgung –
   * spätere Änderungen am Preset wirken sich nicht mehr aus).
   */
  sourceVariantId: bigint("sourceVariantId", { mode: "number" }),
  notes: text("notes"),
  createdAt: tsColumn("createdAt").defaultNow().notNull(),
});

export type SpoolType = typeof spoolTypes.$inferSelect;
export type InsertSpoolType = typeof spoolTypes.$inferInsert;

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

/** 3D-Druckmaterial (Filament-Rolle im Lager) */
export const materials = pgTable(
  "materials",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("userId", { mode: "number" }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    /** Kurz-Kennung zum schnellen Wiederfinden / Beschriften (z. B. „P01“) */
    identifier: varchar("identifier", { length: 50 }),
    /** Materialart, z. B. PLA, PETG, ABS */
    materialType: varchar("materialType", { length: 100 }).notNull(),
    manufacturer: varchar("manufacturer", { length: 255 }),
    color: varchar("color", { length: 100 }),
    /** Preis in Cent (z. B. 2499 = 24,99 €) */
    priceCents: integer("priceCents"),
    /** Kaufdatum als ISO-String YYYY-MM-DD */
    purchaseDate: date("purchaseDate", { mode: "string" }),
    /** Nenn-Füllmenge laut Hersteller in Gramm (z. B. 1000) */
    nominalWeight: integer("nominalWeight").notNull(),
    /** Gewählte eigene Rolle/Verpackung (Leergewicht) */
    spoolTypeId: bigint("spoolTypeId", { mode: "number" }),
    /**
     * Alternativ zu `spoolTypeId`: direkt referenzierte Preset-Variante aus dem
     * globalen Katalog. Es darf immer nur eines von beiden gesetzt sein.
     */
    spoolPresetVariantId: bigint("spoolPresetVariantId", { mode: "number" }),
    /** Zugewiesene Lagerbox/Drybox (Leergewicht) */
    storageBoxId: bigint("storageBoxId", { mode: "number" }),
    notes: text("notes"),
    createdAt: tsColumn("createdAt").defaultNow().notNull(),
    updatedAt: tsColumn("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  // Jede Abfrage filtert nach Besitzer; der Löschlauf beim Kontolöschen
  // ebenfalls.
  t => [index("materials_user_idx").on(t.userId)]
);

export type Material = typeof materials.$inferSelect;
export type InsertMaterial = typeof materials.$inferInsert;

/** Wägung eines Materials: gemessenes Bruttogewicht inkl. Rolle (+ Box) */
export const weighings = pgTable(
  "weighings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    materialId: bigint("materialId", { mode: "number" }).notNull(),
    /** Gemessenes Gesamtgewicht (Material + Rolle + ggf. Box) in Gramm */
    grossWeight: integer("grossWeight").notNull(),
    weighedAt: tsColumn("weighedAt").defaultNow().notNull(),
    note: varchar("note", { length: 500 }),
    createdAt: tsColumn("createdAt").defaultNow().notNull(),
  },
  // Wägungen hängen am Material – ohne Index wäre das Löschen eines Kontos
  // ein Full Scan pro Rolle.
  t => [index("weighings_material_idx").on(t.materialId)]
);

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
export const presetSpoolSeries = pgTable(
  "preset_spool_series",
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
    unique("preset_spool_series_slug_unique").on(t.manufacturerId, t.slug),
    index("preset_spool_series_manufacturer_idx").on(t.manufacturerId),
  ]
);

export type PresetSpoolSeries = typeof presetSpoolSeries.$inferSelect;
export type InsertPresetSpoolSeries = typeof presetSpoolSeries.$inferInsert;

/**
 * Materialarten, für die eine Serie gilt (z. B. PLA). Ohne Eintrag gilt die
 * Serie für alle Materialarten – so kann ein Hersteller pro Materialart eine
 * andere Spule führen.
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

/** Material der Spule selbst */
export const PRESET_SPOOL_MATERIALS = [
  "kunststoff",
  "karton",
  "metall",
  "sonstiges",
] as const;

export const presetSpoolMaterialEnum = pgEnum(
  "preset_spool_material",
  PRESET_SPOOL_MATERIALS
);

/** Revision einer Serie (z. B. „Kartonspule (ab 2023)“) */
export const presetSpoolVersions = pgTable(
  "preset_spool_versions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    seriesId: bigint("seriesId", { mode: "number" }).notNull(),
    /** Grundname – Pflicht, speist den Slug und ist die Rückfallebene */
    name: varchar("name", { length: 255 }).notNull(),
    /** Übersetzungen abweichend vom Grundname (siehe contracts/presets.ts) */
    nameI18n: jsonb("nameI18n").$type<NameI18n>(),
    /** Stabiler Schlüssel innerhalb der Serie, z. B. „karton-2023“ */
    slug: varchar("slug", { length: 255 }).notNull(),
    spoolMaterial: presetSpoolMaterialEnum("spoolMaterial"),
    /** Gültig ab, ISO-String JJJJ-MM-TT */
    validFrom: date("validFrom", { mode: "string" }),
    /** Gültig bis; null = aktuell im Handel (daraus wird „aktuell“ abgeleitet) */
    validTo: date("validTo", { mode: "string" }),
    ...presetMeta(),
  },
  t => [
    unique("preset_spool_versions_slug_unique").on(t.seriesId, t.slug),
    index("preset_spool_versions_series_idx").on(t.seriesId),
  ]
);

export type PresetSpoolVersion = typeof presetSpoolVersions.$inferSelect;
export type InsertPresetSpoolVersion = typeof presetSpoolVersions.$inferInsert;

/** Spule einer Version für ein bestimmtes Netto-Materialgewicht */
export const presetSpoolVariants = pgTable(
  "preset_spool_variants",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    versionId: bigint("versionId", { mode: "number" }).notNull(),
    /** Netto-Materialgewicht laut Hersteller in Gramm (z. B. 1000) */
    nominalWeight: integer("nominalWeight").notNull(),
    /** Leergewicht der leeren Spule in Gramm */
    tareWeight: integer("tareWeight").notNull(),
    /** Außendurchmesser in Millimetern */
    outerDiameterMm: integer("outerDiameterMm"),
    /** Breite der Spule in Millimetern */
    widthMm: integer("widthMm"),
    /** Durchmesser der Mittelbohrung in Millimetern */
    boreDiameterMm: integer("boreDiameterMm"),
    ...presetMeta(),
  },
  t => [
    unique("preset_spool_variants_unique").on(t.versionId, t.nominalWeight),
    index("preset_spool_variants_version_idx").on(t.versionId),
  ]
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
 * Katalogebene. Ein einziger Typ, den sich `hidden_spool_presets.scope` und
 * `preset_proposals.targetType` teilen – so können die beiden Spalten nicht
 * auseinanderlaufen.
 */
export const presetScopeEnum = pgEnum("preset_scope", PRESET_SCOPES);

/**
 * Vom Benutzer ausgeblendete Presets. Wird auf einer höheren Ebene
 * ausgeblendet, verschwinden auch alle darunterliegenden Einträge.
 */
export const hiddenSpoolPresets = pgTable(
  "hidden_spool_presets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("userId", { mode: "number" }).notNull(),
    scope: presetScopeEnum("scope").notNull(),
    /** ID des Katalogeintrags auf der jeweiligen Ebene */
    refId: bigint("refId", { mode: "number" }).notNull(),
    createdAt: tsColumn("createdAt").defaultNow().notNull(),
  },
  t => [
    unique("hidden_spool_presets_unique").on(t.userId, t.scope, t.refId),
    index("hidden_spool_presets_user_idx").on(t.userId),
  ]
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
    /** Eigener Rollentyp, aus dem der Vorschlag entstanden ist */
    sourceSpoolTypeId: bigint("sourceSpoolTypeId", { mode: "number" }),
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
