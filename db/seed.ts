import { seedContainerPresets } from "../api/queries/presetSeed";

/**
 * Manuelles Seeding für die lokale Entwicklung: `npm run db:seed`.
 *
 * In Produktion läuft dasselbe automatisch beim Serverstart
 * (siehe api/boot.ts). Der Aufruf ist idempotent – bestehende Einträge
 * werden nur überschrieben, wenn sie aus dem Seed stammen und die
 * Revision veraltet ist.
 */
async function seed() {
  console.log("Preset-Katalog wird eingespielt …");
  const stats = await seedContainerPresets();
  console.log(
    `Fertig: ${stats.created} neu, ${stats.updated} aktualisiert, ${stats.skipped} unverändert.`
  );
  process.exit(0); // Verbindungspool schließen
}

seed().catch(error => {
  console.error("Seeding fehlgeschlagen:", error);
  process.exit(1);
});
