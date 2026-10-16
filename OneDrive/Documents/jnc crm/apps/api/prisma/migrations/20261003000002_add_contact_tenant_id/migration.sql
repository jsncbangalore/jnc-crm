-- AlterTable
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Backfill tenantId from Company
UPDATE "Contact" c
SET "tenantId" = comp."tenantId"
FROM "Company" comp
WHERE c."companyId" = comp."id"
  AND c."tenantId" IS NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Contact_tenantId_idx" ON "Contact"("tenantId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Contact_tenantId_fkey') THEN
    ALTER TABLE "Contact" ADD CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
