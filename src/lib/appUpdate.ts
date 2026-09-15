import { z } from "zod";
import { VERSION_FILE_PATH } from "@contracts/constants";
import { APP_VERSION } from "@/lib/appVersion";

/**
 * Abgleich der laufenden Oberfläche mit der Version, die der Server ausliefert.
 *
 * Gedacht für die als App installierte Fassung, vor allem auf dem iPhone: Eine
 * Home-Bildschirm-App hat keinen Neuladen-Knopf, und iOS legt sie beim
 * Verlassen nur schlafen – zurück kommt genau die Seite, die man verlassen
 * hat, notfalls Wochen später. Bis 2.9.1 lief dort die alte Oberfläche gegen
 * den neuen Server, bis jemand die App löschte und neu anlegte. Im Browser-Tab
 * dasselbe, nur mit Neuladen-Knopf.
 *
 * Kein Service Worker: Der hielte die alten Dateien erst recht fest (siehe
 * `src/lib/install.ts`). Stattdessen liegt neben `index.html` eine
 * `version.json` aus demselben Bau (`vite.config.ts`), die der Server mit
 * `Cache-Control: no-cache` ausliefert (`api/lib/vite.ts`). Gefragt wird beim
 * Start und immer dann, wenn die App wieder in den Vordergrund kommt
 * (`src/hooks/useAppUpdate.ts`) – auf dem Telefon der einzige Moment, in dem
 * überhaupt etwas passiert.
 */

/** Frühestens alle 60 Sekunden – App-Wechsel kommen in Serien. */
const MIN_INTERVAL_MS = 60_000;

/**
 * Für welche Version in dieser Sitzung schon einmal neu geladen wurde.
 *
 * Der Riegel gegen eine Endlosschleife: Gibt ein Proxy davor `index.html`
 * weiter aus seinem eigenen Cache, kommt nach dem Neuladen dieselbe alte
 * Oberfläche zurück – und fände dieselbe neue Version vor. Je Version wird
 * deshalb genau einmal neu geladen. `sessionStorage`, weil der Eintrag nur
 * diese Sitzung schützen soll und mit ihr verschwindet.
 */
const RELOADED_FOR_KEY = "app-update-reloaded-for";

/**
 * Eingabearten, in denen nichts Getipptes verloren gehen kann. Alles andere
 * (`text`, `search`, `number`, `date` …) zählt als Text.
 */
const NON_TEXT_INPUTS = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "radio",
  "range",
  "reset",
  "submit",
]);

const versionFileSchema = z.object({ version: z.string().min(1).max(64) });

/**
 * Wann zuletzt gefragt wurde. Modulweit und kein React-State: Der Hook
 * darf neu angehängt werden (Sprachwechsel, StrictMode), ohne dass die
 * Sperre von vorn beginnt.
 */
let lastCheckAt = 0;

export type UpdateCheck =
  /** Der Server liefert dieselbe Version aus. */
  | "current"
  /** Andere Version – das Neuladen ist ausgelöst. */
  | "reloading"
  /**
   * Andere Version, aber nicht automatisch neu geladen: Jemand steckt mitten
   * in einer Eingabe, oder ohne Speicherzugriff lässt sich der Schleifenriegel
   * nicht setzen. Wer das bekommt, **bietet** das Neuladen an.
   */
  | "deferred"
  /**
   * Nichts zu tun: zu früh nach der letzten Nachfrage, offline, oder für
   * diese Version wurde schon neu geladen, ohne dass es etwas geändert hätte.
   */
  | "none";

/**
 * Fragt den Server nach seiner Version und lädt bei Abweichung neu.
 *
 * `force` übergeht die Minutensperre – für die eine Prüfung beim Start, die
 * den Fall abdeckt, dass iOS eine veraltete `index.html` aus dem Cache
 * wiederhergestellt hat.
 */
export async function checkForUpdate({
  force = false,
}: { force?: boolean } = {}): Promise<UpdateCheck> {
  const now = Date.now();
  if (!force && now - lastCheckAt < MIN_INTERVAL_MS) return "none";
  lastCheckAt = now;

  const served = await fetchServedVersion();
  if (served === null) return "none";

  if (served === APP_VERSION) {
    // Angekommen – der Riegel hat seinen Dienst getan.
    forgetReload();
    return "current";
  }

  if (reloadedFor() === served) {
    console.warn(
      `filahub: Der Server liefert ${served} aus, geladen ist ${APP_VERSION}, ` +
        "und Neuladen hat nichts geändert. Liefert ein Proxy index.html aus " +
        "seinem eigenen Cache?"
    );
    return "none";
  }

  if (isMidInput() || !rememberReload(served)) return "deferred";

  window.location.reload();
  return "reloading";
}

/** Version, die der Server gerade ausliefert; `null`, wenn nicht ermittelbar. */
export async function fetchServedVersion(): Promise<string | null> {
  try {
    // `no-store`: Diese eine Antwort darf nie aus einem Cache kommen – sonst
    // fragte man den Cache, ob der Cache veraltet ist.
    const res = await fetch(VERSION_FILE_PATH, { cache: "no-store" });
    if (!res.ok) return null;
    const parsed = versionFileSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.version : null;
  } catch {
    // Offline oder unterwegs – dann eben beim nächsten Mal.
    return null;
  }
}

/**
 * Steckt jemand mitten in einer Eingabe? Dann ginge beim Neuladen etwas
 * verloren.
 *
 * Ein offener Dialog (Material anlegen, Wiegen, Verbrauch) zählt immer, ein
 * Feld erst, wenn etwas darin steht. Eine Heuristik, keine Zusicherung – und
 * bewusst in die vorsichtige Richtung falsch: Lieber einmal zu oft nur
 * anbieten als einmal eine halb ausgefüllte Importseite verwerfen.
 */
function isMidInput(): boolean {
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
    return true;
  }
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement) return active.value.trim() !== "";
  return (
    active instanceof HTMLInputElement &&
    !NON_TEXT_INPUTS.has(active.type) &&
    active.value.trim() !== ""
  );
}

// Der Speicher kann gesperrt sein (privates Fenster) – jede der drei
// Funktionen fängt das ab, statt dass die Prüfung daran scheitert.

function reloadedFor(): string | null {
  try {
    return sessionStorage.getItem(RELOADED_FOR_KEY);
  } catch {
    return null;
  }
}

/** `false`, wenn sich der Riegel nicht setzen lässt – dann wird nicht geladen. */
function rememberReload(version: string): boolean {
  try {
    sessionStorage.setItem(RELOADED_FOR_KEY, version);
    return true;
  } catch {
    return false;
  }
}

function forgetReload(): void {
  try {
    sessionStorage.removeItem(RELOADED_FOR_KEY);
  } catch {
    // Dann gab es auch nichts zu vergessen.
  }
}
