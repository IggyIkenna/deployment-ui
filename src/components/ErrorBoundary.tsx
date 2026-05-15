import { Component, type ReactNode } from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] Caught render error:", error, info.componentStack);
  }

  reset() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)] p-8"
        >
          <div className="max-w-lg text-center">
            <h1 className="text-xl font-semibold text-[var(--color-accent-red)] mb-2">
              {this.props.fallbackTitle ?? "Something went wrong"}
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)] mb-6">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                aria-label="Try again without reloading"
                onClick={() => this.reset()}
                className="px-4 py-2 text-sm rounded-md border border-[var(--color-border-default)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
              >
                Try again
              </button>
              <button
                aria-label="Reload the page"
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-sm rounded-md bg-[var(--color-accent-blue)] text-white hover:opacity-90"
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
