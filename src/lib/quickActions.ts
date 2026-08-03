import { useSyncExternalStore } from "react";
import type { MaterialOverview } from "@/types";

/** „palette“ = Suche und Sprünge, „weigh“ = Material zum Wiegen auswählen */
export type PaletteMode = "palette" | "weigh";

export type QuickActionsState = {
  formOpen: boolean;
  /**
   * Ob das Materialformular schon einmal offen war. Es lädt Rollentypen,
   * Presets und Lagerboxen und wird deshalb erst beim ersten Öffnen
   * eingehängt – danach bleibt es stehen, damit die Schließ-Animation läuft.
   */
  formMounted: boolean;
  editing: MaterialOverview | null;
  weighingFor: MaterialOverview | null;
  paletteOpen: boolean;
  paletteMode: PaletteMode;
};

/**
 * Zustand der Schnellaktionen bewusst außerhalb des React-Baums.
 *
 * Die Dialoge hängen am Layout (`QuickActionsHost` in `AuthLayout`), die
 * Auslöser stehen aber in den Seiten – und die rendern das Layout selbst,
 * liegen im Baum also *über* ihm. Ein Context wäre von dort nicht erreichbar.
 */
let state: QuickActionsState = {
  formOpen: false,
  formMounted: false,
  editing: null,
  weighingFor: null,
  paletteOpen: false,
  paletteMode: "palette",
};

const listeners = new Set<() => void>();

export function setQuickActionsState(patch: Partial<QuickActionsState>) {
  state = { ...state, ...patch };
  listeners.forEach(listener => listener());
}

export function getQuickActionsState() {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Aktueller Zustand für den Host, der die Dialoge rendert. */
export function useQuickActionsState() {
  return useSyncExternalStore(
    subscribe,
    getQuickActionsState,
    getQuickActionsState
  );
}

/**
 * Häufige Aktionen von überall erreichbar: Material anlegen, wiegen und die
 * Schnellsuche (Strg/⌘ + K) – ohne vorher zur Übersicht zu navigieren.
 */
export const quickActions = {
  /** Materialformular öffnen – ohne Argument als „neues Material“ */
  openMaterialForm(material?: MaterialOverview | null) {
    setQuickActionsState({
      formOpen: true,
      formMounted: true,
      editing: material ?? null,
    });
  },
  /** Wägedialog für ein bestimmtes Material öffnen */
  openWeighing(material: MaterialOverview) {
    setQuickActionsState({ weighingFor: material });
  },
  /** Schnellsuche öffnen; im Modus „weigh“ direkt zur Materialauswahl */
  openPalette(mode: PaletteMode = "palette") {
    setQuickActionsState({ paletteOpen: true, paletteMode: mode });
  },
};

export function useQuickActions() {
  return quickActions;
}
