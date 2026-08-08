import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18nContext";

/**
 * Der sichtbare Teil der ErrorBoundary. Eigene Datei, weil eine
 * Klassenkomponente `useT()` nicht aufrufen kann und Fast Refresh eine Datei
 * mit Klasse *und* Funktionskomponente nicht mehr aktualisiert.
 */
export function ErrorScreen({ message }: { message: string }) {
  const t = useT();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">{t.errorBoundary.title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {t.errorBoundary.description}
      </p>
      <p className="max-w-md rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
        {message}
      </p>
      <Button onClick={() => window.location.assign("/")}>
        {t.errorBoundary.action}
      </Button>
    </div>
  );
}
