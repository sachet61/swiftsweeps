-- ============================================================================
-- Migration 0014: Per-Conversation Pinned Cashout Rules
-- Target: Self-hosted PostgreSQL
--
-- Scope notes:
-- - Additive-only schema evolution on public.conversations to persist
--   per-customer pinned cashout rules state independently per conversation.
-- - Tracks pinned_message_id, pinned_rules_version, pinned_at, pinned_by_id,
--   pinned_by_name, and pinned_message_text so both customer and staff views
--   immediately render the pinned banner without requiring full history load.
-- ============================================================================

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS pinned_message_id TEXT NULL;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS pinned_rules_version TEXT NULL;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ NULL;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS pinned_by_id TEXT NULL;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS pinned_by_name TEXT NULL;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS pinned_message_text TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_pinned_message_id
  ON public.conversations (pinned_message_id)
  WHERE pinned_message_id IS NOT NULL;
