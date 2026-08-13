-- Add foc_qty column to purchase_items table
ALTER TABLE purchase_items
ADD COLUMN IF NOT EXISTS foc_qty NUMERIC DEFAULT 0;

-- Add comment to document the column
COMMENT ON COLUMN purchase_items.foc_qty IS 'Free of Charge quantity - items received at no cost';
