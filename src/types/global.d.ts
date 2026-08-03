/**
 * Version aus `package.json`, zur Bauzeit von Vite eingesetzt
 * (`define` in `vite.config.ts`).
 *
 * Gilt nur für das Frontend-Projekt (`tsconfig.app.json`, `include: ["src"]`).
 * In `api/` und `contracts/` gibt es diesen Wert nicht – dort würde weder
 * esbuild noch vitest ihn ersetzen. Im Code deshalb ausschließlich über
 * `APP_VERSION` aus `@/lib/appVersion` benutzen.
 */
declare const __APP_VERSION__: string;
