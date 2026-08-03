import { and, eq } from "drizzle-orm";
import { buildVariantDisplayName } from "@contracts/presets";
import {
  PRESET_SEED_REVISION,
  presetSeedCatalog,
  type SeedManufacturer,
} from "@db/presets/catalog";
import {
  presetManufacturers,
  presetSeriesMaterialTypes,
  presetSpoolSeries,
  presetSpoolVariants,
  presetSpoolVersions,
} from "@db/schema";
import { getDb } from "./connection";

export type SeedStats = { created: number; updated: number; skipped: number };

/**
 * Entscheidet, was mit einem bereits vorhandenen Katalogeintrag passiert.
 *
 *   - fremde Herkunft (admin/community) → nie anfassen
 *   - eigene Seed-Daten, aber alte Revision → aktualisieren
 *   - sonst → nichts tun
 *
 * Damit überleben Korrekturen von Administratoren und übernommene
 * Community-Vorschläge jedes Redeploy.
 */
export function seedAction(row: {
  source: string;
  seedRevision: number;
}): "update" | "skip" {
  if (row.source !== "seed") return "skip";
  return row.seedRevision < PRESET_SEED_REVISION ? "update" : "skip";
}

/**
 * Legt den Startkatalog an. Idempotent: Der Aufruf beim Serverstart darf
 * beliebig oft laufen, ohne Duplikate zu erzeugen oder Änderungen zu
 * überschreiben. Läuft ohne Transaktionen (planetscale-Modus); die
 * Unique-Keys je Ebene sind die eigentliche Absicherung.
 */
export async function seedSpoolPresets(
  catalog: SeedManufacturer[] = presetSeedCatalog
): Promise<SeedStats> {
  const db = getDb();
  const stats: SeedStats = { created: 0, updated: 0, skipped: 0 };

  for (const manufacturer of catalog) {
    const existingManufacturer = await db.query.presetManufacturers.findFirst({
      where: eq(presetManufacturers.slug, manufacturer.slug),
    });

    let manufacturerId: number;
    if (!existingManufacturer) {
      await db.insert(presetManufacturers).values({
        slug: manufacturer.slug,
        name: manufacturer.name,
        website: manufacturer.website ?? null,
        source: "seed",
        seedRevision: PRESET_SEED_REVISION,
      });
      const created = await db.query.presetManufacturers.findFirst({
        where: eq(presetManufacturers.slug, manufacturer.slug),
      });
      if (!created) continue;
      manufacturerId = created.id;
      stats.created++;
    } else {
      manufacturerId = existingManufacturer.id;
      if (seedAction(existingManufacturer) === "update") {
        await db
          .update(presetManufacturers)
          .set({
            name: manufacturer.name,
            website: manufacturer.website ?? null,
            seedRevision: PRESET_SEED_REVISION,
          })
          .where(eq(presetManufacturers.id, manufacturerId));
        stats.updated++;
      } else {
        stats.skipped++;
      }
    }

    for (const series of manufacturer.series) {
      const existingSeries = await db.query.presetSpoolSeries.findFirst({
        where: and(
          eq(presetSpoolSeries.manufacturerId, manufacturerId),
          eq(presetSpoolSeries.slug, series.slug)
        ),
      });

      let seriesId: number;
      if (!existingSeries) {
        await db.insert(presetSpoolSeries).values({
          manufacturerId,
          slug: series.slug,
          name: series.name,
          source: "seed",
          seedRevision: PRESET_SEED_REVISION,
        });
        const created = await db.query.presetSpoolSeries.findFirst({
          where: and(
            eq(presetSpoolSeries.manufacturerId, manufacturerId),
            eq(presetSpoolSeries.slug, series.slug)
          ),
        });
        if (!created) continue;
        seriesId = created.id;
        stats.created++;
        await replaceMaterialTypes(seriesId, series.materialTypes);
      } else {
        seriesId = existingSeries.id;
        if (seedAction(existingSeries) === "update") {
          await db
            .update(presetSpoolSeries)
            .set({ name: series.name, seedRevision: PRESET_SEED_REVISION })
            .where(eq(presetSpoolSeries.id, seriesId));
          await replaceMaterialTypes(seriesId, series.materialTypes);
          stats.updated++;
        } else {
          stats.skipped++;
        }
      }

      for (const version of series.versions) {
        const existingVersion = await db.query.presetSpoolVersions.findFirst({
          where: and(
            eq(presetSpoolVersions.seriesId, seriesId),
            eq(presetSpoolVersions.slug, version.slug)
          ),
        });

        let versionId: number;
        if (!existingVersion) {
          await db.insert(presetSpoolVersions).values({
            seriesId,
            slug: version.slug,
            name: version.name,
            spoolMaterial: version.spoolMaterial,
            validFrom: version.validFrom ?? null,
            validTo: version.validTo ?? null,
            source: "seed",
            seedRevision: PRESET_SEED_REVISION,
          });
          const created = await db.query.presetSpoolVersions.findFirst({
            where: and(
              eq(presetSpoolVersions.seriesId, seriesId),
              eq(presetSpoolVersions.slug, version.slug)
            ),
          });
          if (!created) continue;
          versionId = created.id;
          stats.created++;
        } else {
          versionId = existingVersion.id;
          if (seedAction(existingVersion) === "update") {
            await db
              .update(presetSpoolVersions)
              .set({
                name: version.name,
                spoolMaterial: version.spoolMaterial,
                validFrom: version.validFrom ?? null,
                validTo: version.validTo ?? null,
                seedRevision: PRESET_SEED_REVISION,
              })
              .where(eq(presetSpoolVersions.id, versionId));
            stats.updated++;
          } else {
            stats.skipped++;
          }
        }

        for (const variant of version.variants) {
          const displayName = buildVariantDisplayName({
            manufacturer: manufacturer.name,
            series: series.name,
            version: version.name,
            nominalWeight: variant.nominalWeight,
          });
          const existingVariant = await db.query.presetSpoolVariants.findFirst({
            where: and(
              eq(presetSpoolVariants.versionId, versionId),
              eq(presetSpoolVariants.nominalWeight, variant.nominalWeight)
            ),
          });

          if (!existingVariant) {
            await db.insert(presetSpoolVariants).values({
              versionId,
              nominalWeight: variant.nominalWeight,
              tareWeight: variant.tareWeight,
              outerDiameterMm: variant.outerDiameterMm ?? null,
              widthMm: variant.widthMm ?? null,
              boreDiameterMm: variant.boreDiameterMm ?? null,
              notes: variant.notes ?? null,
              displayName,
              source: "seed",
              seedRevision: PRESET_SEED_REVISION,
            });
            stats.created++;
          } else if (seedAction(existingVariant) === "update") {
            await db
              .update(presetSpoolVariants)
              .set({
                tareWeight: variant.tareWeight,
                outerDiameterMm: variant.outerDiameterMm ?? null,
                widthMm: variant.widthMm ?? null,
                boreDiameterMm: variant.boreDiameterMm ?? null,
                notes: variant.notes ?? null,
                displayName,
                seedRevision: PRESET_SEED_REVISION,
              })
              .where(eq(presetSpoolVariants.id, existingVariant.id));
            stats.updated++;
          } else {
            stats.skipped++;
          }
        }
      }
    }
  }

  return stats;
}

async function replaceMaterialTypes(seriesId: number, materialTypes: string[]) {
  const db = getDb();
  await db
    .delete(presetSeriesMaterialTypes)
    .where(eq(presetSeriesMaterialTypes.seriesId, seriesId));
  if (materialTypes.length === 0) return;
  await db.insert(presetSeriesMaterialTypes).values(
    [...new Set(materialTypes)].map(materialType => ({
      seriesId,
      materialType,
    }))
  );
}
