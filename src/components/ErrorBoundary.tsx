import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  /** Human label for the boundary (e.g. "3D scene", "chatbot") — shown in
   *  the default fallback and logged. */
  label?: string;
  /** Custom fallback UI. If omitted, a compact card is rendered. */
  fallback?: ReactNode;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Local error boundary. Wrap independently-failable regions (the WebGL canvas,
 * the chatbot, the dashboard) so one component's throw degrades to a card
 * instead of white-screening the whole app. Added per the 2026-07-12
 * launch-readiness audit (there was no boundary anywhere).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Non-fatal by design; log for diagnostics. No PII — component stack only.
    console.error(`[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ""}]`, error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex h-full min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded-md border border-warn-500/30 bg-warn-500/5 p-4 text-center">
          <div className="text-sm font-medium text-warn-600">
            {this.props.label ? `The ${this.props.label} hit a problem.` : "Something went wrong here."}
          </div>
          <div className="max-w-xs text-[11px] text-ink-500">
            The rest of the app is still working. Try again, or reload the page.
          </div>
          <button
            type="button"
            onClick={this.reset}
            className="btn !px-3 !py-1 !text-xs"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
