// Configuration for session timeout handling
// Allows customizing the countdown duration (in seconds) before redirecting to login.
// The value can be overridden via the environment variable VITE_SESSION_TIMEOUT_COUNTDOWN.

export const SESSION_TIMEOUT_COUNTDOWN: number = (() => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SESSION_TIMEOUT_COUNTDOWN) {
    const parsed = Number(import.meta.env.VITE_SESSION_TIMEOUT_COUNTDOWN);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  // Default to 5 seconds
  return 5;
})();
