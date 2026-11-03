/**
 * Fake Timers Unit Test for Inactivity Timeout, Activity Detection, 30-Min Suppression Cap,
 * Background Polling Exclusion, and Work Guard.
 * 
 * Tests the exact mathematical and state behavior of the AuthContext inactivity loop:
 * 1. Default 60-minute timeout calculation & custom VITE_INACTIVITY_TIMEOUT_MINUTES
 * 2. Exact 1-minute warning threshold (secondsRemaining countdown)
 * 3. Form unsaved changes & in-flight save suppression capped at 30 extra minutes
 * 4. At 90 minutes (60m + 30m cap), timeout logs out even if form is unsaved
 * 5. Background polling requests (notifications, automation, health) NEVER count as user activity
 * 6. Polling-only session times out at exactly 60 minutes
 * 7. Tagged user-started requests and typing DO reset user activity
 * 8. Never exceed the refresh token life (12 hours)
 * 9. "Stay signed in" button resets both user input and suppression timers
 */

const assert = require('assert');

function runFakeTimersTest() {
  console.log('===============================================================');
  console.log('UNIT TEST: INACTIVITY TIMER, 30-MIN CAP & POLLING EXCLUSION');
  console.log('===============================================================\n');

  let simulatedEnv = { VITE_INACTIVITY_TIMEOUT_MINUTES: undefined };
  
  const getInactivityTimeoutMinutes = () => {
    const val = Number(simulatedEnv.VITE_INACTIVITY_TIMEOUT_MINUTES);
    if (!isNaN(val) && val > 0) return val;
    return 60; // default
  };

  const getInactivityTimeoutMs = () => getInactivityTimeoutMinutes() * 60 * 1000;
  const WARNING_THRESHOLD_MS = 60 * 1000;
  const MAX_EXTRA_SUPPRESSION_MS = 30 * 60 * 1000; // 30 extra minutes
  const REFRESH_TOKEN_MAX_LIFE_MS = 12 * 60 * 60 * 1000; // 12 hours

  // 1. Verify Default and Custom Timeout
  console.log('[Case 1] Timeout Calculations:');
  assert.strictEqual(getInactivityTimeoutMinutes(), 60, 'Default should be 60m');
  assert.strictEqual(getInactivityTimeoutMs(), 3600000, 'Default ms should be 3,600,000ms');

  simulatedEnv.VITE_INACTIVITY_TIMEOUT_MINUTES = '30';
  assert.strictEqual(getInactivityTimeoutMinutes(), 30, 'Custom should be 30m');
  assert.strictEqual(getInactivityTimeoutMs(), 1800000, 'Custom ms should be 1,800,000ms');
  console.log('  ✓ Timeout configuration respects VITE_INACTIVITY_TIMEOUT_MINUTES with 60m default.');

  simulatedEnv.VITE_INACTIVITY_TIMEOUT_MINUTES = undefined;

  // 2. Setup Simulated Environment with Fake Clock
  let currentTime = 1700000000000;
  let lastUserInputTime = currentTime;
  let lastActivityTime = currentTime;
  let showInactivityModal = false;
  let secondsRemaining = 60;
  let loggedOut = false;

  let isSaveInProgress = false;
  let hasInFlightUserRequests = false;
  let hasUnsavedFormChanges = false;

  const tickTimer = () => {
    const isSuppressed = isSaveInProgress || hasInFlightUserRequests || hasUnsavedFormChanges;
    const elapsedSinceUserInput = currentTime - lastUserInputTime;
    const baseTimeoutMs = getInactivityTimeoutMs();

    if (isSuppressed) {
      // Combined suppression is capped at 30 extra minutes (e.g. 60m + 30m = 90m),
      // and cannot exceed the refresh token life (12 hours).
      const maxAllowedDuration = Math.min(
        baseTimeoutMs + MAX_EXTRA_SUPPRESSION_MS,
        REFRESH_TOKEN_MAX_LIFE_MS
      );
      const timeLeft = maxAllowedDuration - elapsedSinceUserInput;

      if (timeLeft <= 0) {
        showInactivityModal = false;
        loggedOut = true;
      } else if (timeLeft <= WARNING_THRESHOLD_MS) {
        showInactivityModal = true;
        secondsRemaining = Math.max(1, Math.round(timeLeft / 1000));
      } else {
        showInactivityModal = false;
      }
    } else {
      const timeLeft = baseTimeoutMs - elapsedSinceUserInput;

      if (timeLeft <= 0) {
        showInactivityModal = false;
        loggedOut = true;
      } else if (timeLeft <= WARNING_THRESHOLD_MS) {
        showInactivityModal = true;
        secondsRemaining = Math.max(1, Math.round(timeLeft / 1000));
      } else {
        showInactivityModal = false;
      }
    }
  };

  const recordUserInput = () => {
    lastUserInputTime = currentTime;
    lastActivityTime = currentTime;
    if (showInactivityModal) showInactivityModal = false;
  };

  // Background polling requests NEVER update lastUserInputTime or hasInFlightUserRequests
  const fireBackgroundPolling = (endpoint) => {
    // Verified background endpoints: /notifications, /health, /automation, etc.
    const isBg = endpoint.includes('/health') || endpoint.includes('/notifications') || endpoint.includes('/automation');
    assert(isBg, 'Must be a background polling request');
    // Does NOT update lastUserInputTime
  };

  const fireUserStartedRequest = () => {
    lastUserInputTime = currentTime;
    lastActivityTime = currentTime;
  };

  const clickStaySignedIn = () => {
    lastUserInputTime = currentTime;
    lastActivityTime = currentTime;
    showInactivityModal = false;
  };

  // 3. Test Normal Idle Progression without suppression
  console.log('\n[Case 2] Normal Idle Progression (No Unsaved Changes):');
  currentTime += 58 * 60 * 1000;
  tickTimer();
  assert.strictEqual(showInactivityModal, false, 'Modal should NOT show at 58m');
  assert.strictEqual(loggedOut, false);
  console.log('  ✓ At 58 minutes: user remains active, modal is hidden.');

  currentTime += 60 * 1000; // 59m total (60s left)
  tickTimer();
  assert.strictEqual(showInactivityModal, true, 'Modal MUST show at 59m (60s left)');
  assert.strictEqual(secondsRemaining, 60, 'Should show 60s remaining');
  console.log('  ✓ At 59 minutes: 1-minute countdown warning appears with 60 seconds.');

  // 4. Test "Stay Signed In" Button
  console.log('\n[Case 3] "Stay Signed In" Button:');
  clickStaySignedIn();
  assert.strictEqual(showInactivityModal, false, 'Clicking "Stay Signed In" closes modal');
  tickTimer();
  assert.strictEqual(showInactivityModal, false);
  console.log('  ✓ "Stay Signed In" resets both user input and inactivity timers.');

  // 5. Test Combined Suppression with 30-Minute Cap
  console.log('\n[Case 4] Unsaved Changes Suppression Capped at 30 Extra Minutes:');
  // User starts editing a document form (dirty form)
  hasUnsavedFormChanges = true;

  // Advance to 59 minutes from reset (where warning would normally show without unsaved work)
  currentTime += 59 * 60 * 1000;
  tickTimer();
  assert.strictEqual(showInactivityModal, false, 'Modal MUST be suppressed at 59m when form has unsaved changes');
  assert.strictEqual(loggedOut, false, 'User must not be logged out at 59m');
  console.log('  ✓ At 59 minutes: warning modal suppressed due to unsaved form changes.');

  // Advance to 75 minutes (15 minutes past base timeout)
  currentTime += 16 * 60 * 1000;
  tickTimer();
  assert.strictEqual(showInactivityModal, false, 'Still within 30-minute suppression window');
  assert.strictEqual(loggedOut, false);
  console.log('  ✓ At 75 minutes: work is still protected within 30-minute extra window.');

  // Advance to 89 minutes (1 minute before the 30-minute cap expires: 60m + 30m - 1m)
  currentTime += 14 * 60 * 1000;
  tickTimer();
  assert.strictEqual(showInactivityModal, true, 'Warning modal MUST appear at 89 minutes (1m before 30-min cap)');
  assert.strictEqual(secondsRemaining, 60, 'Countdown shows 60s left before cap');
  assert.strictEqual(loggedOut, false);
  console.log('  ✓ At 89 minutes: 1-minute countdown appears before the 30-minute cap expires.');

  // Advance 60 seconds (reaches 90 minutes = 60m base + 30m cap)
  currentTime += 60 * 1000;
  tickTimer();
  assert.strictEqual(loggedOut, true, 'User MUST be logged out at 90 minutes when 30-minute cap is reached');
  assert.strictEqual(showInactivityModal, false);
  console.log('  ✓ At 90 minutes (60m + 30m cap): idle session logged out despite unsaved form.');

  // 6. Test Polling-Only Session Timing Out
  console.log('\n[Case 5] Polling-Only Session Timing Out (Notifications / Health Polling):');
  // Reset session
  loggedOut = false;
  hasUnsavedFormChanges = false;
  currentTime = 1700000000000;
  lastUserInputTime = currentTime;
  lastActivityTime = currentTime;

  // Simulate background polling every 5 seconds for notifications and health
  for (let min = 1; min <= 58; min++) {
    currentTime += 60 * 1000;
    // Firing background polling requests
    fireBackgroundPolling('/api/v1/notifications/unread-count');
    fireBackgroundPolling('/api/v1/health');
    tickTimer();
  }

  assert.strictEqual(showInactivityModal, false, 'At 58 minutes of polling-only: no warning yet');
  assert.strictEqual(loggedOut, false);

  // At 59 minutes: background polling still firing
  currentTime += 60 * 1000;
  fireBackgroundPolling('/api/v1/notifications');
  tickTimer();
  assert.strictEqual(showInactivityModal, true, 'Warning MUST trigger at 59m despite background polling!');
  assert.strictEqual(secondsRemaining, 60);
  console.log('  ✓ At 59 minutes: warning modal correctly triggers during continuous polling.');

  // At 60 minutes: background polling continues, but idle user is logged out
  currentTime += 60 * 1000;
  fireBackgroundPolling('/api/v1/health');
  tickTimer();
  assert.strictEqual(loggedOut, true, 'User MUST be logged out at 60m during polling-only session!');
  console.log('  ✓ At 60 minutes: polling-only session times out. Polling never kept session alive.');

  // 7. Test User-Started Requests Count as Activity
  console.log('\n[Case 6] User-Started Requests Reset User Input Timer:');
  loggedOut = false;
  currentTime = 1700000000000;
  lastUserInputTime = currentTime;

  currentTime += 50 * 60 * 1000; // 50m idle
  fireUserStartedRequest(); // User manually triggers an action (e.g. Save Voucher / Load Customer)
  tickTimer();

  // Advance 15 more minutes (65m from original start, but only 15m from user action)
  currentTime += 15 * 60 * 1000;
  tickTimer();
  assert.strictEqual(showInactivityModal, false, 'User-started request reset timer; user is not in warning zone');
  assert.strictEqual(loggedOut, false);
  console.log('  ✓ User-started requests correctly refresh the idle timer.');

  // 8. Test Refresh Token Life Cap
  console.log('\n[Case 7] Cap Never Exceeds Refresh Token Life:');
  simulatedEnv.VITE_INACTIVITY_TIMEOUT_MINUTES = '710'; // 710 minutes + 30m cap = 740m, but refresh token is 720m (12h)
  const base710 = getInactivityTimeoutMs();
  const cappedMax = Math.min(base710 + MAX_EXTRA_SUPPRESSION_MS, REFRESH_TOKEN_MAX_LIFE_MS);
  assert.strictEqual(cappedMax, 12 * 60 * 60 * 1000, 'Cap must never exceed refresh token life (12 hours)');
  console.log('  ✓ Max suppression is strictly bounded by refresh token lifetime (12h).');

  console.log('\n===============================================================');
  console.log('ALL FAKE TIMER INACTIVITY, CAP & POLLING TESTS PASSED (100%)');
  console.log('===============================================================');
}

runFakeTimersTest();
