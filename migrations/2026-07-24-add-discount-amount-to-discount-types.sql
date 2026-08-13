-- Migration: add fixed-price discount support to discount_types

-- Ensure discount_types table exists with the new discount_amount column
CREATE TABLE IF NOT EXISTS public.discount_types (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  discount_percent NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add discount_amount column if the table already exists without it
ALTER TABLE public.discount_types
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0;

-- Add a unique index on lower(name) if not already present
CREATE UNIQUE INDEX IF NOT EXISTS idx_discount_types_name ON public.discount_types (LOWER(name));
