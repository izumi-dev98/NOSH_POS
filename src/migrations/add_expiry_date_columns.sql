-- =====================================================
-- Expiry Date Tracking for Purchase Items
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Add expiry_date and is_expired columns to purchase_items
ALTER TABLE purchase_items
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS is_expired BOOLEAN DEFAULT FALSE;

-- 2. Index for efficient expiry queries
CREATE INDEX IF NOT EXISTS idx_purchase_items_expiry
  ON purchase_items (expiry_date)
  WHERE is_expired = FALSE AND qty > 0;

-- 3. Audit trail table for expired items
CREATE TABLE IF NOT EXISTS expiry_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_item_id BIGINT NOT NULL,
  item_name TEXT NOT NULL,
  expired_qty NUMERIC NOT NULL,
  expiry_date DATE,
  expired_at TIMESTAMPTZ DEFAULT NOW(),
  purchase_id BIGINT
);

-- 4. Index for expiry log queries
CREATE INDEX IF NOT EXISTS idx_expiry_log_expired_at
  ON expiry_log (expired_at DESC);
