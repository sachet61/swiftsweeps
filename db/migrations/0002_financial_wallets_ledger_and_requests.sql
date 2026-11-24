-- ============================================================================
-- Migration 0002: Financial Wallets, Ledger Transactions, Top-Ups & Withdrawals
-- Target: Self-hosted PostgreSQL (Slice 1)
--
-- Scope notes:
-- - Preserves exact NUMERIC(12, 2) precision and USD currency defaults from
--   supabase_schema.sql (zero floating-point columns).
-- - Preserves verified ON DELETE CASCADE relationships to public.users(id).
-- - Leaves reviewer_id / target_game_account_id as nullable TEXT (unconstrained)
--   matching verified production data/code semantics.
-- ============================================================================

-- 1. Customer Wallets
-- Source evidence: supabase_schema.sql (lines 22-31, 558-559, 870-871)
CREATE TABLE IF NOT EXISTS public.wallets (
  customer_id TEXT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    CHECK (balance >= 0),
  referral_bonus_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    CHECK (referral_bonus_balance >= 0),
  free_play_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    CHECK (free_play_balance >= 0),
  pending_withdrawal NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    CHECK (pending_withdrawal >= 0),
  pending_deposit NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    CHECK (pending_deposit >= 0),
  total_deposited NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    CHECK (total_deposited >= 0),
  total_withdrawn NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    CHECK (total_withdrawn >= 0),
  currency TEXT NOT NULL DEFAULT 'USD'
    CHECK (char_length(btrim(currency)) BETWEEN 3 AND 10),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Financial Ledger Transactions
-- Source evidence: supabase_schema.sql (lines 34-44, 277, 643-645), api/referralHandlers.ts
CREATE TABLE IF NOT EXISTS public.transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'pending', 'processing', 'failed', 'cancelled', 'reversed')),
  description TEXT NOT NULL,
  reference_id TEXT,
  game_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_transactions_customer
  ON public.transactions (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_reference_type
  ON public.transactions (reference_id, type)
  WHERE reference_id IS NOT NULL;

-- 3. Top-Up Deposit Requests
-- Source evidence: supabase_schema.sql (lines 47-65, 278), src/types/index.ts, src/types.ts
CREATE TABLE IF NOT EXISTS public.topups (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL
    CHECK (amount > 0),
  bonus_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    CHECK (bonus_amount >= 0),
  payment_method_id TEXT NOT NULL,
  payment_method_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'verifying', 'approved', 'completed', 'rejected', 'cancelled')),
  proof_url TEXT,
  target_game_name TEXT,
  target_game_account_id TEXT,
  customer_notes TEXT,
  reviewer_id TEXT,
  reviewer_name TEXT,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_topups_customer
  ON public.topups (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_topups_status_created
  ON public.topups (status, created_at DESC);

-- 4. Withdrawal / Cashout Requests
-- Source evidence: supabase_schema.sql (lines 68-85, 279), src/types/index.ts, src/types.ts
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL
    CHECK (amount > 0),
  fee NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    CHECK (fee >= 0),
  net_amount NUMERIC(12, 2) NOT NULL
    CHECK (net_amount >= 0),
  payout_method_id TEXT NOT NULL,
  payout_method_name TEXT NOT NULL,
  payout_details JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'pending_verification', 'submitted', 'processing', 'approved', 'completed', 'rejected', 'cancelled')),
  reviewer_id TEXT,
  reviewer_name TEXT,
  review_notes TEXT,
  transaction_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_customer
  ON public.withdrawals (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_withdrawals_status_created
  ON public.withdrawals (status, created_at DESC);
