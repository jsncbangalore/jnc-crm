-- ==============================================================================
-- MIGRATION FILE PLAN: Canonicalize Quotation Status to 'approved'
-- Target DB: PostgreSQL
-- Safety: IDEMPOTENT, NON-BLOCKING, ZERO-DOWNTIME DATA MIGRATION
-- CAUTION: DO NOT EXECUTE ON ANY PRODUCTION / LIVE DATABASE WITHOUT EXPLICIT SIGN-OFF
-- ==============================================================================

-- Step 1: Update legacy 'accepted' status to canonical 'approved' on Quotation table
UPDATE "Quotation"
SET "status" = 'approved',
    "updatedAt" = NOW()
WHERE "status" = 'accepted';

-- Step 2: Harmonize StatusHistory audit logs for Quotations
UPDATE "StatusHistory"
SET "toStatus" = 'approved'
WHERE "entityType" = 'Quotation'
  AND "toStatus" = 'accepted';

UPDATE "StatusHistory"
SET "fromStatus" = 'approved'
WHERE "entityType" = 'Quotation'
  AND "fromStatus" = 'accepted';

-- Verification query (must return 0 rows):
-- SELECT count(*) FROM "Quotation" WHERE "status" = 'accepted';
