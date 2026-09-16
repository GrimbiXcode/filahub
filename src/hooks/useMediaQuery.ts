import { useEffect, useState } from "react";

/**
 * Ob eine Media Query gerade zutrifft – `false`, bis sie im Browser
 * ausgewertet ist.
 *
 * Für Entscheidungen, die CSS nicht treffen kann: Ob ein Tipp auf eine
 * Spulenkarte das Detail **daneben** zeigt (breiter Schirm) oder die
 * Detailseite **öffnet** (schmaler), ist Verhalten, keine Darstellung.
 * `useIsMobile` ist dasselbe Muster mit fester Grenze.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
