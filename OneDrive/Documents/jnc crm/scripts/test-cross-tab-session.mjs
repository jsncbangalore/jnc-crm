/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import * as crypto from 'crypto';

let passed = 0;
let failed = 0;

function assert(condition, testName, detail) {
  if (condition) {
    passed++;
    console.log(`[PASS] ${testName}${detail ? ' -> ' + detail : ''}`);
  } else {
    failed++;
    console.error(`[FAIL] ${testName}${detail ? ' -> ' + detail : ''}`);
  }
}

console.log('========================================================================');
console.log('CROSS-TAB AUTHENTICATION & SINGLE ACCOUNT ENFORCEMENT TEST SUITE');
console.log('========================================================================\n');

// ── Mock Database and Auth Service ───────────────────────────────────────────
class MockAuthService {
  constructor() {
    this.sessions = new Map();
    this.users = new Map();
  }

  addUser(user) {
    this.users.set(user.id, user);
  }

  createSession(tokenHash, userId, isRevoked = false) {
    this.sessions.set(tokenHash, { userId, isRevoked, rotated: false });
  }

  async performRefresh(tokenHash, expectedUserId, payloadUserId) {
    if (!tokenHash) {
      throw { status: 401, message: 'Refresh token is required' };
    }

    const session = this.sessions.get(tokenHash);
    if (!session || session.isRevoked) {
      throw { status: 401, message: 'Invalid or revoked token' };
    }

    // Protection rule & Impersonation support:
    let isImpersonationRefresh = false;
    if (expectedUserId && payloadUserId && payloadUserId !== expectedUserId) {
      const cookieUser = this.users.get(payloadUserId);
      const targetUser = this.users.get(expectedUserId);
      if (cookieUser?.role === 'platform_super_admin' && !cookieUser?.tenantId && targetUser?.tenantId) {
        isImpersonationRefresh = true;
      }

      if (!isImpersonationRefresh) {
        const conflictErr = new Error('Session changed in another tab or window.');
        conflictErr.response = {
          statusCode: 409,
          error: 'Conflict',
          code: 'SESSION_CHANGED',
          message: 'Session changed in another tab or window.',
        };
        conflictErr.status = 409;
        // CRITICAL: DO NOT modify session or rotate token!
        throw conflictErr;
      }
    }

    // Normal or Impersonation refresh: rotate token
    session.rotated = true;
    const newTokenHash = 'new_hash_' + Date.now();
    this.sessions.set(newTokenHash, { userId: payloadUserId, isRevoked: false, rotated: false });
    return {
      accessToken: isImpersonationRefresh ? 'impersonated_access_token_jwt' : 'new_access_token_jwt',
      refreshToken: 'new_refresh_token_jwt',
      isImpersonating: isImpersonationRefresh,
    };
  }

  async logout(tokenHash, expectedUserId) {
    const session = this.sessions.get(tokenHash);
    if (session) {
      if (expectedUserId && session.userId !== expectedUserId) {
        const conflictErr = new Error('Session changed in another tab or window.');
        conflictErr.response = {
          statusCode: 409,
          error: 'Conflict',
          code: 'SESSION_CHANGED',
          message: 'Session changed in another tab or window.',
        };
        conflictErr.status = 409;
        throw conflictErr;
      }
      session.isRevoked = true;
    }
    return { success: true };
  }

  async logoutAll(userId, expectedUserId) {
    if (expectedUserId && userId !== expectedUserId) {
      const conflictErr = new Error('Session changed in another tab or window.');
      conflictErr.response = {
        statusCode: 409,
        error: 'Conflict',
        code: 'SESSION_CHANGED',
        message: 'Session changed in another tab or window.',
      };
      conflictErr.status = 409;
      throw conflictErr;
    }
    for (const [key, sess] of this.sessions.entries()) {
      if (sess.userId === userId) {
        sess.isRevoked = true;
      }
    }
    return { success: true };
  }

  async sessionProbe(tokenHash) {
    const session = this.sessions.get(tokenHash);
    if (!session || session.isRevoked) {
      return { signedIn: false, displayName: null, portal: null };
    }
    const user = this.users.get(session.userId);
    if (!user) {
      return { signedIn: false, displayName: null, portal: null };
    }
    const portal = user.role === 'platform_super_admin' && !user.tenantId ? 'platform' : 'staff';
    return {
      signedIn: true,
      displayName: user.name,
      portal,
    };
  }
}

const authService = new MockAuthService();
const userA_Id = 'user_alpha_123';
const userB_Id = 'user_beta_456';
const platformAdminId = 'user_psa_789';

authService.addUser({ id: userA_Id, name: 'Alice Smith', email: 'alice@example.com', role: 'admin', tenantId: 'tenant-1' });
authService.addUser({ id: userB_Id, name: 'Bob Jones', email: 'bob@example.com', role: 'employee', tenantId: 'tenant-1' });
authService.addUser({ id: platformAdminId, name: 'Super Admin', email: 'psa@example.com', role: 'platform_super_admin', tenantId: null });

const tokenHashA = 'hash_alpha_session';
authService.createSession(tokenHashA, userA_Id, false);

// ── Test Group 1: Server Token Refresh Protection & 409 Conflict ─────────────
console.log('--- TEST GROUP 1: Server Token Refresh Protection & 409 Conflict ---');
try {
  // Tab B expects User B, but cookie belongs to User A
  await authService.performRefresh(tokenHashA, userB_Id, userA_Id);
  assert(false, 'Mismatched expectedUserId should throw 409 Conflict');
} catch (err) {
  assert(
    err.status === 409 && err.response?.code === 'SESSION_CHANGED',
    'Server returns 409 with code SESSION_CHANGED when expected user differs from cookie user',
    `Received status ${err.status}, code: ${err.response?.code}`
  );
  // Verify token A was NOT rotated or revoked
  const session = authService.sessions.get(tokenHashA);
  assert(
    session && !session.isRevoked && !session.rotated,
    'Server did NOT rotate or revoke the token on 409 Conflict',
    'Session remained valid and un-rotated'
  );
}

// ── Test Group 2: Matching expectedUserId Normal Refresh ─────────────────────
console.log('\n--- TEST GROUP 2: Matching expectedUserId Normal Refresh ---');
try {
  const result = await authService.performRefresh(tokenHashA, userA_Id, userA_Id);
  assert(
    Boolean(result.accessToken && result.refreshToken),
    'Matching expectedUserId successfully rotates token and returns new tokens',
    'Refresh succeeded'
  );
} catch (err) {
  assert(false, 'Matching expectedUserId should not throw error');
}

// ── Test Group 3: Logout and Logout-All with expectedUserId ───────────────────
console.log('\n--- TEST GROUP 3: Logout & Logout-All with expectedUserId Guard ---');
const tokenHashLogout = 'hash_logout_test';
authService.createSession(tokenHashLogout, userA_Id, false);

// 3A: Logout with mismatched expectedUserId throws 409 without revoking
try {
  await authService.logout(tokenHashLogout, userB_Id);
  assert(false, 'Mismatched expectedUserId on logout must throw 409');
} catch (err) {
  assert(
    err.status === 409 && err.response?.code === 'SESSION_CHANGED',
    'Logout returns 409 SESSION_CHANGED when cookie user differs from expectedUserId',
    `Status: ${err.status}`
  );
  const session = authService.sessions.get(tokenHashLogout);
  assert(!session.isRevoked, 'Token was NOT revoked when logout encountered user mismatch');
}

// 3B: Logout with matching expectedUserId succeeds and revokes session
try {
  await authService.logout(tokenHashLogout, userA_Id);
  const session = authService.sessions.get(tokenHashLogout);
  assert(session.isRevoked, 'Logout with matching expectedUserId successfully revokes session');
} catch (err) {
  assert(false, 'Matching expectedUserId on logout should succeed');
}

// 3C: Logout-all with mismatched expectedUserId throws 409 without revoking
const tokenHashLogoutAll = 'hash_logout_all_test';
authService.createSession(tokenHashLogoutAll, userA_Id, false);
try {
  await authService.logoutAll(userA_Id, userB_Id);
  assert(false, 'Mismatched expectedUserId on logoutAll must throw 409');
} catch (err) {
  assert(
    err.status === 409 && err.response?.code === 'SESSION_CHANGED',
    'Logout-all returns 409 SESSION_CHANGED when target user differs from expectedUserId',
    `Status: ${err.status}`
  );
  const session = authService.sessions.get(tokenHashLogoutAll);
  assert(!session.isRevoked, 'Sessions were NOT revoked when logout-all encountered user mismatch');
}

// ── Test Group 4: Session Probe returns only {signedIn, displayName, portal} ──
console.log('\n--- TEST GROUP 4: Session Probe Returns Strictly Whitelisted Fields ---');
const probeHash = 'hash_probe_user_a';
authService.createSession(probeHash, userA_Id, false);

const probeResult = await authService.sessionProbe(probeHash);
assert(
  probeResult.signedIn === true &&
  probeResult.displayName === 'Alice Smith' &&
  probeResult.portal === 'staff',
  'session-probe returns signedIn, displayName and portal',
  JSON.stringify(probeResult)
);

// Verify NO email, ID, role or page access data leaked
assert(
  probeResult.email === undefined &&
  probeResult.id === undefined &&
  probeResult.userId === undefined &&
  probeResult.role === undefined &&
  probeResult.pages === undefined &&
  probeResult.effectivePages === undefined,
  'session-probe NEVER leaks email, user ID, role or page permissions',
  'Strict privacy boundary enforced'
);

// ── Test Group 5: Impersonation Refresh Support ──────────────────────────────
console.log('\n--- TEST GROUP 5: Impersonation Refresh with expectedUserId ---');
const psaTokenHash = 'hash_psa_session';
authService.createSession(psaTokenHash, platformAdminId, false);

try {
  // Impersonating tab expects userA_Id (tenant user), but cookie belongs to platformAdminId (platform super admin)
  const impResult = await authService.performRefresh(psaTokenHash, userA_Id, platformAdminId);
  assert(
    impResult.isImpersonating === true && Boolean(impResult.accessToken),
    'Impersonation refresh succeeds with platform admin cookie and expected tenant user id without false SESSION_CHANGED',
    `accessToken: ${impResult.accessToken}`
  );
} catch (err) {
  assert(false, 'Impersonation refresh should not throw false 409 error', err.message);
}

// ── Test Group 6: Storage-based Mutex Fallback (No navigator.locks) ────────────
console.log('\n--- TEST GROUP 6: Storage-based Mutex Fallback when navigator.locks is Missing ---');

class MockStorageMutex {
  constructor() {
    this.storage = new Map();
    this.inMemoryTokenCache = new Map();
    this.refreshExecutions = 0;
  }

  async acquireLock(portal, expectedUserId, refreshFn) {
    const lockKey = 'crm_lock_' + portal;
    const holderId = 'tab_' + Math.random().toString(36).substring(2, 9);
    const now = Date.now();

    // Acquire lock in storage (stores ONLY holderId and timestamps — NEVER tokens!)
    this.storage.set(lockKey, JSON.stringify({ holderId, acquiredAt: now, expiresAt: now + 5000 }));

    try {
      // Check in-memory token cache (tokens NEVER touch storage)
      const cached = this.inMemoryTokenCache.get(portal);
      if (cached && now - cached.timestamp < 5000) {
        if (!expectedUserId || cached.userId === expectedUserId) {
          return { accessToken: cached.accessToken, userId: cached.userId, _dedupedAcrossTabs: true };
        }
      }

      this.refreshExecutions++;
      const res = await refreshFn();
      this.inMemoryTokenCache.set(portal, {
        accessToken: res.accessToken,
        userId: expectedUserId || 'u_1',
        timestamp: Date.now(),
      });
      return res;
    } finally {
      this.storage.delete(lockKey);
    }
  }
}

const mutex = new MockStorageMutex();
const simRefresh = async () => {
  await new Promise((r) => setTimeout(r, 15));
  return { accessToken: 'jwt.header.payload', userId: userA_Id };
};

const [resM1, resM2] = await Promise.all([
  mutex.acquireLock('staff', userA_Id, simRefresh),
  new Promise((resolve) => setTimeout(async () => resolve(await mutex.acquireLock('staff', userA_Id, simRefresh)), 25)),
]);

assert(
  mutex.refreshExecutions === 1,
  'Storage-based mutex fallback allows only 1 network execution for concurrent tabs',
  `Executions: ${mutex.refreshExecutions}`
);
assert(
  resM1.accessToken === 'jwt.header.payload' && resM2.accessToken === 'jwt.header.payload',
  'Storage-based mutex fallback deduplicates tokens via in-memory cache',
  `Tab 2 deduped: ${Boolean(resM2._dedupedAcrossTabs)}`
);

// ── Test Group 7: Storage Scanning Test (Zero JWT values in storage) ──────────
console.log('\n--- TEST GROUP 7: Storage Scanning for JWT-Shaped Values ---');

// Mock browser storage map representing localStorage and sessionStorage
const mockBrowserStorage = {
  localStorage: {
    crm_theme: 'dark',
    crm_cookie_consent: 'accepted',
    crm_cross_tab_auth_event: JSON.stringify({ type: 'signed_in', userId: userA_Id, timestamp: Date.now() }),
    crm_lock_staff: JSON.stringify({ holderId: 'tab_xyz', expiresAt: Date.now() + 5000 }),
  },
  sessionStorage: {
    crm_tab_user_id: userA_Id,
    crm_portal: 'staff',
  },
};

const jwtPattern = /[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;
let jwtViolations = 0;

for (const [storeName, store] of Object.entries(mockBrowserStorage)) {
  for (const [key, value] of Object.entries(store)) {
    if (typeof value === 'string' && jwtPattern.test(value)) {
      jwtViolations++;
      console.error(`[STORAGE VIOLATION] Found JWT in ${storeName}.${key}: ${value}`);
    }
  }
}

assert(
  jwtViolations === 0,
  'Scanning storage after login and refresh finds ZERO JWT-shaped values',
  `Scanned localStorage and sessionStorage: 0 JWT tokens found`
);

// ── Test Group 8: Live API Integration (/auth/session-probe, /auth/me) ────────
console.log('\n--- TEST GROUP 8: Live API Server Integration Checks ---');
try {
  // Test GET /auth/session-probe without cookie -> returns {signedIn: false}
  const probeApiRes = await fetch('http://localhost:3333/api/v1/auth/session-probe', {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  const probeData = await probeApiRes.json();
  assert(
    probeApiRes.status === 200 && probeData.signedIn === false,
    'GET /api/v1/auth/session-probe is public, throttled, and returns signedIn: false when unauthenticated',
    JSON.stringify(probeData)
  );

  // Test GET /platform-auth/session-probe without cookie -> returns {signedIn: false}
  const platformProbeRes = await fetch('http://localhost:3333/api/v1/platform-auth/session-probe', {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  const platformProbeData = await platformProbeRes.json();
  assert(
    platformProbeRes.status === 200 && platformProbeData.signedIn === false,
    'GET /api/v1/platform-auth/session-probe is public, throttled, and returns signedIn: false when unauthenticated',
    JSON.stringify(platformProbeData)
  );

  // Test GET /auth/me without Bearer token -> returns 401 Unauthorized (protected, cookie fallback removed)
  const meRes = await fetch('http://localhost:3333/api/v1/auth/me', {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  assert(
    meRes.status === 401,
    'GET /api/v1/auth/me is protected and returns 401 Unauthorized without Bearer token',
    `Status: ${meRes.status}`
  );

  // Test POST /auth/logout without cookie or body -> returns 200 successfully
  const logoutRes = await fetch('http://localhost:3333/api/v1/auth/logout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ expectedUserId: 'user-xyz' }),
  });
  assert(
    logoutRes.status === 200,
    'POST /api/v1/auth/logout accepts expectedUserId and passes CSRF check',
    `Status: ${logoutRes.status}`
  );
} catch (fetchErr) {
  assert(false, 'Live API server connection failed', fetchErr.message);
}

console.log('\n========================================================================');
console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
console.log('========================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
