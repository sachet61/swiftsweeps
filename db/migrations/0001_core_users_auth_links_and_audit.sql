-- ============================================================================
-- Migration 0001: Core Application Users, Auth Link Map, Config & Audit Logs
-- Target: Self-hosted PostgreSQL (Slice 1)
--
-- Scope notes:
-- - Keeps auth-library internals separate (no auth.users or auth-library tables).
-- - Preserves public.users.id as TEXT PRIMARY KEY so all existing UUID-text and
--   legacy usr_* foreign keys remain valid without destructive ID rewrites.
-- - Adds public.auth_user_links as the deterministic bridge to the future
--   self-hosted authentication provider.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Application Users Profile & Authorization Directory
-- Source evidence: supabase_schema.sql (lines 7-19, 549-556)
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer'
    CHECK (role IN ('customer', 'agent', 'admin')),
  phone TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'pending')),
  email_verified BOOLEAN NOT NULL DEFAULT true,
  referral_code TEXT,
  referred_by TEXT,
  signup_ip TEXT,
  device_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_users_email_lower
  ON public.users (lower(email));

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code_upper_unique
  ON public.users (upper(referral_code))
  WHERE referral_code IS NOT NULL AND btrim(referral_code) <> '';

-- Pure local verification downgrade guard (no cross-schema auth.* queries)
-- Source evidence: supabase_schema.sql (lines 376-393)
CREATE OR REPLACE FUNCTION public.prevent_verification_downgrade()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.email_verified = true AND (NEW.email_verified IS NULL OR NEW.email_verified = false) THEN
    NEW.email_verified := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_prevent_verification_downgrade ON public.users;
CREATE TRIGGER tr_prevent_verification_downgrade
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_verification_downgrade();

-- 2. Deterministic Auth-Library Cross-Reference Map
-- Maps external/library auth IDs and legacy Supabase UIDs to public.users(id)
-- without duplicating or manually defining auth-library internal tables.
CREATE TABLE IF NOT EXISTS public.auth_user_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id TEXT NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  auth_user_id TEXT UNIQUE,
  legacy_supabase_uid TEXT UNIQUE,
  email_normalized TEXT NOT NULL,
  migration_source TEXT NOT NULL DEFAULT 'supabase_import'
    CHECK (migration_source IN ('supabase_import', 'self_hosted_signup', 'admin_provisioned')),
  password_reset_required BOOLEAN NOT NULL DEFAULT false,
  linked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_auth_user_links_email_normalized
  ON public.auth_user_links (email_normalized);

-- 3. Application Configuration Store
-- Source evidence: supabase_schema.sql (lines 172-176)
CREATE TABLE IF NOT EXISTS public.app_config (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Server-Enforced Audit Logs
-- Source evidence: supabase_schema.sql (lines 159-169, 475-529), api/index.ts (lines 1660-1675)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL DEFAULT 'system',
  actor_name TEXT NOT NULL DEFAULT 'System',
  actor_role TEXT NOT NULL DEFAULT 'customer'
    CHECK (actor_role IN ('customer', 'agent', 'admin', 'system')),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp
  ON public.audit_logs (timestamp DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_timestamp
  ON public.audit_logs (entity_type, timestamp DESC);
