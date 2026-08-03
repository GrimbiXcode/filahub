import {
  RELEASE_NOTES_NON_NOTE_FILES,
  newestVersion,
  normalizeImagePath,
  parseReleaseNote,
  sortReleaseNotes,
  type ReleaseNote,
} from "@contracts/releaseNotes";

/**
 * Lädt die Release Notes aus `src/release-notes/`.
 *
 * `eager: true` heißt: Die Texte landen im JS-Bundle und die Bilder in der
 * Asset-Pipeline von Vite (gehasht unter `dist/public/assets/`). Damit
 * funktioniert die Seite auch im Produktions-Image, das nur `dist/` enthält –
 * lose Dateien aus dem Repository gibt es dort nicht.
 *
 * Die reine Logik (Frontmatter, Versionsvergleich) steht in
 * `@contracts/releaseNotes`, damit der Server sie mitbenutzen kann.
 */

/** Verzeichnispräfix der Glob-Schlüssel – die Globs sind relativ zu dieser Datei. */
const DIR = "../release-notes/";

const rawNotes = import.meta.glob<string>("../release-notes/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

const imageUrls = import.meta.glob<string>(
  "../release-notes/images/*.{png,jpg,jpeg,gif,svg,webp,avif}",
  { query: "?url", import: "default", eager: true }
);

/** `images/v0.7.0-x.png` → gehashte URL des gebauten Bildes */
const imagesByPath = new Map(
  Object.entries(imageUrls).map(([key, url]) => [key.slice(DIR.length), url])
);

/**
 * Alle Release Notes, neueste zuerst.
 *
 * `parseReleaseNote` wirft bei kaputten Dateien schon beim Import – in der
 * Entwicklung bleibt die Seite dann leer und die Konsole nennt Datei und
 * Grund. Weil `vite build` die Module nicht ausführt, prüft
 * `api/releaseNotes.test.ts` dieselben Dateien noch einmal in der CI.
 */
export const RELEASE_NOTES: ReleaseNote[] = sortReleaseNotes(
  Object.entries(rawNotes)
    .filter(
      ([path]) => !RELEASE_NOTES_NON_NOTE_FILES.includes(path.slice(DIR.length))
    )
    .map(([path, raw]) => parseReleaseNote(path, raw))
);

/** Version der neuesten Release Note; `null`, wenn es keine gibt. */
export const NEWEST_RELEASE_VERSION = newestVersion(RELEASE_NOTES);

/**
 * Löst eine Bildreferenz aus dem Markdown in die gebaute Asset-URL auf.
 * Externe URLs werden unverändert zurückgegeben, unbekannte lokale Pfade
 * ergeben `undefined` (die Anzeige zeigt dann einen Hinweis).
 */
export function releaseNoteImageUrl(src: string): string | undefined {
  const normalized = normalizeImagePath(src);
  if (normalized === null) return src;
  return imagesByPath.get(normalized);
}
