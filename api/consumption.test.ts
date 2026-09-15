import { describe, expect, it } from "vitest";
import {
  consumedSince,
  materialHistory,
  remainingAmount,
} from "@contracts/materials";

/**
 * Verbräuche: das Delta ohne Waage, seit 2.9.0.
 *
 * Drei Funktionen, eine Zusicherung: `consumedSince` zählt, `remainingAmount`
 * zieht ab, `materialHistory` erzählt es als Verlauf – und die Restmenge nach
 * dem jüngsten Verlaufseintrag muss dieselbe Zahl sein, die Übersicht und
 * Freundesansicht aus den ersten beiden rechnen. Zwei Fassungen derselben
 * Rechnung liefen beim nächsten Umbau auseinander; der letzte Block hier ist
 * die Bremse.
 */

const T = (iso: string) => new Date(iso);
const WEIGHED_AT = T("2026-03-01T12:00:00Z");

const filament = {
  materialType: "PLA",
  kind: "filament" as const,
  diameterUm: 1750,
};

describe("consumedSince", () => {
  it("zählt ohne Wägung alles", () => {
    expect(
      consumedSince(null, [
        { weight: 40, consumedAt: T("2025-01-01T00:00:00Z") },
        { weight: 60, consumedAt: T("2026-12-31T00:00:00Z") },
      ])
    ).toBe(100);
  });

  it("zählt nur, was nach der Wägung kam", () => {
    expect(
      consumedSince(WEIGHED_AT, [
        { weight: 300, consumedAt: T("2026-02-28T12:00:00Z") },
        { weight: 40, consumedAt: T("2026-03-01T12:00:01Z") },
        { weight: 60, consumedAt: T("2026-03-05T12:00:00Z") },
      ])
    ).toBe(100);
  });

  it("zählt einen zeitgleichen Verbrauch als danach", () => {
    // `>=` – dieselbe Reihenfolge wie in `materialHistory` bei Gleichstand.
    expect(
      consumedSince(WEIGHED_AT, [{ weight: 25, consumedAt: WEIGHED_AT }])
    ).toBe(25);
  });

  it("ist ohne Verbräuche 0", () => {
    expect(consumedSince(WEIGHED_AT, [])).toBe(0);
    expect(consumedSince(null, [])).toBe(0);
  });
});

describe("remainingAmount mit Verbräuchen", () => {
  it("zieht die Verbräuche seit der Wägung ab", () => {
    const result = remainingAmount({
      nominalWeight: 1000,
      containerTareWeight: 180,
      grossWeight: 1180,
      consumedSinceWeighing: 100,
      ...filament,
    });
    expect(result.remainingWeight).toBe(900);
    expect(result.remainingPercent).toBe(90);
  });

  it("rechnet ohne Wägung ab der Nennmenge", () => {
    const result = remainingAmount({
      nominalWeight: 1000,
      containerTareWeight: 180,
      grossWeight: null,
      consumedSinceWeighing: 250,
      ...filament,
    });
    expect(result.remainingWeight).toBe(750);
    expect(result.remainingPercent).toBe(75);
  });

  it("klemmt beim Überziehen auf 0, statt abzulehnen", () => {
    const result = remainingAmount({
      nominalWeight: 1000,
      containerTareWeight: 180,
      grossWeight: 230,
      consumedSinceWeighing: 80,
      ...filament,
    });
    expect(result.remainingWeight).toBe(0);
    expect(result.remainingPercent).toBe(0);
    expect(result.secondary).toEqual({ unit: "m", value: 0 });
  });

  it("rechnet ohne den Wert wie vor 2.9.0", () => {
    const before = remainingAmount({
      nominalWeight: 1000,
      containerTareWeight: 180,
      grossWeight: 1180,
      ...filament,
    });
    const after = remainingAmount({
      nominalWeight: 1000,
      containerTareWeight: 180,
      grossWeight: 1180,
      consumedSinceWeighing: 0,
      ...filament,
    });
    expect(after).toEqual(before);
    expect(after.remainingWeight).toBe(1000);
  });
});

/** Rohzeilen, wie sie `material.byId` liefert. */
function weighing(id: number, grossWeight: number, at: string, note?: string) {
  return {
    id,
    grossWeight,
    weighedAt: T(at),
    createdAt: T(at),
    note: note ?? null,
  };
}

function consumption(id: number, weight: number, at: string, note?: string) {
  return {
    id,
    weight,
    consumedAt: T(at),
    createdAt: T(at),
    note: note ?? null,
  };
}

describe("materialHistory", () => {
  it("liefert neueste zuerst mit der Restmenge nach jedem Eintrag", () => {
    const history = materialHistory({
      tareWeight: 180,
      nominalWeight: 1000,
      weighings: [weighing(1, 1180, "2026-03-01T12:00:00Z", "neu")],
      consumptions: [
        consumption(1, 100, "2026-03-02T12:00:00Z", "Halterung"),
        consumption(2, 50, "2026-03-03T12:00:00Z"),
      ],
    });
    expect(history.map(e => [e.kind, e.id, e.remainingAfter])).toEqual([
      ["consumption", 2, 850],
      ["consumption", 1, 900],
      ["weighing", 1, 1000],
    ]);
    const first = history[2];
    expect(first.kind === "weighing" && first.netWeight).toBe(1000);
    expect(first.note).toBe("neu");
  });

  it("beginnt ohne Wägung bei der Nennmenge", () => {
    const history = materialHistory({
      tareWeight: 180,
      nominalWeight: 1000,
      weighings: [],
      consumptions: [consumption(1, 250, "2026-03-02T12:00:00Z")],
    });
    expect(history).toHaveLength(1);
    expect(history[0].remainingAfter).toBe(750);
  });

  it("lässt eine Wägung die Verbräuche davor überholen", () => {
    const history = materialHistory({
      tareWeight: 180,
      nominalWeight: 1000,
      weighings: [
        weighing(1, 1180, "2026-03-01T12:00:00Z"),
        weighing(2, 1000, "2026-03-04T12:00:00Z"),
      ],
      consumptions: [consumption(1, 100, "2026-03-02T12:00:00Z")],
    });
    // Nach der zweiten Wägung gilt sie allein: 1000 − 180 = 820.
    expect(history[0]).toMatchObject({ kind: "weighing", remainingAfter: 820 });
    expect(history[1]).toMatchObject({
      kind: "consumption",
      remainingAfter: 900,
    });
  });

  it("stellt bei Gleichstand die Wägung vor den Verbrauch", () => {
    const history = materialHistory({
      tareWeight: 180,
      nominalWeight: 1000,
      weighings: [weighing(7, 1180, "2026-03-01T12:00:00Z")],
      consumptions: [consumption(3, 25, "2026-03-01T12:00:00Z")],
    });
    expect(history.map(e => e.kind)).toEqual(["consumption", "weighing"]);
    expect(history[0].remainingAfter).toBe(975);
  });

  it("klemmt jeden Schritt auf 0", () => {
    const history = materialHistory({
      tareWeight: 180,
      nominalWeight: 1000,
      weighings: [weighing(1, 230, "2026-03-01T12:00:00Z")],
      consumptions: [
        consumption(1, 80, "2026-03-02T12:00:00Z"),
        consumption(2, 10, "2026-03-03T12:00:00Z"),
      ],
    });
    expect(history.map(e => e.remainingAfter)).toEqual([0, 0, 50]);
  });

  it("ordnet nach dem Zeitpunkt, nicht nach der Kennung", () => {
    // Nachgetragene Wägung mit altem Datum: höhere id, aber früher.
    const history = materialHistory({
      tareWeight: 180,
      nominalWeight: 1000,
      weighings: [
        weighing(5, 1000, "2026-03-05T12:00:00Z"),
        weighing(9, 1180, "2026-03-01T12:00:00Z"),
      ],
      consumptions: [],
    });
    expect(history.map(e => e.id)).toEqual([5, 9]);
  });
});

/**
 * **Die Zusicherung dieser Datei.** Übersicht und Freundesansicht rechnen die
 * Restmenge aus `remainingAmount` + `consumedSince`; die Detailseite zeigt sie
 * als `remainingAfter` des jüngsten Verlaufseintrags. Beide müssen für
 * dieselben Rohdaten dieselbe Zahl liefern – sonst sieht jemand oben „900 g“
 * und im Verlauf darunter „850 g“.
 */
describe("Verlauf und Restmenge stimmen überein", () => {
  const cases: {
    name: string;
    weighings: ReturnType<typeof weighing>[];
    consumptions: ReturnType<typeof consumption>[];
  }[] = [
    { name: "nichts erfasst", weighings: [], consumptions: [] },
    {
      name: "keine Wägung, nur Verbräuche",
      weighings: [],
      consumptions: [
        consumption(1, 100, "2026-03-02T12:00:00Z"),
        consumption(2, 50, "2026-03-03T12:00:00Z"),
      ],
    },
    {
      name: "Verbräuche vor und nach der Wägung",
      weighings: [weighing(1, 1180, "2026-03-01T12:00:00Z")],
      consumptions: [
        consumption(1, 300, "2026-02-01T12:00:00Z"),
        consumption(2, 100, "2026-03-02T12:00:00Z"),
      ],
    },
    {
      name: "Gleichstand",
      weighings: [weighing(1, 1180, "2026-03-01T12:00:00Z")],
      consumptions: [consumption(1, 25, "2026-03-01T12:00:00Z")],
    },
    {
      name: "Überziehen",
      weighings: [weighing(1, 230, "2026-03-01T12:00:00Z")],
      consumptions: [
        consumption(1, 80, "2026-03-02T12:00:00Z"),
        consumption(2, 10, "2026-03-03T12:00:00Z"),
      ],
    },
    {
      name: "rückdatierte Wägung",
      weighings: [
        weighing(1, 1000, "2026-03-05T12:00:00Z"),
        weighing(2, 1180, "2026-03-01T12:00:00Z"),
      ],
      consumptions: [
        consumption(1, 100, "2026-03-02T12:00:00Z"),
        consumption(2, 40, "2026-03-06T12:00:00Z"),
      ],
    },
    {
      name: "zwei Wägungen in derselben Sekunde",
      weighings: [
        weighing(1, 1180, "2026-03-01T12:00:00Z"),
        weighing(2, 1100, "2026-03-01T12:00:00Z"),
      ],
      consumptions: [consumption(1, 40, "2026-03-01T12:00:00Z")],
    },
  ];

  it.each(cases)("$name", ({ weighings, consumptions }) => {
    // Jüngste Wägung wie in `findMaterialsInScope`: weighedAt desc, id desc.
    const latest =
      [...weighings].sort(
        (a, b) => b.weighedAt.getTime() - a.weighedAt.getTime() || b.id - a.id
      )[0] ?? null;
    const overview = remainingAmount({
      nominalWeight: 1000,
      containerTareWeight: 180,
      grossWeight: latest?.grossWeight,
      consumedSinceWeighing: consumedSince(
        latest?.weighedAt ?? null,
        consumptions
      ),
      ...filament,
    });
    const history = materialHistory({
      tareWeight: 180,
      nominalWeight: 1000,
      weighings,
      consumptions,
    });
    expect(history[0]?.remainingAfter ?? 1000).toBe(overview.remainingWeight);
  });
});
