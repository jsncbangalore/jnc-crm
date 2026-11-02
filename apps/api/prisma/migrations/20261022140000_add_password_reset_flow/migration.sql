-- CreateTable
CREATE TABLE IF NOT EXISTS "PasswordResetFlow" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "lookupHash" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'started',
    "phoneAttempts" INTEGER NOT NULL DEFAULT 0,
    "emailAttempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetFlow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PasswordResetFlow_accountId_idx" ON "PasswordResetFlow"("accountId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PasswordResetFlow_lookupHash_idx" ON "PasswordResetFlow"("lookupHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PasswordResetFlow_expiresAt_idx" ON "PasswordResetFlow"("expiresAt");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PasswordResetFlow_accountId_fkey'
    ) THEN
        ALTER TABLE "PasswordResetFlow" ADD CONSTRAINT "PasswordResetFlow_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
