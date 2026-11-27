-- ============================================================================
-- Migration 0005: Game Accounts / Gaming IDs Domain
-- Target: Self-hosted PostgreSQL
--
-- Source traceability:
-- - supabase_schema.sql lines 102-113 (public.game_accounts base schema)
-- - supabase_schema.sql lines 873-877 (balance & free_play_balance NUMERIC(12, 2))
-- - src/types/index.ts lines 191-211 (GameAccount model)
--
-- Scope notes:
-- - Preserves NUMERIC(12, 2) monetary precision on balance and free_play_balance
--   with non-negative CHECK constraints.
-- - Enforces strictly 1 Gaming ID per (customer_id, game_id) via a unique index.
-- - Includes additive ALTER TABLE ... ADD COLUMN IF NOT EXISTS guards for safe
--   pre-cutover schema alignment without destructive changes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.game_accounts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  game_title TEXT NOT NULL,
  platform_name TEXT NOT NULL DEFAULT 'Sweepstakes',
  username TEXT NOT NULL DEFAULT 'Pending Assignment',
  password TEXT NOT NULL DEFAULT '',
  pin TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending_assignment', 'pending_reset', 'suspended')),
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
  free_play_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (free_play_balance >= 0),
  request_type TEXT
    CHECK (request_type IS NULL OR request_type IN ('new_id_request', 'password_reset_request')),
  assigned_by_agent_id TEXT,
  assigned_by_agent_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.game_accounts
  ADD COLUMN IF NOT EXISTS platform_name TEXT NOT NULL DEFAULT 'Sweepstakes',
  ADD COLUMN IF NOT EXISTS balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
  ADD COLUMN IF NOT EXISTS free_play_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (free_play_balance >= 0),
  ADD COLUMN IF NOT EXISTS request_type TEXT
    CHECK (request_type IS NULL OR request_type IN ('new_id_request', 'password_reset_request')),
  ADD COLUMN IF NOT EXISTS assigned_by_agent_id TEXT,
  ADD COLUMN IF NOT EXISTS assigned_by_agent_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_game_accounts_customer_game_unique
  ON public.game_accounts (customer_id, game_id);

CREATE INDEX IF NOT EXISTS idx_game_accounts_customer_updated
  ON public.game_accounts (customer_id, updated_at DESC, id ASC);

CREATE INDEX IF NOT EXISTS idx_game_accounts_status_updated
  ON public.game_accounts (status, updated_at DESC, id ASC);
