/** Formatierungs-Helfer (de-DE) */

export function formatGrams(grams: number | null | undefined): string {
  if (grams == null || !Number.isFinite(grams)) return "–";
  return `${grams.toLocaleString("de-DE")} g`;
}

export function formatEuro(cents: number | null | undefined): string {
  if (cents == null) return "–";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/** Wandelt string/Date sicher in ein Date-Objekt um, sonst null. */
function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return d;
}

export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "–";
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "–";
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Euro-String ("24,99" / "24.99") nach Cent, null bei leer/ungültig */
export function parseEuroToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(",", ".").replace(/[€\s]/g, "");
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

export function centsToEuroString(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

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
