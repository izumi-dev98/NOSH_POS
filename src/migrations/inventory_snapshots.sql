-- Inventory Snapshots Table
-- Stores daily inventory state for comparison reports

-- Drop existing functions first (to fix type mismatch issues)
DROP FUNCTION IF EXISTS get_inventory_change(DATE, DATE);
DROP FUNCTION IF EXISTS generate_inventory_snapshot(DATE);

-- Create table if not exists
CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id BIGSERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  inventory_id BIGINT REFERENCES inventory(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  item_type TEXT,
  qty NUMERIC DEFAULT 0,
  unit_price NUMERIC DEFAULT 0,
  total_value NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(snapshot_date, inventory_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON inventory_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_snapshots_inventory ON inventory_snapshots(inventory_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_date_item ON inventory_snapshots(snapshot_date, item_name);

-- Function to generate snapshot for a specific date
CREATE OR REPLACE FUNCTION generate_inventory_snapshot(target_date DATE)
RETURNS VOID AS $$
BEGIN
  DELETE FROM inventory_snapshots WHERE snapshot_date = target_date;

  INSERT INTO inventory_snapshots (snapshot_date, inventory_id, item_name, item_type, qty, unit_price, total_value)
  SELECT
    target_date,
    id as inventory_id,
    item_name,
    type as item_type,
    qty,
    price as unit_price,
    qty * COALESCE(price, 0) as total_value
  FROM inventory
  WHERE deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to get quantity change between two dates
CREATE OR REPLACE FUNCTION get_inventory_change(start_date DATE, end_date DATE)
RETURNS TABLE (
  inventory_id BIGINT,
  item_name TEXT,
  item_type TEXT,
  start_qty NUMERIC,
  end_qty NUMERIC,
  change_qty NUMERIC,
  change_percent NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(s1.inventory_id, s2.inventory_id) as inventory_id,
    COALESCE(s1.item_name, s2.item_name) as item_name,
    COALESCE(s1.item_type, s2.item_type) as item_type,
    COALESCE(s1.qty, 0) as start_qty,
    COALESCE(s2.qty, 0) as end_qty,
    COALESCE(s2.qty, 0) - COALESCE(s1.qty, 0) as change_qty,
    CASE
      WHEN COALESCE(s1.qty, 0) = 0 THEN
        CASE WHEN COALESCE(s2.qty, 0) > 0 THEN 100 ELSE 0 END
      ELSE
        ROUND(((COALESCE(s2.qty, 0) - COALESCE(s1.qty, 0)) / s1.qty * 100), 2)
    END as change_percent
  FROM inventory_snapshots s1
  FULL OUTER JOIN inventory_snapshots s2
    ON s1.inventory_id = s2.inventory_id
    AND s2.snapshot_date = end_date
  WHERE s1.snapshot_date = start_date
  ORDER BY item_name;
END;
$$ LANGUAGE plpgsql;
