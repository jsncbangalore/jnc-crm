import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { SESSION_TIMEOUT_COUNTDOWN } from '../../utils/sessionTimeoutConfig';

/**
 * Red banner displayed when the auth context reports that the session has expired.
 * Shows a short countdown (configurable, default 5 seconds) and then triggers the
 * clearSession method which clears storage and redirects to the index page.
 */
export const SessionExpiredBanner: React.FC = () => {
  const { sessionExpired, clearSession } = useAuth();
  const [seconds, setSeconds] = useState(SESSION_TIMEOUT_COUNTDOWN);

  // Start countdown when sessionExpired becomes true
  useEffect(() => {
    if (!sessionExpired) return;
    setSeconds(SESSION_TIMEOUT_COUNTDOWN);
    const timer = setInterval(() => {
      setSeconds((s) => s - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionExpired]);

  // When countdown reaches zero, perform the actual logout/redirect
  useEffect(() => {
    if (sessionExpired && seconds <= 0) {
      clearSession();
    }
  }, [seconds, sessionExpired, clearSession]);

  if (!sessionExpired) return null;

  return (
    <div
      data-testid="session-expired-banner"
      className="bg-red-600 text-white p-3 text-center fixed top-0 inset-x-0 z-[99999] shadow-lg font-semibold text-sm flex items-center justify-center gap-2"
    >
      <span>⚠️ Session timed out – redirecting to sign in in {Math.max(seconds, 0)}s…</span>
    </div>
  );
};

export default SessionExpiredBanner;
