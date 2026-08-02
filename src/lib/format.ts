/**
 * Darstellungs-Helfer ohne Locale-Bezug.
 *
 * Zahlen-, Gewichts-, Geld- und Datumsformate hängen an den Einstellungen des
 * Benutzers und kommen aus `useFormat()` (`src/providers/format.tsx`), das die
 * reinen Funktionen aus `@contracts/format` bindet.
 */

/** Fortschritts-Farbe je nach Füllstand */
export function fillLevelColor(percent: number | null): string {
  if (percent == null) return "bg-muted-foreground/40";
  if (percent <= 10) return "bg-red-500";
  if (percent <= 25) return "bg-orange-500";
  if (percent <= 50) return "bg-yellow-500";
  return "bg-emerald-500";
}

export function fillLevelTextColor(percent: number | null): string {
  if (percent == null) return "text-muted-foreground";
  if (percent <= 10) return "text-red-600 dark:text-red-400";
  if (percent <= 25) return "text-orange-600 dark:text-orange-400";
  return "text-foreground";
}
