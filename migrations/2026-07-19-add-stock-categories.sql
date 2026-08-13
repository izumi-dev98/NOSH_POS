-- Migration: create add_stock_categories table

CREATE TABLE IF NOT EXISTS public.add_stock_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_add_stock_categories_name ON public.add_stock_categories (LOWER(name));
