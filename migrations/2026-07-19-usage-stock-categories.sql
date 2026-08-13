-- Migration: create usage_stock_categories table

CREATE TABLE IF NOT EXISTS public.usage_stock_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_stock_categories_name ON public.usage_stock_categories (LOWER(name));
