-- ============================================================================
-- Migration 0013: Message Actual Sent Timestamp & Delivery Status
-- Target: Self-hosted PostgreSQL
--
-- Scope notes:
-- - Additive-only schema evolution on public.messages to record authoritative
--   server-side UTC message delivery completion time (sent_at) and outcome
--   (delivery_status: 'pending' | 'sent' | 'failed') separately from message
--   creation timestamp (created_at).
-- - Existing historical rows remain valid with sent_at = NULL so missing
--   timestamps are never misinterpreted as recently delivered notifications.
-- ============================================================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ NULL;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'sent';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_messages_delivery_status'
      AND conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT chk_messages_delivery_status
      CHECK (delivery_status IN ('pending', 'sent', 'failed'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_messages_conv_outbound_sent_at
  ON public.messages (conversation_id, sent_at DESC)
  WHERE sent_at IS NOT NULL
    AND delivery_status = 'sent'
    AND is_internal_note = false
    AND sender_role IN ('agent', 'admin', 'system');
