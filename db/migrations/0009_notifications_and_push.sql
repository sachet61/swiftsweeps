-- ============================================================================
-- Migration 0009: In-App Notifications & Self-Hosted Web Push Subscriptions
-- Target: Self-hosted PostgreSQL
--
-- Scope notes:
-- - Creates public.notifications matching existing server repo expectations
--   (is_read column used by wheelRepo / referralRepo) and safely reconciles any
--   legacy Supabase import that named the column "read".
-- - Replaces app_config['push_subscriptions'] JSON blob with a normalized
--   public.push_subscriptions table supporting atomic 1-to-1 endpoint rebinding,
--   concurrent 404/410 pruning, and ON DELETE CASCADE cleanup per user.
-- ============================================================================

-- 1. User-Scoped In-App Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  message TEXT NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 1000),
  type TEXT NOT NULL CHECK (
    type IN ('topup', 'withdrawal', 'bonus', 'chat', 'game_account', 'referral', 'system')
  ),
  is_read BOOLEAN NOT NULL DEFAULT false,
  link_tab TEXT NULL,
  link_request_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Reconcile legacy Supabase imports where the column was named "read" instead of "is_read"
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'read'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'is_read'
  ) THEN
    ALTER TABLE public.notifications RENAME COLUMN "read" TO is_read;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, is_read, created_at DESC)
  WHERE is_read = false;

-- 2. Normalized Web Push Device Subscriptions (1-to-1 endpoint binding)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE CHECK (endpoint ~* '^https://[^\s]+$'),
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_email TEXT NULL,
  user_role TEXT NOT NULL CHECK (user_role IN ('customer', 'agent', 'admin')),
  p256dh TEXT NOT NULL CHECK (char_length(btrim(p256dh)) > 0),
  auth TEXT NOT NULL CHECK (char_length(btrim(auth)) > 0),
  expiration_time BIGINT NULL,
  platform TEXT NULL,
  browser TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_active
  ON public.push_subscriptions (user_id, active, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_role_active
  ON public.push_subscriptions (user_role, active, updated_at DESC)
  WHERE active = true;
