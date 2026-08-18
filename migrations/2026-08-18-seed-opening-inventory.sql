-- Seed opening inventory and daily movement rows for existing inventory items.
-- Run this in Supabase SQL editor after creating the schema in the migration above.

BEGIN;

-- 1) Backfill opening_inventory for every inventory item that does not already have an opening record.
INSERT INTO opening_inventory (inventory_id, opening_date, opening_qty)
SELECT
  i.id,
  CURRENT_DATE,
  GREATEST(COALESCE(i.qty, 0), 0)
FROM inventory i
LEFT JOIN opening_inventory oi
  ON oi.inventory_id = i.id
 AND oi.opening_date = CURRENT_DATE
WHERE oi.id IS NULL
ON CONFLICT (inventory_id, opening_date) DO NOTHING;

-- 2) Backfill a daily movement row for today using the opening stock as the starting point.
INSERT INTO daily_inventory_movements (
  inventory_id,
  movement_date,
  opening_qty,
  purchase_qty,
  add_stock_qty,
  adjust_qty,
  sale_usage_qty,
  internal_usage_qty,
  closing_qty,
  notes
)
SELECT
  i.id,
  CURRENT_DATE,
  GREATEST(COALESCE(oi.opening_qty, 0), 0),
  0,
  0,
  0,
  0,
  0,
  GREATEST(COALESCE(oi.opening_qty, 0), 0),
  'Seeded from existing inventory quantity'
FROM inventory i
LEFT JOIN opening_inventory oi
  ON oi.inventory_id = i.id
 AND oi.opening_date = CURRENT_DATE
ON CONFLICT (inventory_id, movement_date) DO NOTHING;

COMMIT;

-- Optional: view the seeded records for verification
-- SELECT * FROM opening_inventory ORDER BY opening_date DESC, inventory_id;
-- SELECT * FROM daily_inventory_movements ORDER BY movement_date DESC, inventory_id;
