-- Ensure columns required by schema.prisma exist on all target databases
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "shippingAddress" TEXT;
ALTER TABLE "Invoice" ALTER COLUMN "shippingAddress" TYPE TEXT;

ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "shippingAddress" TEXT;
ALTER TABLE "Quotation" ALTER COLUMN "shippingAddress" TYPE TEXT;

ALTER TABLE "Sku" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Sku" ALTER COLUMN "description" TYPE TEXT;

ALTER TABLE "Sku" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE "Sku" ALTER COLUMN "unit" TYPE TEXT;
