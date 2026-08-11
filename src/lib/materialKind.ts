import type { MaterialKind } from "@contracts/materials";
import type { Messages } from "@/messages/de";

/**
 * Beschriftungen der Materialarten.
 *
 * Hier und nicht in einer Seite oder Komponente: Gebraucht werden sie in der
 * Lager-Verwaltung, im Materialformular und in der Übersicht. Der Katalog wird
 * übergeben statt importiert, damit die Sprache nicht beim Modulladen einfriert
 * – dieselbe Regel wie bei den Navigationstabellen (siehe AGENTS.md).
 */
export function kindLabel(t: Messages, kind: MaterialKind): string {
  if (kind === "powder") return t.lager.kindPowder;
  if (kind === "resin") return t.lager.kindResin;
  return t.lager.kindFilament;
}

export function kindHint(t: Messages, kind: MaterialKind): string {
  if (kind === "powder") return t.lager.kindPowderHint;
  if (kind === "resin") return t.lager.kindResinHint;
  return t.lager.kindFilamentHint;
}
