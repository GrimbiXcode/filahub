import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { checkForUpdate } from "@/lib/appUpdate";
import { useT } from "@/lib/i18nContext";

/** Feste Kennung, damit wiederholte Prüfungen die Meldung nicht stapeln. */
const TOAST_ID = "app-update";

/**
 * Hängt den Versionsabgleich (`src/lib/appUpdate.ts`) an den Lebenszyklus der
 * Seite: einmal beim Start, dann bei jeder Rückkehr in den Vordergrund.
 *
 * `visibilitychange` und nicht `focus`: Das eine feuert auf dem Telefon
 * zuverlässig, wenn die App aus dem Hintergrund kommt, das andere doppelt
 * oder gar nicht – TanStack Query ist aus demselben Grund bei
 * `visibilitychange` allein gelandet.
 *
 * Wird nicht neu geladen, weil jemand mitten in einer Eingabe steckt, bleibt
 * eine Meldung mit Knopf stehen; der nächste Vordergrund-Wechsel versucht es
 * ohnehin wieder.
 */
export function useAppUpdate() {
  const t = useT();

  // Über einen Ref, damit ein Sprachwechsel den Abgleich nicht neu anstößt –
  // die Texte braucht nur die Meldung, und die erst, wenn es so weit ist.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    const run = async (force: boolean) => {
      if (document.visibilityState !== "visible") return;
      if ((await checkForUpdate({ force })) !== "deferred") return;
      toast.info(tRef.current.update.available, {
        id: TOAST_ID,
        duration: Infinity,
        action: {
          label: tRef.current.update.reload,
          onClick: () => window.location.reload(),
        },
      });
    };
    const onVisibilityChange = () => void run(false);

    void run(true);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);
}
