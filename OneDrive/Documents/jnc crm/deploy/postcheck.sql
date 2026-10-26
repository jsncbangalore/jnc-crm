-- ============================================================================
-- CRM POST-UPGRADE READ-ONLY POSTCHECK AUDIT
-- Target: Supabase Live Database / Staging Database / Rehearsal
-- Mode: Strictly READ-ONLY (SELECT only, zero writes, zero data modifications)
-- Safe to execute in Supabase SQL Editor.
-- Returns PASS or FAIL for each validation check.
-- ============================================================================

WITH checks AS (
  -- Check 1: New columns exist across tables
  SELECT 
    '1. New Columns Presence' AS check_name,
    CASE 
      WHEN (
        SELECT COUNT(*) FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND (
            (table_name = 'Tenant' AND column_name IN ('isInternal', 'webhookKeyHash')) OR
            (table_name = 'User' AND column_name IN ('tokenVersion', 'createdById')) OR
            (table_name = 'Contact' AND column_name IN ('tenantId', 'createdById')) OR
            (table_name = 'Company' AND column_name = 'createdById') OR
            (table_name = 'Lead' AND column_name = 'createdById') OR
            (table_name = 'Supplier' AND column_name = 'createdById')
          )
      ) = 9 THEN 'PASS'
      ELSE 'FAIL'
    END AS status,
    (
      SELECT 'Expected 9 columns, found ' || COUNT(*)::text 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND (
          (table_name = 'Tenant' AND column_name IN ('isInternal', 'webhookKeyHash')) OR
          (table_name = 'User' AND column_name IN ('tokenVersion', 'createdById')) OR
          (table_name = 'Contact' AND column_name IN ('tenantId', 'createdById')) OR
          (table_name = 'Company' AND column_name = 'createdById') OR
          (table_name = 'Lead' AND column_name = 'createdById') OR
          (table_name = 'Supplier' AND column_name = 'createdById')
        )
    ) AS details

  UNION ALL

  -- Check 2: New tables exist
  SELECT 
    '2. Auxiliary Tables Presence' AS check_name,
    CASE 
      WHEN (
        SELECT COUNT(*) FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('PasswordResetToken', 'UsedSelectionToken', 'RefreshSession')
      ) = 3 THEN 'PASS'
      ELSE 'FAIL'
    END AS status,
    (
      SELECT 'Expected 3 tables, found ' || COUNT(*)::text 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('PasswordResetToken', 'UsedSelectionToken', 'RefreshSession')
    ) AS details

  UNION ALL

  -- Check 3: Zero rows with tenantId NULL in core tenant-owned tables
  SELECT 
    '3. Core Tables Tenant Isolation (tenantId NOT NULL)' AS check_name,
    CASE 
      WHEN (
        (SELECT COUNT(*) FROM "Company" WHERE "tenantId" IS NULL) +
        (SELECT COUNT(*) FROM "Lead" WHERE "tenantId" IS NULL) +
        (SELECT COUNT(*) FROM "Supplier" WHERE "tenantId" IS NULL) +
        (SELECT COUNT(*) FROM "Order" WHERE "tenantId" IS NULL) +
        (SELECT COUNT(*) FROM "Invoice" WHERE "tenantId" IS NULL)
      ) = 0 THEN 'PASS'
      ELSE 'FAIL'
    END AS status,
    (
      SELECT 'NULL tenantId counts: Company=' || (SELECT COUNT(*) FROM "Company" WHERE "tenantId" IS NULL)::text ||
             ', Lead=' || (SELECT COUNT(*) FROM "Lead" WHERE "tenantId" IS NULL)::text ||
             ', Supplier=' || (SELECT COUNT(*) FROM "Supplier" WHERE "tenantId" IS NULL)::text ||
             ', Order=' || (SELECT COUNT(*) FROM "Order" WHERE "tenantId" IS NULL)::text ||
             ', Invoice=' || (SELECT COUNT(*) FROM "Invoice" WHERE "tenantId" IS NULL)::text
    ) AS details

  UNION ALL

  -- Check 4: Contact tenantId backfill audit (orphan contacts reported separately)
  SELECT 
    '4. Contact tenantId Backfill (Non-orphan contacts)' AS check_name,
    CASE 
      WHEN (
        SELECT COUNT(*) FROM "Contact" c
        JOIN "Company" comp ON c."companyId" = comp."id"
        WHERE c."tenantId" IS NULL
      ) = 0 THEN 'PASS'
      ELSE 'FAIL'
    END AS status,
    (
      SELECT 'Contacts with company but NULL tenantId: ' || 
        (SELECT COUNT(*) FROM "Contact" c JOIN "Company" comp ON c."companyId" = comp."id" WHERE c."tenantId" IS NULL)::text ||
        '; Orphan contacts (no company): ' ||
        (SELECT COUNT(*) FROM "Contact" WHERE "companyId" IS NULL)::text
    ) AS details

  UNION ALL

  -- Check 5: createdById populated on Company, Contact, Lead, Supplier
  SELECT 
    '5. Record Ownership Backfill (createdById NOT NULL)' AS check_name,
    CASE 
      WHEN (
        (SELECT COUNT(*) FROM "Company" WHERE "createdById" IS NULL) +
        (SELECT COUNT(*) FROM "Contact" WHERE "tenantId" IS NOT NULL AND "createdById" IS NULL) +
        (SELECT COUNT(*) FROM "Lead" WHERE "createdById" IS NULL) +
        (SELECT COUNT(*) FROM "Supplier" WHERE "createdById" IS NULL)
      ) = 0 THEN 'PASS'
      ELSE 'FAIL'
    END AS status,
    (
      SELECT 'NULL createdById counts: Company=' || (SELECT COUNT(*) FROM "Company" WHERE "createdById" IS NULL)::text ||
             ', Contact(scoped)=' || (SELECT COUNT(*) FROM "Contact" WHERE "tenantId" IS NOT NULL AND "createdById" IS NULL)::text ||
             ', Lead=' || (SELECT COUNT(*) FROM "Lead" WHERE "createdById" IS NULL)::text ||
             ', Supplier=' || (SELECT COUNT(*) FROM "Supplier" WHERE "createdById" IS NULL)::text
    ) AS details

  UNION ALL

  -- Check 6: Webhook keys backfilled for all tenants
  SELECT 
    '6. Tenant Webhook Keys Populated' AS check_name,
    CASE 
      WHEN (
        SELECT COUNT(*) FROM "Tenant" WHERE "webhookKeyHash" IS NULL AND "deletedAt" IS NULL
      ) = 0 THEN 'PASS'
      ELSE 'FAIL'
    END AS status,
    (
      SELECT 'Tenants missing webhookKeyHash: ' || 
        (SELECT COUNT(*) FROM "Tenant" WHERE "webhookKeyHash" IS NULL AND "deletedAt" IS NULL)::text
    ) AS details

  UNION ALL

  -- Check 7: Exactly one primary tenant has isInternal = true
  SELECT 
    '7. Primary Internal Tenant Identification' AS check_name,
    CASE 
      WHEN (
        (SELECT COUNT(*) FROM "Tenant" WHERE "isInternal" = true AND "deletedAt" IS NULL) = 1
        AND (
          SELECT COUNT(*) FROM "Tenant" 
          WHERE "isInternal" = true 
            AND "deletedAt" IS NULL
        ) = 1
      ) THEN 'PASS'
      ELSE 'FAIL'
    END AS status,
    (
      SELECT 'Internal tenant count: ' || 
        (SELECT COUNT(*) FROM "Tenant" WHERE "isInternal" = true AND "deletedAt" IS NULL)::text ||
        ' (Code: ' || COALESCE((SELECT code FROM "Tenant" WHERE "isInternal" = true AND "deletedAt" IS NULL LIMIT 1), 'NONE') || ')'
    ) AS details
)
SELECT 
  check_name,
  status,
  details
FROM checks
ORDER BY check_name;
