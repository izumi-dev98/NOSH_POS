-- Add paid_amount and last_payment tracking to purchases for partial payments
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS last_payment_amount NUMERIC;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMP;
