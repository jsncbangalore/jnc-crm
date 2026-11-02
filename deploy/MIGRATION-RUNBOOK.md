# Production Database Migration Runbook

> **Target Version**: 2026.10  
> **Classification**: Standard Zero-Downtime Additive Migration  
> **Security Guard**: Strictly No Live Secrets or Real Credentials Stored in this Document. Use environment variables and placeholders.

---

## 1. Overview & Strategy

This runbook covers the deployment of pending schema migrations:
1. `20261017184500_add_web_form_settings`
2. `20261020093000_add_otp_challenge_and_device_sessions`
3. `20261020103000_add_mail_account_encryption`
4. `20261020110000_add_reset_ticket`
5. `20261020120000_add_email_outbox`
6. `20261020130000_add_two_factor_auth`

All pending schema changes are **strictly additive**:
- New tables are created with `CREATE TABLE IF NOT EXISTS`.
- Altered tables add columns with `NULL` or safe defaults (`DEFAULT CURRENT_TIMESTAMP`, `DEFAULT false`, `DEFAULT 'starttls'`).
- No columns are dropped or renamed.
- No existing production data is destroyed.

---

## 2. Quiet-Hour Migration Window

- **Recommended Window**: Off-peak hours (e.g., 01:00 AM – 03:00 AM local time / weekend maintenance slot).
- **Estimated Execution Time**: < 3 minutes for schema migration; < 10 minutes total rehearsal & verification.
- **Traffic Interruption**: Zero planned downtime. The additive schema allows existing backend processes to continue running uninterrupted while new tables are staged.

---

## 3. Pre-Migration Verification (Read-Only)

Before touching any production service, run the read-only preflight check from your release environment:

```bash
# Connects in read-only transaction mode, audits row counts, pending migrations, unique keys, and RLS
npm run migration:preflight
```

**Verify the Preflight Output**:
- Pending migrations list matches the 6 target migrations.
- Unique constraint checks report `[PASS]` (0 duplicates).
- Row counts on `User`, `Tenant`, `RefreshSession` match expectations.

---

## 4. Production Database Backup

Before applying schema updates, execute a clean pg_dump backup to local or cloud storage.

```bash
# Set environment variables for authentication
export PGPASSWORD="<PROD_DB_PASSWORD>"

# Execute full schema + data pg_dump
pg_dump \
  -h "<PROD_DB_HOST>" \
  -p "<PROD_DB_PORT>" \
  -U "<PROD_DB_USER>" \
  -d "<PROD_DB_NAME>" \
  -F c \
  -b \
  -v \
  -f "backup_pre_migration_$(date +%Y%m%d_%H%M%S).dump"
```

Verify that the generated `.dump` file has a non-zero size and is stored in a secure backup directory.

---

## 5. Rehearsal in Staging / Test Database

Always rehearse the full migration on a fresh test database cloned from the backup:

```bash
# 1. Restore backup into isolated test/staging database
export PGPASSWORD="<STAGING_DB_PASSWORD>"
pg_restore \
  -h "<STAGING_DB_HOST>" \
  -p "<STAGING_DB_PORT>" \
  -U "<STAGING_DB_USER>" \
  -d "<STAGING_DB_NAME>" \
  --clean --if-exists \
  "backup_pre_migration_*.dump"

# 2. Run migrations against staging
DATABASE_URL="postgresql://<STAGING_DB_USER>:<STAGING_DB_PASSWORD>@<STAGING_DB_HOST>:<STAGING_DB_PORT>/<STAGING_DB_NAME>" \
  npx prisma migrate deploy

# 3. Execute test suites against migrated staging DB
npm run test:auth-security
node node_modules/ts-node/dist/bin.js --project apps/api/tsconfig.json scripts/test-outbox-cleanup.ts
```

---

## 6. Production Migration Execution (`migrate:prod`)

### Critical Connection Pooler Note
> [!IMPORTANT]
> When using managed database providers (such as Supabase, AWS RDS, or Render PostgreSQL):
> - **DO NOT** use transaction-level pooler addresses (port `6543`) for DDL migrations.
> - **USE** the direct connection address or session-level pooler address (port `5432`) to support Prisma migration advisory locks and multi-statement transactions.

```bash
# Set direct or session-pooler connection URL
export DATABASE_URL="postgresql://<PROD_DB_USER>:<PROD_DB_PASSWORD>@<PROD_DB_DIRECT_HOST>:5432/<PROD_DB_NAME>?sslmode=require"

# Execute production migrations
npx prisma migrate deploy
```

---

## 7. Post-Migration Security Hardening (RLS & Permissions)

When new tables are created in PostgreSQL (`WebFormSettings`, `OtpChallenge`, `ResetTicket`, `EmailOutbox`, `UserTwoFactor`, `TrustedDevice`, `LoginTicket`), ensure that Supabase Row-Level Security (RLS) is immediately enabled so public Data APIs cannot bypass application tenant isolation.

```bash
# Re-apply the production RLS lockdown script
psql "<PROD_DB_SESSION_URL>" -f deploy/supabase-lockdown.sql

# Verify Row-Level Security on every public table
npm run live:rls-check
```

Confirm that `live:rls-check` reports `100% of public tables have Row-Level Security enabled`.

---

## 8. Deployment Order & Service Rollout

To ensure zero downtime, adhere strictly to the following deployment sequence:

```
Step 1: Database Migration (`npx prisma migrate deploy`)
             ↓
Step 2: Security Hardening (`supabase-lockdown.sql` + `live:rls-check`)
             ↓
Step 3: Backend API Deployment (Render / Container Service)
             ↓
Step 4: Frontend Web Deployment (Static Hosting / CDN)
```

**Why this order?**  
The database schema changes are strictly additive. Deploying the database changes first allows the older backend to continue running smoothly. When the new API backend starts, its Prisma Client finds all required tables and columns already present. Finally, the frontend static assets are updated to present the new UI features.

---

## 9. Production Smoke Tests

Execute immediate smoke verification against the production endpoint:

1. **System Health Check**:
   ```bash
   curl -f -s https://<API_DOMAIN>/api/v1/health
   # Expected: {"status":"ok","version":"1.0.0"}
   ```

2. **Staff Login**:
   - Log in with an administrator account.
   - Verify that session tokens and cookies are issued without `500 Internal server error`.

3. **Public Lead Capture Webhook / Form**:
   ```bash
   curl -X OPTIONS https://<API_DOMAIN>/api/v1/webhooks/inquiry-info/<WEBHOOK_KEY> -i
   # Expected: HTTP 204 No Content with CORS origin headers
   ```

4. **Security Cleanup Verification**:
   ```bash
   node node_modules/ts-node/dist/bin.js --project apps/api/tsconfig.json scripts/test-outbox-cleanup.ts
   # Expected: [PASS] All outbox security & purge assertions passed
   ```

---

## 10. Rollback Decision & Runbook

### Scenario A: Code Issue / Frontend Bug (Additive Schema)
- **Status**: The schema updates (`UserTwoFactor`, `OtpChallenge`, etc.) are purely additive and do not break older code.
- **Action**: **DO NOT roll back the database.** Keep the migrated database schema intact.
- **Rollback Step**: Redeploy the previous stable build of the Backend API and Frontend Web. Older backend queries simply ignore the newly added columns and tables.

### Scenario B: Critical Data Corruption / DDL Failure (Destructive)
- **Status**: Data integrity was compromised or an unrecoverable failure occurred during manual interventions.
- **Action**: Full database point-in-time restore from the pre-migration backup.
- **Rollback Step**:
  ```bash
  export PGPASSWORD="<PROD_DB_PASSWORD>"
  pg_restore \
    -h "<PROD_DB_HOST>" \
    -p "<PROD_DB_PORT>" \
    -U "<PROD_DB_USER>" \
    -d "<PROD_DB_NAME>" \
    --clean --if-exists \
    "backup_pre_migration_<TIMESTAMP>.dump"
  ```
  Then redeploy the previous stable backend release.
