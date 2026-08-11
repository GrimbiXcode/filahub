import { z } from "zod";

/** Datum im ISO-Format JJJJ-MM-TT */
export const importDatumSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT");

/**
 * Eine Position aus dem LLM-Import (Preis in Euro als Zahl).
 * Wird clientseitig zur Prüfung der LLM-Ausgabe genutzt.
 */
export const importPositionSchema = z.object({
  typ: z.string().trim().min(1, "Typ ist erforderlich"),
  hersteller: z.string().trim().optional(),
  farbe: z.string().trim().optional(),
  nenngewicht: z
    .number()
    .int("Nenngewicht muss eine ganze Zahl sein")
    .positive("Nenngewicht muss > 0 sein"),
  preis: z.number().min(0, "Preis darf nicht negativ sein").optional(),
  anzahl: z
    .number()
    .int("Anzahl muss eine ganze Zahl sein")
    .min(1, "Anzahl muss mindestens 1 sein")
    .max(50, "Anzahl darf maximal 50 sein")
    .default(1),
});

/** Vollständiges Import-Payload, wie es das LLM liefern soll. */
export const importPayloadSchema = z.object({
  bestelldatum: importDatumSchema.optional(),
  positionen: z
    .array(importPositionSchema)
    .min(1, "Mindestens eine Position ist erforderlich")
    .max(100, "Maximal 100 Positionen pro Import"),
});

export type ImportPosition = z.infer<typeof importPositionSchema>;
export type ImportPayload = z.infer<typeof importPayloadSchema>;

/** Position für die Server-Mutation: Preis bereits in Cent umgerechnet. */
export const importItemSchema = z.object({
  typ: z.string().trim().min(1, "Typ ist erforderlich"),
  hersteller: z.string().trim().optional(),
  farbe: z.string().trim().optional(),
  nenngewicht: z
    .number()
    .int("Nenngewicht muss eine ganze Zahl sein")
    .positive("Nenngewicht muss > 0 sein"),
  priceCents: z
    .number()
    .int()
    .min(0, "Preis darf nicht negativ sein")
    .optional(),
  anzahl: z
    .number()
    .int("Anzahl muss eine ganze Zahl sein")
    .min(1, "Anzahl muss mindestens 1 sein")
    .max(50, "Anzahl darf maximal 50 sein")
    .default(1),
});

/**
 * Input der importMany-Mutation.
 *
 * `lagerId` gehört hierher und **nicht** in `importPositionSchema`: Das dort
 * beschriebene JSON kommt aus einem Sprachmodell und hat deutsche Schlüssel als
 * festen Vertrag (siehe AGENTS.md). Das Ziel-Lager wählt der Benutzer in der
 * Oberfläche – ein Modell kann es nicht kennen.
 */
export const importManyInputSchema = z.object({
  lagerId: z.number().int().positive("Bitte ein Lager wählen"),
  purchaseDate: importDatumSchema.optional(),
  items: z
    .array(importItemSchema)
    .min(1, "Mindestens eine Position ist erforderlich")
    .max(100, "Maximal 100 Positionen pro Import"),
});

export type ImportItem = z.infer<typeof importItemSchema>;
export type ImportManyInput = z.infer<typeof importManyInputSchema>;
