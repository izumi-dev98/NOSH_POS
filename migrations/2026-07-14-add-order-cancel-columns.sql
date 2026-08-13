-- Migration: add cancel columns to orders table

-- Adds a text column for cancel note, a reference to user who cancelled, and a timestamp for when it was cancelled.
-- Run this SQL in Supabase SQL editor or via psql connected to your database.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancel_note text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancelled_by integer;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Optional: add foreign key to user table (uncomment if your user table is named "user" and primary key is id)
-- ALTER TABLE public.orders
--   ADD CONSTRAINT fk_orders_cancelled_by_user FOREIGN KEY (cancelled_by) REFERENCES public."user"(id) ON DELETE SET NULL;

-- You may also want to index cancelled_by for queries:
-- CREATE INDEX IF NOT EXISTS idx_orders_cancelled_by ON public.orders(cancelled_by);
