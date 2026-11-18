# Live Database LUT Default Value Correction Runbook

## Background
In migration `20261001000000_init`, the `Tenant` and `Invoice` tables were created with hardcoded default values for `lutBondNo` (`'AD290525013648T'`) and `lutValidity` (`'From : 10/05/2025 To: 09/05/2026'`). As a result:
1. Newly registered tenants inherited this expired LUT bond number by default.
2. Regular, non-SEZ tax invoices inherited this expired LUT bond and printed LUT compliance blocks even when the transaction was purely domestic.
3. SEZ invoices displayed expired validity dates.

## Remediation Objectives
- Remove default values from database columns so newly inserted rows default to `NULL`.
- Nullify hardcoded default LUT values on existing non-SEZ invoices.
- Nullify hardcoded default LUT values on tenants that never configured custom LUT numbers.
- Ensure only genuine SEZ / zero-rated export invoices contain LUT information.

> [!IMPORTANT]
> **Safety Rule**: Never run untested DDL migrations directly against live databases during peak traffic. Perform a snapshot backup first.

---

## Step-by-Step Production Procedure

### Step 1: Pre-Execution Audit (Read-Only)
Run the read-only audit script to observe affected counts:
```bash
node scripts/check-default-lut.js
```
Verify that the output displays counts only and matches expectations.

### Step 2: Database Backup
Take a point-in-time snapshot or standard pg_dump:
```bash
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME -t "Tenant" -t "Invoice" > pre_lut_fix_backup_$(date +%Y%m%d_%H%M%S).sql
```

### Step 3: Execute Schema Migration (Drop Defaults)
Execute migration `apps/api/prisma/migrations/20261118120000_remove_default_lut/migration.sql`:
```sql
BEGIN;

-- Drop defaults so future rows default to NULL
ALTER TABLE "Tenant" ALTER COLUMN "lutBondNo" DROP DEFAULT;
ALTER TABLE "Tenant" ALTER COLUMN "lutValidity" DROP DEFAULT;

ALTER TABLE "Invoice" ALTER COLUMN "lutBondNo" DROP DEFAULT;
ALTER TABLE "Invoice" ALTER COLUMN "lutValidity" DROP DEFAULT;

COMMIT;
```

### Step 4: Data Clean-up (Nullify Stale Defaults)
Clean up non-SEZ invoices and unconfigured tenants:
```sql
BEGIN;

-- 1. Clear default LUT from non-SEZ invoices
UPDATE "Invoice"
SET "lutBondNo" = NULL,
    "lutValidity" = NULL
WHERE "isSez" = false
  AND ("lutBondNo" = 'AD290525013648T' OR "lutValidity" = 'From : 10/05/2025 To: 09/05/2026');

-- 2. Clear default LUT from Tenants who have not explicitly customized it
UPDATE "Tenant"
SET "lutBondNo" = NULL,
    "lutValidity" = NULL
WHERE "lutBondNo" = 'AD290525013648T'
  AND "lutValidity" = 'From : 10/05/2025 To: 09/05/2026';

COMMIT;
```

### Step 5: Post-Execution Verification
Re-run the audit script:
```bash
node scripts/check-default-lut.js
```
Expected output:
- `Tenants with default LUT: 0`
- `Non-SEZ invoices affected: 0`

---

## Rollback Plan
If any operational issue arises, restore the backed-up columns:
```sql
BEGIN;
ALTER TABLE "Tenant" ALTER COLUMN "lutBondNo" SET DEFAULT 'AD290525013648T';
ALTER TABLE "Tenant" ALTER COLUMN "lutValidity" SET DEFAULT 'From : 10/05/2025 To: 09/05/2026';

ALTER TABLE "Invoice" ALTER COLUMN "lutBondNo" SET DEFAULT 'AD290525013648T';
ALTER TABLE "Invoice" ALTER COLUMN "lutValidity" SET DEFAULT 'From : 10/05/2025 To: 09/05/2026';
COMMIT;
```
Or restore from the dump file created in Step 2.
