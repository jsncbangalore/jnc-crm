# Production Rollout Guide: One-Account-Per-Browser Session Management

## Summary
This release implements strict one-account-per-browser session integrity, mutual blocking between company and platform workspaces, in-memory token lifecycle isolation, rate-limited public session probing, and multi-tab conflict resolution with modal alerts.

---

## 1. Rollout Order

Deploy services in the following strict order to ensure zero downtime and uninterrupted user sessions:

### Step 1: Deploy Backend (API Service)
1. **Deploy API Build**:
   - Deploys `@Public()` `GET /api/v1/auth/session-probe` and `GET /api/v1/platform-auth/session-probe` (rate-limited at 60 req/min).
   - Keeps `GET /auth/me` and `GET /platform-auth/me` protected by JWT guard (page permissions preserved).
   - Enforces `expectedUserId` verification during `POST /auth/logout`, `POST /auth/logout-all`, and `POST /auth/refresh`:
     - If the refresh cookie session owner differs from the tab's `expectedUserId`, returns HTTP `409 SESSION_CHANGED` without revoking active sessions.
     - Supports platform super admin company impersonation refreshes without false session conflict errors.
2. **Backward Compatibility**:
   - Older frontend tabs continuing to call `/auth/refresh` or `/auth/me` will continue functioning without breaking.
3. **Database**:
   - Zero database migrations required. No changes to environment variables or schemas.

### Step 2: Deploy Frontend (Web Application)
1. **Deploy Frontend Build**:
   - Migrates access tokens entirely into memory; tokens are never persisted to `localStorage`, `sessionStorage`, or cookies accessible to JavaScript.
   - Activates `BroadcastChannel` in-memory cross-tab token synchronization and the storage-based mutex fallback when `navigator.locks` is unavailable.
   - Updates `/login` and `/platform/login` pages to call `/session-probe` on mount, displaying the "Already signed in" card showing only the display name (no user IDs, emails, or internal roles exposed).
   - Binds browser tabs to `crm_tab_user_id` in `sessionStorage` and displays the `Session Changed` modal whenever another account signs in across tabs.

---

### Step 3: Tab Behavior & Expected Reload on Old Tabs
- **Existing Open Tabs**:
  - When users have tabs open from the previous version, the first refresh attempt after frontend deployment detects the updated contract.
  - Tabs automatically perform a transparent silent refresh or prompt with the `Session Changed` modal instructing the user to click **Reload**.
  - Clicking **Reload** adopts the in-memory architecture immediately without requiring re-entering credentials.

---

## 2. Verification Checklist
- [x] Run backend test suite: `node scripts/test-cross-tab-session.mjs` (18 passing tests).
- [x] Run Playwright browser test suite: `npm run test:e2e-session` (12 passing tests).
- [x] Verify no tokens in storage: storage scan confirms 0 JWT-shaped values in `localStorage` or `sessionStorage`.
- [x] Brand & security audit: `npm run scan:branding` passes with zero violations.

---

## 3. Rollback Strategy
If a rollback is required:
1. Revert Frontend build to the previous release. Old tabs revert to standard refresh flow.
2. Revert Backend build. Zero database rollback needed.
