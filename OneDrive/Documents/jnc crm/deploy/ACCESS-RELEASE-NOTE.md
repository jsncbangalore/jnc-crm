# Granular Page Access Control — Release & Deployment Runbook

**Release Version:** v1.1.0-page-access  
**Scope:** Strict server-enforced granular page access control, canonical page registry (20 company pages + 3 platform pages), atomic migration helper, and cross-module scoping.

---

## 1. Deployment Overview & Execution Order

Deployments must follow this sequential, zero-downtime execution order:

```
[1. Database Migration]
          ↓
[2. Migration Helper Dry-Run]
          ↓
[3. Migration Helper Execute]
          ↓
[4. Dual Deployment: Backend & Frontend]
          ↓
[5. Role-Based Smoke Verification]
```

---

## 2. Step 1: Database Migration

Apply the pending schema migration for page access tables:
- `UserPageAccess` (unique `userId`, `tenantId`, `pages` JSON array)
- `AccessTemplate` (template presets for roles/departments)

```bash
# Run migration on database
npx prisma migrate deploy
```

> **Note:** The migration only adds new non-breaking tables. It does not alter or lock existing business entity tables (`Lead`, `Order`, `Invoice`, etc.).

---

## 3. Step 2: Migration Helper Dry-Run

Verify candidate users and team module lists without performing any database writes:

```bash
node scripts/migrate-user-page-access.ts --dry-run
```

- Verify the output summary table:
  - Role-level counts only (no user emails, names, or IDs displayed)
  - Number of existing users preserved vs. newly queued
  - Legacy `Team.allowedPages` mapped to canonical keys (e.g., `daily-activities` → `daily_activities`, `purchase-bills` → `purchase_bills`)

---

## 4. Step 3: Migration Helper Execute

Execute atomic backfill and team normalizations:

```bash
node scripts/migrate-user-page-access.ts --execute
```

- All updates execute inside a single `$transaction`.
- **Idempotency Guarantee:** Pre-existing `UserPageAccess` records are strictly preserved and never overwritten.
- Re-running the script immediately reports 0 writes.

---

## 5. Step 4: Coordinated Backend & Frontend Deployment

Deploy the API server and Web application simultaneously:

```bash
# 1. API build & restart
npm --workspace=apps/api run build
pm2 reload api-server # or systemctl restart crm-api

# 2. Frontend build & upload
npm --workspace=apps/web run build
# Deploy dist/ to hosting static root / CDN
```

---

## 6. Step 5: Role Smoke Tests

Perform verification using non-production test accounts for the 4 core business personas:

### A. Sales Representative (`employee`)
1. **Login:** Verify landing page directs to `/leads`.
2. **Navigation:** Verify sidebar and global launcher display only Sales items (`leads`, `lead_flow`, `quotations`, `orders`, `dashboard`, `notifications`). Operations & Finance links (`invoices`, `inventory`, `suppliers`, `purchase_bills`, `users`, `audit_logs`) are hidden.
3. **Direct URL Protection:** Attempt to navigate directly to `/invoices` or `/users` → Verify HTTP 403 response with `pageKey` and redirection back to first allowed page.
4. **Data Isolation:**
   - In Leads detail: related `quotations` appear; unrelated invoice links are absent.
   - Global Quick Add (+) displays only `New Lead / Customer`.
   - Global search filters results to permitted modules only.

### B. Store Manager (`store_manager`)
1. **Login:** Verify landing page directs to `/inventory`.
2. **Navigation:** Sidebar displays Operations items (`inventory`, `suppliers`, `purchase_bills`, `orders`, `shipments`, `dashboard`, `notifications`). Sales (`leads`, `quotations`) and Admin menus (`users`, `audit_logs`, `branding`) are absent.
3. **Direct URL Protection:** Attempt to navigate to `/users` or `/setup` → Blocked with 403 `pageKey`.
4. **Data Isolation:**
   - Suppliers and Inventory stock positions load correctly.
   - Quotation conversion buttons are omitted.

### C. Accountant (`finance` / `accountant`)
1. **Login:** Verify landing page directs to `/invoices`.
2. **Navigation:** Displays Finance & Operations ledgers (`invoices`, `purchase_bills`, `suppliers`, `quotations`, `orders`, `dashboard`, `notifications`). System administration pages (`users`, `teams`, `branding`, `mail_settings`) are omitted.
3. **Data Scoping:**
   - Customer account profile: Invoice histories load; non-finance fields and administrative actions are hidden.
   - Dashboard cards: Unpaid invoices and revenue KPIs display properly.

### D. Company Administrator (`tenant_admin` / `admin`)
1. **Login:** Full access to all 20 company CRM modules.
2. **User Management:**
   - In `Users > Permissions`, granular page toggle UI loads with 5 groups: Sales, Operations, Finance, Work, Admin.
   - Admin can save custom page overrides for any staff user.
   - Sub-admins cannot grant admin pages (`users`, `teams`, `audit_logs`, `automation`, `branding`, `mail_settings`).
   - Sales reps granted the `users` page cannot edit or demote administrators (strict rank hierarchy).

---

## 7. Rollback Procedure

If unexpected regressions occur, execute rollback in reverse:

```sql
-- 1. Clear newly populated page access rows
TRUNCATE TABLE "UserPageAccess";
TRUNCATE TABLE "AccessTemplate";
```

```bash
# 2. Redeploy previous stable backend and frontend release tags
git checkout <previous-stable-tag>
npm --workspace=apps/api run build
npm --workspace=apps/web run build
pm2 reload api-server
```

> **State Integrity:** Deleting `UserPageAccess` rows restores the previous team-based fallback rules with zero impact on operational business data (leads, invoices, quotations, orders, inventory remain completely intact).
