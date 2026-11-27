-- ============================================================================
-- Migration 0010: Support Conversations, Messages & Self-Hosted Chat Attachments
-- Target: Self-hosted PostgreSQL
--
-- Scope notes:
-- - Replaces Supabase RLS policies, supabase_realtime publications, and
--   chat_attachments storage bucket usage with server-enforced API ownership/RBAC,
--   transactional persistence, and durable BYTEA attachment storage.
-- - Preserves canonical conversation IDs ('conv_' || customer_id), ticket
--   status constraints ('open' | 'pending' | 'resolved' | 'closed'),
--   chronological (created_at, id) keyset pagination indexes, and
--   is_internal_note isolation for staff-only internal notes.
-- ============================================================================

-- 1. Customer Support Conversations
CREATE TABLE IF NOT EXISTS public.conversations (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL CHECK (char_length(btrim(customer_name)) BETWEEN 1 AND 160),
  agent_id TEXT NULL,
  agent_name TEXT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'pending', 'resolved', 'closed')
  ),
  last_message TEXT NOT NULL DEFAULT '',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_conversations_customer_id
  ON public.conversations (customer_id);

CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at
  ON public.conversations (last_message_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_status_last_message_at
  ON public.conversations (status, last_message_at DESC, id DESC);

-- 2. Support Messages (including embedded financial transaction cards & staff internal notes)
CREATE TABLE IF NOT EXISTS public.messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL CHECK (char_length(btrim(sender_name)) BETWEEN 1 AND 160),
  sender_role TEXT NOT NULL CHECK (
    sender_role IN ('customer', 'agent', 'admin', 'system')
  ),
  content TEXT NOT NULL DEFAULT '',
  attachment_url TEXT NULL,
  attachment_name TEXT NULL,
  transaction_data JSONB NULL,
  is_internal_note BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON public.messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created_id
  ON public.messages (conversation_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_messages_request_id
  ON public.messages ((transaction_data->>'requestId'))
  WHERE transaction_data IS NOT NULL AND transaction_data ? 'requestId';

-- 3. Durable Self-Hosted Chat Image Attachments (PNG / JPEG / WebP / GIF, max 5 MB)
CREATE TABLE IF NOT EXISTS public.chat_attachments (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_-]+\.(png|jpg|webp|gif)$'),
  conversation_id TEXT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  uploaded_by TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (
    content_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')
  ),
  original_name TEXT NULL,
  image_data BYTEA NOT NULL,
  size_bytes INT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_chat_attachments_conversation
  ON public.chat_attachments (conversation_id, created_at DESC);
