import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  RELEASE_NOTES_NON_NOTE_FILES,
  compareVersions,
  newestVersion,
  normalizeImagePath,
  parseReleaseNote,
  releaseVersionSchema,
  sortReleaseNotes,
  splitFrontmatter,
  unreadReleaseNotes,
  versionFromFilename,
} from "@contracts/releaseNotes";

/** Kürzel für die Tests der reinen Logik */
function note(version: string, title = "Titel") {
  return { version, title, date: "2026-01-01", body: "Inhalt" };
}

const VALID = `---
date: 2026-08-03
title: Dark theme
---

## Dark theme

Text.
`;

describe("releaseVersionSchema", () => {
  it("nimmt X.Y.Z an", () => {
    expect(releaseVersionSchema.safeParse("0.7.0").success).toBe(true);
    expect(releaseVersionSchema.safeParse("10.20.30").success).toBe(true);
  });

  it("lehnt Vorabversionen, Build-Metadaten und führende Nullen ab", () => {
    for (const value of [
      "1.0.0-rc.1",
      "1.0.0+build",
      "01.7.0",
      "1.7",
      "v1.7.0",
      "",
    ]) {
      expect(releaseVersionSchema.safeParse(value).success, value).toBe(false);
    }
  });
});

describe("versionFromFilename", () => {
  it("liest die Version aus dem Dateinamen – auch mit Pfad davor", () => {
    expect(versionFromFilename("../release-notes/release_v0.7.0.md")).toBe(
      "0.7.0"
    );
    expect(versionFromFilename("release_v10.2.30.md")).toBe("10.2.30");
  });

  it("wirft bei abweichenden Namen", () => {
    for (const name of [
      "release_v0.7.md",
      "release_v0.7.0.markdown",
      "changelog.md",
      "AGENTS.md",
      "release_v1.2.3-beta.md",
      "release_v01.2.3.md",
    ]) {
      expect(() => versionFromFilename(name), name).toThrow(
        /release_vX\.Y\.Z\.md/
      );
    }
  });
});

describe("splitFrontmatter", () => {
  it("trennt Frontmatter und Inhalt", () => {
    const { frontmatter, body } = splitFrontmatter(VALID);
    expect(frontmatter).toEqual({ date: "2026-08-03", title: "Dark theme" });
    expect(body).toBe("## Dark theme\n\nText.");
  });

  it("kommt mit CRLF und BOM klar", () => {
    const raw = "﻿" + VALID.replace(/\n/g, "\r\n");
    expect(splitFrontmatter(raw).frontmatter.title).toBe("Dark theme");
  });

  it("trennt nur am ersten Doppelpunkt", () => {
    const raw =
      "---\ndate: 2026-08-03\ntitle: New: now with images\n---\n\nText.\n";
    expect(splitFrontmatter(raw).frontmatter.title).toBe(
      "New: now with images"
    );
  });

  it("hält eine Trennlinie im Text nicht für das Ende des Frontmatters", () => {
    const raw =
      "---\ndate: 2026-08-03\ntitle: T\n---\n\nOben\n\n---\n\nUnten\n";
    const { frontmatter, body } = splitFrontmatter(raw);
    expect(frontmatter).toEqual({ date: "2026-08-03", title: "T" });
    expect(body).toBe("Oben\n\n---\n\nUnten");
  });

  it("wirft ohne Frontmatter und bei fehlendem Abschluss", () => {
    expect(() => splitFrontmatter("## Ohne Kopf\n")).toThrow(
      /Frontmatter fehlt/
    );
    expect(() => splitFrontmatter("---\ndate: 2026-08-03\n")).toThrow(
      /nicht mit '---' abgeschlossen/
    );
  });
});

describe("parseReleaseNote", () => {
  it("liefert Version, Frontmatter und Inhalt", () => {
    const parsed = parseReleaseNote("release_v0.7.0.md", VALID);
    expect(parsed).toEqual({
      version: "0.7.0",
      date: "2026-08-03",
      title: "Dark theme",
      body: "## Dark theme\n\nText.",
    });
  });

  it("nennt den Dateinamen in der Fehlermeldung", () => {
    const raw = "---\ndate: 2026-08-03\n---\n\nText.\n";
    expect(() => parseReleaseNote("release_v0.7.0.md", raw)).toThrow(
      /release_v0\.7\.0\.md/
    );
  });

  it("wirft bei fehlendem oder falsch formatiertem Frontmatter", () => {
    const missingTitle = "---\ndate: 2026-08-03\n---\n\nText.\n";
    const badDate = "---\ndate: 03.08.2026\ntitle: T\n---\n\nText.\n";
    const emptyBody = "---\ndate: 2026-08-03\ntitle: T\n---\n";
    expect(() => parseReleaseNote("release_v0.7.0.md", missingTitle)).toThrow();
    expect(() => parseReleaseNote("release_v0.7.0.md", badDate)).toThrow(
      /YYYY-MM-DD/
    );
    expect(() => parseReleaseNote("release_v0.7.0.md", emptyBody)).toThrow(
      /leer/
    );
  });

  it("wirft bei unbekannten Schlüsseln – fängt Tippfehler ab", () => {
    const typo = "---\ndate: 2026-08-03\ntitel: T\ntitle: T\n---\n\nText.\n";
    const withVersion =
      "---\ndate: 2026-08-03\ntitle: T\nversion: 9.9.9\n---\n\nText.\n";
    expect(() => parseReleaseNote("release_v0.7.0.md", typo)).toThrow();
    expect(() => parseReleaseNote("release_v0.7.0.md", withVersion)).toThrow();
  });
});

describe("compareVersions", () => {
  it("vergleicht segmentweise numerisch, nicht alphabetisch", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.10", "1.0.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "0.99.99")).toBeGreaterThan(0);
    expect(compareVersions("0.6.1", "0.7.0")).toBeLessThan(0);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("behandelt unlesbare Werte als älter als alles", () => {
    expect(compareVersions("kaputt", "0.0.1")).toBeLessThan(0);
    expect(compareVersions("0.0.1", "kaputt")).toBeGreaterThan(0);
    expect(compareVersions("kaputt", "auch kaputt")).toBe(0);
  });
});

describe("sortReleaseNotes / newestVersion", () => {
  it("sortiert neueste zuerst", () => {
    const sorted = sortReleaseNotes([
      note("0.6.1"),
      note("0.10.0"),
      note("0.9.0"),
    ]);
    expect(sorted.map(n => n.version)).toEqual(["0.10.0", "0.9.0", "0.6.1"]);
  });

  it("verändert die Eingabe nicht", () => {
    const input = [note("0.6.1"), note("0.7.0")];
    sortReleaseNotes(input);
    expect(input.map(n => n.version)).toEqual(["0.6.1", "0.7.0"]);
  });

  it("liefert die neueste Version, bei leerer Liste null", () => {
    expect(newestVersion([note("0.6.1"), note("0.7.0")])).toBe("0.7.0");
    expect(newestVersion([])).toBeNull();
  });
});

describe("unreadReleaseNotes", () => {
  const notes = [note("0.5.0"), note("0.6.0"), note("0.7.0")];

  it("zeigt ohne gespeicherten Stand alles als ungelesen", () => {
    expect(unreadReleaseNotes(notes, null).map(n => n.version)).toEqual([
      "0.7.0",
      "0.6.0",
      "0.5.0",
    ]);
    expect(unreadReleaseNotes(notes, undefined)).toHaveLength(3);
  });

  it("zeigt nur Neueres als den gespeicherten Stand", () => {
    expect(unreadReleaseNotes(notes, "0.5.0").map(n => n.version)).toEqual([
      "0.7.0",
      "0.6.0",
    ]);
    expect(unreadReleaseNotes(notes, "0.7.0")).toHaveLength(0);
  });

  it("kommt mit einem neueren Stand als allen Einträgen klar (Rollback)", () => {
    expect(unreadReleaseNotes(notes, "9.9.9")).toHaveLength(0);
  });

  it("behandelt einen unlesbaren Stand wie 'nichts gelesen'", () => {
    expect(unreadReleaseNotes(notes, "kaputt")).toHaveLength(3);
  });

  it("liefert für eine leere Liste eine leere Liste", () => {
    expect(unreadReleaseNotes([], null)).toEqual([]);
  });
});

describe("normalizeImagePath", () => {
  it("bringt lokale Schreibweisen auf eine Form", () => {
    for (const src of ["images/a.png", "./images/a.png", "/images/a.png"]) {
      expect(normalizeImagePath(src), src).toBe("images/a.png");
    }
    expect(normalizeImagePath("images/a.png?v=2")).toBe("images/a.png");
    expect(normalizeImagePath("images/mit%20leer.png")).toBe(
      "images/mit leer.png"
    );
  });

  it("lässt externe und ausbrechende Pfade in Ruhe", () => {
    for (const src of [
      "https://example.org/a.png",
      "//example.org/a.png",
      "data:image/png;base64,AAA",
      "../../secret.png",
      "",
    ]) {
      expect(normalizeImagePath(src), src).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Prüfungen gegen die echten Dateien in src/release-notes/
//
// Ein `vite build` führt die Module nicht aus – eine kaputte Release Note
// fiele sonst erst im Browser auf. Diese Tests laufen in der CI bei jedem Push
// und sind damit die eigentliche Absicherung (Vorbild: presetCatalog.test.ts).
// ---------------------------------------------------------------------------

const NOTES_DIR = path.resolve(import.meta.dirname, "../src/release-notes");
const IMAGES_DIR = path.join(NOTES_DIR, "images");

const noteFiles = readdirSync(NOTES_DIR)
  .filter(name => name.endsWith(".md"))
  .filter(name => !RELEASE_NOTES_NON_NOTE_FILES.includes(name))
  .sort();

/** `images/` darf fehlen, solange keine Release Note ein Bild einbindet. */
const imageFiles = existsSync(IMAGES_DIR) ? readdirSync(IMAGES_DIR) : [];

/** Alle Bildreferenzen `![alt](pfad)` einer Release Note */
function imageRefs(body: string) {
  return [...body.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map(
    match => ({ alt: match[1], src: match[2] })
  );
}

describe("Release Notes im Repository", () => {
  it("enthält mindestens einen Eintrag", () => {
    expect(noteFiles.length).toBeGreaterThan(0);
  });

  it("hat die Regeln für Agents hinterlegt", () => {
    expect(readdirSync(NOTES_DIR)).toContain("AGENTS.md");
  });

  it("lässt sich vollständig einlesen", () => {
    for (const name of noteFiles) {
      const raw = readFileSync(path.join(NOTES_DIR, name), "utf-8");
      expect(() => parseReleaseNote(name, raw), name).not.toThrow();
    }
  });

  it("hat eindeutige Versionen", () => {
    const versions = noteFiles.map(name => versionFromFilename(name));
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("verweist nur auf vorhandene Bilder – mit Alternativtext", () => {
    for (const name of noteFiles) {
      const raw = readFileSync(path.join(NOTES_DIR, name), "utf-8");
      const { body } = parseReleaseNote(name, raw);
      for (const ref of imageRefs(body)) {
        expect(
          ref.alt.trim(),
          `Alternativtext in ${name} für ${ref.src}`
        ).not.toBe("");
        const normalized = normalizeImagePath(ref.src);
        if (normalized === null) continue; // externe URL
        expect(normalized.startsWith("images/"), `${name}: ${ref.src}`).toBe(
          true
        );
        expect(imageFiles, `${name}: ${ref.src}`).toContain(
          normalized.slice("images/".length)
        );
      }
    }
  });

  it("hat keine unbenutzten Bilder", () => {
    const used = new Set<string>();
    for (const name of noteFiles) {
      const raw = readFileSync(path.join(NOTES_DIR, name), "utf-8");
      for (const ref of imageRefs(parseReleaseNote(name, raw).body)) {
        const normalized = normalizeImagePath(ref.src);
        if (normalized?.startsWith("images/")) {
          used.add(normalized.slice("images/".length));
        }
      }
    }
    expect(imageFiles.filter(file => !used.has(file))).toEqual([]);
  });

  it("enthält kein rohes HTML – das wird beim Rendern still verworfen", () => {
    for (const name of noteFiles) {
      const raw = readFileSync(path.join(NOTES_DIR, name), "utf-8");
      const { body } = parseReleaseNote(name, raw);
      // Code-Blöcke und Inline-Code dürfen Spitzklammern enthalten.
      const withoutCode = body
        .replace(/```[\s\S]*?```/g, "")
        .replace(/`[^`\n]*`/g, "");
      expect(withoutCode, name).not.toMatch(
        /<\/?[a-zA-Z][a-zA-Z0-9-]*(\s|\/?>)/
      );
    }
  });
});
