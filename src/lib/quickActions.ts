import { useSyncExternalStore } from "react";
import type { FriendMaterial, MaterialOverview, PrintJobDetail } from "@/types";

/**
 * „palette“ = Suche und Sprünge, „weigh“ = Material zum Wiegen auswählen,
 * „consume“ = Material auswählen, von dem ein Verbrauch abgebucht wird
 */
export type PaletteMode = "palette" | "weigh" | "consume";

/** Vorbelegung des Druckformulars – etwa von der Seite eines Gebindes */
export type PrintJobPrefill = {
  productId: number;
  materialId?: number | null;
};

export type QuickActionsState = {
  formOpen: boolean;
  /**
   * Ob das Materialformular schon einmal offen war. Es lädt Rollentypen,
   * Presets und Lagerboxen und wird deshalb erst beim ersten Öffnen
   * eingehängt – danach bleibt es stehen, damit die Schließ-Animation läuft.
   */
  formMounted: boolean;
  editing: MaterialOverview | null;
  /**
   * Beim Anlegen: das Material, zu dem ein weiteres Gebinde kommt („Weitere
   * Rolle anlegen“). `null` = ein neues Material. Beim Bearbeiten ohne
   * Bedeutung – dort gilt das Material des Gebindes.
   */
  formProductId: number | null;
  weighingFor: MaterialOverview | null;
  /** Material, von dem gerade ein Verbrauch abgebucht wird (seit 2.9.0) */
  consumptionFor: MaterialOverview | null;
  /**
   * Material eines Freundes, für das eine Ausleih-Anfrage offen ist.
   *
   * Läuft über diesen Zustand und nicht über einen Dialog in der Schnellsuche:
   * Ein Dialog im Dialog wäre eine Falle – die Palette müsste erst schließen,
   * und bis dahin wäre der Auslöser mit ihr verschwunden.
   */
  loanFor: FriendMaterial | null;
  paletteOpen: boolean;
  paletteMode: PaletteMode;
  /**
   * Druckformular (seit 4.2.0). Wie das Materialformular erst beim ersten
   * Öffnen eingehängt – es lädt Gebinde, Materialien und Vorschläge.
   */
  printFormOpen: boolean;
  printFormMounted: boolean;
  /** Der bearbeitete Druck; `null` = neuer Druck */
  printEditing: PrintJobDetail | null;
  printPrefill: PrintJobPrefill | null;
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
  formProductId: null,
  weighingFor: null,
  consumptionFor: null,
  loanFor: null,
  paletteOpen: false,
  paletteMode: "palette",
  printFormOpen: false,
  printFormMounted: false,
  printEditing: null,
  printPrefill: null,
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
 * Häufige Aktionen von überall erreichbar: Material anlegen, wiegen, Verbrauch
 * abbuchen und die Schnellsuche (Strg/⌘ + K) – ohne vorher zur Übersicht zu
 * navigieren.
 */
export const quickActions = {
  /** Materialformular öffnen – ohne Argument als „neues Material“ */
  openMaterialForm(material?: MaterialOverview | null) {
    setQuickActionsState({
      formOpen: true,
      formMounted: true,
      editing: material ?? null,
      formProductId: null,
    });
  },
  /** Ein weiteres Gebinde (Rolle, Flasche …) zu einem bestehenden Material anlegen */
  openAddGebinde(productId: number) {
    setQuickActionsState({
      formOpen: true,
      formMounted: true,
      editing: null,
      formProductId: productId,
    });
  },
  /** Wägedialog für ein bestimmtes Material öffnen */
  openWeighing(material: MaterialOverview) {
    setQuickActionsState({ weighingFor: material });
  },
  /** Verbrauch für ein bestimmtes Material abbuchen */
  openConsumption(material: MaterialOverview) {
    setQuickActionsState({ consumptionFor: material });
  },
  /** Druck erfassen – optional mit einem Material oder Gebinde vorbelegt */
  openPrintJobForm(prefill?: PrintJobPrefill | null) {
    setQuickActionsState({
      printFormOpen: true,
      printFormMounted: true,
      printEditing: null,
      printPrefill: prefill ?? null,
    });
  },
  /** Einen erfassten Druck bearbeiten */
  editPrintJob(job: PrintJobDetail) {
    setQuickActionsState({
      printFormOpen: true,
      printFormMounted: true,
      printEditing: job,
      printPrefill: null,
    });
  },
  /** Ausleih-Anfrage für das Material eines Freundes öffnen */
  openLoanRequest(material: FriendMaterial) {
    setQuickActionsState({ loanFor: material });
  },
  /** Schnellsuche öffnen; im Modus „weigh“ direkt zur Materialauswahl */
  openPalette(mode: PaletteMode = "palette") {
    setQuickActionsState({ paletteOpen: true, paletteMode: mode });
  },
};

export function useQuickActions() {
  return quickActions;
}
