import { z } from "zod";

/**
 * Sammelbearbeitung von Gebinden aus der Übersicht (seit 4.5.0).
 *
 * Gemeinsam für Client und Server: Der Dialog baut den Änderungssatz mit
 * denselben Regeln, die `material.updateMany` prüft.
 *
 * **Nur Felder des Gebindes, die für jedes Gebinde einzeln gelten** – Preis,
 * Kaufdatum, Nennmenge, Drybox und „aufgebraucht“. Bewusst nicht dabei:
 *
 * - die **Felder des Materials** (Name, Hersteller, Farbe …): Sie gelten schon
 *   für alle Gebinde eines Materials, und über mehrere Materialien hinweg
 *   gleichgesetzt hießen sie Zusammenführen – dafür gibt es `product.merge`.
 * - die **Kennung**: Sie ist je Lager eindeutig, eine gemeinsame kollidierte
 *   beim zweiten Gebinde.
 * - das **Lager**: Ein Umzug nimmt Kennungen mit und muss die Konsistenzregel
 *   je Material prüfen (`assertProductFitsLager`) – das ist der Einzelweg.
 * - die **Gebindeart**: entweder eigene Art oder Katalogvariante, samt
 *   Vorauswahl nach Hersteller (`ContainerPicker`); über verschiedene
 *   Hersteller hinweg gäbe es keine sinnvolle Vorauswahl.
 *
 * `undefined` heißt „nicht ändern“, `null` heißt „leeren“ – wie bei
 * `material.update`.
 */
export const bulkGebindePatchSchema = z
  .object({
    priceCents: z.number().int().min(0).nullable().optional(),
    purchaseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT")
      .nullable()
      .optional(),
    nominalWeight: z
      .number()
      .int()
      .positive("Nennmenge muss > 0 sein")
      .optional(),
    storageBoxId: z.number().int().positive().nullable().optional(),
    archived: z.boolean().optional(),
  })
  .strict();

export type BulkGebindePatch = z.infer<typeof bulkGebindePatchSchema>;

/** Ob der Änderungssatz überhaupt etwas ändert */
export function hasBulkChanges(patch: BulkGebindePatch): boolean {
  return Object.values(patch).some(value => value !== undefined);
}

/**
 * Die IDs ohne Dubletten, in der Reihenfolge des ersten Auftretens. Eine
 * doppelt geschickte ID darf die Prüfung „alle gehören zum Bereich“ nicht
 * verfälschen (gezählt wird über die eindeutigen).
 */
export function uniqueIds(ids: readonly number[]): number[] {
  return [...new Set(ids)];
}
