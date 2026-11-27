-- ============================================================================
-- Migration 0007: Wheel of Luck Spins Domain (public.wheel_spins)
-- Target: Self-hosted PostgreSQL
--
-- Source traceability:
-- - supabase_schema.sql lines 870-899 (wheel_spins table & wallet/game balances)
-- - api/wheelHandlers.ts (rolling 24h spin claim & idempotency semantics)
--
-- Scope notes:
-- - Preserves NUMERIC(12, 2) monetary precision on reward/simulated amounts
--   and NUMERIC(10, 4) precision on probability_weight.
-- - Preserves unique partial idempotency index per (customer_id, idempotency_key).
-- - Omits Supabase RLS & supabase_realtime publication; access is enforced
--   server-side by the Node API.
-- ============================================================================

ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS free_play_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

CREATE TABLE IF NOT EXISTS public.wheel_spins (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  segment_id TEXT NOT NULL,
  segment_label TEXT NOT NULL,
  reward_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    CHECK (reward_amount >= 0),
  simulated_win_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    CHECK (simulated_win_amount >= 0),
  probability_weight NUMERIC(10, 4) NOT NULL DEFAULT 1.0000
    CHECK (probability_weight >= 0),
  idempotency_key TEXT,
  tx_id TEXT,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'voided', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_wheel_spins_customer_created
  ON public.wheel_spins (customer_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wheel_spins_customer_idempotency
  ON public.wheel_spins (customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
