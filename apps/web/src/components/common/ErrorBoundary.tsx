import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  referenceId: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    referenceId: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    const referenceId =
      'ERR-' +
      Date.now().toString(36).toUpperCase() +
      '-' +
      Math.random().toString(36).substring(2, 6).toUpperCase();
    return { hasError: true, error, referenceId };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught React Error caught by ErrorBoundary:', error, errorInfo);
  }

  private getFriendlyErrorMessage(): string {
    const raw = this.state.error?.message || '';
    // Strip minified React errors and internal framework traces
    if (
      !raw ||
      raw.includes('Minified React error') ||
      raw.includes('reactjs.org') ||
      raw.includes('invariant=') ||
      raw.includes('Objects are not valid as a React child') ||
      raw.includes('undefined is not an object') ||
      raw.includes('Cannot read properties of')
    ) {
      return 'An unexpected error occurred while displaying this section. Please reload the page to continue.';
    }
    return raw;
  }

  public render() {
    if (this.state.hasError) {
      const friendlyMessage = this.getFriendlyErrorMessage();
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#0F1117] flex items-center justify-center p-6 text-center transition-colors duration-150">
          <div className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl max-w-md w-full p-8 shadow-2xl space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 dark:border-amber-500/30 text-amber-600 dark:text-crm-amber flex items-center justify-center mx-auto">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Something went wrong</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {friendlyMessage}
            </p>
            {this.state.referenceId && (
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 select-all">
                Reference ID: <span className="font-semibold text-slate-700 dark:text-slate-200">{this.state.referenceId}</span>
              </p>
            )}
            <div className="pt-2 flex gap-2 justify-center">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null, referenceId: null });
                  window.location.reload();
                }}
                className="btn-primary text-xs px-5 py-2.5 gap-2"
              >
                <RefreshCw size={14} /> Reload
              </button>
              <button
                onClick={() => {
                  try {
                    const consent = localStorage.getItem('crm_cookie_consent');
                    const theme = localStorage.getItem('crm_theme');
                    localStorage.clear();
                    if (consent) localStorage.setItem('crm_cookie_consent', consent);
                    if (theme && consent && consent.includes('"preferences":true')) {
                      localStorage.setItem('crm_theme', theme);
                    }
                    sessionStorage.clear();
                  } catch {
                    // ignore
                  }
                  window.history.replaceState(null, '', '/login');
                  window.location.href = '/login';
                }}
                className="btn-ghost text-xs px-4 py-2.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Go to Login
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
