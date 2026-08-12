import type { OrganizationRole } from "@contracts/organizations";
import type { Messages } from "@/messages/de";

/**
 * Beschriftung und Erklärung einer Stufe.
 *
 * In der Oberfläche heißen die Stufen nach dem, was sie **dürfen** – „Ansehen“,
 * „Wiegen“, „Erfassen“, „Verwalten“ –, nicht nach ihrem technischen Namen. Wer
 * eine Rolle vergibt, soll nicht überlegen müssen, was `viewer` bedeutet.
 *
 * Die Zuordnung steht hier und nicht in `src/messages/`, weil sie ein
 * Nachschlagewerk über einem Enum ist: `Record<OrganizationRole, …>` macht eine
 * neue Stufe zum Compile-Fehler, ein loser Schlüsselzugriff nicht.
 */
const LABEL_KEYS: Record<OrganizationRole, keyof Messages["organizations"]> = {
  viewer: "roleViewer",
  weigher: "roleWeigher",
  editor: "roleEditor",
  admin: "roleAdmin",
};

const HINT_KEYS: Record<OrganizationRole, keyof Messages["organizations"]> = {
  viewer: "roleViewerHint",
  weigher: "roleWeigherHint",
  editor: "roleEditorHint",
  admin: "roleAdminHint",
};

export function roleLabel(role: OrganizationRole, t: Messages): string {
  return t.organizations[LABEL_KEYS[role]] as string;
}

export function roleHint(role: OrganizationRole, t: Messages): string {
  return t.organizations[HINT_KEYS[role]] as string;
}
