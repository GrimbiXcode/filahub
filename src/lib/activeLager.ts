import { useSyncExternalStore } from "react";

/**
 * Das gerade gewählte Lager.
 *
 * Bewusst außerhalb des React-Baums, wie `quickActions`: Die Auswahl steht in
 * der Seitenleiste (`AuthLayout`), gelesen wird sie in den Seiten – und die
 * rendern das Layout selbst, liegen im Baum also *über* ihm. Ein Context wäre
 * von dort nicht erreichbar.
 *
 * `null` heißt „noch nicht entschieden": beim ersten Rendern, bevor die
 * Lagerliste geladen ist, und bei einem Benutzer ohne Lager. Die Seiten müssen
 * damit umgehen können, statt auf einen Wert zu warten.
 */

/**
 * Der Schlüssel hängt seit 2.5.0 am **Bereich**: In einer Organisation liegen
 * andere Lager als privat, und eine gemeinsame Merkstelle zeigte nach dem
 * Wechsel auf ein Lager der anderen Seite. Gepflegt wird er von
 * `setActiveOrganizationId` (`src/lib/activeScope.ts`) – hier steht nur, wie er
 * aussieht und was beim Umschalten passiert.
 */
let scopeKey = "personal";

function storageKey(): string {
  return `active-lager:${scopeKey}`;
}

function readStored(): number | null {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    // Privates Fenster ohne Speicherzugriff – dann eben pro Sitzung.
    return null;
  }
}

let activeLagerId: number | null = readStored();

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(listener => listener());
}

/**
 * Wechselt den Bereich und liest das dort zuletzt gewählte Lager ein.
 *
 * Gemeldet wird über dasselbe `emit()`: Der Wechsel ist für jede Seite, die
 * `useActiveLagerId` liest, nicht von einer Auswahl von Hand zu unterscheiden –
 * und soll es auch nicht sein.
 */
export function setScopeKey(next: string) {
  if (scopeKey === next) return;
  scopeKey = next;
  activeLagerId = readStored();
  emit();
}

export function getActiveLagerId(): number | null {
  return activeLagerId;
}

export function setActiveLagerId(id: number | null) {
  if (activeLagerId === id) return;
  activeLagerId = id;
  try {
    if (id == null) localStorage.removeItem(storageKey());
    else localStorage.setItem(storageKey(), String(id));
  } catch {
    // Siehe `readStored` – die Auswahl gilt dann nur für diese Sitzung.
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Das gewählte Lager, abgeglichen mit der tatsächlich vorhandenen Liste.
 *
 * Der Abgleich ist der eigentliche Zweck: Im `localStorage` kann eine ID
 * stehen, die es nicht mehr gibt – gelöscht, oder auf einem anderen Gerät
 * angelegt. Ohne Abgleich zeigte die Übersicht dauerhaft ein leeres Lager, und
 * niemand käme darauf, warum.
 *
 * Fällt in diesem Fall auf das erste Lager zurück (die Liste ist nach Namen
 * sortiert, also stabil).
 */
export function useActiveLagerId(
  available: readonly { id: number }[] | undefined
): number | null {
  const stored = useSyncExternalStore(
    subscribe,
    getActiveLagerId,
    getActiveLagerId
  );
  if (!available || available.length === 0) return null;
  if (stored != null && available.some(l => l.id === stored)) return stored;
  return available[0].id;
}
