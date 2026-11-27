-- ============================================================================
-- Migration 0012: Self-Hosted Object Storage (Payment Proofs, QR & Media)
-- Target: Self-hosted PostgreSQL
--
-- Scope notes:
-- - Replaces remaining Supabase Storage bucket usage (`chat_attachments`
--   receipts & QR/catalog uploads, `avatars`, `partner-icons` via
--   /api/storage/upload and /api/storage/file) with durable BYTEA object
--   persistence and explicit private/public access control (`is_public`).
-- - Preserves canonical object keys `(bucket, object_path)`, ownership
--   (`owner_user_id`), and existing `/api/storage/file?bucket=...&path=...`
--   object references across `topups`, `app_config`, `game_catalog`, and
--   `messages`.
-- - Private financial receipts (`receipts/*`) and conversation attachments
--   (`conv_*/*`) MUST set `is_public = false` and are served only to the
--   owning user, staff (`admin` / `agent`), or bearers of a valid short-lived
--   HMAC-signed URL.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.storage_objects (
  bucket TEXT NOT NULL CHECK (
    bucket IN ('chat_attachments', 'avatars', 'partner-icons')
  ),
  object_path TEXT NOT NULL CHECK (
    char_length(btrim(object_path)) BETWEEN 1 AND 512
    AND object_path !~ '^/'
    AND position('..' in object_path) = 0
  ),
  owner_user_id TEXT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  uploaded_by TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  is_public BOOLEAN NOT NULL DEFAULT false,
  content_type TEXT NOT NULL CHECK (
    content_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')
  ),
  image_data BYTEA NOT NULL,
  size_bytes INT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 15728640),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (bucket, object_path)
);

CREATE INDEX IF NOT EXISTS idx_storage_objects_owner_created
  ON public.storage_objects (owner_user_id, created_at DESC)
  WHERE owner_user_id IS NOT NULL;
