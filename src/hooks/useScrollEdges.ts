import { useEffect, useState } from "react";

export type ScrollEdges = { above: boolean; below: boolean };

/** Kleiner Rest, den Safari beim Ausrollen stehen lässt. */
const TOLERANCE_PX = 2;

/**
 * Ob in einem scrollbaren Element oberhalb bzw. unterhalb des sichtbaren
 * Ausschnitts noch Inhalt liegt.
 *
 * Nimmt das Element selbst statt eines Ref-Objekts: Auf dem Telefon steckt die
 * Navigation in einem Sheet, das erst beim Öffnen gerendert wird – ein
 * `useEffect` über ein Ref-Objekt hätte es nie zu sehen bekommen. Der Aufrufer
 * übergibt deshalb den Setter eines `useState` als `ref`.
 */
export function useScrollEdges(element: HTMLElement | null): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>({
    above: false,
    below: false,
  });
  useEffect(() => {
    if (!element) return;
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = element;
      const above = scrollTop > TOLERANCE_PX;
      const below = scrollTop + clientHeight < scrollHeight - TOLERANCE_PX;
      setEdges(prev =>
        prev.above === above && prev.below === below ? prev : { above, below }
      );
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    // Die Höhe ändert sich mit dem Fenster und mit dem Inhalt (die
    // Verwaltungspunkte erscheinen erst, wenn `auth.me` geladen ist).
    const resize = new ResizeObserver(update);
    resize.observe(element);
    const mutation = new MutationObserver(update);
    mutation.observe(element, { childList: true, subtree: true });
    return () => {
      element.removeEventListener("scroll", update);
      resize.disconnect();
      mutation.disconnect();
    };
  }, [element]);
  return edges;
}
