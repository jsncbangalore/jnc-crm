# Production Release Runbook & Checklist

This document is the definitive checklist for deploying releases to `api.jsnc.co.in` and `admin.jsnc.co.in`.
Follow these steps **strictly in order**.

---

## The Golden Rule of Deployment Order

```
┌────────────────────────────────────────────────────────┐
│ 1. Database Migrations  ──>  2. API Backend  ──>  3. Web Frontend │
└────────────────────────────────────────────────────────┘
```

### Why this order is mandatory (What breaks if you change it):
1. **If you deploy the Website first:**
   - The new website contains code expecting new API routes, modified response contracts, or updated validations.
   - When users interact with the site, the old API returns `404 Not Found`, `400 Bad Request (unrecognized parameter)`, or missing data errors.
2. **If you deploy the API before Migrations:**
   - The new API contains Prisma models with new tables or columns.
   - Any query executing against the unmigrated database immediately crashes with PostgreSQL error code `42703 (column does not exist)` or `42P01 (relation does not exist)`.
   - The `/health/ready` check turns into HTTP 503, rendering the backend degraded.
3. **Safe Order:**
   - **Step 1 (Migrations first):** Database migrations are strictly backwards-compatible (new nullable columns, default values, cascade FKs). The old API continues running smoothly on the migrated DB.
   - **Step 2 (API second):** The new API starts, connects to the migrated database, and begins serving both old and new web client requests.
   - **Step 3 (Website last):** The new website is published and immediately communicates with the already-upgraded API backend.

---

## Pre-Release Checklist

- [ ] **Release Verification Passed Locally:**
  ```bash
  npm run release:verify
  ```
  Ensure all automated suites, brand lock checks, rehearsal migrations, and dist scans pass with zero errors.

---

## Step-by-Step Release Procedure

### Step 1: Back Up the Live Database
Before touching anything in production, generate a full dump of the live database:
```bash
# On your local machine (against your live database credentials via safe manual run)
# or via Supabase / Render dashboard / pg_dump:
pg_dump "$LIVE_DATABASE_URL" -Fc -f "backups/live-pre-deploy-$(date +%Y%m%d%H%M%S).dump"
```
- Verify the backup file exists, is non-empty, and generate a SHA-256 checksum:
  ```bash
  sha256sum backups/live-pre-deploy-*.dump
  ```

### Step 2: Restore the Backup to a Copy
Restore the backup into a staging or rehearsal copy database:
```bash
# Example into staging database:
pg_restore -d "$STAGING_DATABASE_URL" --clean --if-exists backups/live-pre-deploy-*.dump
```

### Step 3: Run All New Migrations on the Copy
Apply the pending migrations to the copy database to prove that they apply cleanly without data loss or lock timeouts:
```bash
DATABASE_URL="$STAGING_DATABASE_URL" DIRECT_URL="$STAGING_DATABASE_URL" npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
```
- Confirm `prisma migrate status` returns `Database schema is up to date!`.

### Step 4: Run Smoke Tests Against the Copy
Point a local API instance to the copy database and run the smoke checks:
```bash
DATABASE_URL="$STAGING_DATABASE_URL" npm run test:all
```
- Confirm all tests pass against the restored copy.

### Step 5: Apply Migrations to the Live Database
Now apply the migrations directly to the live production database:
```bash
DATABASE_URL="$LIVE_DATABASE_URL" DIRECT_URL="$LIVE_DIRECT_URL" npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
```
- Verify the live status:
  ```bash
  DATABASE_URL="$LIVE_DATABASE_URL" DIRECT_URL="$LIVE_DIRECT_URL" npx prisma migrate status --schema=apps/api/prisma/schema.prisma
  ```

### Step 6: Deploy the API & Verify Commit ID
1. In the Render Dashboard, trigger a manual deploy of `jnc-crm-api` from the target commit (or let Git push trigger it).
2. Wait for Render build to complete and show **Live**.
3. Verify the deployment:
   ```bash
   curl -s https://api.jsnc.co.in/api/v1/health | jq
   ```
4. Confirm:
   - `status`: `"ok"`
   - `database`: `"connected"`
   - `commitId`: Matches your expected release commit hash (never `"unknown"`).
   - `migrationState.pendingList`: `[]` (empty array).
   - `migrationState.failedList`: `[]` (empty array).

### Step 7: Verify 2-Step Setup Routes
Test the two 2-factor setup routes with an invalid token to confirm that the endpoint is wired correctly and returns `401 Unauthorized` (never `404 Not Found`):
```bash
# 1. 2FA Status check
curl -s -o /dev/null -w "%{http_code}\n" -X GET https://api.jsnc.co.in/api/v1/auth/2fa-setup/status \
  -H "Authorization: Bearer invalid-probe-token"
# Expected: 401

# 2. 2FA Setup init check
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api.jsnc.co.in/api/v1/auth/2fa-setup/init \
  -H "Authorization: Bearer invalid-probe-token"
# Expected: 401
```

### Step 8: Build and Upload the Website
1. Build the production website with the canonical API URL:
   ```bash
   VITE_API_URL=https://api.jsnc.co.in/api/v1 npm --workspace=apps/web run build
   ```
2. Upload the contents of `apps/web/dist/` to your web server (e.g. cPanel, S3, Netlify, or VPS hosting `admin.jsnc.co.in`).

### Step 9: Post-Deploy Verification
1. Open `https://admin.jsnc.co.in` in your browser.
2. Check the global footer at the bottom of the page:
   - Look for `Build <hash>`.
   - Verify that there is **NO** warning banner showing `⚠️ Build mismatch: Web ... / API ...`.
3. Perform one real test login with an authorized staff account:
   - Verify login completes smoothly.
   - Verify sidebar links appear matching the role.
   - Verify Invoices, Quotations, and Bills load data without errors.

---

## Rollback Procedures

### If Step 5 Fails (Migration fails on live DB):
- Stop immediately. Do NOT deploy the new API or website.
- If the migration failed midway, inspect `_prisma_migrations` on the live database.
- Execute the rollback SQL script corresponding to the failed migration (see Migration Audit).
- Re-run `prisma migrate status` to confirm the database is back in a consistent state.

### If Step 6 Fails (New API crashes or reports degraded):
- In Render Dashboard -> **Deploys**:
  - Click on the previous working deploy.
  - Click **Rollback to this deploy**.
- Because the migrations were backwards-compatible, the previous API version will continue running on the updated database without interruption.

### If Step 8 Fails (Website issues or blank screen):
- Re-upload the previous build artifacts of `apps/web/dist` to your web host.
- The new API backend is backwards-compatible and handles requests from the previous frontend version without issue.
