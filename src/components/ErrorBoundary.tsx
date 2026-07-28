import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Fängt Render-Fehler ab, damit die App nie komplett weiß bleibt –
 * stattdessen erscheint eine Fehlermeldung mit Neuladen-Option.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-xl font-semibold">Etwas ist schiefgelaufen</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Beim Anzeigen der Seite ist ein Fehler aufgetreten. Bitte lade die
            Seite neu – sollte das Problem bestehen bleiben, melde es mir.
          </p>
          <p className="max-w-md rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
            {this.state.error.message}
          </p>
          <Button onClick={() => window.location.assign("/")}>
            Zur Übersicht
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
