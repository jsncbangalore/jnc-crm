<!--
--- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
c2pa.action: 'c2pa.created'
c2pa.ai_training: 'disallowed'
c2pa.do_not_train: true
rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
-----------------------------------------------------
-->

# Production Release Order & Rollback Procedures

## Overview

This document defines the strict sequential release process for deploying the CRM platform. To prevent version mismatch errors (such as 404/405 route missing errors, outdated DTO rejections, or frontend "Cannot reach the server" messages), releases MUST strictly adhere to the following execution sequence:

```
[1. Backup] ──> [2. Database Migrations] ──> [3. Backend Deploy] ──> [4. Verify /health] ──> [5. Website Deploy] ──> [6. Postcheck]
```

> **IMPORTANT RULE:** Never deploy the frontend website build before the backend API is deployed and verified with `/health`. If an outdated API is active, the frontend will automatically enter maintenance mode to protect user data.

---

## Step 1: Pre-Release Backup

Before applying any changes, create full backups of both the production database and the currently live frontend/backend build artifacts.

### Actions
1. **Database Snapshot / Dump:**
   Create a point-in-time snapshot or dump of the production database:
   ```bash
   # Create dated database backup
   npm run db:backup
   # Or via pg_dump:
   pg_dump "$DATABASE_URL" -F c -b -v -f "./backups/backup_pre_release_$(date +%Y%m%d_%H%M%S).dump"
   ```
2. **Archive Current Web Build:**
   Save a copy of the currently deployed web assets on the static host / CDN / server into an archive directory (`backup_web_prev/`).

### Rollback Procedure (Step 1)
- If the backup script fails or the database is unreachable, **ABORT THE RELEASE IMMEDIATELY**. Do not proceed to migrations.

---

## Step 2: Database Migrations

Apply pending Prisma schema migrations to bring the database schema into alignment with the new backend release.

### Actions
1. Run Prisma migration deployment:
   ```bash
   npm --workspace=apps/api run prisma:migrate:deploy
   ```
2. Verify migration status:
   ```bash
   npm --workspace=apps/api run prisma:migrate:status
   ```

### Rollback Procedure (Step 2)
- If a migration fails halfway:
  1. Inspect the error log to identify which statement failed.
  2. If data corruption or partial table creation occurred, restore the database dump from Step 1:
     ```bash
     pg_restore -d "$DATABASE_URL" -c -v "./backups/backup_pre_release_<TIMESTAMP>.dump"
     ```
  3. Abort the release and investigate the migration script locally.

---

## Step 3: Backend API Deployment

Deploy the updated backend API service containing the new route handlers, updated services, and backward compatibility shims.

### Actions
1. Trigger backend deployment (e.g., via git push to backend repo or container rebuild on Render/Docker):
   ```bash
   git push backend main
   ```
2. Monitor deployment build logs until the build succeeds and the container health check begins.

### Rollback Procedure (Step 3)
- If the backend fails to build or crash-loops on startup:
  1. Re-deploy the previous known-healthy backend commit or container image in the hosting dashboard.
  2. Because the database migrations are backward-compatible (all new columns and tables are optional or additive), the previous backend version continues to operate normally against the migrated database.

---

## Step 4: Health & Version Verification

Verify that the target API is online, healthy, and reporting the expected version.

### Actions
1. Run the automated release verification script:
   ```bash
   npm run release:verify -- https://api.yourdomain.com/api/v1
   ```
2. Verify the HTTP response manually:
   ```bash
   curl -i https://api.yourdomain.com/api/v1/health
   ```
   **Expected Response (HTTP 200 OK):**
   ```json
   {
     "status": "ok",
     "version": "1.1.0",
     "apiVersion": "1.1.0",
     "features": [
       "auth",
       "rbac",
       "password-reset-flow",
       "two-factor-auth",
       "device-sessions",
       "web-form-settings"
     ]
   }
   ```

### Rollback Procedure (Step 4)
- If `/health` returns an error, HTTP 404, or an `apiVersion` lower than the website's required version:
  1. **DO NOT DEPLOY THE WEBSITE.**
  2. Recheck backend logs to ensure the new build was successfully loaded.
  3. If unresolvable within 5 minutes, roll back the backend to the previous deployment (Step 3 Rollback).

---

## Step 5: Frontend Website Deployment

Once the backend is confirmed running and reporting `apiVersion: 1.1.0` or higher, deploy the frontend web assets.

### Actions
1. Build the production web distribution:
   ```bash
   npm --workspace=apps/web run build
   ```
2. Upload the built `dist/` files (or `frontend.zip`) to the web hosting provider (e.g., Hostinger `public_html/`).
3. Ensure `.htaccess` (or nginx rewrite config) properly routes all client-side paths to `index.html`.

### Rollback Procedure (Step 5)
- If the website displays unexpected rendering issues, asset loading errors, or cache inconsistencies:
  1. Re-upload the previous web build archived in Step 1 to `public_html/`.
  2. Clear the CDN or browser cache.
  3. Because the new backend maintains backward compatibility for one full release cycle (supporting legacy login, refresh, forgot-password, and reset-password contracts without 410 errors), the restored previous website will function seamlessly against the new backend!

---

## Step 6: Post-Deployment Smoke Verification

Perform end-to-end smoke tests against the live deployment:

1. **Health Verification:**
   Verify `GET /api/v1/health` returns status `ok`.
2. **Maintenance Mode Check:**
   Open the login page (`/login`). Ensure NO maintenance banner is visible and form fields are enabled.
3. **Staff Login Flow:**
   Log in with a test user to confirm token exchange and redirection.
4. **Password Reset Flow:**
   Navigate to `/forgot-password`, test looking up a test account, and confirm that no 404 or "Cannot reach the server" errors occur.
5. **Session Refresh:**
   Verify token refresh executes normally with HTTP 200 OK.

---

## Release Compatibility Matrix

| Web Version | Target API Version | Status | Behavior |
|:---|:---|:---|:---|
| `v1.1.0` | `v1.1.0+` | **Compatible** | All features operational. |
| `v1.1.0` | `v1.0.0` (outdated) | **Protected** | Shows maintenance notice: *"We are updating the system. Please try again in a few minutes."* Disables forms to prevent failed submits. |
| `v1.0.0` (previous) | `v1.1.0` (new) | **Backward Compatible** | Legacy routes (`POST /auth/login`, `POST /auth/refresh`, `POST /auth/forgot-password`, `POST /auth/reset-password`) are fully serviced without 410 errors. |

---

## Deploy Safety Startup Guard & Auto-Deploy Policy

### 1. Startup Migration Guard (Production)
The production backend binary includes an automated startup safety guard that executes before listening on the network port:
- Compares compiled migration directories in `prisma/migrations` with the `_prisma_migrations` database table.
- If unapplied (pending) migrations exist, the backend **refuses to start** and exits with code `1`, printing:
  `[STARTUP BLOCKED] Migration safety check failed: X pending database migration(s) detected.`
- This prevents schema mismatch errors, missing column crashes, and table lockup under live user traffic.

### 2. Auto-Deploy Policy
- **CRITICAL:** **Turn OFF Auto-Deploy** on Render / hosting services for the backend repository.
- Auto-deploy triggers backend compilation before database migrations are applied, which activates the startup guard block and triggers an outage loop.
- **Always execute migrations (Step 2) first**, verify with `prisma migrate status`, and only then trigger manual deployment or push to the backend repository.

---

## Legacy Password Reset Deprecation (`LEGACY_RESET_ENABLED`)

- **Environment Variable:** `LEGACY_RESET_ENABLED`
- **Default:** `false` in production.
- **Behavior when `false`:**
  - Old link-based routes `POST /api/v1/auth/forgot-password` and `POST /api/v1/auth/reset-password` return `HTTP 410 Gone`:
    `{"statusCode": 410, "message": "This endpoint has been deprecated. Please use the updated password reset flow."}`
- **Behavior when `true` (temporary grace period):**
  - Allows non-privileged staff accounts to request/reset passwords via the legacy format.
  - Strictly refuses privileged accounts (`platform_super_admin`, `tenant_admin`, `admin`) with `HTTP 403 Forbidden`:
    `{"statusCode": 403, "message": "Admin accounts must use the secure reset flow."}`
  - Enforces all existing IP throttling limits (`@Throttle`).
  - Writes high-priority audit log entries for all legacy reset attempts.
- **Scheduled Removal:** Legacy routes and the `LEGACY_RESET_ENABLED` shim are **scheduled for permanent removal in v2.1**.

---

## Branding Architecture: Document Logo vs. Portal Logo

- **Document Logo:**
  - Used for official financial documents: Invoices, Quotations, Delivery Challans, Credit Notes, Purchase Orders, print templates, and outgoing transactional emails.
  - Stored in `Tenant.logoUrl`.
  - Accessible via `GET /api/v1/settings/branding/logo`.
  - **STRICT RULE:** The public logo endpoint serves only the Document logo and must NOT be used on pre-login or portal header pages.
- **Portal Logo (Optional):**
  - Displayed exclusively in the application portal header after user login.
  - Stored in `Tenant.portalLogoUrl` (added via migration `20261026120000_add_portal_logo_to_tenant`).
  - When unset (default), the portal header displays the company display name as plain text.
  - Managed via `POST /api/v1/settings/branding/portal-logo` and `DELETE /api/v1/settings/branding/portal-logo`.
- **Pre-Login Pages:**
  - The login, platform login, forgot password, reset password, 2-step verification, and already-signed-in pages use ONLY the product brand from build-time configuration (`BRAND_CONFIG`).
  - Pre-login pages NEVER query tenant branding or use cached company data.
