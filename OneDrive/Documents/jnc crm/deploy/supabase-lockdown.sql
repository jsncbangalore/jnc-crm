-- ============================================================================
-- CRM SUPABASE DATA API LOCKDOWN SCRIPT
-- Target: Fresh Supabase Project (PostgreSQL 14+)
-- Purpose: Enable Row Level Security (RLS) across ALL public tables to block
--          unauthorized PostgREST / anon-key access while preserving backend
--          Postgres connection access (Prisma connects as table owner).
-- Run this in the Supabase SQL Editor immediately after `prisma db push`.
-- ============================================================================

DO $$
DECLARE
  tbl RECORD;
  counter INT := 0;
BEGIN
  FOR tbl IN (
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY tablename
  ) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl.tablename);
    counter := counter + 1;
    RAISE NOTICE 'Enabled RLS on table: public.%', tbl.tablename;
  END LOOP;

  RAISE NOTICE 'SUCCESS: Row Level Security enabled across % tables in public schema.', counter;
END $$;
