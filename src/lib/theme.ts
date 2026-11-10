import { useSyncExternalStore } from "react";

/** Auswählbare Farbschemata – „system“ folgt der Einstellung des Geräts. */
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export type ResolvedTheme = "light" | "dark";

/**
 * Hintergrundfarbe der Adressleiste je Farbschema. Muss zu `--background`
 * aus `index.css` passen – dieselben Werte stehen im Startskript in
 * `public/theme-init.js`, das das Schema vor dem ersten Paint setzt.
 */
export const THEME_COLORS = { light: "#f5f6f8", dark: "#121417" } as const;

/*
  Das Farbschema als Store außerhalb des React-Baums, wie `activeScope` –
  bis 4.8.0 über `next-themes`. Gespeichert wird in `localStorage` unter
  `theme`; denselben Schlüssel liest `public/theme-init.js`, das die Klasse
  schon vor dem ersten Paint setzt (sonst blitzt die helle Oberfläche auf).
  Die Einstellung hängt am Gerät, nicht am Konto: dasselbe Konto darf am
  Telefon dunkel und am Rechner hell sein.
*/

const STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function parse(raw: string | null): Theme {
  return raw === "light" || raw === "dark" ? raw : "system";
}

function readStored(): Theme {
  try {
    return parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Privates Fenster ohne Speicherzugriff – dann eben pro Sitzung.
    return "system";
  }
}

const media =
  typeof window !== "undefined" ? window.matchMedia(DARK_QUERY) : undefined;

type State = { theme: Theme; resolvedTheme: ResolvedTheme };

function resolve(theme: Theme): State {
  const resolvedTheme =
    theme === "system" ? (media?.matches ? "dark" : "light") : theme;
  return { theme, resolvedTheme };
}

let state = resolve(readStored());
const listeners = new Set<() => void>();

function update(theme: Theme) {
  const next = resolve(theme);
  if (
    next.theme === state.theme &&
    next.resolvedTheme === state.resolvedTheme
  ) {
    return;
  }
  const schemeChanged = next.resolvedTheme !== state.resolvedTheme;
  state = next;
  if (schemeChanged) applyToDocument(state.resolvedTheme);
  for (const listener of listeners) listener();
}

/**
 * Setzt Klasse, `color-scheme` und `<meta name="theme-color">`. Übergänge
 * sind dabei kurz abgeschaltet: Sonst blendeten Hunderte Elemente einzeln
 * über, und die Seite flackerte durch ein halbes Schema.
 */
function applyToDocument(resolved: ResolvedTheme) {
  const root = document.documentElement;
  const pause = document.createElement("style");
  pause.textContent =
    "*,*::before,*::after{transition:none!important;animation-duration:0s!important}";
  document.head.appendChild(pause);

  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[resolved]);

  // Erst nach dem nächsten Layout wieder einschalten, sonst greift die Pause
  // nie: Der Browser fasst Setzen und Entfernen zu einem Schritt zusammen.
  void getComputedStyle(document.body).opacity;
  requestAnimationFrame(() => pause.remove());
}

/**
 * Gerät und andere Tabs. Einmal je Seite angemeldet, nicht je Komponente –
 * der Store lebt so lange wie die Seite.
 */
if (typeof window !== "undefined") {
  // `theme-init.js` hat das Schema meist schon gesetzt; scheiterte es (etwa
  // ohne Speicherzugriff), zieht der erste Import hier nach.
  if (
    document.documentElement.classList.contains("dark") !==
    (state.resolvedTheme === "dark")
  ) {
    applyToDocument(state.resolvedTheme);
  }
  media?.addEventListener("change", () => update(state.theme));
  window.addEventListener("storage", event => {
    if (event.key === STORAGE_KEY || event.key === null) update(readStored());
  });
}

export function setTheme(next: Theme) {
  try {
    if (next === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Ohne Speicher gilt die Wahl bis zum Neuladen.
  }
  update(next);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;

/**
 * Farbschema lesen und setzen. `theme` ist die Auswahl inkl. „system“,
 * `resolvedTheme` das tatsächlich sichtbare Schema.
 */
export function useAppTheme() {
  const current = useSyncExternalStore(subscribe, getSnapshot);
  return { ...current, setTheme };
}
