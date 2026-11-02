-- CreateTable
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "dedupeId" TEXT,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_deliveries_dedupeId_key" ON "webhook_deliveries"("dedupeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "webhook_deliveries_tenantId_status_idx" ON "webhook_deliveries"("tenantId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "webhook_deliveries_status_nextRetryAt_idx" ON "webhook_deliveries"("status", "nextRetryAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'webhook_deliveries_tenantId_fkey'
    ) THEN
        ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
