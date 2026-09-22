import type { KeyboardEvent } from "react";
import type { Messages } from "@/messages/de";

/**
 * Tastenbelegung der Erfassungsmasken, als `{...formKeys}` an den `<form>`:
 *
 * - **Cmd/Strg + Enter** speichert – aus jedem Feld, auch aus einem
 *   mehrzeiligen Textfeld.
 * - **Enter** in einem einzeiligen Feld springt zum nächsten Feld, statt das
 *   Formular abzuschicken. Wer in einem Vorschlagsfeld tippt und mit Enter
 *   bestätigt, will den Vorschlag übernehmen und weiterarbeiten – vorher legte
 *   dasselbe Enter das Material an, halb ausgefüllt. Nach dem letzten Feld
 *   landet der Fokus auf dem Speichern-Knopf; dort speichert Enter wie jeder
 *   Knopf.
 *
 * Was ein Feld selbst mit Enter macht (Vorschlag übernehmen, Liste öffnen),
 * hat Vorrang: Es ruft `preventDefault`, und hier geschieht nichts mehr.
 * Knöpfe, Auswahllisten und Textfelder behalten ihr eigenes Enter.
 *
 * Nur für Masken mit mehreren Feldern gedacht. Ein Suchfeld oder die
 * Gewichtseingabe beim Wiegen bleiben bei Enter = absenden.
 */
export const formKeys = {
  onKeyDownCapture: saveShortcut,
  onKeyDown: nextField,
};

/**
 * Cmd/Strg + Enter, in der Capture-Phase: Die Felder kommen erst danach dran.
 * Sonst schluckte etwa eine Radix-Auswahl das Enter (sie klappt damit auf und
 * ruft `preventDefault`), und das Speichern bliebe aus.
 */
function saveShortcut(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
  if (event.nativeEvent.isComposing) return;
  event.preventDefault();
  event.stopPropagation();
  const form = event.currentTarget;
  const submit = submitButton(form);
  // Ein gesperrter Knopf (Speichern läuft, Pflichtfeld fehlt) sperrt auch
  // die Tastenkombination – sonst ginge derselbe Eintrag zweimal raus.
  if (submit?.disabled) return;
  form.requestSubmit(submit ?? undefined);
}

function nextField(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== "Enter" || event.defaultPrevented) return;
  // Während einer Eingabe per IME bestätigt Enter die Zeichen, nicht das Feld
  if (event.nativeEvent.isComposing) return;
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !SINGLE_LINE.has(target.type))
    return;
  event.preventDefault();

  const form = event.currentTarget;
  const fields = Array.from(
    form.querySelectorAll<HTMLElement>(FOCUSABLE_FIELDS)
  ).filter(isReachable);
  const next = fields[fields.indexOf(target) + 1];
  if (next) {
    next.focus();
    if (next instanceof HTMLInputElement && SINGLE_LINE.has(next.type))
      next.select();
    return;
  }
  const submit = submitButton(form);
  if (submit && !submit.disabled) submit.focus();
}

function submitButton(form: HTMLFormElement) {
  return form.querySelector<HTMLButtonElement>(
    "button[type=submit], button:not([type])"
  );
}

/** Eingabearten, in denen Enter sonst das Formular abschickt */
const SINGLE_LINE = new Set([
  "text",
  "search",
  "number",
  "email",
  "tel",
  "url",
  "password",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
]);

/**
 * Wohin Enter springt: Eingabefelder und die Wähler (Radix-Auswahl und
 * Gebindewähler tragen `role="combobox"`). Kurzwahl-Knöpfe wie „250 g" oder
 * „Farbe hinterlegen" überspringt Enter – die erreicht Tab.
 */
const FOCUSABLE_FIELDS = [
  "input:not([type=hidden]):not([type=checkbox]):not([type=radio])",
  "textarea",
  "select",
  "button[role=combobox]",
].join(",");

function isReachable(element: HTMLElement) {
  return (
    !element.matches(":disabled") &&
    element.tabIndex >= 0 &&
    !element.closest("[aria-hidden=true]") &&
    element.getClientRects().length > 0
  );
}

/**
 * Tastenkürzel beschriften – auf dem Mac ⌘, sonst die Steuerungstaste. Die
 * heißt je nach Sprache anders, deshalb kommt sie aus dem Katalog statt aus
 * einer Konstante.
 */
export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

/** Beschriftung für Cmd/Strg + Enter, z. B. „⌘ ↵" */
export function submitShortcut(t: Messages): string {
  return isMac ? "⌘ ↵" : `${t.common.ctrlKey} ↵`;
}

/** Für `aria-keyshortcuts` am Speichern-Knopf */
export const SUBMIT_KEYSHORTCUTS = "Meta+Enter Control+Enter";
