-- CreateTable
CREATE TABLE "PurchaseBill" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "vendorGstin" TEXT,
    "vendorAddress" TEXT,
    "invoiceDate" TEXT,
    "project" TEXT DEFAULT 'General Inventory',
    "items" JSONB DEFAULT '[]',
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "cgst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grandTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "documentUrl" TEXT,
    "rawText" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseBill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseBill_tenantId_idx" ON "PurchaseBill"("tenantId");

-- AddForeignKey
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 1. Enable Row Level Security on PurchaseBill
ALTER TABLE "PurchaseBill" ENABLE ROW LEVEL SECURITY;

-- 2. Revoke all privileges from public PostgREST API roles
REVOKE ALL ON "PurchaseBill" FROM anon, authenticated;

-- 3. Set default privileges for all future schema objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- 4. Future Table RLS Verification & Lockdown Guard
DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN (
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY tablename
  ) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl.tablename);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated;', tbl.tablename);
  END LOOP;
END $$;
