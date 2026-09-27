import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Das Server-Bündel muss sich laden lassen (seit 4.4.0).
 *
 * `npm run build` bündelt `api/boot.ts` mit esbuild und setzt einen Banner
 * davor, der `require` für CommonJS-Pakete bereitstellt. In 4.3.0 kam
 * `fflate` dazu, dessen Node-Fassung selbst `createRequire` importiert – der
 * Banner deklarierte denselben Namen, und das fertige Bündel scheiterte beim
 * Start mit einem SyntaxError. `vite build`, `tsc` und alle Tests liefen
 * grün; aufgefallen wäre es erst im Container.
 *
 * Deshalb hier: dasselbe Bündel mit **denselben** Schaltern aus
 * `package.json` bauen und von Node parsen lassen (`--check` führt nichts
 * aus). Doppelte Deklarationen und ähnliche Fehler des Bündels sind damit rot.
 */
const root = path.resolve(__dirname, "..");
let outdir: string | null = null;

afterAll(async () => {
  if (outdir) await rm(outdir, { recursive: true, force: true });
});

describe("Server-Bündel", () => {
  it("baut wie npm run build und lässt sich parsen", async () => {
    const pkg = JSON.parse(
      await readFile(path.join(root, "package.json"), "utf8")
    ) as { scripts: { build: string } };
    const esbuildPart = pkg.scripts.build.split("&&")[1]?.trim() ?? "";
    expect(esbuildPart.startsWith("esbuild api/boot.ts")).toBe(true);
    const banner = /--banner:js="(.*)"$/.exec(esbuildPart)?.[1];
    expect(banner).toBeTruthy();

    outdir = await mkdtemp(path.join(tmpdir(), "filahub-bundle-"));
    const { build } = await import("esbuild");
    await build({
      entryPoints: [path.join(root, "api/boot.ts")],
      platform: "node",
      bundle: true,
      format: "esm",
      outdir,
      banner: { js: banner! },
      // `.mjs`: Im Wegwerf-Verzeichnis gibt es kein `"type": "module"`, und
      // als `.js` prüfte Node das Bündel als CommonJS – ohne den Fehler
      outExtension: { ".js": ".mjs" },
      logLevel: "silent",
    });
    // Wirft mit der Meldung von Node, wenn das Bündel nicht parsbar ist
    execFileSync(process.execPath, ["--check", path.join(outdir, "boot.mjs")], {
      stdio: "pipe",
    });
  }, 60_000);
});
