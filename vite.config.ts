import devServer from "@hono/vite-dev-server";
import { readFileSync } from "node:fs";
import path from "path";
const __dirname = import.meta.dirname;
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { inspectAttr } from "kimi-plugin-inspect-react";

// Version aus package.json ins Frontend reichen (angezeigt unter „Neuerungen").
// Bewusst per readFileSync statt Import: tsconfig.node.json kennt kein
// resolveJsonModule.
const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf-8")
) as { version: string };

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    devServer({ entry: "api/boot.ts", exclude: [/^\/(?!api\/).*$/] }),
    inspectAttr(),
    react(),
  ],
  server: {
    port: 3000,
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
