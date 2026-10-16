-- ============================================================================
-- JNC-CRM POST-BOOTSTRAP READ-ONLY VERIFICATION SCRIPT (LIVE SUPABASE)
-- Target: Fresh Supabase Live Database
-- Mode: Strictly READ-ONLY (SELECT only, zero writes, zero data modifications)
-- Safe to execute directly in Supabase SQL Editor.
-- Output: Summary table with PASS / FAIL per validation check.
-- ============================================================================

WITH checks AS (
  -- Check 1: Row Level Security enabled on EVERY public table (unprotected count must be 0)
  SELECT 
    '1. Row Level Security (RLS) Coverage' AS check_name,
    CASE 
      WHEN (
        SELECT COUNT(*) 
        FROM pg_tables 
        WHERE schemaname = 'public' AND NOT rowsecurity
      ) = 0 THEN 'PASS'
      ELSE 'FAIL'
    END AS status,
    (
      SELECT 'Public tables lacking RLS: ' || COUNT(*)::text 
      FROM pg_tables 
      WHERE schemaname = 'public' AND NOT rowsecurity
    ) AS details

  UNION ALL

  -- Check 2: Exactly one internal tenant JNC
  SELECT 
    '2. Internal JNC Tenant Presence' AS check_name,
    CASE 
      WHEN (
        (SELECT COUNT(*) FROM "Tenant" WHERE "isInternal" = true AND "deletedAt" IS NULL) = 1
        AND (SELECT COUNT(*) FROM "Tenant" WHERE "isInternal" = true AND "code" = 'JNC' AND "deletedAt" IS NULL) = 1
        AND (SELECT "webhookKeyHash" FROM "Tenant" WHERE "code" = 'JNC' LIMIT 1) IS NOT NULL
      ) THEN 'PASS'
      ELSE 'FAIL'
    END AS status,
    (
      SELECT 'Internal tenant count: ' || 
        (SELECT COUNT(*) FROM "Tenant" WHERE "isInternal" = true AND "deletedAt" IS NULL)::text ||
        ' (Code: ' || COALESCE((SELECT code FROM "Tenant" WHERE "isInternal" = true AND "deletedAt" IS NULL LIMIT 1), 'NONE') ||
        ', Has WebhookKey: ' || CASE WHEN (SELECT "webhookKeyHash" FROM "Tenant" WHERE "code" = 'JNC' LIMIT 1) IS NOT NULL THEN 'YES' ELSE 'NO' END || ')'
    ) AS details

  UNION ALL

  -- Check 3: Expected initial user count (exactly 2: owner tenant_admin + platform_super_admin)
  SELECT 
    '3. Initial Seeded User Count' AS check_name,
    CASE 
      WHEN (
        (SELECT COUNT(*) FROM "User" WHERE "deletedAt" IS NULL) = 2
        AND (SELECT COUNT(*) FROM "User" WHERE "role" = 'tenant_admin' AND "deletedAt" IS NULL) = 1
        AND (SELECT COUNT(*) FROM "User" WHERE "role" = 'platform_super_admin' AND "deletedAt" IS NULL) = 1
        AND (SELECT COUNT(*) FROM "User" WHERE "mustResetPassword" = true AND "deletedAt" IS NULL) = 2
      ) THEN 'PASS'
      ELSE 'FAIL'
    END AS status,
    (
      SELECT 'Total users: ' || (SELECT COUNT(*) FROM "User" WHERE "deletedAt" IS NULL)::text ||
             ' (Tenant Admin: ' || (SELECT COUNT(*) FROM "User" WHERE "role" = 'tenant_admin' AND "deletedAt" IS NULL)::text ||
             ', Platform Super Admin: ' || (SELECT COUNT(*) FROM "User" WHERE "role" = 'platform_super_admin' AND "deletedAt" IS NULL)::text ||
             ', mustResetPassword=true: ' || (SELECT COUNT(*) FROM "User" WHERE "mustResetPassword" = true AND "deletedAt" IS NULL)::text || ')'
    ) AS details

  UNION ALL

  -- Check 4: No NULL tenantId on tenant-owned tables
  SELECT 
    '4. Tenant Isolation Integrity (Zero NULL tenantId)' AS check_name,
    CASE 
      WHEN (
        (SELECT COUNT(*) FROM "Company" WHERE "tenantId" IS NULL) +
        (SELECT COUNT(*) FROM "Lead" WHERE "tenantId" IS NULL) +
        (SELECT COUNT(*) FROM "Supplier" WHERE "tenantId" IS NULL) +
        (SELECT COUNT(*) FROM "Order" WHERE "tenantId" IS NULL) +
        (SELECT COUNT(*) FROM "Invoice" WHERE "tenantId" IS NULL) +
        (SELECT COUNT(*) FROM "Contact" WHERE "companyId" IS NOT NULL AND "tenantId" IS NULL)
      ) = 0 THEN 'PASS'
      ELSE 'FAIL'
    END AS status,
    (
      SELECT 'NULL tenantId counts: Company=' || (SELECT COUNT(*) FROM "Company" WHERE "tenantId" IS NULL)::text ||
             ', Lead=' || (SELECT COUNT(*) FROM "Lead" WHERE "tenantId" IS NULL)::text ||
             ', Supplier=' || (SELECT COUNT(*) FROM "Supplier" WHERE "tenantId" IS NULL)::text ||
             ', Order=' || (SELECT COUNT(*) FROM "Order" WHERE "tenantId" IS NULL)::text ||
             ', Invoice=' || (SELECT COUNT(*) FROM "Invoice" WHERE "tenantId" IS NULL)::text ||
             ', Contact(with company)=' || (SELECT COUNT(*) FROM "Contact" WHERE "companyId" IS NOT NULL AND "tenantId" IS NULL)::text
    ) AS details

  UNION ALL

  -- Check 5: Audit log initialized
  SELECT 
    '5. Audit Log Initialization' AS check_name,
    CASE 
      WHEN (SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'PROD_BOOTSTRAP') >= 1 THEN 'PASS'
      ELSE 'FAIL'
    END AS status,
    (
      SELECT 'PROD_BOOTSTRAP audit entries: ' || (SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'PROD_BOOTSTRAP')::text
    ) AS details
)
SELECT 
  check_name,
  status,
  details
FROM checks
ORDER BY check_name;
