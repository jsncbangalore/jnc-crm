-- ============================================================================
-- JNC-CRM DATABASE UPGRADE ROLLBACK SCRIPT (OCTOBER 2026)
-- Target Database: PostgreSQL 14+
-- Safety: Reverses October 2026 schema changes within a single transaction.
-- WARNING: Use only immediately after a failed upgrade; it deletes new columns
--          and the data in them. After real use, restore the backup instead.
-- NOTE: Leaves User.tokenVersion and Tenant.isInternal in place because the live
--       database had them before this upgrade.
-- ============================================================================

BEGIN;

-- 1. Drop foreign key constraints added in upgrade
ALTER TABLE "Contact" DROP CONSTRAINT IF EXISTS "Contact_createdById_fkey";
ALTER TABLE "Contact" DROP CONSTRAINT IF EXISTS "Contact_tenantId_fkey";
ALTER TABLE "Company" DROP CONSTRAINT IF EXISTS "Company_createdById_fkey";
ALTER TABLE "Lead" DROP CONSTRAINT IF EXISTS "Lead_createdById_fkey";
ALTER TABLE "Supplier" DROP CONSTRAINT IF EXISTS "Supplier_createdById_fkey";
ALTER TABLE "PasswordResetToken" DROP CONSTRAINT IF EXISTS "PasswordResetToken_userId_fkey";
ALTER TABLE "RefreshSession" DROP CONSTRAINT IF EXISTS "RefreshSession_userId_fkey";

-- 2. Drop new tables
DROP TABLE IF EXISTS "UsedSelectionToken";
DROP TABLE IF EXISTS "PasswordResetToken";
DROP TABLE IF EXISTS "RefreshSession";

-- 3. Drop indexes
DROP INDEX IF EXISTS "Contact_tenantId_idx";
DROP INDEX IF EXISTS "Contact_createdById_idx";
DROP INDEX IF EXISTS "Company_createdById_idx";
DROP INDEX IF EXISTS "Lead_createdById_idx";
DROP INDEX IF EXISTS "Supplier_createdById_idx";
DROP INDEX IF EXISTS "Tenant_webhookKeyHash_key";

-- 4. Drop added columns
ALTER TABLE "Contact" DROP COLUMN IF EXISTS "tenantId";
ALTER TABLE "Contact" DROP COLUMN IF EXISTS "createdById";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "createdById";
ALTER TABLE "Lead" DROP COLUMN IF EXISTS "createdById";
ALTER TABLE "Supplier" DROP COLUMN IF EXISTS "createdById";
ALTER TABLE "User" DROP COLUMN IF EXISTS "createdById";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "webhookKeyHash";

COMMIT;
