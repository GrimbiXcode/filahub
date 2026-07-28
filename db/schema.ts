import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  bigint,
  int,
  date,
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
  /** Gewählte Rolle/Verpackung (Leergewicht) */
  spoolTypeId: bigint("spoolTypeId", { mode: "number", unsigned: true }),
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
