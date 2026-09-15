import devServer from "@hono/vite-dev-server";
import { readFileSync } from "node:fs";
import path from "path";
const __dirname = import.meta.dirname;
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VERSION_FILE_PATH } from "./contracts/constants.ts";

// Version aus package.json ins Frontend reichen (angezeigt unter „Neuerungen").
// Bewusst per readFileSync statt Import: tsconfig.node.json kennt kein
// resolveJsonModule.
const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf-8")
) as { version: string };

/**
 * Legt `version.json` neben `index.html` – die Datei, an der eine laufende
 * Oberfläche erkennt, dass der Server inzwischen eine andere Version
 * ausliefert (`src/lib/appUpdate.ts`).
 *
 * Aus dem Bau und nicht aus dem Server: `api/` kennt die Version nicht (siehe
 * `src/types/global.d.ts`), und eine Datei aus demselben Bau kann nicht von
 * der `index.html` daneben abweichen. Der Entwicklungsserver beantwortet den
 * Pfad gleich, damit der Abgleich dort genauso läuft wie in Produktion.
 */
function versionFile(version: string): Plugin {
  const body = JSON.stringify({ version });
  return {
    name: "filahub:version-file",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: VERSION_FILE_PATH.slice(1),
        source: body,
      });
    },
    configureServer(server) {
      server.middlewares.use(VERSION_FILE_PATH, (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-cache");
        res.end(body);
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    devServer({ entry: "api/boot.ts", exclude: [/^\/(?!api\/).*$/] }),
    react(),
    versionFile(pkg.version),
  ],
  server: {
    // Wie der Produktionsserver in api/boot.ts: PORT gewinnt, sonst 3000.
    // So lassen sich mehrere Instanzen parallel starten.
    port: parseInt(process.env.PORT || "3000"),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@contracts": path.resolve(__dirname, "./contracts"),
      "@db": path.resolve(__dirname, "./db"),
      db: path.resolve(__dirname, "./db"),
    },
  },
  envDir: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
});
