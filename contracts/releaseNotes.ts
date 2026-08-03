import { z } from "zod";

/**
 * Release Notes: Dateiname-, Frontmatter- und Versionslogik.
 *
 * Die eigentlichen Texte liegen als Markdown in `src/release-notes/` und sind
 * bewusst **englisch** – als einzige Ausnahme von der Deutsch-Regel des
 * Projekts (siehe `src/release-notes/AGENTS.md`).
 *
 * Diese Datei wird von Client, Server und Tests importiert und darf deshalb
 * nichts aus `@db` oder `api/` zur Laufzeit laden – nur zod und eigene Logik.
 * Insbesondere kein `import.meta.glob`: Das Einlesen der Dateien steckt in
 * `src/lib/releaseNotes.ts`, damit der Server `compareVersions` mitbenutzen
 * kann (MySQL kann Versionsnummern nicht sinnvoll vergleichen).
 */

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/**
 * Genau drei Zahlen ohne führende Nullen. Vorabversionen (`1.0.0-rc.1`) und
 * Build-Metadaten (`1.0.0+abc`) sind bewusst nicht erlaubt: Das Projekt
 * veröffentlicht ausschließlich `vX.Y.Z`-Tags, und der Vergleich bleibt so
 * trivial nachvollziehbar.
 */
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const releaseVersionSchema = z
  .string()
  .max(32)
  .regex(VERSION_PATTERN, "Version muss die Form X.Y.Z haben");

export function isReleaseVersion(value: string): boolean {
  return VERSION_PATTERN.test(value);
}

/**
 * Vergleicht zwei Versionen segmentweise numerisch.
 * `< 0` wenn a älter ist, `0` bei Gleichheit, `> 0` wenn a neuer ist.
 *
 * Nicht parsebare Werte gelten als „älter als alles" – ein unbekannter Wert in
 * der Datenbank führt damit dazu, dass wieder alles als ungelesen gilt, statt
 * dass die Anzeige stillschweigend leer bleibt.
 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersionParts(a);
  const right = parseVersionParts(b);
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;

  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

function parseVersionParts(value: string): [number, number, number] | null {
  const match = VERSION_PATTERN.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

// ---------------------------------------------------------------------------
// Dateiname
// ---------------------------------------------------------------------------

/** `…/release-notes/release_v0.7.0.md` → `0.7.0` */
const FILENAME_PATTERN = /^release_v(.+)\.md$/;

/** Dateien in `src/release-notes/`, die keine Release Note sind */
export const RELEASE_NOTES_NON_NOTE_FILES = ["AGENTS.md"];

export function versionFromFilename(filePath: string): string {
  const fileName = filePath.split("/").pop() ?? filePath;
  const match = FILENAME_PATTERN.exec(fileName);
  const version = match?.[1];
  if (!version || !isReleaseVersion(version)) {
    throw new Error(
      `Release Note "${fileName}": Dateiname muss release_vX.Y.Z.md lauten.`
    );
  }
  return version;
}

// ---------------------------------------------------------------------------
// Frontmatter + Inhalt
// ---------------------------------------------------------------------------

/**
 * `strictObject`, damit ein Tippfehler im Schlüssel (`titel:`) auffällt,
 * statt still ignoriert zu werden. `version` gehört bewusst **nicht** dazu –
 * die Version steht im Dateinamen und kann so nicht auseinanderlaufen.
 */
export const releaseNoteFrontmatterSchema = z.strictObject({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date muss im Format YYYY-MM-DD stehen"),
  title: z.string().min(1, "title darf nicht leer sein"),
});

export type ReleaseNoteFrontmatter = z.infer<
  typeof releaseNoteFrontmatterSchema
>;

export type ReleaseNote = ReleaseNoteFrontmatter & {
  /** `0.7.0` – kommt aus dem Dateinamen */
  version: string;
  /** Markdown ohne Frontmatter */
  body: string;
};

/**
 * Trennt einen Frontmatter-Block vom Rest. Erkannt wird nur ein Block ganz am
 * Dateianfang, damit eine Trennlinie (`---`) mitten im Text nicht fälschlich
 * als Ende gedeutet wird.
 */
export function splitFrontmatter(raw: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  // BOM und CRLF wegräumen – beides kommt aus echten Editoren.
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!/^---[ \t]*\n/.test(text)) {
    throw new Error("Frontmatter fehlt (Datei muss mit '---' beginnen).");
  }

  // Der schließende Strich muss eine eigene Zeile sein – sonst würde eine
  // Trennlinie im Text den Block vorzeitig beenden.
  const match = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  if (!match) {
    throw new Error("Frontmatter ist nicht mit '---' abgeschlossen.");
  }

  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    if (line.trim() === "") continue;
    const separator = line.indexOf(":");
    if (separator === -1) {
      throw new Error(`Frontmatter-Zeile ohne ':' – "${line.trim()}".`);
    }
    // Nur der erste Doppelpunkt trennt, damit "title: Neu: mit Bildern" geht.
    const key = line.slice(0, separator).trim();
    frontmatter[key] = line.slice(separator + 1).trim();
  }

  const body = text.slice(match[0].length).replace(/^\n+/, "");
  return { frontmatter, body: body.trimEnd() };
}

/**
 * Liest eine Release Note ein. Wirft mit Dateinamen in der Meldung: In der
 * Entwicklung bricht damit schon der Import ab (leere Seite, Meldung in der
 * Konsole), in der CI schlägt `api/releaseNotes.test.ts` fehl.
 */
export function parseReleaseNote(filePath: string, raw: string): ReleaseNote {
  const version = versionFromFilename(filePath);
  const fileName = filePath.split("/").pop() ?? filePath;

  let frontmatter: Record<string, string>;
  let body: string;
  try {
    ({ frontmatter, body } = splitFrontmatter(raw));
  } catch (error) {
    throw new Error(`Release Note "${fileName}": ${(error as Error).message}`);
  }

  const parsed = releaseNoteFrontmatterSchema.safeParse(frontmatter);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map(issue => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Release Note "${fileName}": ${details}`);
  }

  if (body.trim() === "") {
    throw new Error(`Release Note "${fileName}": Inhalt ist leer.`);
  }

  return { ...parsed.data, version, body };
}

// ---------------------------------------------------------------------------
// Sortierung und Ungelesen-Logik
// ---------------------------------------------------------------------------

/** Neueste zuerst; bei gleicher Version alphabetisch, damit es deterministisch bleibt. */
export function sortReleaseNotes<T extends { version: string }>(
  notes: readonly T[]
): T[] {
  return [...notes].sort(
    (a, b) =>
      compareVersions(b.version, a.version) ||
      a.version.localeCompare(b.version)
  );
}

export function newestVersion(
  notes: readonly { version: string }[]
): string | null {
  return sortReleaseNotes(notes).at(0)?.version ?? null;
}

/**
 * Alles, was neuer ist als der zuletzt gesehene Stand.
 *
 * `lastSeen === null` (noch nie die Neuerungen geöffnet) bedeutet bewusst
 * „alles ungelesen": Bestehende Benutzer sehen beim Einführen der Funktion
 * einmalig die komplette Historie, und genau das ist der Zweck.
 * Ein unbekannter Wert wird wie `null` behandelt (siehe `compareVersions`).
 */
export function unreadReleaseNotes<T extends { version: string }>(
  notes: readonly T[],
  lastSeen: string | null | undefined
): T[] {
  const sorted = sortReleaseNotes(notes);
  if (lastSeen == null) return sorted;
  return sorted.filter(note => compareVersions(note.version, lastSeen) > 0);
}

// ---------------------------------------------------------------------------
// Bildpfade
// ---------------------------------------------------------------------------

/**
 * Bringt eine Bildreferenz aus dem Markdown auf die kanonische Form
 * `images/datei.png`, damit `src/lib/releaseNotes.ts` sie in der Glob-Tabelle
 * nachschlagen kann.
 *
 * `null` heißt „nicht lokal auflösen": externe URLs, Data-URIs und alles, was
 * aus dem Verzeichnis ausbrechen will.
 */
export function normalizeImagePath(src: string): string | null {
  const trimmed = src.trim();
  if (trimmed === "") return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null; // http:, data:, mailto:
  if (trimmed.startsWith("//")) return null;

  // Query und Fragment gehören nicht zum Dateinamen.
  const withoutSuffix = trimmed.split(/[?#]/, 1)[0];

  let decoded = withoutSuffix;
  try {
    decoded = decodeURIComponent(withoutSuffix);
  } catch {
    // Ungültige Prozent-Sequenz: unverändert weiterverwenden.
  }

  const cleaned = decoded.replace(/^\.\//, "").replace(/^\/+/, "");
  if (cleaned === "" || cleaned.split("/").includes("..")) return null;
  return cleaned;
}
