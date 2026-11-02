-- AlterTable PurchaseBill
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "invoiceDateReal" TIMESTAMP(3);
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid';

-- CreateTable LedgerEntry
CREATE TABLE IF NOT EXISTS "LedgerEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partyType" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "financialYear" TEXT NOT NULL,
    "voucherType" TEXT NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "particulars" TEXT NOT NULL,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "reversalOfId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable PartyOpeningBalance
CREATE TABLE IF NOT EXISTS "PartyOpeningBalance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partyType" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "side" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartyOpeningBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable SupplierPayment
CREATE TABLE IF NOT EXISTS "SupplierPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(14,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'NEFT',
    "reference" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable PaymentAllocation
CREATE TABLE IF NOT EXISTS "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentType" TEXT NOT NULL,
    "paymentRecordId" TEXT,
    "supplierPaymentId" TEXT,
    "invoiceId" TEXT,
    "purchaseBillId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable LedgerLock
CREATE TABLE IF NOT EXISTS "LedgerLock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "lockedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LedgerEntry_tenantId_sourceType_sourceId_voucherType_key" ON "LedgerEntry"("tenantId", "sourceType", "sourceId", "voucherType");
CREATE INDEX IF NOT EXISTS "LedgerEntry_tenantId_partyType_partyId_entryDate_idx" ON "LedgerEntry"("tenantId", "partyType", "partyId", "entryDate");
CREATE INDEX IF NOT EXISTS "LedgerEntry_tenantId_financialYear_idx" ON "LedgerEntry"("tenantId", "financialYear");
CREATE INDEX IF NOT EXISTS "LedgerEntry_tenantId_voucherType_voucherNo_idx" ON "LedgerEntry"("tenantId", "voucherType", "voucherNo");

CREATE UNIQUE INDEX IF NOT EXISTS "PartyOpeningBalance_tenantId_partyType_partyId_financialYear_key" ON "PartyOpeningBalance"("tenantId", "partyType", "partyId", "financialYear");
CREATE INDEX IF NOT EXISTS "PartyOpeningBalance_tenantId_financialYear_idx" ON "PartyOpeningBalance"("tenantId", "financialYear");

CREATE UNIQUE INDEX IF NOT EXISTS "SupplierPayment_tenantId_paymentNumber_key" ON "SupplierPayment"("tenantId", "paymentNumber");
CREATE INDEX IF NOT EXISTS "SupplierPayment_tenantId_supplierId_idx" ON "SupplierPayment"("tenantId", "supplierId");

CREATE INDEX IF NOT EXISTS "PaymentAllocation_tenantId_invoiceId_idx" ON "PaymentAllocation"("tenantId", "invoiceId");
CREATE INDEX IF NOT EXISTS "PaymentAllocation_tenantId_purchaseBillId_idx" ON "PaymentAllocation"("tenantId", "purchaseBillId");
CREATE INDEX IF NOT EXISTS "PaymentAllocation_paymentRecordId_idx" ON "PaymentAllocation"("paymentRecordId");
CREATE INDEX IF NOT EXISTS "PaymentAllocation_supplierPaymentId_idx" ON "PaymentAllocation"("supplierPaymentId");

CREATE UNIQUE INDEX IF NOT EXISTS "LedgerLock_tenantId_key" ON "LedgerLock"("tenantId");

CREATE INDEX IF NOT EXISTS "PurchaseBill_supplierId_idx" ON "PurchaseBill"("supplierId");

-- AddForeignKey
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartyOpeningBalance" ADD CONSTRAINT "PartyOpeningBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentRecordId_fkey" FOREIGN KEY ("paymentRecordId") REFERENCES "PaymentRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_purchaseBillId_fkey" FOREIGN KEY ("purchaseBillId") REFERENCES "PurchaseBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LedgerLock" ADD CONSTRAINT "LedgerLock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LedgerLock" ADD CONSTRAINT "LedgerLock_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
