-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "isInternal" BOOLEAN NOT NULL DEFAULT false;

-- Mark internal JNC tenant
UPDATE "Tenant" SET "isInternal" = true WHERE "code" IN ('JNC', 'JNC-ORG-001') OR "id" = 'default-tenant-id';
