# JNC-CRM GO-LIVE DEPLOYMENT PROCEDURE & GOVERNANCE GUIDE

## Mandatory Rule
> **Run migrations on the staging project first before applying to live production.**

---

## Production Deployment Order

1. **Database Backup**:
   Run database backup script prior to any migration or deployment:
   ```bash
   npm run db:backup
   ```

2. **Staging Migration & Verification**:
   Execute migration on staging environment credentials first:
   ```bash
   npm run staging:migrate
   npm run staging:status
   ```

3. **Production Migration Deployment**:
   Apply pending Prisma migrations to live production database through `DIRECT_URL` with project-ref safety guard (`EXPECTED_PROJECT_REF` verification):
   ```bash
   npm run migrate:prod
   ```

4. **Security & Row Level Security Audit**:
   Verify that all public database tables have Row Level Security enabled and anonymous queries are rejected:
   ```bash
   npm run live:rls-check
   ```

5. **API & Web Bundle Upload**:
   Build, verify security manifest, package deployment ZIPs, and upload API build bundle (`jnc-crm-api-dist.zip` / `jnc-crm-web-dist.zip`):
   ```bash
   npm run release:pack
   ```
