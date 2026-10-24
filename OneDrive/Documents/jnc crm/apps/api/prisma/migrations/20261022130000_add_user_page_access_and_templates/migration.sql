-- CreateTable
CREATE TABLE IF NOT EXISTS "UserPageAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pages" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPageAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AccessTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pages" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserPageAccess_userId_key" ON "UserPageAccess"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserPageAccess_tenantId_idx" ON "UserPageAccess"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserPageAccess_userId_idx" ON "UserPageAccess"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AccessTemplate_tenantId_name_key" ON "AccessTemplate"("tenantId", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccessTemplate_tenantId_idx" ON "AccessTemplate"("tenantId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserPageAccess_userId_fkey') THEN
    ALTER TABLE "UserPageAccess" ADD CONSTRAINT "UserPageAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserPageAccess_tenantId_fkey') THEN
    ALTER TABLE "UserPageAccess" ADD CONSTRAINT "UserPageAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccessTemplate_tenantId_fkey') THEN
    ALTER TABLE "AccessTemplate" ADD CONSTRAINT "AccessTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
