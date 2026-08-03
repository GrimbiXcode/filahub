import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { releaseNoteImageUrl } from "@/lib/releaseNotes";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * Rendert den Markdown-Inhalt einer Release Note.
 *
 * Die Elemente werden bewusst von Hand auf die Farb-Tokens abgebildet, statt
 * ein Prosa-Plugin einzubinden: Das brächte eine eigene Graustufen-Palette mit,
 * die erst wieder an `--foreground` & Co. gebunden werden müsste – und die
 * Eingriffe bei Bildern, Links und Tabellen bräuchte es trotzdem.
 *
 * Rohes HTML wird von react-markdown verworfen (kein `rehype-raw`); Release
 * Notes dürfen deshalb keins enthalten, siehe `src/release-notes/AGENTS.md`.
 */

const components: Components = {
  h1: ({ children }) => (
    <h2 className="mt-6 text-lg font-semibold tracking-tight first:mt-0">
      {children}
    </h2>
  ),
  h2: ({ children }) => (
    <h3 className="mt-6 text-base font-semibold tracking-tight first:mt-0">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="mt-5 text-sm font-semibold tracking-tight first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => <p className="mt-3 first:mt-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="mt-3 list-disc space-y-1 pl-5 first:mt-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-3 list-decimal space-y-1 pl-5 first:mt-0">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-3 border-l-2 border-border pl-4 italic text-muted-foreground first:mt-0">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    // Nur Inline-Code kommt ohne Sprachklasse; Blöcke stecken in <pre>.
    const isBlock =
      typeof className === "string" && className.includes("language-");
    return (
      <code
        className={cn(
          "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]",
          isBlock && "block bg-transparent p-0 text-sm"
        )}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mt-3 overflow-x-auto rounded-lg border bg-muted p-3 first:mt-0">
      {children}
    </pre>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="font-medium text-primary underline underline-offset-4"
    >
      {children}
    </a>
  ),
  hr: () => <Separator className="my-6" />,
  // Auf dem Telefon darf eine Tabelle die Seite nicht breiter machen.
  table: ({ children }) => (
    <div className="mt-3 w-full overflow-x-auto first:mt-0">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b px-3 py-2 text-left font-medium">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b px-3 py-2 align-top">{children}</td>
  ),
  img: ({ src, alt, title }) => {
    const resolved =
      typeof src === "string" ? releaseNoteImageUrl(src) : undefined;
    if (!resolved) {
      // Kann nur passieren, wenn jemand den Test in api/releaseNotes.test.ts
      // umgangen hat – dann lieber sichtbar als unsichtbar kaputt.
      return (
        <span className="mt-3 block rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Bild nicht gefunden: {String(src)}
        </span>
      );
    }
    return (
      <img
        src={resolved}
        alt={alt ?? ""}
        title={title}
        loading="lazy"
        className="mt-3 h-auto max-w-full rounded-lg border first:mt-0"
      />
    );
  },
};

export function ReleaseNoteMarkdown({ children }: { children: string }) {
  return (
    // Der Inhalt ist immer englisch, der Rest der Oberfläche deutsch.
    <div lang="en" className="text-sm leading-relaxed text-muted-foreground">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </Markdown>
    </div>
  );
}
