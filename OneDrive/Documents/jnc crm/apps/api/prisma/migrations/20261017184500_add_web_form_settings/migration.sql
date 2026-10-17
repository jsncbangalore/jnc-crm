-- CreateTable
CREATE TABLE "WebFormSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "brandColor" TEXT NOT NULL DEFAULT '#2563eb',
    "headline" TEXT NOT NULL DEFAULT 'Request a Quote',
    "description" TEXT NOT NULL DEFAULT 'Please fill out the form below and our team will get in touch shortly.',
    "submitButtonText" TEXT NOT NULL DEFAULT 'Submit Inquiry',
    "thankYouTitle" TEXT NOT NULL DEFAULT 'Thank You!',
    "thankYouMessage" TEXT NOT NULL DEFAULT 'Your inquiry has been received. Our team will contact you soon.',
    "redirectUrl" TEXT,
    "products" JSONB NOT NULL DEFAULT '[]',
    "fields" JSONB NOT NULL DEFAULT '{"name":{"show":true,"required":true},"phone":{"show":true,"required":true},"email":{"show":true,"required":false},"company":{"show":true,"required":false},"city":{"show":true,"required":false},"product":{"show":true,"required":false},"quantity":{"show":true,"required":false},"urgency":{"show":true,"required":false},"message":{"show":true,"required":false}}',
    "allowedOrigins" JSONB NOT NULL DEFAULT '[]',
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebFormSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebFormSettings_tenantId_key" ON "WebFormSettings"("tenantId");

-- CreateIndex
CREATE INDEX "WebFormSettings_tenantId_idx" ON "WebFormSettings"("tenantId");

-- AddForeignKey
ALTER TABLE "WebFormSettings" ADD CONSTRAINT "WebFormSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
