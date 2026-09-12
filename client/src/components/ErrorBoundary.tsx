/**
 * FIX-Q (BUG-201) — the application had no error boundary anywhere.
 *
 * React unmounts the whole tree when a render throws and nothing catches it,
 * so one reservation whose `startDate` could not be parsed took the entire
 * reservations page down to a blank white screen — with no way back except a
 * manual reload, and no trace of what happened. A boundary around the routed
 * page keeps the shell (sidebar, header) alive, says what broke, and offers
 * the two things that actually help: try again, and reload.
 *
 * Deliberately a class component: `componentDidCatch` has no hook equivalent.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Changing this value resets the boundary — used to clear it on navigation. */
  resetKey?: string;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The console is where a developer looks first, and the only place this
    // information exists at all today — there is no client error reporting.
    console.error("Unhandled render error:", error, info.componentStack);
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6" role="alert">
        <div className="max-w-lg space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Er ging iets mis op dit scherm</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            De pagina kon niet worden getoond. De rest van de applicatie werkt gewoon door — probeer
            het opnieuw, of herlaad de pagina.
          </p>
          <pre className="max-h-32 overflow-auto rounded bg-muted p-3 text-xs">{error.message}</pre>
          <div className="flex gap-2">
            <Button onClick={this.reset} variant="default">
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Opnieuw proberen
            </Button>
            <Button onClick={() => window.location.reload()} variant="outline">
              Pagina herladen
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
