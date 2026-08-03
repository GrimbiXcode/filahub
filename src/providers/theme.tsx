import { type ReactNode, useEffect } from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { THEME_COLORS } from "@/lib/theme";

/**
 * Farbschema der App. Gespeichert wird in `localStorage` unter `theme` –
 * denselben Schlüssel liest auch das Inline-Skript in `index.html`, das die
 * Klasse schon vor dem ersten Paint setzt (sonst blitzt die helle Oberfläche
 * auf). Die Einstellung hängt am Gerät, nicht am Konto: dasselbe Konto darf
 * am Telefon dunkel und am Rechner hell sein.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ThemeColorMeta />
      {children}
    </NextThemesProvider>
  );
}

/** Hält `<meta name="theme-color">` passend zum aktiven Schema. */
function ThemeColorMeta() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    meta.setAttribute(
      "content",
      resolvedTheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light
    );
  }, [resolvedTheme]);

  return null;
}
