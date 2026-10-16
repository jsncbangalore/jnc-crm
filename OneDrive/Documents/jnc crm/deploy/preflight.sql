-- ============================================================================
-- JNC-CRM PRE-UPGRADE READ-ONLY PREFLIGHT AUDIT
-- Target: Supabase Live Database / Staging Database / Rehearsal
-- Mode: Strictly READ-ONLY (SELECT only, zero writes, zero data modifications)
-- Safe to execute in Supabase SQL Editor.
-- ============================================================================

-- 1. Table Record Counts
SELECT 'Tenant' AS "table_name", COUNT(*) AS "total_rows" FROM "Tenant"
UNION ALL
SELECT 'User', COUNT(*) FROM "User"
UNION ALL
SELECT 'Company', COUNT(*) FROM "Company"
UNION ALL
SELECT 'Contact', COUNT(*) FROM "Contact"
UNION ALL
SELECT 'Lead', COUNT(*) FROM "Lead"
UNION ALL
SELECT 'Supplier', COUNT(*) FROM "Supplier"
UNION ALL
SELECT 'Order', COUNT(*) FROM "Order"
UNION ALL
SELECT 'Invoice', COUNT(*) FROM "Invoice"
ORDER BY "table_name";

-- 2. Orphan Contacts (Contacts without Company or with invalid Company reference)
SELECT 
  id AS "orphan_contact_id",
  name AS "contact_name",
  email AS "contact_email",
  phone AS "contact_phone",
  "companyId" AS "referenced_company_id",
  "createdAt"
FROM "Contact"
WHERE "companyId" IS NULL 
   OR "companyId" NOT IN (SELECT id FROM "Company")
ORDER BY "createdAt" ASC;

-- 3. Rows with tenantId IS NULL Across Tenant-Owned Tables
SELECT 'Company' AS "table_name", COUNT(*) AS "rows_with_null_tenant" FROM "Company" WHERE "tenantId" IS NULL
UNION ALL
SELECT 'Lead', COUNT(*) FROM "Lead" WHERE "tenantId" IS NULL
UNION ALL
SELECT 'Supplier', COUNT(*) FROM "Supplier" WHERE "tenantId" IS NULL
UNION ALL
SELECT 'Order', COUNT(*) FROM "Order" WHERE "tenantId" IS NULL
UNION ALL
SELECT 'Invoice', COUNT(*) FROM "Invoice" WHERE "tenantId" IS NULL
ORDER BY "table_name";

-- 4. User Distribution by Role
SELECT 
  role,
  COUNT(*) AS "total_users",
  COUNT(CASE WHEN "isActive" THEN 1 END) AS "active_users",
  COUNT(CASE WHEN NOT "isActive" THEN 1 END) AS "inactive_users"
FROM "User"
WHERE "deletedAt" IS NULL
GROUP BY role
ORDER BY "total_users" DESC;

-- 5. Registered Organizations / Tenants
SELECT 
  id AS "tenant_id",
  code AS "tenant_code",
  name AS "tenant_name",
  status AS "tenant_status",
  currency AS "tenant_currency",
  "createdAt"
FROM "Tenant"
WHERE "deletedAt" IS NULL
ORDER BY "createdAt" ASC;

-- 6. Check Presence of October 2026 Upgrade Schema Elements
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'Tenant' AND column_name IN ('isInternal', 'webhookKeyHash')) OR
    (table_name = 'User' AND column_name IN ('tokenVersion', 'createdById')) OR
    (table_name = 'Contact' AND column_name IN ('tenantId', 'createdById')) OR
    (table_name IN ('Company', 'Lead', 'Supplier') AND column_name = 'createdById')
  )
ORDER BY table_name, column_name;

SELECT 
  table_name AS "auxiliary_table_present"
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('PasswordResetToken', 'UsedSelectionToken', 'RefreshSession')
ORDER BY table_name;

-- 7. Cross-Tenant Duplicate Email Accounts
SELECT 
  email,
  COUNT(*) AS "account_count",
  string_agg(DISTINCT "tenantId", ', ') AS "tenant_ids"
FROM "User"
WHERE "deletedAt" IS NULL
GROUP BY email
HAVING COUNT(*) > 1;

-- 8. Current Users Flagged with mustResetPassword = true
SELECT 
  id AS "user_id",
  email,
  "employeeCode",
  role,
  "tenantId",
  "mustResetPassword"
FROM "User"
WHERE "mustResetPassword" = true 
  AND "deletedAt" IS NULL
ORDER BY "tenantId", "employeeCode";
