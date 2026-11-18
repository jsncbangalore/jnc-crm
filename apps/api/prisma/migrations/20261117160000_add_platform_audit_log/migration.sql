-- CreateTable
CREATE TABLE IF NOT EXISTS "PlatformAuditLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorName" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "targetTenantId" TEXT,
    "targetTenantCode" TEXT,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'success',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "prevHash" TEXT,
    "hash" TEXT NOT NULL,

    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlatformAuditLog_timestamp_idx" ON "PlatformAuditLog"("timestamp");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlatformAuditLog_action_idx" ON "PlatformAuditLog"("action");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlatformAuditLog_targetTenantId_idx" ON "PlatformAuditLog"("targetTenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlatformAuditLog_targetTenantCode_idx" ON "PlatformAuditLog"("targetTenantCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlatformAuditLog_actorId_idx" ON "PlatformAuditLog"("actorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlatformAuditLog_outcome_idx" ON "PlatformAuditLog"("outcome");
