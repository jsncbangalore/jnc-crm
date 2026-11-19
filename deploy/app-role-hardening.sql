-- ============================================================================
-- APP DATABASE ROLE HARDENING SCRIPT
-- Target: PostgreSQL (Production / Supabase / Self-hosted)
-- Purpose: 
--   1. Create/alter runtime application user `jnc_app` with NOBYPASSRLS.
--   2. Grant DML-only permissions (SELECT, INSERT, UPDATE, DELETE) on tables.
--   3. Restrict DDL / migration privileges to separate migration role (e.g. `postgres`).
--
-- REQUIRED VARIABLE:
--   app_role_password - Strong password for the jnc_app database role.
--   Usage: psql -v app_role_password='<STRONG_PASSWORD>' -f deploy/app-role-hardening.sql
-- ============================================================================

\if :{?app_role_password}
  -- Variable confirmed present
\else
  \echo 'FATAL ERROR: Required psql variable :app_role_password is not defined.'
  \echo 'Run with: psql -v app_role_password="<STRONG_PASSWORD>" -f deploy/app-role-hardening.sql'
  \q 1
\endif

-- 1. Create role if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'jnc_app') THEN
    CREATE ROLE jnc_app WITH LOGIN;
  END IF;
END $$;

-- 2. Set password from psql variable and enforce security settings
ALTER ROLE jnc_app WITH LOGIN PASSWORD :'app_role_password';
ALTER ROLE jnc_app WITH NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- 3. Grant schema usage
GRANT USAGE ON SCHEMA public TO jnc_app;

-- 4. Grant DML-only on all existing tables in public schema
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO jnc_app;

-- 5. Grant sequence usage for auto-increment / serials
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jnc_app;

-- 6. Configure default privileges for future tables created by the migration role
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO jnc_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO jnc_app;

SELECT 'SUCCESS: Role jnc_app configured with NOBYPASSRLS and DML-only grants.' AS status;
