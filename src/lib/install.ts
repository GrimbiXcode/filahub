/**
 * Erkennung für „filahub zum Home-Bildschirm hinzufügen“.
 *
 * Einen Knopf, der überall wirklich installiert, gibt es nicht. Chromium
 * bietet dafür `beforeinstallprompt` an, verlangt für dieses Ereignis aber
 * weiterhin einen Service Worker mit `fetch`-Handler – den hat filahub
 * bewusst nicht, weil eine selbst gehostete App sonst nach jedem Deploy auf
 * alten Dateien hängen bleiben kann. Safari kennt gar kein solches Ereignis
 * (WebKit-Bug 255716) und wird es absehbar auch nicht bekommen.
 *
 * Bleibt: dem Benutzer den Weg zeigen, den sein Browser tatsächlich hat.
 * Diese Datei beantwortet dafür die zwei nötigen Fragen – welcher Browser,
 * und läuft die App schon installiert?
 */

export type InstallPlatform =
  | "ios"
  | "android"
  | "chromium-desktop"
  | "safari-desktop"
  | "firefox"
  | "unknown";

function isIos(ua: string, touchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS gibt sich seit Version 13 als Mac aus. Nur der Touchscreen
  // unterscheidet ein iPad noch von einem MacBook.
  return /Macintosh/.test(ua) && touchPoints > 1;
}

/**
 * Die Parameter sind nur zum Prüfen da – im Betrieb kommen beide Werte aus
 * `navigator`, sonst müsste jede Aufrufstelle dasselbe wiederholen.
 */
export function detectInstallPlatform(
  ua: string = navigator.userAgent,
  touchPoints: number = navigator.maxTouchPoints
): InstallPlatform {
  if (isIos(ua, touchPoints)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Firefox\/|FxiOS/.test(ua)) return "firefox";
  // Reihenfolge zählt: Chrome und Edge führen „Safari“ ebenfalls in ihrer
  // Kennung, umgekehrt gilt das nicht.
  if (/Edg\/|Chrome\/|Chromium\//.test(ua)) return "chromium-desktop";
  if (/Safari\//.test(ua)) return "safari-desktop";
  return "unknown";
}

/** Läuft die Seite bereits als installierte App statt im Browser-Tab? */
export function isStandalone(): boolean {
  const modes = ["standalone", "fullscreen", "minimal-ui"];
  if (modes.some(m => window.matchMedia(`(display-mode: ${m})`).matches)) {
    return true;
  }
  // Safari kennt `display-mode` nicht und meldet den Zustand über eine
  // eigene, nicht standardisierte Eigenschaft.
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Das Ereignis, mit dem Chromium den nativen Installationsdialog anbietet.
 * Steht nicht in den TypeScript-Standardtypen, weil es kein Standard ist.
 */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
