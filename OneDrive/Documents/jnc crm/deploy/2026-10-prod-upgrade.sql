-- ============================================================================
-- JNC-CRM PRODUCTION DATABASE UPGRADE (OCTOBER 2026)
-- Target Database: PostgreSQL 14+
-- Safety Guarantee: Non-destructive, single transaction, idempotent (IF NOT EXISTS).
-- ============================================================================

BEGIN;

-- 0. Enable pgcrypto for cryptographic hashes & random tokens
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tenant additions: isInternal flag and webhookKeyHash
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "isInternal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "webhookKeyHash" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_webhookKeyHash_key" ON "Tenant"("webhookKeyHash");

-- Idempotently set Tenant.isInternal = true for internal JNC tenant, and false for all client companies
UPDATE "Tenant"
SET "isInternal" = CASE 
  WHEN "code" IN ('JNC', 'JNC-ORG-001') OR "id" = 'default-tenant-id' THEN true 
  ELSE false 
END;

-- Backfill random webhookKeyHash for existing tenants
UPDATE "Tenant"
SET "webhookKeyHash" = encode(digest(random()::text || clock_timestamp()::text || "id", 'sha256'), 'hex')
WHERE "webhookKeyHash" IS NULL;

-- 2. User additions: tokenVersion and createdById
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- 3. Contact additions: tenantId and createdById
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- Backfill Contact.tenantId from Company
UPDATE "Contact" c
SET "tenantId" = comp."tenantId"
FROM "Company" comp
WHERE c."companyId" = comp."id"
  AND (c."tenantId" IS NULL OR c."tenantId" = '');

-- NOTE: Contacts with no associated company are NOT guessed to avoid cross-tenant contamination.
-- They remain unassigned (tenantId IS NULL) and are reported in the upgrade notice below.

CREATE INDEX IF NOT EXISTS "Contact_tenantId_idx" ON "Contact"("tenantId");
CREATE INDEX IF NOT EXISTS "Contact_createdById_idx" ON "Contact"("createdById");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Contact_tenantId_fkey'
  ) THEN
    ALTER TABLE "Contact"
      ADD CONSTRAINT "Contact_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Contact_createdById_fkey'
  ) THEN
    ALTER TABLE "Contact"
      ADD CONSTRAINT "Contact_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 4. Company: createdById
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
CREATE INDEX IF NOT EXISTS "Company_createdById_idx" ON "Company"("createdById");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Company_createdById_fkey'
  ) THEN
    ALTER TABLE "Company"
      ADD CONSTRAINT "Company_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 5. Lead: createdById
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
CREATE INDEX IF NOT EXISTS "Lead_createdById_idx" ON "Lead"("createdById");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Lead_createdById_fkey'
  ) THEN
    ALTER TABLE "Lead"
      ADD CONSTRAINT "Lead_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 6. Supplier: createdById
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
CREATE INDEX IF NOT EXISTS "Supplier_createdById_idx" ON "Supplier"("createdById");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Supplier_createdById_fkey'
  ) THEN
    ALTER TABLE "Supplier"
      ADD CONSTRAINT "Supplier_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 7. Backfill createdById where possible
-- For Leads: prefer assignedToId if populated
UPDATE "Lead"
SET "createdById" = "assignedToId"
WHERE "createdById" IS NULL AND "assignedToId" IS NOT NULL;

-- For Company/Contact/Lead/Supplier: backfill with first active tenant_admin/admin of the owning tenant
UPDATE "Company" c
SET "createdById" = (
  SELECT u."id" FROM "User" u
  WHERE u."tenantId" = c."tenantId"
    AND u."role" IN ('tenant_admin', 'admin')
    AND u."deletedAt" IS NULL
  ORDER BY u."createdAt" ASC
  LIMIT 1
)
WHERE c."createdById" IS NULL;

UPDATE "Contact" c
SET "createdById" = (
  SELECT u."id" FROM "User" u
  WHERE u."tenantId" = c."tenantId"
    AND u."role" IN ('tenant_admin', 'admin')
    AND u."deletedAt" IS NULL
  ORDER BY u."createdAt" ASC
  LIMIT 1
)
WHERE c."createdById" IS NULL;

UPDATE "Lead" l
SET "createdById" = (
  SELECT u."id" FROM "User" u
  WHERE u."tenantId" = l."tenantId"
    AND u."role" IN ('tenant_admin', 'admin')
    AND u."deletedAt" IS NULL
  ORDER BY u."createdAt" ASC
  LIMIT 1
)
WHERE l."createdById" IS NULL;

UPDATE "Supplier" s
SET "createdById" = (
  SELECT u."id" FROM "User" u
  WHERE u."tenantId" = s."tenantId"
    AND u."role" IN ('tenant_admin', 'admin')
    AND u."deletedAt" IS NULL
  ORDER BY u."createdAt" ASC
  LIMIT 1
)
WHERE s."createdById" IS NULL;

-- 8. Table: PasswordResetToken
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PasswordResetToken_userId_fkey'
  ) THEN
    ALTER TABLE "PasswordResetToken"
      ADD CONSTRAINT "PasswordResetToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 9. Table: UsedSelectionToken
CREATE TABLE IF NOT EXISTS "UsedSelectionToken" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsedSelectionToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UsedSelectionToken_tokenHash_key" ON "UsedSelectionToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "UsedSelectionToken_usedAt_idx" ON "UsedSelectionToken"("usedAt");

-- 10. Table: RefreshSession
CREATE TABLE IF NOT EXISTS "RefreshSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "isRevoked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");
CREATE INDEX IF NOT EXISTS "RefreshSession_userId_idx" ON "RefreshSession"("userId");
CREATE INDEX IF NOT EXISTS "RefreshSession_familyId_idx" ON "RefreshSession"("familyId");
CREATE INDEX IF NOT EXISTS "RefreshSession_expiresAt_idx" ON "RefreshSession"("expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RefreshSession_userId_fkey'
  ) THEN
    ALTER TABLE "RefreshSession"
      ADD CONSTRAINT "RefreshSession_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 11. Read-only notice: Report count of orphan contacts with tenantId NULL
DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM "Contact"
  WHERE "tenantId" IS NULL;

  IF orphan_count > 0 THEN
    RAISE NOTICE 'ATTENTION: % orphan Contact row(s) lack a valid company/tenantId and remain unassigned (tenantId IS NULL). Run scripts/report-orphan-contacts.ts for details.', orphan_count;
  ELSE
    RAISE NOTICE 'SUCCESS: Zero orphan Contact rows detected. All contacts successfully resolved to their owning tenant.';
  END IF;
END $$;

COMMIT;
