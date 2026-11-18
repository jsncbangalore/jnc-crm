-- Migration: Remove default LUT bond number and validity from Tenant and Invoice tables
-- Prevents non-SEZ invoices from inheriting hardcoded default LUT details

ALTER TABLE "Tenant" ALTER COLUMN "lutBondNo" DROP DEFAULT;
ALTER TABLE "Tenant" ALTER COLUMN "lutValidity" DROP DEFAULT;

ALTER TABLE "Invoice" ALTER COLUMN "lutBondNo" DROP DEFAULT;
ALTER TABLE "Invoice" ALTER COLUMN "lutValidity" DROP DEFAULT;
