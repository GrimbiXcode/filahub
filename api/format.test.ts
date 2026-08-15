import { describe, expect, it } from "vitest";
import {
  centsToInputString,
  currencySymbol,
  decimalSeparator,
  formatDate,
  formatGrams,
  formatMoney,
  formatPercent,
  parseDateInput,
  parseMoneyToCents,
} from "@contracts/format";

/**
 * Intl setzt je nach Locale und ICU-Version geschützte Leerzeichen
 * (U+00A0/U+202F) – für Vergleiche auf ein normales Leerzeichen bringen.
 */
const norm = (value: string) => value.replace(/\s/g, " ");

describe("parseMoneyToCents", () => {
  it("liest einfache Beträge in beiden Schreibweisen", () => {
    expect(parseMoneyToCents("24,99", "de-DE")).toBe(2499);
    expect(parseMoneyToCents("24.99", "de-DE")).toBe(2499);
    expect(parseMoneyToCents("24,99", "en-US")).toBe(2499);
    expect(parseMoneyToCents("24.99", "en-US")).toBe(2499);
    expect(parseMoneyToCents("19", "de-DE")).toBe(1900);
  });

  it("erkennt bei zwei Trennzeichen das letzte als Dezimaltrennzeichen", () => {
    expect(parseMoneyToCents("1.234,56", "de-DE")).toBe(123456);
    expect(parseMoneyToCents("1,234.56", "de-DE")).toBe(123456);
    expect(parseMoneyToCents("1.234,56", "en-US")).toBe(123456);
    expect(parseMoneyToCents("1,234.56", "en-US")).toBe(123456);
  });

  it("löst ein einzelnes Trennzeichen vor drei Ziffern über die Locale auf", () => {
    expect(parseMoneyToCents("1.234", "de-DE")).toBe(123400);
    expect(parseMoneyToCents("1,234", "de-DE")).toBe(123);
    expect(parseMoneyToCents("1.234", "en-US")).toBe(123);
    expect(parseMoneyToCents("1,234", "en-US")).toBe(123400);
  });

  it("ignoriert Währungszeichen und Leerzeichen", () => {
    expect(parseMoneyToCents("€ 24,99", "de-DE")).toBe(2499);
    expect(parseMoneyToCents("24,99 €", "de-DE")).toBe(2499);
    expect(parseMoneyToCents("CHF 24.99", "de-CH")).toBe(2499);
    expect(parseMoneyToCents("$1,299.00", "en-US")).toBe(129900);
  });

  it("liefert null bei leer, unlesbar oder negativ", () => {
    expect(parseMoneyToCents("", "de-DE")).toBeNull();
    expect(parseMoneyToCents("   ", "de-DE")).toBeNull();
    expect(parseMoneyToCents("keine Angabe", "de-DE")).toBeNull();
    expect(parseMoneyToCents("-5", "de-DE")).toBeNull();
  });

  it("kommt mit mehreren Tausendertrennzeichen zurecht", () => {
    expect(parseMoneyToCents("1.234.567,89", "de-DE")).toBe(123456789);
    expect(parseMoneyToCents("1,234,567.89", "en-US")).toBe(123456789);
  });
});

describe("centsToInputString", () => {
  it("nutzt das Dezimaltrennzeichen der Locale, aber keine Gruppierung", () => {
    expect(centsToInputString(2499, "de-DE")).toBe("24,99");
    expect(centsToInputString(2499, "en-US")).toBe("24.99");
    expect(centsToInputString(123456, "de-DE")).toBe("1234,56");
    expect(centsToInputString(null, "de-DE")).toBe("");
  });

  it("ist mit parseMoneyToCents rundlaufsicher", () => {
    for (const locale of ["de-DE", "en-US", "de-CH", "fr-FR"]) {
      for (const cents of [0, 5, 999, 2499, 123456]) {
        expect(
          parseMoneyToCents(centsToInputString(cents, locale), locale)
        ).toBe(cents);
      }
    }
  });
});

describe("formatGrams", () => {
  it("gruppiert nach Locale", () => {
    expect(norm(formatGrams(1000, "de-DE"))).toBe("1.000 g");
    expect(norm(formatGrams(1000, "en-US"))).toBe("1,000 g");
    expect(norm(formatGrams(750, "de-DE"))).toBe("750 g");
  });

  it("zeigt einen Strich, wenn nichts bekannt ist", () => {
    expect(formatGrams(null, "de-DE")).toBe("–");
    expect(formatGrams(Number.NaN, "de-DE")).toBe("–");
  });
});

describe("formatPercent", () => {
  it("rechnet von 0–100 auf die Locale-Schreibweise um", () => {
    expect(norm(formatPercent(83, "de-DE"))).toBe("83 %");
    expect(norm(formatPercent(83, "en-US"))).toBe("83%");
    expect(formatPercent(null, "de-DE")).toBe("–");
  });
});

describe("formatMoney", () => {
  it("berücksichtigt Locale und Währung", () => {
    expect(norm(formatMoney(2499, "de-DE", "EUR"))).toBe("24,99 €");
    expect(norm(formatMoney(2499, "en-US", "USD"))).toBe("$24.99");
    expect(formatMoney(null, "de-DE", "EUR")).toBe("–");
  });

  it("wechselt nur die Beschriftung, nicht den Betrag", () => {
    // Die Locale bestimmt das Zahlenformat, die Währung nur das Symbol.
    expect(norm(formatMoney(2499, "de-DE", "EUR"))).toBe("24,99 €");
    expect(norm(formatMoney(2499, "de-DE", "CHF"))).toBe("24,99 CHF");
    expect(norm(formatMoney(2499, "en-US", "EUR"))).toBe("€24.99");
  });
});

describe("formatDate", () => {
  it("dreht die Reihenfolge je nach Locale", () => {
    expect(formatDate("2026-07-20", "de-DE")).toBe("20.07.2026");
    expect(formatDate("2026-07-20", "en-US")).toBe("07/20/2026");
    expect(formatDate(null, "de-DE")).toBe("–");
    expect(formatDate("kein Datum", "de-DE")).toBe("–");
  });
});

describe("parseDateInput", () => {
  it("liest die ISO-Form, mit und ohne Uhrzeit", () => {
    expect(parseDateInput("2026-08-12", "de-DE")).toBe("2026-08-12");
    expect(parseDateInput("2026-8-2", "de-DE")).toBe("2026-08-02");
    expect(parseDateInput("2026-08-12T10:30:00Z", "de-DE")).toBe("2026-08-12");
    expect(parseDateInput("  2026-08-12  ", "en-US")).toBe("2026-08-12");
  });

  it("liest die Schreibweise der Locale", () => {
    expect(parseDateInput("12.08.2026", "de-DE")).toBe("2026-08-12");
    expect(parseDateInput("12/08/2026", "de-CH")).toBe("2026-08-12");
    expect(parseDateInput("08/12/2026", "en-US")).toBe("2026-08-12");
    expect(parseDateInput("12 08 2026", "de-DE")).toBe("2026-08-12");
  });

  it("nimmt eine Zahl über zwölf als Tag, egal was die Locale sagt", () => {
    expect(parseDateInput("20.07.2026", "en-US")).toBe("2026-07-20");
    expect(parseDateInput("07/20/2026", "de-DE")).toBe("2026-07-20");
    // Auch wenn dann beide Zahlen zur Locale quer stehen: 13 kann nur der
    // Tag sein, also ist die andere der Monat.
    expect(parseDateInput("12.13.2026", "de-DE")).toBe("2026-12-13");
  });

  it("ergänzt zweistellige Jahre und findet das Datum im Satz", () => {
    expect(parseDateInput("1.9.26", "de-DE")).toBe("2026-09-01");
    expect(parseDateInput("bestellt am 03.11.2025", "de-DE")).toBe(
      "2025-11-03"
    );
  });

  it("weist zurück, was kein Datum ist", () => {
    expect(parseDateInput("", "de-DE")).toBeNull();
    expect(parseDateInput("keine Ahnung", "de-DE")).toBeNull();
    expect(parseDateInput("12.2026", "de-DE")).toBeNull();
    expect(parseDateInput("31.02.2026", "de-DE")).toBeNull();
    expect(parseDateInput("32.01.2026", "de-DE")).toBeNull();
    expect(parseDateInput("13.13.2026", "de-DE")).toBeNull();
    expect(parseDateInput("12.08.202", "de-DE")).toBeNull();
    expect(parseDateInput("1899-01-01", "de-DE")).toBeNull();
  });

  it("liest, was formatDate geschrieben hat – in beiden Locales", () => {
    for (const locale of ["de-DE", "de-CH", "en-US", "en-GB"]) {
      for (const iso of ["2026-01-31", "2026-07-04", "2025-12-24"]) {
        expect(parseDateInput(formatDate(iso, locale), locale)).toBe(iso);
      }
    }
  });
});

describe("decimalSeparator / currencySymbol", () => {
  it("liefert die Zeichen der Locale", () => {
    expect(decimalSeparator("de-DE")).toBe(",");
    expect(decimalSeparator("en-US")).toBe(".");
    expect(currencySymbol("de-DE", "EUR")).toBe("€");
    expect(currencySymbol("en-US", "USD")).toBe("$");
  });
});
