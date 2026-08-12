import { describe, expect, it } from "vitest";
import {
  ORGANIZATION_ROLES,
  WEIGHING_CORRECTION_MINUTES,
  mayDeleteWeighing,
} from "@contracts/organizations";

/**
 * Wer welche Wägung löschen darf.
 *
 * Ein Funktionstest und kein Integrationstest, weil `mayDeleteWeighing` eine
 * reine Funktion ist – und weil **Server und Oberfläche dieselbe** aufrufen:
 * Was hier grün ist, gilt für den Riegel in `material.deleteWeighing` und für
 * die Sichtbarkeit des Knopfes in `MaterialDetail.tsx` gleichermaßen. Genau
 * dafür steht sie in `contracts/`.
 *
 * Die Zeit kommt als Parameter herein, nicht aus der Uhr: Ein Test, der auf
 * `Date.now()` beruht, prüft die Grenze entweder gar nicht oder wird beim
 * nächsten langsamen Lauf rot.
 */

const JETZT = new Date("2026-08-12T12:00:00Z");

/** Eine Wägung, die vor `minuten` Minuten erfasst wurde. */
function wägung(id: number, minuten: number) {
  return {
    id,
    createdAt: new Date(JETZT.getTime() - minuten * 60_000),
  };
}

describe("mayDeleteWeighing", () => {
  const frisch = wägung(7, 1);

  it("lässt `editor` und `admin` jede Wägung löschen", () => {
    const alt = wägung(3, 60 * 24);
    for (const role of ["editor", "admin"] as const) {
      // frisch und letzte
      expect(mayDeleteWeighing(role, frisch, frisch.id, JETZT)).toBe(true);
      // alt und **nicht** die letzte – beides egal
      expect(mayDeleteWeighing(role, alt, 7, JETZT)).toBe(true);
    }
  });

  it("verwehrt `viewer` auch die eigene frische Wägung", () => {
    expect(mayDeleteWeighing("viewer", frisch, frisch.id, JETZT)).toBe(false);
  });

  /*
    Der Korrekturfall, für den die Ausnahme überhaupt da ist: Zahl vertippt,
    sofort gemerkt. Ohne ihn wäre `weigher` in einer Werkstatt unbrauchbar.
  */
  it("lässt `weigher` die zuletzt erfasste, frische Wägung löschen", () => {
    expect(mayDeleteWeighing("weigher", frisch, frisch.id, JETZT)).toBe(true);
  });

  /*
    Die tragende Bedingung. Geschichte ist per Definition alt – damit ist das
    Abräumen eines ganzen Verlaufs für `weigher` unerreichbar, nicht bloß
    unbequem.
  */
  it("verwehrt `weigher` eine Wägung außerhalb des Fensters", () => {
    const alt = wägung(7, WEIGHING_CORRECTION_MINUTES + 1);
    expect(mayDeleteWeighing("weigher", alt, alt.id, JETZT)).toBe(false);
  });

  /*
    Allein trüge diese Bedingung nichts – wer die letzte löscht, macht die
    vorletzte zur letzten. Zusammen mit dem Zeitfenster ist sie aber der
    Unterschied zwischen „korrigieren" und „in der Aufzeichnung herumräumen".
  */
  it("verwehrt `weigher` eine frische Wägung, die nicht die letzte ist", () => {
    expect(mayDeleteWeighing("weigher", frisch, frisch.id + 1, JETZT)).toBe(
      false
    );
  });

  it("prüft die Grenze auf die Minute", () => {
    const knappDrin = wägung(7, WEIGHING_CORRECTION_MINUTES - 0.02);
    const knappDraußen = wägung(7, WEIGHING_CORRECTION_MINUTES + 0.02);
    expect(mayDeleteWeighing("weigher", knappDrin, 7, JETZT)).toBe(true);
    expect(mayDeleteWeighing("weigher", knappDraußen, 7, JETZT)).toBe(false);
  });

  /*
    Eine Wägung, die genau **jetzt** entsteht, muss löschbar sein – sonst wäre
    der Korrekturfall bei einer schnellen Uhr eine Sekunde lang verschlossen.
  */
  it("lässt die gerade eben erfasste Wägung zu", () => {
    expect(mayDeleteWeighing("weigher", wägung(7, 0), 7, JETZT)).toBe(true);
  });

  /*
    Kein `default`-Zweig, der eine neue Stufe stillschweigend durchließe: Käme
    eine fünfte dazu, muss dieser Test sie einordnen.
  */
  it("kennt jede Stufe aus ORGANIZATION_ROLES", () => {
    const erlaubt = ORGANIZATION_ROLES.filter(role =>
      mayDeleteWeighing(role, frisch, frisch.id, JETZT)
    );
    expect(erlaubt).toEqual(["weigher", "editor", "admin"]);
  });
});
