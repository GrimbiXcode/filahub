import { MarkdownContent } from "@/components/MarkdownContent";
import { releaseNoteImageUrl } from "@/lib/releaseNotes";

/**
 * Rendert den Markdown-Inhalt einer Release Note.
 *
 * Der Inhalt der Einträge ist immer englisch, auch wenn die Oberfläche deutsch
 * spricht – siehe `src/release-notes/AGENTS.md`. Deshalb steht hier `lang="en"`
 * fest. Bilder lösen sich über die Asset-Pipeline von Vite auf; Release Notes
 * dürfen kein rohes HTML enthalten, das verwirft `MarkdownContent`.
 */
export function ReleaseNoteMarkdown({ children }: { children: string }) {
  return (
    <MarkdownContent lang="en" resolveImage={releaseNoteImageUrl}>
      {children}
    </MarkdownContent>
  );
}
