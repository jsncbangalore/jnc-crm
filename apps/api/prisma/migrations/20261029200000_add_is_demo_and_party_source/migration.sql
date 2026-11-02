
-- AlterTable Tenant
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable Company
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'manual';

-- AlterTable Supplier
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'manual';

-- Mark seeded demo tenants and parties
UPDATE "Tenant" SET "isDemo" = true WHERE code IN ('ACME-DEV-001', 'BETA-DEV-002', 'GAMMA-DEV-003');
UPDATE "Company" SET "isDemo" = true, "source" = 'demo' WHERE name IN ('Acme Logistics Ltd', 'Omni Retail Ventures Ltd', 'Global SEZ Exporters Inc', 'Customer A');
UPDATE "Supplier" SET "isDemo" = true, "source" = 'demo' WHERE name IN ('Apex Raw Metals & Cables', 'Supplier A');
