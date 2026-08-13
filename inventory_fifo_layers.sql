-- Inventory FIFO Layers Tracking Table
-- Tracks remaining stock batches with their original costs for accurate FIFO valuation

CREATE TABLE IF NOT EXISTS inventory_fifo_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
  source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('purchase', 'add_stock')),
  source_id UUID NOT NULL,
  remaining_qty NUMERIC DEFAULT 0,
  unit_price NUMERIC DEFAULT 0,
  fifo_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient FIFO queries
CREATE INDEX IF NOT EXISTS idx_fifo_layers_inventory ON inventory_fifo_layers(inventory_id);
CREATE INDEX IF NOT EXISTS idx_fifo_layers_date ON inventory_fifo_layers(fifo_date);
CREATE INDEX IF NOT EXISTS idx_fifo_layers_remaining ON inventory_fifo_layers(remaining_qty);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_fifo_layer_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fifo_layer_updated_at
  BEFORE UPDATE ON inventory_fifo_layers
  FOR EACH ROW
  EXECUTE FUNCTION update_fifo_layer_updated_at();

-- View for active layers (with remaining quantity > 0)
CREATE OR REPLACE VIEW active_fifo_layers AS
SELECT * FROM inventory_fifo_layers
WHERE remaining_qty > 0
ORDER BY fifo_date ASC, id ASC;

COMMENT ON TABLE inventory_fifo_layers IS 'Tracks FIFO inventory layers with remaining quantities and costs';
COMMENT ON COLUMN inventory_fifo_layers.source_type IS 'Source of the stock: purchase or add_stock';
COMMENT ON COLUMN inventory_fifo_layers.source_id IS 'ID of the source record (purchase_item or consumption_item)';
COMMENT ON COLUMN inventory_fifo_layers.remaining_qty IS 'Remaining quantity in this FIFO layer';
COMMENT ON COLUMN inventory_fifo_layers.unit_price IS 'Original unit price for cost tracking';
COMMENT ON COLUMN inventory_fifo_layers.fifo_date IS 'Date used for FIFO ordering (oldest first)';
