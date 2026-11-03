import React, { useState, useEffect } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import {
  getConnectionStatus,
  subscribeConnectionStatus,
  retryConnection,
  ConnectionStatus,
} from '../../services/api';

export const ReconnectingBanner: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>(getConnectionStatus());
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    return subscribeConnectionStatus((newStatus) => {
      setStatus(newStatus);
    });
  }, []);

  if (status.state === 'connected') {
    return null;
  }

  const handleManualRetry = async () => {
    setIsRetrying(true);
    try {
      await retryConnection();
    } catch {
      // Status update will handle the UI state
    } finally {
      setIsRetrying(false);
    }
  };

  if (status.state === 'reconnecting') {
    return (
      <aside
        id="crm-reconnecting-banner"
        aria-live="polite"
        role="status"
        className="sticky top-0 z-[9998] w-full bg-amber-600 dark:bg-amber-700 text-white py-2 px-3 sm:px-4 shadow-md transition-all duration-200"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-xs sm:text-sm font-medium">
          <RefreshCw size={16} className="shrink-0 animate-spin" />
          <span>
            Reconnecting to the server...
            {status.attempt > 0 && (
              <span className="opacity-90 ml-1 text-amber-100 font-normal">
                (attempt {status.attempt} of {status.maxAttempts})
              </span>
            )}
          </span>
        </div>
      </aside>
    );
  }

  if (status.state === 'offline') {
    return (
      <aside
        id="crm-offline-banner"
        aria-live="assertive"
        role="alert"
        className="sticky top-0 z-[9998] w-full bg-rose-600 dark:bg-rose-700 text-white py-2.5 px-3 sm:px-4 shadow-md transition-all duration-200"
      >
        <div className="max-w-7xl mx-auto flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2 font-medium">
            <WifiOff size={16} className="shrink-0 text-rose-200" />
            <span>{status.message || 'Cannot reach the server. Your work is still here.'}</span>
          </div>
          <button
            id="crm-reconnect-retry-btn"
            type="button"
            onClick={handleManualRetry}
            disabled={isRetrying}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1 bg-white text-rose-700 dark:bg-slate-900 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-slate-800 rounded font-semibold text-xs transition shadow-sm disabled:opacity-50 cursor-pointer shrink-0"
          >
            <RefreshCw size={13} className={isRetrying ? 'animate-spin' : ''} />
            <span>{isRetrying ? 'Retrying...' : 'Retry'}</span>
          </button>
        </div>
      </aside>
    );
  }

  return null;
};

export default ReconnectingBanner;
