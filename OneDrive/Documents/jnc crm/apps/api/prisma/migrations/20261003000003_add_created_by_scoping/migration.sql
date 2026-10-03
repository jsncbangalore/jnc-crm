-- AlterTable Company: Add createdById
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- AlterTable Contact: Add createdById
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- AlterTable Lead: Add createdById
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- AlterTable Supplier: Add createdById
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- CreateTable PasswordResetToken
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable UsedSelectionToken
CREATE TABLE IF NOT EXISTS "UsedSelectionToken" (
    "jti" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsedSelectionToken_pkey" PRIMARY KEY ("jti")
);

-- CreateIndexes
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- Add foreign key constraints
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Company_createdById_fkey') THEN
    ALTER TABLE "Company" ADD CONSTRAINT "Company_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Contact_createdById_fkey') THEN
    ALTER TABLE "Contact" ADD CONSTRAINT "Contact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lead_createdById_fkey') THEN
    ALTER TABLE "Lead" ADD CONSTRAINT "Lead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Supplier_createdById_fkey') THEN
    ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PasswordResetToken_userId_fkey') THEN
    ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── BACKFILL createdById FROM EXISTING CREATORS / OWNERS ────────────────────

-- 1. Lead: backfill createdById from assignedToId
UPDATE "Lead"
SET "createdById" = "assignedToId"
WHERE "createdById" IS NULL AND "assignedToId" IS NOT NULL;

-- 2. Company: backfill createdById from associated Lead creator/assignee
UPDATE "Company" c
SET "createdById" = sub."createdById"
FROM (
  SELECT DISTINCT ON ("companyId") "companyId", COALESCE("createdById", "assignedToId") AS "createdById"
  FROM "Lead"
  WHERE "companyId" IS NOT NULL AND (COALESCE("createdById", "assignedToId") IS NOT NULL)
  ORDER BY "companyId", "createdAt" ASC
) sub
WHERE c."id" = sub."companyId"
  AND c."createdById" IS NULL;

-- Fallback Company: backfill from first active user in the same tenant
UPDATE "Company" c
SET "createdById" = u."id"
FROM (
  SELECT DISTINCT ON ("tenantId") "tenantId", "id"
  FROM "User"
  WHERE "deletedAt" IS NULL
  ORDER BY "tenantId", "createdAt" ASC
) u
WHERE c."tenantId" = u."tenantId"
  AND c."createdById" IS NULL;

-- 3. Contact: backfill createdById from Company's createdById
UPDATE "Contact" ct
SET "createdById" = c."createdById"
FROM "Company" c
WHERE ct."companyId" = c."id"
  AND ct."createdById" IS NULL
  AND c."createdById" IS NOT NULL;

-- Fallback Contact: backfill from first active user in the same tenant
UPDATE "Contact" ct
SET "createdById" = u."id"
FROM (
  SELECT DISTINCT ON ("tenantId") "tenantId", "id"
  FROM "User"
  WHERE "deletedAt" IS NULL
  ORDER BY "tenantId", "createdAt" ASC
) u
WHERE ct."tenantId" = u."tenantId"
  AND ct."createdById" IS NULL;

-- 4. Quotation: backfill createdById from Lead if missing
UPDATE "Quotation" q
SET "createdById" = COALESCE(l."createdById", l."assignedToId")
FROM "Lead" l
WHERE q."leadId" = l."id"
  AND q."createdById" IS NULL
  AND (COALESCE(l."createdById", l."assignedToId") IS NOT NULL);

-- 5. Invoice: backfill createdById from Order if missing
UPDATE "Invoice" inv
SET "createdById" = o."createdById"
FROM "Order" o
WHERE inv."orderId" = o."id"
  AND inv."createdById" IS NULL
  AND o."createdById" IS NOT NULL;

-- 6. Supplier: backfill createdById from first active admin in tenant
UPDATE "Supplier" s
SET "createdById" = u."id"
FROM (
  SELECT DISTINCT ON ("tenantId") "tenantId", "id"
  FROM "User"
  WHERE "deletedAt" IS NULL
  ORDER BY "tenantId", "createdAt" ASC
) u
WHERE s."tenantId" = u."tenantId"
  AND s."createdById" IS NULL;
