import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft, LogIn } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  referenceId: string | null;
  pageName: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    referenceId: null,
    pageName: 'CRM Application',
  };

  private static derivePageName(): string {
    if (typeof window === 'undefined') return 'CRM Application';
    const path = window.location.pathname || '';
    const clean = path.replace(/^\//, '').split('/')[0] || 'Dashboard';
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  public static getDerivedStateFromError(error: Error): State {
    const referenceId =
      'ERR-' +
      Date.now().toString(36).toUpperCase() +
      '-' +
      Math.random().toString(36).substring(2, 6).toUpperCase();
    const pageName = ErrorBoundary.derivePageName();
    return { hasError: true, error, referenceId, pageName };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const refId = this.state.referenceId || 'N/A';
    const pageName = this.state.pageName || ErrorBoundary.derivePageName();
    const route = typeof window !== 'undefined' ? window.location.pathname : '/';

    console.error(
      `[ErrorBoundary] Reference ID: ${refId} | Page: ${pageName}\nComponent Stack:`,
      errorInfo?.componentStack,
      '\nError:',
      error
    );

    // Report client error to backend table
    try {
      let userId: string | undefined;
      let tenantId: string | undefined;
      try {
        const stored = localStorage.getItem('crm_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          userId = parsed.id || parsed.userId;
          tenantId = parsed.tenantId;
        }
      } catch {}

      const payload = {
        id: refId,
        route,
        page: pageName,
        message: error?.message || 'Unknown render error',
        componentStack: errorInfo?.componentStack ? errorInfo.componentStack.slice(0, 5000) : undefined,
        buildVersion: '1.2.0',
        userId,
        tenantId,
      };

      const sendReport = (url: string) =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

      sendReport('/api/v1/client-errors').catch(() => {
        sendReport('/client-errors').catch(() => {});
      });
    } catch {}
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
      return 'An unexpected display error occurred while rendering this view. Please try reloading or navigating back.';
    }
    return raw;
  }

  public render() {
    if (this.state.hasError) {
      const friendlyMessage = this.getFriendlyErrorMessage();
      const pageName = this.state.pageName || ErrorBoundary.derivePageName();

      return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#0F1117] flex items-center justify-center p-6 text-center transition-colors duration-150">
          <div className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl max-w-md w-full p-8 shadow-2xl space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 dark:border-amber-500/30 text-amber-600 dark:text-crm-amber flex items-center justify-center mx-auto">
              <AlertTriangle size={32} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Something went wrong</h2>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                Page: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{pageName}</span>
              </p>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {friendlyMessage}
            </p>
            {this.state.referenceId && (
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-600 dark:text-slate-400 select-all">
                Reference ID: <span className="font-bold text-slate-800 dark:text-slate-200">{this.state.referenceId}</span>
              </div>
            )}
            <div className="pt-2 flex flex-wrap gap-2 justify-center">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null, referenceId: null });
                  window.location.reload();
                }}
                className="btn-primary text-xs px-4 py-2 gap-1.5 inline-flex items-center"
              >
                <RefreshCw size={13} /> Reload
              </button>
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null, referenceId: null });
                  if (window.history.length > 1) {
                    window.history.back();
                  } else {
                    window.location.href = '/';
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
              >
                <ArrowLeft size={13} /> Go Back
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
                className="inline-flex items-center gap-1 px-3 py-2 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition"
              >
                <LogIn size={13} /> Login
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
