# LIVE AUTHENTICATION ROLLBACK & CONTINGENCY PLAN

## 1. Overview & Scope
This plan details the rollback procedures for cross-origin authentication, refresh token cookie handling, and session rotation between the web frontend (`admin.jsnc.co.in`) and the API backend (`admin.jsnc.co.in/api/v1` or standalone API origin).

---

## 2. Trigger Conditions
Initiate immediate rollback if any of the following occur in production:
1. **Third-Party Cookie Dropping**: Browsers (Safari ITP or Chrome Incognito) block `SameSite=None; Secure` refresh cookies, preventing users from logging in or maintaining sessions.
2. **Infinite Token Refresh Loop**: Clients repeatedly call `POST /auth/refresh` on expired/invalid tokens and loop indefinitely instead of cleanly landing on `/login`.
3. **CORS Preflight Failures**: Cross-origin requests from authorized frontends are rejected with `403 Forbidden` or missing `Access-Control-Allow-Credentials: true`.
4. **Session Invalidation Outage**: `tokenVersion` or `familyId` mismatch invalidates valid sessions for active users.

---

## 3. Rollback Procedures

### Plan A: Environment Variable Hot-Switch (Zero Code Deployment, < 2 Minutes)
If the issue is cookie delivery or SameSite attributes:
1. In the production host/container environment:
   ```bash
   # Fall back from SameSite=None to SameSite=Lax (for same-site/subdomain topologies)
   AUTH_COOKIE_SAME_SITE="Lax"
   
   # Or switch auth token transport to Authorization Header fallback
   AUTH_REFRESH_TRANSPORT="header_and_cookie"
   ```
2. Restart the API process:
   ```bash
   pm2 restart crm-api || systemctl restart crm-api
   ```

### Plan B: Code Rollback via Git (< 5 Minutes)
If regression requires reverting application builds:
1. Roll back the API server to the previous stable release commit:
   ```bash
   git log -n 5 --oneline
   git revert --no-edit <COMMIT_HASH>
   npm run build --prefix apps/api
   pm2 restart crm-api
   ```
2. Roll back the Web frontend distribution:
   ```bash
   npm run build --prefix apps/web
   # Sync dist files to web server docroot:
   rsync -avz apps/web/dist/ /var/www/crm-web/
   ```

### Plan C: Database Session Cleanup (< 1 Minute)
If refresh token families or poisoned session records need resetting:
```sql
-- Connect via psql / migration role
-- deploy/rollback.sql
BEGIN;

-- Reset compromised token versions to force clean relogin without state corruption
UPDATE "User"
SET "tokenVersion" = "tokenVersion" + 1
WHERE "deletedAt" IS NULL;

-- Invalidate all pending refresh sessions
DELETE FROM "Session" WHERE "expiresAt" > NOW();

COMMIT;
```

---

## 4. Post-Rollback Verification Checklist
Execute the automated test suite against the target instance:
- [ ] `node scripts/test-cross-origin-auth.js` -> 5/5 PASSED
- [ ] `GET /api/v1/health` -> HTTP 200 with valid commitId
- [ ] Login test via UI: Clean redirect to `/dashboard`, zero duplicate network requests
- [ ] Direct inspection: `crm_refresh_token` cookie set with `HttpOnly`, valid path, and no loops
- [ ] Public forms (`/inquiry`): Verify submissions succeed without cookies set
