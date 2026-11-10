import { Fragment, useMemo, type ReactNode } from "react";
import {
  parseMarkdown,
  type MarkdownBlock,
  type MarkdownInline,
  type TableAlign,
} from "@contracts/markdown";
import { Separator } from "@/components/ui/separator";
import { useT } from "@/lib/i18nContext";
import { cn } from "@/lib/utils";

/**
 * Rendert Markdown im Design der App.
 *
 * Gelesen wird mit `parseMarkdown` (`contracts/markdown.ts`, bis 4.8.0
 * `react-markdown`), gezeichnet wird hier. Die Elemente werden bewusst von
 * Hand auf die Farb-Tokens abgebildet, statt ein Prosa-Plugin einzubinden:
 * Das brächte eine eigene Graustufen-Palette mit, die erst wieder an
 * `--foreground` & Co. gebunden werden müsste – und die Eingriffe bei Bildern,
 * Links und Tabellen bräuchte es trotzdem.
 *
 * Rohes HTML bleibt Text, und es entstehen nur React-Elemente, nie
 * `innerHTML`. Das ist hier kein Detail, sondern die Zusicherung, dass
 * eingebetteter Text keine Skripte einschleusen kann. Nicht erlaubte
 * Adressen (`javascript:` …) kommen als `null` an und werden nur Text.
 */

/** Löst eine Bildreferenz in eine gebaute Asset-URL auf. */
export type ImageResolver = (src: string) => string | undefined;

type RenderContext = {
  resolveImage: ImageResolver | undefined;
  imageMissing: (vars: { src: string }) => string;
};

const ALIGN_CLASS: Record<Exclude<TableAlign, null>, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function renderInline(
  nodes: MarkdownInline[],
  ctx: RenderContext
): ReactNode[] {
  return nodes.map((node, key) => {
    switch (node.type) {
      case "text":
        return <Fragment key={key}>{node.value}</Fragment>;
      case "break":
        return <br key={key} />;
      case "strong":
        return (
          <strong key={key} className="font-semibold text-foreground">
            {renderInline(node.children, ctx)}
          </strong>
        );
      case "emphasis":
        return <em key={key}>{renderInline(node.children, ctx)}</em>;
      case "delete":
        return <del key={key}>{renderInline(node.children, ctx)}</del>;
      case "code":
        return (
          <code
            key={key}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
          >
            {node.value}
          </code>
        );
      case "link": {
        const children = renderInline(node.children, ctx);
        if (node.href === null)
          return <Fragment key={key}>{children}</Fragment>;
        /*
          Interne Verweise – etwa von der Datenschutzerklärung aufs Impressum –
          bleiben im selben Tab und ohne `rel`: Ein neuer Tab wäre hier eine
          Zumutung, und `noreferrer` gegen die eigene Seite ergibt keinen Sinn.
          `//host` und `/\host` sind keine internen Pfade, sondern Adressen
          fremder Seiten ohne Schema – seit 4.2.0 rendert diese Komponente auch
          Notizen, die andere Mitglieder einer Organisation geschrieben haben.
        */
        const isInternal = /^\/(?![/\\])/.test(node.href);
        return (
          <a
            key={key}
            href={node.href}
            title={node.title ?? undefined}
            {...(isInternal
              ? {}
              : { target: "_blank", rel: "noreferrer noopener" })}
            className="font-medium text-primary underline underline-offset-4"
          >
            {children}
          </a>
        );
      }
      case "image": {
        const resolved =
          node.src === null ? undefined : ctx.resolveImage?.(node.src);
        if (!resolved) {
          // Lieber sichtbar als unsichtbar kaputt.
          return (
            <span
              key={key}
              className="mt-3 block rounded-lg border border-dashed p-3 text-sm text-muted-foreground"
            >
              {ctx.imageMissing({ src: node.src ?? "" })}
            </span>
          );
        }
        return (
          <img
            key={key}
            src={resolved}
            alt={node.alt}
            title={node.title ?? undefined}
            loading="lazy"
            className="mt-3 h-auto max-w-full rounded-lg border first:mt-0"
          />
        );
      }
    }
  });
}

/** Überschriften eine Stufe tiefer: `h1` der Seite ist der Seitentitel. */
const HEADING_CLASS = [
  "mt-6 text-lg font-semibold tracking-tight first:mt-0",
  "mt-6 text-base font-semibold tracking-tight first:mt-0",
  "mt-5 text-sm font-semibold tracking-tight first:mt-0",
] as const;

function renderBlocks(
  blocks: MarkdownBlock[],
  ctx: RenderContext,
  /** In engen Listen stehen Absätze ohne `<p>`, wie bei GitHub. */
  tight = false
): ReactNode[] {
  return blocks.map((block, key) => {
    switch (block.type) {
      case "heading": {
        const Tag = (["h2", "h3", "h4", "h5", "h6", "h6"] as const)[
          block.depth - 1
        ];
        return (
          <Tag
            key={key}
            className={HEADING_CLASS[Math.min(block.depth, 3) - 1]}
          >
            {renderInline(block.children, ctx)}
          </Tag>
        );
      }
      case "paragraph":
        return tight ? (
          <Fragment key={key}>{renderInline(block.children, ctx)}</Fragment>
        ) : (
          <p key={key} className="mt-3 first:mt-0">
            {renderInline(block.children, ctx)}
          </p>
        );
      case "thematicBreak":
        return <Separator key={key} className="my-6" />;
      case "code":
        return (
          <pre
            key={key}
            className="mt-3 overflow-x-auto rounded-lg border bg-muted p-3 first:mt-0"
          >
            <code className="block font-mono text-sm">{block.value}</code>
          </pre>
        );
      case "blockquote":
        return (
          <blockquote
            key={key}
            className="mt-3 border-l-2 border-border pl-4 italic text-muted-foreground first:mt-0"
          >
            {renderBlocks(block.children, ctx)}
          </blockquote>
        );
      case "list": {
        const items = block.items.map((item, index) => (
          // Aufgaben ohne Aufzählungszeichen – das Kästchen ersetzt es.
          <li
            key={index}
            className={cn("pl-1", item.checked !== null && "list-none")}
          >
            {item.checked !== null && (
              <input
                type="checkbox"
                checked={item.checked}
                disabled
                readOnly
                className="mr-2 align-middle"
              />
            )}
            {renderBlocks(item.children, ctx, block.tight)}
          </li>
        ));
        return block.ordered ? (
          <ol
            key={key}
            start={block.start !== 1 ? (block.start ?? undefined) : undefined}
            className="mt-3 list-decimal space-y-1 pl-5 first:mt-0"
          >
            {items}
          </ol>
        ) : (
          <ul key={key} className="mt-3 list-disc space-y-1 pl-5 first:mt-0">
            {items}
          </ul>
        );
      }
      case "table":
        // Auf dem Telefon darf eine Tabelle die Seite nicht breiter machen.
        return (
          <div key={key} className="mt-3 w-full overflow-x-auto first:mt-0">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {block.head.map((cell, c) => (
                    <th
                      key={c}
                      className={cn(
                        "border-b px-3 py-2 text-left font-medium",
                        block.align[c] && ALIGN_CLASS[block.align[c]]
                      )}
                    >
                      {renderInline(cell, ctx)}
                    </th>
                  ))}
                </tr>
              </thead>
              {block.rows.length > 0 && (
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td
                          key={c}
                          className={cn(
                            "border-b px-3 py-2 align-top",
                            block.align[c] && ALIGN_CLASS[block.align[c]]
                          )}
                        >
                          {renderInline(cell, ctx)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        );
    }
  });
}

export function MarkdownContent({
  children,
  lang,
  resolveImage,
  className,
}: {
  children: string;
  /** Sprache des Inhalts – kann von der Oberflächensprache abweichen. */
  lang: string;
  resolveImage?: ImageResolver;
  className?: string;
}) {
  const t = useT();
  const imageMissing = t.common.imageMissing;
  const blocks = useMemo(() => parseMarkdown(children), [children]);
  return (
    <div
      lang={lang}
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
    >
      {renderBlocks(blocks, { resolveImage, imageMissing })}
    </div>
  );
}
