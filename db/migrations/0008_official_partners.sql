-- ============================================================================
-- Migration 0008: Official Partners Directory & Uploaded Icon Storage
-- Target: Self-hosted PostgreSQL
--
-- Scope notes:
-- - Replaces Supabase RLS policies, storage.* partner-icons bucket, and
--   auth.uid() audit trigger with server-enforced API RBAC, transactional
--   updates, and explicit public.audit_logs writes.
-- - Preserves strict URL / platform host validation, note/name bounds,
--   UUID partner identifiers, and (is_visible, sort_order, name) indexing.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Strict HTTPS & Platform-Matched Host Validation Helper
CREATE OR REPLACE FUNCTION public.is_valid_official_partner_url(
  p_url TEXT,
  p_platform TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  v_trimmed TEXT;
  v_authority TEXT;
  v_host TEXT;
BEGIN
  v_trimmed := btrim(p_url);

  -- Must start with https://, contain no whitespace, no userinfo (@), and no query-in-authority tricks
  IF v_trimmed !~* '^https://[^/\s?#]+(?:/[^\s]*)?$' THEN
    RETURN FALSE;
  END IF;

  v_authority := split_part(regexp_replace(v_trimmed, '^https://', '', 'i'), '/', 1);
  v_authority := split_part(v_authority, '?', 1);
  v_authority := split_part(v_authority, '#', 1);

  IF position('@' IN v_authority) > 0 THEN
    RETURN FALSE;
  END IF;

  v_host := lower(split_part(v_authority, ':', 1));

  IF p_platform = 'facebook' THEN
    RETURN v_host IN ('facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com', 'm.me');
  ELSIF p_platform = 'instagram' THEN
    RETURN v_host IN ('instagram.com', 'www.instagram.com', 'ig.me');
  ELSIF p_platform = 'telegram' THEN
    RETURN v_host IN ('t.me', 'telegram.me');
  END IF;

  RETURN FALSE;
END;
$$;

-- 2. Official Partners Directory Table
CREATE TABLE IF NOT EXISTS public.official_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  icon_url TEXT NULL CHECK (
    icon_url IS NULL
    OR (
      (
        icon_url ~* '^https://[^\s<>"'']+$'
        OR icon_url ~ '^/api/official-partners/icons/[a-zA-Z0-9_-]+\.(png|jpg|webp)$'
      )
      AND icon_url !~* '\.svg(\?|#|$)'
      AND icon_url !~* 'image/svg'
    )
  ),
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'telegram')),
  page_url TEXT NOT NULL,
  message_link TEXT NULL,
  game_id TEXT NULL,
  note TEXT NULL CHECK (note IS NULL OR char_length(note) <= 80),
  is_visible BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  updated_by TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_official_partners_page_url
    CHECK (public.is_valid_official_partner_url(page_url, platform)),
  CONSTRAINT chk_official_partners_message_link
    CHECK (message_link IS NULL OR public.is_valid_official_partner_url(message_link, platform))
);

CREATE INDEX IF NOT EXISTS idx_official_partners_visible_order
  ON public.official_partners (is_visible, sort_order ASC, name ASC);

CREATE INDEX IF NOT EXISTS idx_official_partners_game_id
  ON public.official_partners (game_id)
  WHERE game_id IS NOT NULL;

-- 3. Automatic Blank-String Normalization & updated_at Trigger
CREATE OR REPLACE FUNCTION public.touch_official_partners_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := timezone('utc'::text, now());
  IF NEW.message_link IS NOT NULL AND btrim(NEW.message_link) = '' THEN
    NEW.message_link := NULL;
  END IF;
  IF NEW.icon_url IS NOT NULL AND btrim(NEW.icon_url) = '' THEN
    NEW.icon_url := NULL;
  END IF;
  IF NEW.game_id IS NOT NULL AND btrim(NEW.game_id) = '' THEN
    NEW.game_id := NULL;
  END IF;
  IF NEW.note IS NOT NULL AND btrim(NEW.note) = '' THEN
    NEW.note := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_official_partners_updated_at ON public.official_partners;
CREATE TRIGGER trg_official_partners_updated_at
  BEFORE INSERT OR UPDATE ON public.official_partners
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_official_partners_updated_at();

-- 4. Durable Self-Hosted Storage for Uploaded Partner Icons (PNG / JPEG / WebP, max 512 KB)
CREATE TABLE IF NOT EXISTS public.official_partner_icons (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_-]+\.(png|jpg|webp)$'),
  content_type TEXT NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  image_data BYTEA NOT NULL,
  size_bytes INT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 524288),
  created_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
