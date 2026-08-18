-- Create opening inventory tracking table
CREATE TABLE IF NOT EXISTS opening_inventory (
  id BIGSERIAL PRIMARY KEY,
  inventory_id BIGINT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  opening_date DATE NOT NULL,
  opening_qty NUMERIC NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(inventory_id, opening_date),
  CONSTRAINT opening_qty_positive CHECK (opening_qty >= 0)
);

-- Create daily inventory movements table to track daily changes
CREATE TABLE IF NOT EXISTS daily_inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  inventory_id BIGINT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  movement_date DATE NOT NULL,
  opening_qty NUMERIC NOT NULL DEFAULT 0,
  purchase_qty NUMERIC NOT NULL DEFAULT 0,
  add_stock_qty NUMERIC NOT NULL DEFAULT 0,
  adjust_qty NUMERIC NOT NULL DEFAULT 0,
  sale_usage_qty NUMERIC NOT NULL DEFAULT 0,
  internal_usage_qty NUMERIC NOT NULL DEFAULT 0,
  closing_qty NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(inventory_id, movement_date),
  CONSTRAINT closing_qty_non_negative CHECK (closing_qty >= 0)
);

-- Create indexes for better query performance
CREATE INDEX idx_opening_inventory_date ON opening_inventory(opening_date);
CREATE INDEX idx_opening_inventory_inventory_id ON opening_inventory(inventory_id);
CREATE INDEX idx_daily_movements_date ON daily_inventory_movements(movement_date);
CREATE INDEX idx_daily_movements_inventory_id ON daily_inventory_movements(inventory_id);
CREATE INDEX idx_daily_movements_inventory_date ON daily_inventory_movements(inventory_id, movement_date);

-- Add trigger to auto-update updated_at for opening_inventory
CREATE OR REPLACE FUNCTION update_opening_inventory_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER opening_inventory_timestamp_trigger
BEFORE UPDATE ON opening_inventory
FOR EACH ROW
EXECUTE FUNCTION update_opening_inventory_timestamp();

-- Add trigger to auto-update updated_at for daily_inventory_movements
CREATE OR REPLACE FUNCTION update_daily_movements_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER daily_movements_timestamp_trigger
BEFORE UPDATE ON daily_inventory_movements
FOR EACH ROW
EXECUTE FUNCTION update_daily_movements_timestamp();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON opening_inventory TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON daily_inventory_movements TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE opening_inventory_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE daily_inventory_movements_id_seq TO authenticated;
