-- Create menu_sets table
CREATE TABLE IF NOT EXISTS menu_sets (
  id SERIAL PRIMARY KEY,
  set_name VARCHAR(255) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create menu_set_items table (junction table for menu sets and menu items)
CREATE TABLE IF NOT EXISTS menu_set_items (
  id SERIAL PRIMARY KEY,
  set_id INTEGER NOT NULL REFERENCES menu_sets(id) ON DELETE CASCADE,
  menu_id INTEGER NOT NULL REFERENCES menu(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_menu_sets_category ON menu_sets(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_set_items_set ON menu_set_items(set_id);
CREATE INDEX IF NOT EXISTS idx_menu_set_items_menu ON menu_set_items(menu_id);
