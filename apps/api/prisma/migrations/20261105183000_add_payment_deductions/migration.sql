-- AlterTable
ALTER TABLE "PaymentRecord" ADD COLUMN IF NOT EXISTS "deductions" JSONB;

-- AlterTable
ALTER TABLE "SupplierPayment" ADD COLUMN IF NOT EXISTS "deductions" JSONB;
