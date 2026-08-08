import { Component, type ReactNode } from "react";
import { ErrorScreen } from "./ErrorScreen";

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
      return <ErrorScreen message={this.state.error.message} />;
    }
    return this.props.children;
  }
}
