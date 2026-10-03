-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "tenantId" TEXT;

-- Backfill tenantId from Company
UPDATE "Contact" c
SET "tenantId" = comp."tenantId"
FROM "Company" comp
WHERE c."companyId" = comp."id"
  AND c."tenantId" IS NULL;

-- CreateIndex
CREATE INDEX "Contact_tenantId_idx" ON "Contact"("tenantId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
