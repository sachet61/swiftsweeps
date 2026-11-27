-- ============================================================================
-- Migration 0011: Faked Cashouts Live Feed Table
-- Target: Self-hosted PostgreSQL
--
-- Scope notes:
-- - Preserves public.faked_cashouts schema from supabase_schema.sql lines
--   179-188 & 283 with NUMERIC(12, 2) currency precision and descending
--   timestamp index.
-- - Supabase permissive RLS policies and realtime publications are omitted;
--   read/write authorization and audit logging are enforced in the Node API.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.faked_cashouts (
  id TEXT PRIMARY KEY CHECK (char_length(btrim(id)) BETWEEN 1 AND 120),
  customer_name TEXT NOT NULL CHECK (char_length(btrim(customer_name)) BETWEEN 1 AND 80),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (char_length(btrim(currency)) BETWEEN 3 AND 10),
  method_name TEXT NOT NULL CHECK (char_length(btrim(method_name)) BETWEEN 1 AND 80),
  game_name TEXT NOT NULL CHECK (char_length(btrim(game_name)) BETWEEN 1 AND 120),
  is_fake BOOLEAN NOT NULL DEFAULT true,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_cashouts_timestamp
  ON public.faked_cashouts (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_faked_cashouts_timestamp_id
  ON public.faked_cashouts (timestamp DESC, id DESC);
