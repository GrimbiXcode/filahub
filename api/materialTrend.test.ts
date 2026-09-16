import { describe, expect, it } from "vitest";
import { consumptionTrend } from "@contracts/materials";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-08-11T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);

/** Ein Verlaufseintrag, wie `materialHistory` ihn liefert – neueste zuerst. */
const entry = (days: number, remainingAfter: number) => ({
  at: daysAgo(days),
  remainingAfter,
});

describe("consumptionTrend", () => {
  it("braucht mindestens zwei Einträge", () => {
    expect(consumptionTrend({ history: [], now })).toBeNull();
    expect(consumptionTrend({ history: [entry(0, 364)], now })).toBeNull();
  });

  it("rechnet Gramm je Woche und Reichweite über das Fenster", () => {
    // 1.000 g vor 28 Tagen, heute 800 g: 200 g in vier Wochen
    const trend = consumptionTrend({
      history: [entry(0, 800), entry(14, 900), entry(28, 1000)],
      now,
    });
    expect(trend).not.toBeNull();
    expect(trend!.gramsPerWeek).toBeCloseTo(50, 6);
    expect(trend!.weeksLeft).toBeCloseTo(16, 6);
  });

  it("nimmt den ältesten Eintrag im Fenster als Bezug, nicht den ältesten überhaupt", () => {
    // Der Eintrag vor 200 Tagen liegt außerhalb der 90 Tage und zählt nicht.
    const trend = consumptionTrend({
      history: [entry(0, 500), entry(70, 700), entry(200, 1000)],
      now,
    });
    expect(trend!.gramsPerWeek).toBeCloseTo((200 / 70) * 7, 6);
  });

  it("greift auf den letzten Eintrag vor dem Fenster zurück, wenn im Fenster nur der jüngste liegt", () => {
    const trend = consumptionTrend({
      history: [entry(0, 500), entry(120, 1000)],
      now,
    });
    expect(trend).not.toBeNull();
    expect(trend!.gramsPerWeek).toBeCloseTo((500 / 120) * 7, 6);
    expect(trend!.weeksLeft).toBeCloseTo(500 / ((500 / 120) * 7), 6);
  });

  it("meldet kein Tempo, wenn nichts verbraucht wurde oder mehr da ist", () => {
    expect(
      consumptionTrend({ history: [entry(0, 800), entry(7, 800)], now })
    ).toEqual({ gramsPerWeek: 0, weeksLeft: null });
    expect(
      consumptionTrend({ history: [entry(0, 1000), entry(7, 400)], now })
    ).toEqual({ gramsPerWeek: 0, weeksLeft: null });
  });

  it("gibt bei zwei Einträgen am selben Tag keine Aussage ab", () => {
    expect(
      consumptionTrend({
        history: [entry(0, 700), { at: daysAgo(0.5), remainingAfter: 900 }],
        now,
      })
    ).toBeNull();
  });

  it("lässt sich mit einem anderen Fenster rechnen", () => {
    const trend = consumptionTrend({
      history: [entry(0, 500), entry(10, 600), entry(40, 900)],
      now,
      windowDays: 30,
    });
    expect(trend!.gramsPerWeek).toBeCloseTo((100 / 10) * 7, 6);
  });
});
