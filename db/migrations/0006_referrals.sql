-- ============================================================================
-- Migration 0006: Referrals Domain (public.referral_awards & telemetry guards)
-- Target: Self-hosted PostgreSQL
--
-- Source traceability:
-- - public/supabase_schema.sql lines 492-535 (referral columns & referral_awards)
-- - api/referralHandlers.ts (attribution, qualification, review & ledger states)
-- - src/types/index.ts (ReferralLedgerEntry)
--
-- Scope notes:
-- - Preserves NUMERIC(12, 2) monetary precision with non-negative CHECK bounds.
-- - Preserves UNIQUE (referee_id) anti-double-attribution invariant.
-- - Omits Supabase RLS & supabase_realtime publication; access is enforced
--   server-side by the Node API.
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referral_code TEXT,
  ADD COLUMN IF NOT EXISTS referred_by TEXT,
  ADD COLUMN IF NOT EXISTS signup_ip TEXT,
  ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code_upper_unique
  ON public.users (upper(referral_code))
  WHERE referral_code IS NOT NULL AND btrim(referral_code) <> '';

ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS referral_bonus_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

CREATE TABLE IF NOT EXISTS public.referral_awards (
  id TEXT PRIMARY KEY,
  referrer_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referee_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referral_code_used TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'signup_link'
    CHECK (source IN (
      'signup_link',
      'manual_link',
      'manual_link_and_reward',
      'admin_reassign',
      'manual_admin',
      'manual_agent',
      'retroactive_reconcile'
    )),
  reward_mode TEXT NOT NULL DEFAULT 'flat'
    CHECK (reward_mode IN ('flat', 'percent')),
  payout_target TEXT NOT NULL DEFAULT 'referral_bonus'
    CHECK (payout_target IN ('referral_bonus', 'available_balance')),
  referrer_reward_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    CHECK (referrer_reward_amount >= 0),
  referee_reward_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    CHECK (referee_reward_amount >= 0),
  qualifying_deposit_id TEXT,
  qualifying_deposit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00
    CHECK (qualifying_deposit_amount >= 0),
  status TEXT NOT NULL DEFAULT 'registered'
    CHECK (status IN (
      'registered',
      'pending_deposit',
      'processing',
      'held_for_review',
      'rewarded',
      'rejected',
      'capped'
    )),
  fraud_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  staff_reason TEXT,
  assigned_by TEXT,
  assigned_by_name TEXT,
  reviewed_by TEXT,
  reviewed_by_name TEXT,
  review_notes TEXT,
  rewarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_referral_awards_referee UNIQUE (referee_id),
  CONSTRAINT chk_referral_awards_no_self CHECK (referrer_id <> referee_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_awards_referrer_status
  ON public.referral_awards (referrer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_awards_status_created
  ON public.referral_awards (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_awards_rewarded_at
  ON public.referral_awards (rewarded_at DESC);
