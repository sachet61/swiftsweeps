-- Migration 0003: Game Catalog Domain (Slice 2)
-- Source verified from supabase_schema.sql (lines 88-99) and frontend GameCatalogItem model.
-- Additive columns (game_url, download_url, links, updated_at) persist admin-edited
-- play/download links directly in PostgreSQL without altering numeric precision.

CREATE TABLE IF NOT EXISTS public.game_catalog (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  description TEXT,
  min_load NUMERIC(12, 2) NOT NULL DEFAULT 5.00 CHECK (min_load >= 0),
  bonus_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (bonus_pct >= 0 AND bonus_pct <= 1000),
  is_active BOOLEAN NOT NULL DEFAULT true,
  icon_url TEXT,
  image_url TEXT,
  game_url TEXT,
  download_url TEXT,
  links JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_game_catalog_active_created
  ON public.game_catalog (is_active, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_game_catalog_category
  ON public.game_catalog (category);
