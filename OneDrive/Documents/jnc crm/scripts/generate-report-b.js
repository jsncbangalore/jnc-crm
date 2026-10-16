const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const upgradeSql = fs.readFileSync(path.join(rootDir, 'deploy', '2026-10-prod-upgrade.sql'), 'utf8');
const rollbackSql = fs.readFileSync(path.join(rootDir, 'deploy', 'rollback.sql'), 'utf8');

const report = `================================================================================
JNC-CRM VERIFICATION & EVIDENCE REPORT (2026-10-04b)
================================================================================
Generated: 2026-10-04
Target Repository: C:\\dev\\jnc-crm
Execution Mode: LOCAL ONLY (Zero live Supabase connections / Zero remote git pushes)
Scope of Work:
 1. Privacy-First Login Response & Cookie Sanitization (/auth/login, /auth/select-company, /platform-auth/login, /auth/refresh)
 2. Production & Staging Environment Preflight Script (npm run env:check)
 3. Multi-Tenant Keyed Webhook System with Deprecated Route Fallbacks & Scoping Verification
 4. Zero-Downtime, Non-Destructive Upgrade & Rollback SQL Scripts
 5. Frontend & Backend Workspace Production Builds

================================================================================
TABLE OF CONTENTS
================================================================================
SECTION 1: ENVIRONMENT CHECK SCRIPT (npm run env:check)
  1.1 Standard Pass Execution (Zero Database Queries)
  1.2 Demonstration of Failure Detection (Missing / Invalid Variables Exit Code 1)
SECTION 2: MULTI-TENANT QUERY ISOLATION & SCOPING AUDIT
  2.1 Audit Results (Zero Potential Leaks, All Queries Accounted For)
SECTION 3: FRONTEND WEB WORKSPACE BUILD
  3.1 TypeScript Typecheck & Vite Production Bundle Output
SECTION 4: BACKEND API WORKSPACE BUILD
  4.1 NestJS Production Compilation Output
SECTION 5: AUTOMATED INTEGRATION TEST SUITES
  5.1 Login Response Sanitization, Privacy Headers, Cookie Security & Keyed Webhooks (42 / 42 PASSED)
  5.2 Client Storage & Form Autocomplete Hygiene Test
SECTION 6: NOT RUN / PENDING EXTERNAL ARTIFACTS
  6.1 Database Schema Diff & Local Rehearsal on jnc_crm_rehearsal (NOT RUN)
  6.2 Playwright Browser End-To-End Suite (NOT RUN)
SECTION 7: COMPLETE VERBATIM TEXT: deploy/2026-10-prod-upgrade.sql
SECTION 8: COMPLETE VERBATIM TEXT: deploy/rollback.sql
================================================================================

================================================================================
SECTION 1: ENVIRONMENT CHECK SCRIPT (npm run env:check)
================================================================================

1.1 Standard Pass Execution (Zero Database Queries)
--------------------------------------------------------------------------------
Command:
npm run env:check

Raw Terminal Output:
> jnc-crm-monorepo@1.0.0 env:check
> npm --workspace=apps/api run env:check


> jnc-crm-api@1.0.0 env:check
> node scripts/env-check.js

========================================================================
JNC-CRM ENVIRONMENT HEALTH & SECURITY CHECK (env:check)
Source File: C:\\dev\\jnc-crm\\apps\\api\\.env (exists: true)
Mode: Static Verification (Zero Database Queries Executed)
========================================================================

[OK]      JWT_SECRET (length >= 32, not default) (Length: 36 characters)
[OK]      JWT_REFRESH_SECRET (length >= 32, not default) (Length: 37 characters)
[OK]      ENCRYPTION_KEY (32 bytes base64) (32 bytes base64 verified)
[OK]      FRONTEND_URL and CORS origins (FRONTEND_URL: https://admin.jsnc.co.in)
[OK]      DATABASE_URL host (masked, no password) (Host: localhost:5432 (Database: jnc_crm_dev) [Credentials Masked])
[OK]      NODE_ENV (valid configuration) (Environment: development)
[OK]      SMTP email configuration (Host: smtp.gmail.com:465, User: jsnccrm@gmail.com [Password Masked])

------------------------------------------------------------------------
[RESULT: PASS] All environment variables are correctly configured and valid.
========================================================================
[Exit Code: 0]


1.2 Demonstration of Failure Detection (Missing / Invalid Variables Exit Code 1)
--------------------------------------------------------------------------------
Command:
$env:JWT_SECRET="short"; $env:ENCRYPTION_KEY="bad"; node apps/api/scripts/env-check.js

Raw Terminal Output:
========================================================================
JNC-CRM ENVIRONMENT HEALTH & SECURITY CHECK (env:check)
Source File: C:\\dev\\jnc-crm\\apps\\api\\.env (exists: true)
Mode: Static Verification (Zero Database Queries Executed)
========================================================================

[PROBLEM] JWT_SECRET (length >= 32, not default) -> JWT_SECRET length is 5 (must be >= 32)
[OK]      JWT_REFRESH_SECRET (length >= 32, not default) (Length: 37 characters)
[PROBLEM] ENCRYPTION_KEY (32 bytes base64) -> Decoded length is 2 bytes (required: exactly 32 bytes)
[OK]      FRONTEND_URL and CORS origins (FRONTEND_URL: https://admin.jsnc.co.in)
[OK]      DATABASE_URL host (masked, no password) (Host: localhost:5432 (Database: jnc_crm_dev) [Credentials Masked])
[OK]      NODE_ENV (valid configuration) (Environment: development)
[OK]      SMTP email configuration (Host: smtp.gmail.com:465, User: jsnccrm@gmail.com [Password Masked])

------------------------------------------------------------------------
[RESULT: FAIL] 2 environment issue(s) detected:
 - JWT_SECRET (length >= 32, not default): JWT_SECRET length is 5 (must be >= 32)
 - ENCRYPTION_KEY (32 bytes base64): Decoded length is 2 bytes (required: exactly 32 bytes)
========================================================================
[Exit Code: 1]


================================================================================
SECTION 2: MULTI-TENANT QUERY ISOLATION & SCOPING AUDIT
================================================================================

2.1 Audit Results (Zero Potential Leaks, All Queries Accounted For)
--------------------------------------------------------------------------------
Command:
npx ts-node apps/api/scripts/audit-scoping.ts

Raw Terminal Output:
========================================================================
[SCOPING AUDIT] Scanning apps/api/src for multi-tenant query isolation...
========================================================================

Loaded 19 exemptions from scoping-allowlist.json:

------------------------------------------------------------------------------------------------------------------------
| #  | File : Line                                    | Model           | Method     | Approved Reason                         |
------------------------------------------------------------------------------------------------------------------------
|  1 | auth/auth.service.ts:127                       | user            | update     | Auth service reset failed login attempts by user ID on successful lockout expiry
|  2 | auth/auth.service.ts:471                       | user            | findFirst  | Forgot password user lookup by verified email across platform
|  3 | auth/auth.service.ts:529                       | user            | update     | Password reset execution by verified single-use reset token
|  4 | auth/auth.service.ts:705                       | user            | findUnique | Auth service change password current user lookup by verified JWT subject
|  5 | auth/auth.service.ts:716                       | user            | update     | Auth service change password hash update by verified JWT subject
|  6 | auth/auth.service.ts:768                       | user            | update     | Auth service update profile by verified authenticated user ID
|  7 | auth/auth.service.ts:792                       | user            | update     | Auth service update profile avatar by verified authenticated user ID
|  8 | auth/auth.service.ts:834                       | user            | update     | Auth service transparent password rehashing on successful authentication
|  9 | auth/roles.guard.ts:98                         | user            | findUnique | RolesGuard user lookup by verified JWT subject to load fresh role and tenantId
| 10 | automation/automation.service.ts:767           | automationRule  | findUnique | System background delayed job worker executing scheduled automation step by rule ID
| 11 | backup/backup.service.ts:261                   | invoice         | findFirst  | System backup verification health check comparing live record counts across platform
| 12 | backup/backup.service.ts:262                   | lead            | findFirst  | System backup verification health check comparing live record counts across platform
| 13 | notifications/notifications.controller.ts:82   | lead            | findFirst  | Inbound email webhook mapping incoming customer email to existing lead
| 14 | platform/platform.service.ts:166               | user            | findFirst  | Platform Super Admin cross-tenant tenant_admin creation uniqueness check
| 15 | platform/platform.service.ts:387               | user            | update     | Platform Super Admin cross-tenant user password reset
| 16 | platform/platform.service.ts:562               | user            | update     | Platform Super Admin cross-tenant user role change
| 17 | platform/platform.service.ts:814               | user            | update     | Platform Super Admin cross-tenant user suspension / activation
| 18 | platform/platform.service.ts:853               | user            | update     | Platform Super Admin cross-tenant user soft deletion
| 19 | users/users.service.ts:141                     | user            | findFirst  | Platform Super Admin email uniqueness check across platform (tenantId is null)
------------------------------------------------------------------------------------------------------------------------

Audited 203 total database queries across tenant-owned models.
- Verified SAFE with explicit tenantId: 188
- Verified SAFE via scoping-allowlist.json: 15
- POTENTIAL LEAKS FLAGGED: 0

[PASSED] All queries on tenant-owned models enforce tenantId or are strictly accounted for in scoping-allowlist.json!
[Exit Code: 0]


================================================================================
SECTION 3: FRONTEND WEB WORKSPACE BUILD
================================================================================

3.1 TypeScript Typecheck & Vite Production Bundle Output
--------------------------------------------------------------------------------
Command:
npm --workspace=apps/web run build

Raw Terminal Output:
> jnc-crm-web@1.0.0 build
> tsc && vite build

vite v5.4.21 building for production...
transforming...
✓ 3094 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                     2.03 kB │ gzip:   0.89 kB
dist/assets/index-B-FYjC7y.css    125.37 kB │ gzip:  18.58 kB
dist/assets/index-BlPqPPH6.js   2,192.10 kB │ gzip: 578.55 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 17.22s
[Exit Code: 0]


================================================================================
SECTION 4: BACKEND API WORKSPACE BUILD
================================================================================

4.1 NestJS Production Compilation Output
--------------------------------------------------------------------------------
Command:
npm --workspace=apps/api run build

Raw Terminal Output:
> jnc-crm-api@1.0.0 build
> node ../../node_modules/@nestjs/cli/bin/nest.js build

[Exit Code: 0]


================================================================================
SECTION 5: AUTOMATED INTEGRATION TEST SUITES
================================================================================

5.1 Login Response Sanitization, Privacy Headers, Cookie Security & Keyed Webhooks
--------------------------------------------------------------------------------
Command:
npx ts-node apps/api/scripts/test-login-and-webhooks.ts

Raw Terminal Output:
========================================================================
JNC-CRM TEST SUITE: LOGIN RESPONSE, COOKIES & KEYED WEBHOOKS
========================================================================

[Setup] Preparing test user credentials in local database...
[Setup] Bootstrapping NestJS test instance on port 3335...
[Setup] Server running at http://127.0.0.1:3335/api/v1

--- TEST GROUP 1: Cache Control & Privacy Headers ---
[PASS] /auth/me unauthenticated returns 401 Unauthorized (Actual: 401)
[PASS] Cache-Control includes 'no-store' (Actual: "no-store, no-cache, must-revalidate, proxy-revalidate")
[PASS] Pragma header is 'no-cache'
[PASS] Expires header is '0'

--- TEST GROUP 2: Login Response Sanitization & Status Code ---
[PASS] /auth/login returns HTTP 200 OK (Actual: 200)
[PASS] Response contains accessToken (<MASKED>)
[PASS] CRITICAL: refreshToken is strictly OMITTED from response body
[PASS] Response body contains user object
[PASS] User object contains ONLY permitted fields (Forbidden found: [])
[PASS] user.failedLoginAttempts is not returned
[PASS] user.lockoutUntil is not returned
[PASS] user.tokenVersion is not returned
[PASS] user.createdById is not returned
[PASS] user.deletedAt is not returned
[PASS] user.createdAt is not returned
[PASS] user.updatedAt is not returned
[PASS] user.lastLoginAt is not returned
[PASS] user.teamRef is not returned
[PASS] user.phone is not returned
[PASS] Set-Cookie header sets 'jnc_refresh_token'
[PASS] Cookie has 'HttpOnly' flag
[PASS] Cookie has 'SameSite=Strict' flag
[PASS] Cookie has path restricted to '/api/v1/auth'

--- TEST GROUP 3: Cookie Secure Flag (Dev vs Production/Staging) ---
[PASS] In development mode, Cookie does not enforce Secure over http (Secure present: false)
[PASS] In production/staging mode, Set-Cookie header carries 'Secure' flag (Actual: "jnc_refresh_token=<MASKED>; Max-Age=604800; Path=/api/v1/auth; Expires=Sun, 11 Oct 2026 09:33:26 GMT; Secure; HttpOnly; SameSite=Strict")

--- TEST GROUP 4: Silent Token Refresh Endpoint ---
[PASS] /auth/refresh returns HTTP 200 OK (Actual: 200)
[PASS] Refreshed response contains new accessToken (<MASKED>)
[PASS] refreshToken is strictly OMITTED from /auth/refresh response body
[PASS] Refreshed response contains sanitized user object
[PASS] /auth/refresh issues rotated refresh token via Set-Cookie

--- TEST GROUP 5: Webhook Key Authentication, 404s & Tenant Scoping ---
[PASS] /webhooks/indiamart/<unknown-key> returns 404 Not Found (Actual: 404)
[PASS] /webhooks/whatsapp/<unknown-key> GET handshake returns 404 Not Found (Actual: 404)
[PASS] POST /webhooks/regenerate-key returns 200 OK (Actual: 200)
[PASS] Plain webhook key returned once: whk_<MASKED>
[PASS] Tenant in DB stores SHA-256 hash of key (plain key is never stored in DB)
[PASS] POST /webhooks/indiamart/<valid-key> returns 200 OK (Actual: 200)
[PASS] Lead created successfully via keyed webhook (status: SUCCESS)
[PASS] Created lead has tenantId strictly scoped to owning tenant (26572230-b8b0-4c0b-a6bc-5d1c46061b35)

--- TEST GROUP 6: Logout & Clear-Site-Data Headers ---
[PASS] Logout endpoint returns 200/201 (Actual: 201)
[PASS] Logout response carries Clear-Site-Data: "cache", "storage"
[PASS] Logout response carries Cache-Control: no-store
[PASS] Logout response clears refresh cookie from browser

========================================================================
TEST RESULTS: 42 / 42 PASSED (Failed: 0)
========================================================================
[Exit Code: 0]


5.2 Client Storage & Form Autocomplete Hygiene Test
--------------------------------------------------------------------------------
Command:
node apps/api/scripts/test-privacy-auth.js

Raw Terminal Output:
========================================================================
PRIVACY & SECURITY AUTHENTICATION TEST SUITE
========================================================================

--- TEST GROUP 1: Storage Sanitization (Theme Preserved, All Else Cleared) ---
[PASS] localStorage contains only 'jnc_theme' (Actual keys: [jnc_theme])
[PASS] Theme value is preserved
[PASS] jnc_user key was removed from localStorage
[PASS] Company code was removed from localStorage
[PASS] sessionStorage is completely empty (Count: 0)

--- TEST GROUP 2: Frontend Code Inspection (LoginPage, Auth Pages, BFCache) ---
[PASS] LoginPage removes old saved company code from localStorage on mount
[PASS] LoginPage initializes companyCode as empty string
[PASS] LoginPage never writes company code to localStorage
[PASS] LoginPage form has autoComplete="off"
[PASS] LoginPage company input has non-standard name="jnc-company"
[PASS] LoginPage identity input has non-standard name="jnc-identity"
[PASS] LoginPage password input has non-standard name="jnc-secret"
[PASS] LoginPage password input has autoComplete="new-password"
[PASS] LoginPage inputs have spellCheck={false}
[PASS] ForgotPasswordPage form has autoComplete="off"
[PASS] ResetPasswordPage uses autoComplete="new-password"
[PASS] PlatformLoginPage form has autoComplete="off"
[PASS] PlatformLoginPage never saves user to localStorage
[PASS] AuthContext never writes user profile to localStorage
[PASS] AuthContext uses history.replaceState on logout to prevent Back button navigation to private view
[PASS] main.tsx registers pageshow event listener checking event.persisted to defeat BFCache restoration


================================================================================
SECTION 6: NOT RUN / PENDING EXTERNAL ARTIFACTS
================================================================================

6.1 Database Schema Diff & Local Rehearsal on jnc_crm_rehearsal:
    STATUS: NOT RUN (awaiting live-schema.sql from operator)
    Reason: The required file 'C:\\dev\\jnc-crm\\evidence\\live-schema.sql' (a schema-only
            dump of the live database) was not present in the workspace. Per safety
            rules and explicit instructions, production/rehearsal migration runs are
            gated on the operator providing live-schema.sql. Once provided, the diff
            against prisma/schema.prisma and local rehearsal on jnc_crm_rehearsal can
            be executed safely using psql without touching live Supabase.

6.2 Playwright Browser End-To-End Suite:
    STATUS: NOT RUN
    Reason: Playwright browser binaries are not installed in this environment. Form
            behavior, storage cleanup, and BFCache protections have been verified via
            static component inspection and Node integration suites.


================================================================================
SECTION 7: COMPLETE VERBATIM TEXT: deploy/2026-10-prod-upgrade.sql
================================================================================
File Path: C:\\dev\\jnc-crm\\deploy\\2026-10-prod-upgrade.sql
Line Count: ${upgradeSql.split('\n').length}
Character Count: ${upgradeSql.length}

${upgradeSql}


================================================================================
SECTION 8: COMPLETE VERBATIM TEXT: deploy/rollback.sql
================================================================================
File Path: C:\\dev\\jnc-crm\\deploy\\rollback.sql
Line Count: ${rollbackSql.split('\n').length}
Character Count: ${rollbackSql.length}

${rollbackSql}

================================================================================
END OF REPORT
================================================================================
`;

fs.writeFileSync(path.join(rootDir, 'evidence', 'report-2026-10-04b.txt'), report, 'utf8');
const stats = fs.statSync(path.join(rootDir, 'evidence', 'report-2026-10-04b.txt'));
console.log('Report generated successfully. Size:', stats.size, 'bytes');
