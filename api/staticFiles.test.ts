import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VERSION_FILE_PATH } from "@contracts/constants";

/**
 * Cache-Kopfzeilen der statischen Auslieferung (`api/lib/vite.ts`).
 *
 * Gegen ein Wegwerf-Verzeichnis statt gegen `dist/public`, damit der Test
 * ohne `npm run build` läuft. Der verzögerte Import von `./app` wie in
 * `securityHeaders.test.ts`: `api/lib/env.ts` liest beim Laden aus
 * `process.env`.
 *
 * Der Grund für den Test steht in `api/lib/vite.ts`: Ohne diese Kopfzeilen
 * hielt der Browser `index.html` tagelang für frisch, und eine auf dem iPhone
 * installierte App blieb nach einem Release auf den alten Dateien sitzen.
 */

const IMMUTABLE = "public, max-age=31536000, immutable";

let app: (typeof import("./app"))["default"];
let root: string;

beforeAll(async () => {
  process.env.APP_SECRET ||= "test-secret";

  root = mkdtempSync(path.join(tmpdir(), "filahub-static-"));
  mkdirSync(path.join(root, "assets"));
  writeFileSync(
    path.join(root, "index.html"),
    "<!doctype html><title>filahub</title>"
  );
  writeFileSync(path.join(root, "assets", "index-abc123.js"), "console.log(1)");
  writeFileSync(path.join(root, "manifest.webmanifest"), "{}");
  writeFileSync(path.join(root, "theme-init.js"), "/* */");
  writeFileSync(
    path.join(root, VERSION_FILE_PATH.slice(1)),
    JSON.stringify({ version: "9.9.9" })
  );

  app = (await import("./app")).default;
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app, root);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function get(requestPath: string, accept = "*/*") {
  return app.fetch(
    new Request(`http://localhost${requestPath}`, { headers: { accept } })
  );
}

describe("cacheControlFor", () => {
  it("hält gehashte Bundles für unveränderlich, alles andere für prüfpflichtig", async () => {
    const { cacheControlFor } = await import("./lib/vite");
    expect(cacheControlFor("/assets/index-abc123.js")).toBe(IMMUTABLE);
    expect(cacheControlFor("/assets/v0.7.0-release-notes-1a2b.png")).toBe(
      IMMUTABLE
    );
    for (const p of ["/", "/index.html", "/theme-init.js", VERSION_FILE_PATH]) {
      expect(cacheControlFor(p), p).toBe("no-cache");
    }
  });
});

describe("Statische Auslieferung", () => {
  it("lässt index.html bei jedem Aufruf neu prüfen", async () => {
    for (const p of ["/", "/index.html"]) {
      const res = await get(p);
      expect(res.status, p).toBe(200);
      expect(res.headers.get("content-type"), p).toContain("text/html");
      expect(res.headers.get("cache-control"), p).toBe("no-cache");
      expect(await res.text(), p).toContain("filahub");
    }
  });

  it("lässt gehashte Bundles ein Jahr lang im Cache", async () => {
    const res = await get("/assets/index-abc123.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(IMMUTABLE);
  });

  it("lässt ungehashte Dateien aus public/ neu prüfen", async () => {
    for (const p of ["/manifest.webmanifest", "/theme-init.js"]) {
      const res = await get(p);
      expect(res.status, p).toBe(200);
      expect(res.headers.get("cache-control"), p).toBe("no-cache");
    }
  });

  it("liefert die Versionsdatei frisch und als JSON", async () => {
    /*
      Die Datei, an der die laufende Oberfläche eine neue Version erkennt
      (`src/lib/appUpdate.ts`). Käme sie aus dem Cache, fragte man den Cache,
      ob der Cache veraltet ist.
    */
    const res = await get(VERSION_FILE_PATH);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ version: "9.9.9" });
  });

  it("liefert für tiefe Links index.html mit derselben Regel", async () => {
    const res = await get("/einstellungen", "text/html,*/*;q=0.8");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toContain("filahub");
  });

  it("gibt 404-Antworten keine Cache-Kopfzeile mit", async () => {
    /*
      Vor allem unter `/assets/`: Ein fehlendes Bundle mit `immutable` zu
      beantworten hieße, dem Browser das Fehlen für ein Jahr einzuschärfen.
    */
    for (const p of ["/assets/index-fehlt.js", "/gibt-es-nicht.png"]) {
      const res = await get(p);
      expect(res.status, p).toBe(404);
      expect(res.headers.get("cache-control"), p).toBeNull();
      expect(await res.json(), p).toEqual({ error: "Not Found" });
    }
  });

  it("lässt die API-Antworten unberührt", async () => {
    // `/health` ist vor der statischen Auslieferung registriert – die
    // Kopfzeile darf dort nicht landen.
    const res = await get("/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBeNull();
  });
});
