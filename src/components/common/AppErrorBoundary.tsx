import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  public static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    const rawMsg =
      error instanceof Error && error.message
        ? error.message
        : 'An unexpected interface error occurred.';
    return {
      hasError: true,
      message: rawMsg,
    };
  }

  public componentDidCatch(error: unknown, errorInfo: React.ErrorInfo): void {
    console.error('[AppErrorBoundary] Uncaught render error:', error, errorInfo);
  }

  private handleRecover = () => {
    this.setState({ hasError: false, message: '' });
  };

  public render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          data-testid="app-error-boundary"
          className="min-h-screen bg-[#0A0F1D] text-slate-100 flex items-center justify-center px-4 py-8"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#0E1628] border border-rose-500/40 shadow-2xl p-6 space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-rose-400" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-bold text-white">
                Something went wrong displaying this view
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                {this.state.message}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={this.handleRecover}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 cursor-pointer"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
