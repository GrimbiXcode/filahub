import path from "node:path";
import { loadConfigFromFile } from "vite";
import { describe, expect, it } from "vitest";

/**
 * Schriften dürfen im Produktionsbau nicht als `data:`-URI enden.
 *
 * Vite legt Dateien unter `build.assetsInlineLimit` (Vorgabe 4 KB) als
 * `data:`-URI ins CSS. Zwei kleine woff2-Teilmengen aus
 * `@fontsource-variable/*` fielen darunter – und die CSP aus `api/app.ts`
 * (`font-src 'self'`) blockierte sie auf jeder Seite. Die Zeichen dieser
 * Teilmengen erschienen in einer Systemschrift; `vite build`, `tsc` und alle
 * Tests waren grün.
 *
 * Statt einen ganzen Bau abzuwarten, lädt der Test die echte
 * `vite.config.ts` und fragt deren Entscheidung ab: Schriften nie inlinen,
 * alles andere nach der Vorgabe von Vite.
 */
const root = path.resolve(__dirname, "..");

async function inlineLimit() {
  const loaded = await loadConfigFromFile(
    { command: "build", mode: "production" },
    path.join(root, "vite.config.ts"),
    root,
    "silent"
  );
  const limit = loaded?.config.build?.assetsInlineLimit;
  if (typeof limit !== "function") {
    throw new Error("build.assetsInlineLimit ist keine Funktion");
  }
  return limit;
}

describe("Schriften im Produktionsbau", () => {
  it("legt woff und woff2 nie als data:-URI ab, egal wie klein", async () => {
    const limit = await inlineLimit();
    const tiny = Buffer.alloc(100);
    for (const file of [
      "/x/node_modules/@fontsource-variable/manrope/files/manrope-greek-wght-normal.woff2",
      "/x/fonts/Schrift.WOFF2",
      "/x/fonts/schrift.woff",
    ]) {
      expect(limit(file, tiny), file).toBe(false);
    }
  });

  it("lässt für andere Dateien die Vorgabe von Vite gelten", async () => {
    const limit = await inlineLimit();
    expect(limit("/x/src/icon.svg", Buffer.alloc(100))).toBeUndefined();
    expect(limit("/x/src/bild.png", Buffer.alloc(100))).toBeUndefined();
  });
});
