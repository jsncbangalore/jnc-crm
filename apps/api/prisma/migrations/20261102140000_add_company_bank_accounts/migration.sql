-- CreateTable
CREATE TABLE IF NOT EXISTS "CompanyBankAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "holderName" TEXT,
    "accountNumber" TEXT NOT NULL,
    "accountNumberLast4" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "branch" TEXT,
    "upiId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isDocumentDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyBankAccount_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "PaymentRecord" ADD COLUMN IF NOT EXISTS "bankAccountId" TEXT;
ALTER TABLE "PaymentRecord" ADD COLUMN IF NOT EXISTS "bankAccountLabel" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "bankAccountId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "bankAccountDetails" JSONB;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompanyBankAccount_tenantId_idx" ON "CompanyBankAccount"("tenantId");
CREATE INDEX IF NOT EXISTS "CompanyBankAccount_tenantId_isActive_idx" ON "CompanyBankAccount"("tenantId", "isActive");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CompanyBankAccount_tenantId_fkey'
  ) THEN
    ALTER TABLE "CompanyBankAccount" ADD CONSTRAINT "CompanyBankAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
