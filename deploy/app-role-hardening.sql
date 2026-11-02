-- ============================================================================
-- APP DATABASE ROLE HARDENING SCRIPT
-- Target: PostgreSQL (Production / Supabase / Self-hosted)
-- Purpose: 
--   1. Create/alter runtime application user `jnc_app` with NOBYPASSRLS.
--   2. Grant DML-only permissions (SELECT, INSERT, UPDATE, DELETE) on tables.
--   3. Restrict DDL / migration privileges to separate migration role (e.g. `postgres`).
-- ============================================================================

DO $$
BEGIN
  -- Create role if not exists
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'jnc_app') THEN
    CREATE ROLE jnc_app WITH LOGIN PASSWORD 'CHANGE_IN_PRODUCTION_STRONG_PASSWORD';
  END IF;
  
  -- Enforce NOBYPASSRLS and standard security settings
  ALTER ROLE jnc_app WITH NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
  
  -- Grant schema usage
  GRANT USAGE ON SCHEMA public TO jnc_app;
  
  -- Grant DML-only on all existing tables in public schema
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO jnc_app;
  
  -- Grant sequence usage for auto-increment / serials
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jnc_app;
  
  -- Configure default privileges for future tables created by the migration role
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO jnc_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO jnc_app;
  
  RAISE NOTICE 'SUCCESS: Role jnc_app configured with NOBYPASSRLS and DML-only grants.';
END $$;
