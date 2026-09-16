import type { ConsumptionTrend } from "@contracts/materials";
import type { Messages } from "@/messages/de";

/** Ab hier ist eine Wochenzahl keine Auskunft mehr, sondern eine Zumutung. */
const LONG_REACH_WEEKS = 104;

/**
 * Die Tendenz als Satz: „Tendenz −25 g / Woche · reicht so noch ≈ 15 Wochen“.
 *
 * Eine Stelle für beide Orte (Detailseite und das Panel neben dem Regal),
 * damit die Grenzfälle nicht auseinanderlaufen: zu wenige Einträge, kein
 * Verbrauch, und eine Reichweite jenseits von zwei Jahren, die als Zahl nur
 * nach Rechenfehler aussähe.
 */
export function describeTrend(
  trend: ConsumptionTrend | null,
  t: Messages,
  formatGrams: (grams: number) => string
): string {
  if (trend == null) return t.materialDetail.trendNone;
  if (trend.weeksLeft == null) return t.materialDetail.trendFlat;
  const rate = t.materialDetail.trendPerWeek({
    amount: formatGrams(Math.round(trend.gramsPerWeek)),
  });
  const reach =
    trend.weeksLeft > LONG_REACH_WEEKS
      ? t.materialDetail.trendLong
      : t.materialDetail.trendReach({
          weeks: Math.max(1, Math.round(trend.weeksLeft)),
        });
  return `${rate} · ${reach}`;
}
