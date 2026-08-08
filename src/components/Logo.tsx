import { cn } from "@/lib/utils";

/**
 * Bildmarke: eine Spule von vorn – äußerer Ring, Mittelbohrung und ein
 * Füllstandsbogen. Der Bogen greift die Farbskala der Restmenge auf
 * (siehe `fillBarClass` in `src/lib/format.ts`) und steht bewusst auf dem
 * gelben Mittelwert, nicht auf „voll“.
 *
 * Dieselbe Form liegt als Favicon in `index.html` und auf der Produktseite
 * unter `landing/` – wird sie hier geändert, müssen beide mitgezogen werden.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("h-5 w-5", className)}
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="16"
        cy="16"
        r="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        opacity="0.45"
      />
      <path
        d="M16 3a13 13 0 0 1 11.3 19.4"
        fill="none"
        className="stroke-yellow-500"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle
        cx="16"
        cy="16"
        r="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        opacity="0.45"
      />
    </svg>
  );
}

/**
 * Bildmarke plus Schriftzug. Der Produktname wird bewusst nicht übersetzt –
 * er ist ein Eigenname, in jeder Sprache derselbe, und klein geschrieben wie
 * im Repository und auf der Produktseite.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark className="shrink-0" />
      <span className="font-semibold tracking-tight">filahub</span>
    </span>
  );
}
