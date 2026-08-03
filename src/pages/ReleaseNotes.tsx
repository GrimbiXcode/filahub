import AuthLayout from "@/components/AuthLayout";
import { PageHeader } from "@/components/PageHeader";
import { ReleaseNoteMarkdown } from "@/components/ReleaseNoteMarkdown";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useReleaseNotes } from "@/hooks/useReleaseNotes";
import { APP_VERSION } from "@/lib/appVersion";
import { useFormat } from "@/lib/formatContext";

/**
 * „Neuerungen": alle Release Notes, neueste zuerst.
 *
 * Die Oberfläche ist deutsch wie im Rest der App, der Inhalt der Einträge
 * bewusst englisch – siehe `src/release-notes/AGENTS.md`.
 */
export default function ReleaseNotes() {
  const { notes, unreadCount, wasUnread } = useReleaseNotes({
    markSeenOnMount: true,
  });
  const { formatDate } = useFormat();

  return (
    <AuthLayout>
      <div className="flex max-w-3xl flex-col gap-4 sm:gap-6">
        <PageHeader
          title="Neuerungen"
          description={
            unreadCount === 0
              ? "Was sich im Filament-Lager geändert hat"
              : unreadCount === 1
                ? "Ein neuer Eintrag seit deinem letzten Besuch"
                : `${unreadCount} neue Einträge seit deinem letzten Besuch`
          }
        />

        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Für diese Version gibt es noch keine Einträge.
          </p>
        ) : (
          notes.map(note => (
            <Card key={note.version} className="overflow-hidden">
              <CardHeader className="gap-1 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="font-mono">
                    v{note.version}
                  </Badge>
                  {wasUnread(note.version) && <Badge>Neu</Badge>}
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

        <p className="text-xs text-muted-foreground">
          Du nutzt Version {APP_VERSION}.
        </p>
      </div>
    </AuthLayout>
  );
}
