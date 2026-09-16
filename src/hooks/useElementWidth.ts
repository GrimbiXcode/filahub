import { useEffect, useState, type RefObject } from "react";

/**
 * Die gemessene Breite eines Elements in Pixeln – 0, bis es gemessen ist.
 *
 * Für Zeichnungen, die ihre Geometrie in Pixeln brauchen (die Verlaufskurve):
 * Ein SVG, das per `viewBox` mitskaliert, macht aus einer 2-px-Linie eine
 * 4-px-Linie, sobald es breiter wird. Deshalb wird die Breite gemessen und die
 * Zeichnung darauf gerechnet.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(element.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
