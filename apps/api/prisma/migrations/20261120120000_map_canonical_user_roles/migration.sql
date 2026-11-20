-- Migration: Map existing user roles to canonical 9 roles
UPDATE "User" SET "role" = 'administrator' WHERE "role" = 'admin' OR "role" = 'tenant_admin';
UPDATE "User" SET "role" = 'sub_administrator' WHERE "role" = 'sub_admin';
UPDATE "User" SET "role" = 'sales_representative' WHERE "role" = 'employee' OR "role" = 'sales';
UPDATE "User" SET "role" = 'store_inventory_manager' WHERE "role" = 'store_manager' OR "role" = 'inventory_manager';
UPDATE "User" SET "role" = 'finance_specialist' WHERE "role" = 'finance';

-- Update default for User.role column
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'sales_representative';
