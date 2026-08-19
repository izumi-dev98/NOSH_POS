-- Store the method used when paying a supplier credit invoice.
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS payment_method text;