-- Migration: Add Customer Master, Document Series, Line GST and Document Chain links
-- Created: 2026-10-27T14:00:00Z

-- 1. Quotation: Add customerId, snapshot fields, and orderId link
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "customerName" TEXT;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "customerPhone" TEXT;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "customerEmail" TEXT;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "customerGstin" TEXT;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "customerAddress" TEXT;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "customerState" TEXT;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "orderId" TEXT;

CREATE INDEX IF NOT EXISTS "Quotation_customerId_idx" ON "Quotation"("customerId");

ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_customerId_fkey" 
  FOREIGN KEY ("customerId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. QuotationLine: Add hsnCode, description, gstRate
ALTER TABLE "QuotationLine" ADD COLUMN IF NOT EXISTS "hsnCode" TEXT;
ALTER TABLE "QuotationLine" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "QuotationLine" ADD COLUMN IF NOT EXISTS "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 18.0;

-- 3. Order: Add customerId, snapshot fields
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerGstin" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerAddress" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerState" TEXT;

CREATE INDEX IF NOT EXISTS "Order_customerId_idx" ON "Order"("customerId");

ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" 
  FOREIGN KEY ("customerId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. OrderLine: Add hsnCode, description, discount, gstRate
ALTER TABLE "OrderLine" ADD COLUMN IF NOT EXISTS "hsnCode" TEXT;
ALTER TABLE "OrderLine" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "OrderLine" ADD COLUMN IF NOT EXISTS "discount" DOUBLE PRECISION NOT NULL DEFAULT 0.0;
ALTER TABLE "OrderLine" ADD COLUMN IF NOT EXISTS "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 18.0;

-- 5. Invoice: Add quotationId, customerId
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "quotationId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "customerId" TEXT;

CREATE INDEX IF NOT EXISTS "Invoice_quotationId_idx" ON "Invoice"("quotationId");
CREATE INDEX IF NOT EXISTS "Invoice_customerId_idx" ON "Invoice"("customerId");

-- 6. PaymentRecord: Add customerId, reversalOfId
ALTER TABLE "PaymentRecord" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "PaymentRecord" ADD COLUMN IF NOT EXISTS "reversalOfId" TEXT;

CREATE INDEX IF NOT EXISTS "PaymentRecord_customerId_idx" ON "PaymentRecord"("customerId");
CREATE INDEX IF NOT EXISTS "PaymentRecord_reversalOfId_idx" ON "PaymentRecord"("reversalOfId");

ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_customerId_fkey" 
  FOREIGN KEY ("customerId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_reversalOfId_fkey" 
  FOREIGN KEY ("reversalOfId") REFERENCES "PaymentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. DocumentSeries table
CREATE TABLE IF NOT EXISTS "DocumentSeries" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "docType" TEXT NOT NULL,
  "financialYear" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "nextNumber" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DocumentSeries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentSeries_tenantId_docType_financialYear_key" 
  ON "DocumentSeries"("tenantId", "docType", "financialYear");

CREATE INDEX IF NOT EXISTS "DocumentSeries_tenantId_idx" ON "DocumentSeries"("tenantId");

ALTER TABLE "DocumentSeries" ADD CONSTRAINT "DocumentSeries_tenantId_fkey" 
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
