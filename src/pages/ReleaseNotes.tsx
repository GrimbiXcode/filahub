import AuthLayout from "@/components/AuthLayout";
import { PageHeader } from "@/components/PageHeader";
import { ReleaseNoteMarkdown } from "@/components/ReleaseNoteMarkdown";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useReleaseNotes } from "@/hooks/useReleaseNotes";
import { APP_VERSION } from "@/lib/appVersion";
import { useFormat } from "@/lib/formatContext";
import { useT } from "@/lib/i18nContext";

/**
 * „Neuerungen": alle Release Notes, neueste zuerst.
 *
 * Der Rahmen ist übersetzt, der Inhalt der Einträge bleibt bewusst englisch –
 * siehe `src/release-notes/AGENTS.md`. Deshalb steht `lang="en"` an den
 * Überschriften und am Markdown-Block.
 */
export default function ReleaseNotes() {
  const { notes, unreadCount, wasUnread } = useReleaseNotes({
    markSeenOnMount: true,
  });
  const { formatDate } = useFormat();
  const t = useT();

  return (
    <AuthLayout>
      <div className="flex max-w-3xl flex-col gap-4 sm:gap-6">
        <PageHeader
          title={t.releaseNotes.title}
          description={
            unreadCount === 0
              ? t.releaseNotes.description
              : unreadCount === 1
                ? t.releaseNotes.unreadOne
                : t.releaseNotes.unreadMany({ count: unreadCount })
          }
        />

        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t.releaseNotes.empty}
          </p>
        ) : (
          notes.map(note => (
            <Card key={note.version} className="overflow-hidden">
              <CardHeader className="gap-1 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="font-mono">
                    v{note.version}
                  </Badge>
                  {wasUnread(note.version) && (
                    <Badge>{t.releaseNotes.new}</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatDate(note.date)}
                  </span>
                </div>
                <h2
                  className="text-base font-semibold tracking-tight"
                  lang="en"
                >
                  {note.title}
                </h2>
              </CardHeader>
              <CardContent>
                <ReleaseNoteMarkdown>{note.body}</ReleaseNoteMarkdown>
              </CardContent>
            </Card>
          ))
        )}

        {/* Der Quelltext-Hinweis ist keine Höflichkeit: Die AGPL verlangt in
            § 13, dass Nutzern einer über das Netz erreichbaren (geänderten)
            Fassung der zugehörige Quelltext angeboten wird. Wer filahub
            anpasst und betreibt, muss den Link auf sein eigenes Repository
            umbiegen. */}
        <p className="text-xs text-muted-foreground">
          {t.releaseNotes.version({ version: APP_VERSION })}{" "}
          {t.releaseNotes.license}{" "}
          <a
            href="https://www.gnu.org/licenses/agpl-3.0.html"
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-2 hover:text-foreground"
          >
            AGPL-3.0
          </a>
          {t.releaseNotes.sourceIntro}{" "}
          <a
            href="https://github.com/GrimbiXcode/filahub"
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {t.releaseNotes.source}
          </a>{" "}
          {t.releaseNotes.sourceOutro}
        </p>
      </div>
    </AuthLayout>
  );
}
