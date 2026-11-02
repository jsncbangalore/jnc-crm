-- CreateTable
CREATE TABLE "BrandingAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandingAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandingAsset_tenantId_assetType_key" ON "BrandingAsset"("tenantId", "assetType");

-- CreateIndex
CREATE INDEX "BrandingAsset_tenantId_assetType_idx" ON "BrandingAsset"("tenantId", "assetType");

-- CreateIndex
CREATE INDEX "BrandingAsset_contentHash_idx" ON "BrandingAsset"("contentHash");

-- AddForeignKey
ALTER TABLE "BrandingAsset" ADD CONSTRAINT "BrandingAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
