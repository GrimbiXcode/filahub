# Release Notes

Die Dateien in diesem Verzeichnis werden in der App unter „Neuerungen"
(`/neuerungen`) angezeigt. Sie sind Inhalt, kein Code.

## Sprache: ausschließlich Englisch

**Das ist die einzige Ausnahme von der Deutsch-Regel des Projekts**
(`AGENTS.md` im Wurzelverzeichnis, Abschnitt „Code-Stil").

- Release Notes werden **immer auf Englisch** geschrieben.
- Sie werden **nie** übersetzt, lokalisiert oder zweisprachig gepflegt. Es gibt
  keine `_de`-Varianten und keine Übersetzungsdateien.
- Die Oberfläche drumherum (Seitentitel, Menüeintrag, „Neu"-Markierung) bleibt
  deutsch – nur der Inhalt dieser Dateien ist englisch.

## Eine Datei pro Version

```
release_v<major>.<minor>.<patch>.md
```

- Die Version kommt **aus dem Dateinamen** – sie steht bewusst nirgends sonst,
  damit sie nicht auseinanderlaufen kann.
- Nur `X.Y.Z` mit reinen Zahlen ohne führende Nullen. Vorabversionen
  (`0.8.0-rc.1`) und Build-Metadaten werden abgelehnt.
- `AGENTS.md` (diese Datei) ist die einzige `.md`-Datei hier, die keine Release
  Note ist.

## Frontmatter

Pflicht, ganz am Dateianfang, beide Felder:

```markdown
---
date: 2026-08-03
title: Dark theme and release notes
---
```

- `date`: Veröffentlichungsdatum als `YYYY-MM-DD`.
- `title`: kurze englische Überschrift, ohne Versionsnummer (die zeigt die App
  daneben schon an).
- **Keine weiteren Schlüssel.** Unbekannte Felder – auch Tippfehler wie
  `titel:` – lassen die Seite in der Entwicklung leer bleiben (Grund samt
  Dateiname in der Browser-Konsole) und `npm run test` fehlschlagen.
  `version:` ist ebenfalls verboten (siehe oben).

## Inhalt

- Beginne die Abschnitte bei `##` (`#` ist der Seite vorbehalten).
- Schreibe für Benutzer: neue Funktionen, spürbare Verbesserungen, behobene
  Fehler. Keine internen Umbauten, keine Dateinamen, keine Commit-Hashes.
- Unterstützt sind Überschriften, Absätze, Listen, Fett/Kursiv, Links, Code,
  Tabellen (GitHub-Markdown) und Bilder.
- **Kein rohes HTML** – es wird beim Rendern still verworfen und ist deshalb
  durch einen Test verboten.
- **Keine Tailwind-Klassen.** Tailwind durchsucht `.md`-Dateien nicht; die
  Gestaltung kommt vollständig aus `src/components/ReleaseNoteMarkdown.tsx`.

## Bilder

- Ablageort: `images/`, Dateiname mit Versionspräfix und in Kleinbuchstaben,
  z. B. `images/v0.7.0-release-notes.png`.
- Referenz relativ zu diesem Verzeichnis:

  ```markdown
  ![The release notes page with unread entries](images/v0.7.0-release-notes.png)
  ```

- **Alternativtext ist Pflicht** (englisch), sonst schlägt der Test fehl.
- Bilder werden über `import.meta.glob` mitgebaut und landen gehasht in
  `dist/public/assets/`. Ein Verweis auf eine nicht vorhandene Datei und ein
  Bild, auf das keine Release Note verweist, lassen beide die Tests
  fehlschlagen.

## Beim Veröffentlichen

1. Version in `package.json` erhöhen.
2. Passende `release_vX.Y.Z.md` in **derselben Änderung** anlegen.
3. `npm run test` – `api/releaseNotes.test.ts` prüft Namen, Frontmatter,
   Bildverweise und Alternativtexte gegen die echten Dateien.

## Veröffentlichte Einträge nicht mehr umschreiben

Benutzer haben sie unter Umständen schon als gelesen markiert und sehen eine
Änderung nie wieder. Tippfehler und Formulierungen zu korrigieren ist in
Ordnung; nachträglich Inhalte ergänzen gehört in die nächste Version.

`npm run format` (Prettier) formatiert diese Dateien mit – Aufzählungen mit
`-`, Absätze werden nicht neu umbrochen.
