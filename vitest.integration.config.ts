/**
 * Integrationstests gegen eine echte PostgreSQL-Datenbank – bewusst getrennt von
 * `vitest.config.ts`, damit `npm run test` ohne Datenbank lauffähig bleibt.
 * Start: `npm run test:integration` mit gesetzter `TEST_DATABASE_URL`.
 */
import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "src"),
      "@contracts": path.resolve(templateRoot, "contracts"),
      "@db": path.resolve(templateRoot, "db"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["api/**/*.integration.test.ts"],
    setupFiles: ["./api/test/setup-integration.ts"],
    // Alle Testdateien teilen sich eine Datenbank – daher nacheinander.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
