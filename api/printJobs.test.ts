import { describe, expect, it } from "vitest";
import { mayDeleteWeighing } from "@contracts/organizations";
import {
  decodePrintJobCursor,
  encodePrintJobCursor,
  isHttpsUrl,
  linkHost,
  mayDeletePrintJob,
  normalizeTags,
  parseTagInput,
  printJobLinkSchema,
} from "@contracts/printJobs";

/** Druckhistorie (seit 4.2.0) – die reinen Regeln aus `contracts/printJobs.ts`. */
describe("Tags", () => {
  it("klein, getrimmt, ohne # und ohne Dubletten", () => {
    expect(
      normalizeTags([" Vase ", "vase", "#Geschenk", "  ", "Deko  Tisch"])
    ).toEqual(["vase", "geschenk", "deko tisch"]);
  });

  it("zerlegt die Eingabe an Komma, Semikolon, # und Zeilenumbruch", () => {
    expect(parseTagInput("Vase, Deko;#Geschenk\nPETG")).toEqual([
      "vase",
      "deko",
      "geschenk",
      "petg",
    ]);
  });
});

describe("Links", () => {
  it("nimmt nur https", () => {
    expect(isHttpsUrl("https://www.printables.com/model/1")).toBe(true);
    expect(isHttpsUrl("http://example.org")).toBe(false);
    expect(isHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpsUrl("printables.com/model/1")).toBe(false);
    expect(() =>
      printJobLinkSchema.parse({ url: "javascript:alert(1)" })
    ).toThrow();
  });

  it("zeigt den Host ohne www", () => {
    expect(linkHost("https://www.printables.com/model/1-vase")).toBe(
      "printables.com"
    );
    expect(linkHost("https://makerworld.com/de/models/2")).toBe(
      "makerworld.com"
    );
  });
});

describe("Cursor", () => {
  it("übersteht den Hin- und Rückweg", () => {
    const entry = { printedAt: new Date("2026-09-01T10:00:00.123Z"), id: 42 };
    expect(decodePrintJobCursor(encodePrintJobCursor(entry))).toEqual(entry);
  });

  it("macht aus Unsinn null statt eines Fehlers", () => {
    expect(decodePrintJobCursor("kaputt")).toBeNull();
    expect(decodePrintJobCursor(null)).toBeNull();
    expect(decodePrintJobCursor("2026-01-01T00:00:00Z|x")).toBeNull();
  });
});

describe("mayDeletePrintJob", () => {
  it("ist dieselbe Regel wie beim Wiegen – ein Alias, keine Kopie", () => {
    expect(mayDeletePrintJob).toBe(mayDeleteWeighing);
  });
});
