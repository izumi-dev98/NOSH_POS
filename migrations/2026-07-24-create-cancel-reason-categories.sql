-- Migration: create cancel_reason_categories table

CREATE TABLE IF NOT EXISTS public.cancel_reason_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cancel_reason_categories_name ON public.cancel_reason_categories (LOWER(name));
