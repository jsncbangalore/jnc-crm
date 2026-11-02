-- AlterTable User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastPasswordChangeAt" TIMESTAMP(3);

-- AlterTable RefreshSession
ALTER TABLE "RefreshSession" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
ALTER TABLE "RefreshSession" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;
ALTER TABLE "RefreshSession" ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "RefreshSession" ADD COLUMN IF NOT EXISTS "deviceLabel" TEXT;

-- CreateTable OtpChallenge
CREATE TABLE IF NOT EXISTS "OtpChallenge" (
    "id" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'password_reset',
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "resendAfter" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "requestIp" TEXT,
    "requestUserAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OtpChallenge_emailNormalized_idx" ON "OtpChallenge"("emailNormalized");
CREATE INDEX IF NOT EXISTS "OtpChallenge_expiresAt_idx" ON "OtpChallenge"("expiresAt");
