-- Migration File: 20261026120000_add_portal_logo_to_tenant
-- Note: MIGRATION FILE ONLY. Pure addition to schema; existing logoUrl remains Document logo.

-- AlterTable: Add optional portal logo URL to Tenant
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "portalLogoUrl" TEXT;
