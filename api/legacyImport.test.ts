/**
 * Die Wertumwandlung der Datenübernahme (api/queries/legacyImport.ts).
 *
 * Der Rest der Übernahme braucht zwei Datenbanken und steckt deshalb in
 * `api/legacyImport.integration.test.ts`. Die Umwandlung selbst ist reine
 * Logik – und der Teil, an dem eine Migration typischerweise scheitert:
 * MySQL kennt kein `boolean`, liefert `date` je nach Treiberoption anders und
 * gibt JSON mal geparst, mal als Zeichenkette zurück.
 */
import { describe, expect, it } from "vitest";
import { convertValue, mapRow, redactUrl } from "./queries/legacyImport";

describe("convertValue", () => {
  it("macht aus MySQL-tinyint(1) einen echten Boolean", () => {
    expect(convertValue(1, "boolean")).toBe(true);
    expect(convertValue(0, "boolean")).toBe(false);
    expect(convertValue("1", "boolean")).toBe(true);
    expect(convertValue("0", "boolean")).toBe(false);
    expect(convertValue(true, "boolean")).toBe(true);
  });

  it("reicht null und undefined als null durch", () => {
    for (const type of ["boolean", "number", "string", "date", "json"]) {
      expect(convertValue(null, type)).toBeNull();
      expect(convertValue(undefined, type)).toBeNull();
    }
  });

  it("wandelt Zahlen aus Zeichenketten um", () => {
    expect(convertValue("42", "number")).toBe(42);
    expect(convertValue(42, "number")).toBe(42);
    // 0 darf nicht als „leer“ verloren gehen.
    expect(convertValue(0, "number")).toBe(0);
  });

  it("nimmt JSON geparst wie als Zeichenkette entgegen", () => {
    const object = { kind: "new", nested: { a: [1, 2] } };
    expect(convertValue(object, "json")).toEqual(object);
    expect(convertValue(JSON.stringify(object), "json")).toEqual(object);
  });

  it("lässt unlesbares JSON unangetastet, statt den Lauf abzubrechen", () => {
    expect(convertValue("{kaputt", "json")).toBe("{kaputt");
  });

  it("liefert Zeitstempel als Date", () => {
    const date = new Date("2026-02-03T12:00:00.000Z");
    expect(convertValue(date, "date")).toBe(date);
    expect(convertValue("2026-02-03T12:00:00.000Z", "date")).toEqual(date);
  });

  it("formt Datumsspalten zu YYYY-MM-TT, auch wenn ein Date ankommt", () => {
    // `date(..., { mode: "string" })` hat den dataType "string". Ohne diesen
    // Sonderfall stünde dort „Tue Feb 03 2026 …“ in der Datenbank.
    expect(convertValue(new Date("2026-02-03T00:00:00.000Z"), "string")).toBe(
      "2026-02-03"
    );
    expect(convertValue("2026-02-03", "string")).toBe("2026-02-03");
  });

  it("nutzt UTC für die Datumsformatierung", () => {
    // Kurz vor Mitternacht UTC: Bei lokaler Auswertung käme je nach Zeitzone
    // der Vor- oder Folgetag heraus.
    expect(convertValue(new Date("2026-02-03T23:30:00.000Z"), "string")).toBe(
      "2026-02-03"
    );
  });
});

describe("mapRow", () => {
  const columns = {
    id: { name: "id", dataType: "number" },
    active: { name: "active", dataType: "boolean" },
    validFrom: { name: "validFrom", dataType: "string" },
    payload: { name: "payload", dataType: "json" },
    createdAt: { name: "createdAt", dataType: "date" },
  };

  it("bildet die Spalten auf die Schlüssel des Schemas ab", () => {
    const result = mapRow(
      {
        id: 7,
        active: 1,
        validFrom: "2023-01-01",
        payload: '{"a":1}',
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      columns
    );
    expect(result).toEqual({
      id: 7,
      active: true,
      validFrom: "2023-01-01",
      payload: { a: 1 },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
  });

  it("lässt Spalten weg, die die Quelle nicht kennt", () => {
    // Wichtig für ältere Installationen: die Zielspalte behält so ihren
    // Default, statt auf null gesetzt zu werden.
    const result = mapRow({ id: 1 }, columns);
    expect(result).toEqual({ id: 1 });
    expect("active" in result).toBe(false);
  });

  it("übernimmt gesetzte Nullwerte", () => {
    const result = mapRow({ id: 1, validFrom: null }, columns);
    expect(result).toEqual({ id: 1, validFrom: null });
  });

  it("ignoriert Spalten, die es nur in der Quelle gibt", () => {
    const result = mapRow({ id: 1, abgeschaffteSpalte: "x" }, columns);
    expect(result).toEqual({ id: 1 });
  });
});

describe("redactUrl", () => {
  it("entfernt Benutzer und Passwort", () => {
    expect(redactUrl("mysql://filahub:geheim@db:3306/filahub")).toBe(
      "db:3306/filahub"
    );
    expect(redactUrl("postgres://user:pw@127.0.0.1:5432/filahub")).toBe(
      "127.0.0.1:5432/filahub"
    );
  });

  it("kommt ohne Port aus", () => {
    expect(redactUrl("mysql://user:pw@db/filahub")).toBe("db/filahub");
  });

  it("verrät bei einer unlesbaren URL nichts", () => {
    expect(redactUrl("kein-url-format")).toBe("unbekannte Quelle");
  });
});
