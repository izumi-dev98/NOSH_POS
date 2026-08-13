-- Purchase Return FIFO Tracking Table
-- Links purchase returns to the specific FIFO layers they consumed

CREATE TABLE IF NOT EXISTS purchase_return_fifo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_item_id UUID REFERENCES purchase_return_items(id) ON DELETE CASCADE,
  source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('purchase', 'add_stock')),
  source_id UUID NOT NULL,
  qty_reduced NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_value NUMERIC GENERATED ALWAYS AS (qty_reduced * unit_price) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_return_fifo_return_item ON purchase_return_fifo(return_item_id);
CREATE INDEX IF NOT EXISTS idx_return_fifo_source ON purchase_return_fifo(source_type, source_id);

-- View for return details with FIFO breakdown
CREATE OR REPLACE VIEW purchase_return_fifo_details AS
SELECT
  prf.id,
  prf.return_item_id,
  pri.invoice_number,
  pri.item_name,
  pri.type,
  pri.qty as return_qty,
  pri.unit_price as return_unit_price,
  pri.total_price as return_total_price,
  prf.source_type,
  prf.source_id,
  prf.qty_reduced,
  prf.unit_price as fifo_unit_price,
  prf.total_value as fifo_total_value,
  prf.created_at
FROM purchase_return_fifo prf
JOIN purchase_return_items pri ON prf.return_item_id = pri.id;

COMMENT ON TABLE purchase_return_fifo IS 'Links purchase returns to consumed FIFO layers for audit trail';
COMMENT ON COLUMN purchase_return_fifo.source_type IS 'Source of the stock that was reduced: purchase or add_stock';
COMMENT ON COLUMN purchase_return_fifo.source_id IS 'ID of the source record (purchase_item or consumption_item)';
COMMENT ON COLUMN purchase_return_fifo.qty_reduced IS 'Quantity reduced from this FIFO layer';
COMMENT ON COLUMN purchase_return_fifo.unit_price IS 'Unit price from the FIFO layer';
COMMENT ON COLUMN purchase_return_fifo.total_value IS 'Total value reduced (qty_reduced * unit_price)';
