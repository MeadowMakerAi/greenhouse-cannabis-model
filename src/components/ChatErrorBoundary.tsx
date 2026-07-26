import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Wraps the Sage message thread so a single message that throws while
 * rendering (e.g. a markdown edge case in MarkdownLite, or a malformed
 * finding) degrades to a small inline notice instead of blanking the entire
 * chat panel. Scoped intentionally tight — one bad message, not the whole app.
 */
interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export default class ChatErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Dev-visible; not sent anywhere (client-only tool).
    console.error("Sage message render failed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded border border-warn-500/40 bg-warn-500/10 p-2 text-xs text-warn-700">
          Sage hit a display error rendering this response. Your scenario is
          unaffected — try asking again.
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="ml-2 underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
