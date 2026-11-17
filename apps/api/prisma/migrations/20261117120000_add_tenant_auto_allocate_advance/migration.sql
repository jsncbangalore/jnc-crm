-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "autoAllocateAdvance" BOOLEAN NOT NULL DEFAULT true;
