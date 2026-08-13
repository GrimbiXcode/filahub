import {
  type MaterialColumn,
  normalizeHiddenColumns,
} from "@contracts/materialColumns";
import { trpc } from "@/lib/trpc";
import type { TextKey } from "@/lib/i18nContext";

/**
 * Beschriftung je Spalte der Materialübersicht – als **Schlüssel**, nicht als
 * fertiger Text: Eine modulweite Tabelle mit aufgelösten Texten fröre die
 * Sprache beim Modulladen ein (siehe `AGENTS.md`, Abschnitt „Sprachen“).
 *
 * Der `Record`-Typ erzwingt Vollständigkeit: Wer `MATERIAL_COLUMNS` erweitert,
 * bekommt hier einen Typfehler statt einer namenlosen Zeile im Auswahlmenü.
 */
export const MATERIAL_COLUMN_LABELS: Record<MaterialColumn, TextKey<"home">> = {
  identifier: "colIdentifier",
  name: "colMaterial",
  type: "colType",
  manufacturer: "colManufacturer",
  remaining: "colRemaining",
  containerBox: "colContainerBox",
  price: "colPrice",
  purchase: "colPurchase",
  actions: "colActions",
};

/**
 * Die ausgeblendeten Spalten des angemeldeten Benutzers.
 *
 * Gleicher Query-Key und gleiche Optionen wie in `useAuth`, deshalb kein
 * zusätzlicher Request – dasselbe Vorgehen, mit dem der `I18nProvider` an
 * `users.language` kommt.
 *
 * Durch `normalizeHiddenColumns` gereicht, weil der gespeicherte Stand aus
 * einer anderen Fassung der App stammen kann: unbekannte Kennungen und
 * gesperrte Spalten fliegen raus, statt die Tabelle schiefzuziehen.
 */
export function useHiddenMaterialColumns(): MaterialColumn[] {
  const { data: user } = trpc.auth.me.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
  return normalizeHiddenColumns(user?.hiddenMaterialColumns);
}
