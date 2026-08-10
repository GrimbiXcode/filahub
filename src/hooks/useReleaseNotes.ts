import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { unreadReleaseNotes } from "@contracts/releaseNotes";
import { useAuth } from "@/hooks/useAuth";
import { NEWEST_RELEASE_VERSION, RELEASE_NOTES } from "@/lib/releaseNotes";
import { trpc } from "@/lib/trpc";

type Options = {
  /**
   * Beim ersten Rendern als gelesen markieren. Nur die Neuerungen-Seite setzt
   * das – die Seitenleiste liest den Stand bloß.
   */
  markSeenOnMount?: boolean;
};

/**
 * Release Notes samt Ungelesen-Stand des angemeldeten Benutzers.
 *
 * Der Stand hängt am Konto (`users.lastSeenReleaseVersion`) und nicht am Gerät,
 * damit die Neuerungen nicht in jedem Browser erneut als ungelesen erscheinen.
 * `null` bedeutet „noch nie geöffnet" – dann gilt alles als ungelesen.
 */
export function useReleaseNotes({ markSeenOnMount = false }: Options = {}) {
  const { user, isLoading } = useAuth();
  const utils = trpc.useUtils();
  const { mutate: markSeenMutation } =
    trpc.auth.markReleaseNotesSeen.useMutation({
      onSuccess: () => utils.auth.me.invalidate(),
    });

  const lastSeen = user?.lastSeenReleaseVersion ?? null;
  const isReady = !isLoading && !!user;

  /**
   * Stand beim Betreten der Seite. Die Seite markiert die Neuerungen beim
   * Öffnen als gelesen – ohne diesen festgehaltenen Wert würden die
   * „Neu"-Markierungen noch während des Lesens verschwinden.
   *
   * `undefined` als Startwert, weil die Seiten `AuthLayout` als Kind rendern:
   * Beim ersten Durchlauf steht der Benutzer noch nicht fest, ein
   * `useState`-Initialisierer würde dauerhaft `null` (= alles ungelesen)
   * festhalten.
   */
  const [seenAtEntry, setSeenAtEntry] = useState<string | null | undefined>(
    undefined
  );
  useEffect(() => {
    // Genau dieses Festhalten ist der Zweck des Effekts: Sobald der Benutzer
    // feststeht, wird der Stand einmalig übernommen. Ein Ref reicht nicht, weil
    // `unreadAtEntry` unten daraus neu berechnet werden muss.
    if (isReady) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSeenAtEntry(current => (current === undefined ? lastSeen : current));
    }
    // `lastSeen` bewusst nicht in den Abhängigkeiten: Der Wert soll genau
    // einmal festgehalten werden, nicht bei jeder Aktualisierung neu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  const unread = useMemo(
    () => unreadReleaseNotes(RELEASE_NOTES, lastSeen),
    [lastSeen]
  );

  const unreadAtEntry = useMemo(
    () =>
      new Set(
        unreadReleaseNotes(
          RELEASE_NOTES,
          seenAtEntry === undefined ? lastSeen : seenAtEntry
        ).map(note => note.version)
      ),
    [seenAtEntry, lastSeen]
  );

  // `StrictMode` ruft Effekte doppelt auf – der Ref verhindert die zweite
  // Mutation.
  const marked = useRef(false);
  useEffect(() => {
    if (!markSeenOnMount || !isReady || marked.current) return;
    if (!NEWEST_RELEASE_VERSION || lastSeen === NEWEST_RELEASE_VERSION) return;
    marked.current = true;
    markSeenMutation({ version: NEWEST_RELEASE_VERSION });
  }, [markSeenOnMount, isReady, lastSeen, markSeenMutation]);

  return {
    notes: RELEASE_NOTES,
    newestVersion: NEWEST_RELEASE_VERSION,
    /** Aktuell ungelesen – Grundlage für den Zähler in der Seitenleiste. */
    unreadCount: isReady ? unread.length : 0,
    /** War beim Betreten der Seite ungelesen; bleibt während des Besuchs stabil. */
    wasUnread: useCallback(
      (version: string) => unreadAtEntry.has(version),
      [unreadAtEntry]
    ),
  };
}
