import { useTheme } from "next-themes";

/** Auswählbare Farbschemata – „system“ folgt der Einstellung des Geräts. */
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

/** Beschriftungen für die Oberfläche */
export const THEME_LABELS: Record<Theme, string> = {
  light: "Hell",
  dark: "Dunkel",
  system: "System",
};

/**
 * Hintergrundfarbe der Adressleiste je Farbschema. Muss zu `--background`
 * aus `index.css` passen – dieselben Werte stehen im Inline-Skript in
 * `index.html`, das das Schema vor dem ersten Paint setzt.
 */
export const THEME_COLORS = { light: "#ffffff", dark: "#09090b" } as const;

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
