import { useEffect, useState } from "react";

/**
 * Gibt einen Wert erst zurück, wenn er sich `delayMs` lang nicht geändert hat.
 *
 * Gebraucht für die Suche im Lager der Freunde: Die läuft – anders als die
 * Suche im eigenen Lager – auf dem Server, und ohne Entprellen wäre das eine
 * Abfrage pro Tastenanschlag.
 */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
