import { useSyncExternalStore } from "react";
import type { OrganizationRole } from "@contracts/organizations";
import { trpc } from "@/lib/trpc";
import { setScopeKey } from "@/lib/activeLager";

/**
 * Der gerade gewählte Bereich: der eigene Bestand oder der einer Organisation.
 *
 * Bewusst außerhalb des React-Baums, wie `activeLager` und `quickActions`: Die
 * Auswahl steht in der Seitenleiste (`AuthLayout`), gelesen wird sie in den
 * Seiten – und die rendern das Layout selbst, liegen im Baum also *über* ihm.
 * Ein Context wäre von dort nicht erreichbar.
 *
 * **Neu geholt wird von selbst.** `organizationId` ist Teil des Query-Keys jeder
 * bereichsbezogenen Prozedur; ein Wechsel lädt alles Betroffene nach, ganz ohne
 * `invalidate`. Genau dafür ist das Feld serverseitig Pflicht und nicht
 * optional.
 */

const STORAGE_KEY = "active-scope";

/** `null` = persönlicher Bereich. */
function parse(raw: string | null): number | null {
  if (!raw || raw === "personal") return null;
  const parsed = Number.parseInt(raw.replace(/^org:/, ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function readStored(): number | null {
  try {
    return parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Privates Fenster ohne Speicherzugriff – dann eben pro Sitzung.
    return null;
  }
}

let activeOrganizationId: number | null = readStored();

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(listener => listener());
}

export function getActiveOrganizationId(): number | null {
  return activeOrganizationId;
}

export function setActiveOrganizationId(id: number | null) {
  if (activeOrganizationId === id) return;
  activeOrganizationId = id;
  try {
    if (id == null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, `org:${id}`);
  } catch {
    // Siehe `readStored` – die Auswahl gilt dann nur für diese Sitzung.
  }
  /*
    Das gewählte Lager hängt am Bereich: In der Organisation gibt es andere
    Lager als privat. Ohne diesen Schritt zeigte der Lager-Umschalter nach dem
    Wechsel auf ein Lager der anderen Seite – bis der Abgleich in
    `useActiveLagerId` es bemerkt und stillschweigend auf das erste umbiegt.
  */
  setScopeKey(id == null ? "personal" : `org:${id}`);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): number | null {
  return activeOrganizationId;
}

/**
 * Der aktive Bereich als Eingabe für jede bereichsbezogene Prozedur.
 *
 * Abgeglichen mit den tatsächlichen Mitgliedschaften – das ist der eigentliche
 * Zweck, genau wie bei `useActiveLagerId`: Im `localStorage` kann eine
 * Organisation stehen, in der man nicht mehr Mitglied ist (entfernt worden,
 * ausgetreten, oder die Organisation ist weg). Ohne den Abgleich liefe jede
 * Abfrage in ein `NOT_FOUND`, die Oberfläche zeigte dauerhaft eine Fehlermeldung,
 * und niemand käme darauf, warum.
 *
 * Solange die Liste noch lädt, gilt der persönliche Bereich. Das ist die sichere
 * Richtung: Ein kurzer Blick auf den eigenen Bestand ist harmlos, ein kurzer
 * Blick auf einen fremden wäre es nicht.
 */
export function useActiveScope(): { organizationId: number | null } {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const { data: memberships } = trpc.organization.list.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
  });
  if (stored == null) return { organizationId: null };
  if (!memberships) return { organizationId: null };
  const known = memberships.some(m => m.organizationId === stored);
  return { organizationId: known ? stored : null };
}

/**
 * Die eigene Stufe im aktiven Bereich – Grundlage dafür, welche Knöpfe die
 * Oberfläche zeigt.
 *
 * Im persönlichen Bereich `admin`: Im eigenen Bestand darf man alles, und eine
 * Sonderbehandlung an jeder Aufrufstelle wäre die schlechtere Antwort als ein
 * Wert, der einfach stimmt.
 *
 * **Während die Liste lädt `viewer`**, und das ist Absicht: Ein Knopf, der kurz
 * fehlt und dann erscheint, ist besser als einer, der kurz da ist und beim
 * Klicken `FORBIDDEN` liefert.
 *
 * Die Oberfläche ist damit Bequemlichkeit, keine Sperre – entschieden wird in
 * `resolveScope` (`api/scope.ts`). Dasselbe merkt `AdminLayout.tsx` für die
 * Administration an.
 */
export function useScopeRole(): OrganizationRole {
  const { organizationId } = useActiveScope();
  const { data: memberships } = trpc.organization.list.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
  });
  if (organizationId == null) return "admin";
  return (
    memberships?.find(m => m.organizationId === organizationId)?.role ??
    "viewer"
  );
}
