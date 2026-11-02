-- CreateTable
CREATE TABLE IF NOT EXISTS "ResetTicket" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResetTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ResetTicket_jti_key" ON "ResetTicket"("jti");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ResetTicket_emailNormalized_idx" ON "ResetTicket"("emailNormalized");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ResetTicket_expiresAt_idx" ON "ResetTicket"("expiresAt");
