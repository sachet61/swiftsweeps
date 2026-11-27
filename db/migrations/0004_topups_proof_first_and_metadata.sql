-- ============================================================================
-- Migration 0004: Deposits (Top-Ups) Proof-First & Extended Metadata Columns
-- Target: Self-hosted PostgreSQL
--
-- Scope notes:
-- - Relaxes strict `amount > 0` check from 0002 to `amount >= 0` so proof-first
--   customer top-up submissions (`amount = 0` awaiting staff receipt review)
--   persist cleanly in PostgreSQL while preserving NUMERIC(12, 2) precision.
-- - Adds additive metadata columns deferred in 0002 (see db/SCHEMA_REVIEW.md)
--   without destructive statements or foreign-key breaks.
-- ============================================================================

ALTER TABLE public.topups
  DROP CONSTRAINT IF EXISTS topups_amount_check;

ALTER TABLE public.topups
  ADD CONSTRAINT topups_amount_check CHECK (amount >= 0);

ALTER TABLE public.topups
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD'
    CHECK (char_length(btrim(currency)) BETWEEN 3 AND 10),
  ADD COLUMN IF NOT EXISTS bonus_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00
    CHECK (bonus_percentage >= 0 AND bonus_percentage <= 500),
  ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    CHECK (fee_amount >= 0),
  ADD COLUMN IF NOT EXISTS final_wallet_credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    CHECK (final_wallet_credit >= 0),
  ADD COLUMN IF NOT EXISTS provider_ref TEXT,
  ADD COLUMN IF NOT EXISTS receipt_name TEXT,
  ADD COLUMN IF NOT EXISTS target_game_username TEXT,
  ADD COLUMN IF NOT EXISTS funding_source TEXT NOT NULL DEFAULT 'payment_method',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_topups_customer_status_updated
  ON public.topups (customer_id, status, updated_at DESC);
