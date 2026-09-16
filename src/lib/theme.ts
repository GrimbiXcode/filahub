import { useTheme } from "next-themes";

/** Auswählbare Farbschemata – „system“ folgt der Einstellung des Geräts. */
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

/**
 * Hintergrundfarbe der Adressleiste je Farbschema. Muss zu `--background`
 * aus `index.css` passen – dieselben Werte stehen im Startskript in
 * `public/theme-init.js`, das das Schema vor dem ersten Paint setzt.
 */
export const THEME_COLORS = { light: "#f5f6f8", dark: "#121417" } as const;

/**
 * Farbschema lesen und setzen. `theme` ist die Auswahl inkl. „system“,
 * `resolvedTheme` das tatsächlich sichtbare Schema.
 */
export function useAppTheme() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return {
    theme: (theme ?? "system") as Theme,
    resolvedTheme: (resolvedTheme ?? "light") as "light" | "dark",
    setTheme: (next: Theme) => setTheme(next),
  };
}
