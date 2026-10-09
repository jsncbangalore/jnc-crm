-- CreateTable
CREATE TABLE "PurchaseBill" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "billDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'received',
    "documentUrl" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseBill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseBill_tenantId_idx" ON "PurchaseBill"("tenantId");

-- CreateIndex
CREATE INDEX "PurchaseBill_billNumber_idx" ON "PurchaseBill"("billNumber");

-- AddForeignKey
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
