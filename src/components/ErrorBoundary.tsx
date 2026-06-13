import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Optional custom fallback. Receives the error and a reset fn. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary. A single throw anywhere in the render tree (a corrupt
 * image decode, an OOM during background removal, a bad worker response) would
 * otherwise unmount the whole app to a blank white page. This catches it and
 * offers recovery without a full reload.
 *
 * React 19 still has no Hook for error boundaries — a class with
 * getDerivedStateFromError / componentDidCatch is the only supported API.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No remote crash reporting in this client-only tool; surface to the console
    // so it's visible in dev and in a user's devtools when they report a bug.
    console.error('Unhandled error caught by ErrorBoundary:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="min-h-screen bg-base text-content flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-surface border border-line rounded-xl p-6 shadow-lg flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h1 className="font-semibold text-base text-content">Something went wrong</h1>
              <p className="text-xs text-muted">The editor hit an unexpected error.</p>
            </div>
          </div>

          <pre className="text-[11px] leading-relaxed text-faint bg-base border border-line rounded-md p-3 overflow-auto max-h-32 whitespace-pre-wrap break-words">
            {error.message || String(error)}
          </pre>

          <div className="flex gap-2">
            <button
              onClick={this.reset}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/40 hover:bg-blue-500/25 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium bg-elevated border border-line-strong text-muted hover:bg-hover hover:text-content transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
