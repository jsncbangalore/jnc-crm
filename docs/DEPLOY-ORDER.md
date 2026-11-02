# Production Deployment Order & Rollout Plan

## Prerequisites & Constraints
- **Prisma Client Binary Targets**: `apps/api/prisma/schema.prisma` includes `debian-openssl-3.0.x` and `native`. Render nodes run Debian 12 / Ubuntu with OpenSSL 3.x.
- **Pre-Deploy Guard**: Render Free tier does not execute `preDeployCommand`. Migrations must be verified and executed using the manual runbook (`docs/MIGRATE-LIVE.md`) or via a paid plan.
- **Zero Secrets**: Never include real tokens, credentials, or customer data in deployment scripts or repositories.

---

## Deployment Steps (Strict Sequence)

### Phase 1: Database Snapshot & Parity Test
1. **Take Backup**: Create a manual snapshot of the live database via provider dashboard or `pg_dump`.
2. **Test on Staging/Dev Copy**:
   - Restore database dump to a separate temporary/staging database.
   - Run `node scripts/render-predeploy-guard.js`.
   - Run `npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma`.
   - Verify `npx prisma migrate status --schema=apps/api/prisma/schema.prisma` returns `Database schema is up to date!`.

### Phase 2: Live Database Migration
3. **Execute Live Migrations**:
   - Follow `docs/MIGRATE-LIVE.md`.
   - Run the pre-deploy guard pointing to live `DIRECT_URL`.
   - Provide manual project reference confirmation.
   - Run `npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma`.
   - Verify `npx prisma migrate status` reports clean state.

### Phase 3: Deploy Backend API
4. **Trigger Render API Deployment**:
   - Ensure Render Settings match:
     - **Build Command**: `npm install --include=dev && npm --workspace=apps/api run build`
     - **Start Command**: `node apps/api/dist/main.js`
   - Trigger Manual Deploy of latest commit on Render dashboard.
5. **Wait for Status: Live**:
   - Monitor deployment logs until Render marks service `Live` and reports:
     `CRM API running at http://localhost:10000/api/v1`

### Phase 4: API Smoke Tests
6. **Verify API Contract Version**:
   - In browser or via curl:
     `GET https://[YOUR-API-DOMAIN]/api/v1/health`
   - Verify JSON payload contains:
     ```json
     {
       "status": "ok",
       "version": "1.2.0",
       "apiVersion": "1.2.0"
     }
     ```
7. **Verify Route Mapping (401 Check)**:
   - Request protected route without token:
     `GET https://[YOUR-API-DOMAIN]/api/v1/ledger/lock`
   - Confirm response status is **HTTP 401 Unauthorized** (NOT 404 "Cannot GET").

### Phase 5: Web Frontend Deployment
8. **Upload Web Build**:
   - Build frontend with matching `REQUIRED_API_VERSION = '1.2.0'`.
   - Deploy bundle to hosting provider / CDN.
9. **Client Refresh**:
   - Open live CRM site.
   - Press **Ctrl+F5** (hard refresh) to bypass browser cache.
   - Confirm no "We are updating the system" banner appears and Ledger / GST document creation works smoothly.
