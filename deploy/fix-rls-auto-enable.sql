-- ============================================================================
-- FIX: Revoke Public Access from SECURITY DEFINER function public.rls_auto_enable()
-- Severity: High (Fixes Supabase Linter Rule: Public Can Execute SECURITY DEFINER Function)
-- ============================================================================

-- 1. Revoke execution from untrusted / public roles
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;

-- 2. Restrict execution strictly to internal backend service role and postgres superuser
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO postgres;

-- 3. Security Hardening: Pin search_path to prevent search_path hijacking
ALTER FUNCTION public.rls_auto_enable() SET search_path = public, pg_temp;

-- Verification check query:
-- SELECT routine_name, grantee, privilege_type 
-- FROM information_schema.routine_privileges 
-- WHERE routine_name = 'rls_auto_enable' AND routine_schema = 'public';
