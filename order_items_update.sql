-- Add menu_set_id column to order_items table
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS menu_set_id INTEGER REFERENCES menu_sets(id) ON DELETE SET NULL;

-- Make menu_id nullable since it can be either menu_id or menu_set_id
ALTER TABLE order_items
ALTER COLUMN menu_id DROP NOT NULL;

-- Add a check constraint to ensure either menu_id or menu_set_id is set (but not both)
ALTER TABLE order_items
ADD CONSTRAINT check_menu_or_set CHECK (
  (menu_id IS NOT NULL AND menu_set_id IS NULL) OR
  (menu_id IS NULL AND menu_set_id IS NOT NULL)
);
