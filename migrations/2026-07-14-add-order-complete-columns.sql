-- Migration: add completed columns to orders table

-- Adds a reference to user who completed the order, and a timestamp for when it was completed.
-- Run this SQL in Supabase SQL editor or via psql connected to your database.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS completed_by integer;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Optional: add foreign key to user table (uncomment if your user table is named "user" and primary key is id)
-- ALTER TABLE public.orders
--   ADD CONSTRAINT fk_orders_completed_by_user FOREIGN KEY (completed_by) REFERENCES public."user"(id) ON DELETE SET NULL;

-- You may also want to index completed_by for queries:
-- CREATE INDEX IF NOT EXISTS idx_orders_completed_by ON public.orders(completed_by);
