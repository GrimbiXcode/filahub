import { describe, expect, it } from "vitest";
import {
  ABUSE_ALERT_THRESHOLDS,
  BLOCK_REASONS,
  evaluateAlerts,
  exceedsLimit,
  MAX_MATERIALS_PER_LAGER,
  type AbuseCounts,
} from "@contracts/limits";

/**
 * Die Entscheidungen der Missbrauchsabwehr, ohne Datenbank.
 *
 * Beide Funktionen sind kurz genug, dass man sie für offensichtlich halten
 * könnte – und genau deshalb geprüft: Ein `>=` statt `>` verschiebt jede
 * Obergrenze im Projekt um eins, und wann eine Instanz ihren Betreiber weckt,
 * ist zu wichtig, um es nur im Betrieb zu beobachten.
 */

describe("exceedsLimit", () => {
  it("lässt bis genau zur Grenze durch", () => {
    // Der Fall, auf den es ankommt: Bei 999 vorhandenen darf das 1000. hinein.
    expect(
      exceedsLimit(MAX_MATERIALS_PER_LAGER - 1, MAX_MATERIALS_PER_LAGER)
    ).toBe(false);
  });

  it("weist ab, sobald die Grenze überschritten würde", () => {
    expect(exceedsLimit(MAX_MATERIALS_PER_LAGER, MAX_MATERIALS_PER_LAGER)).toBe(
      true
    );
  });

  it("rechnet den ganzen Stapel mit", () => {
    // Der Massenimport legt bis zu 200 auf einmal an.
    expect(exceedsLimit(0, 100, 100)).toBe(false);
    expect(exceedsLimit(0, 100, 101)).toBe(true);
    expect(exceedsLimit(50, 100, 51)).toBe(true);
  });

  it("kommt mit einer bereits überschrittenen Grenze zurecht", () => {
    /*
      Möglich, weil keine dieser Grenzen die Datenbank garantiert: Zwei
      gleichzeitige Anfragen können jede um eins überschreiten. Danach muss
      weiter abgewiesen und nicht etwa wieder geöffnet werden.
    */
    expect(exceedsLimit(150, 100)).toBe(true);
  });
});

const quiet: AbuseCounts = {
  rateLimited: 0,
  quotaExceeded: 0,
  registrationBlocked: 0,
  pendingUnblockRequests: 0,
};

describe("evaluateAlerts", () => {
  it("schweigt, solange nichts auffällt", () => {
    expect(evaluateAlerts(quiet)).toEqual([]);
  });

  it("schweigt einen Zähler unter der Schwelle", () => {
    const counts = {
      ...quiet,
      rateLimited: ABUSE_ALERT_THRESHOLDS.rateLimited.threshold - 1,
    };
    expect(evaluateAlerts(counts)).toEqual([]);
  });

  it("meldet genau auf der Schwelle", () => {
    // Die Schwelle ist erreicht, nicht erst überschritten – sonst wäre der
    // dokumentierte Wert um eins zu hoch.
    const counts = {
      ...quiet,
      rateLimited: ABUSE_ALERT_THRESHOLDS.rateLimited.threshold,
    };
    const alerts = evaluateAlerts(counts);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].key).toBe("rateLimited");
    expect(alerts[0].threshold).toBe(
      ABUSE_ALERT_THRESHOLDS.rateLimited.threshold
    );
  });

  it("meldet mehrere Schwellen in der Reihenfolge der Tabelle", () => {
    const counts: AbuseCounts = {
      rateLimited: 1000,
      quotaExceeded: 1000,
      registrationBlocked: 1000,
      pendingUnblockRequests: 1000,
    };
    expect(evaluateAlerts(counts).map(a => a.key)).toEqual(
      Object.keys(ABUSE_ALERT_THRESHOLDS)
    );
  });

  it("gibt Zählstand und Fenster mit, damit die Meldung ohne Nachschlagen lesbar ist", () => {
    const counts = { ...quiet, pendingUnblockRequests: 42 };
    const [alert] = evaluateAlerts(counts);
    expect(alert.count).toBe(42);
    expect(alert.window).toBe(
      ABUSE_ALERT_THRESHOLDS.pendingUnblockRequests.window
    );
  });
});

describe("Sperrgründe", () => {
  /*
    Die Liste steht in vier Katalogen: hier, in `contracts/notifications.ts`
    (Telegram, zweisprachig) und in `src/messages/de.ts`/`en.ts` (Oberfläche).
    Die drei anderen sind über ihre Typen an diese gebunden; dieser Test hält
    fest, dass der Schlüssel selbst stabil bleibt – er steht als Text in der
    Datenbank (`users.blockedReason`) und überlebt dort jede Umbenennung im
    Code.
  */
  it("bleibt bei den Schlüsseln, die in der Datenbank stehen", () => {
    expect([...BLOCK_REASONS]).toEqual([
      "abuse",
      "spam",
      "terms",
      "automated",
      "other",
    ]);
  });
});
