-- Migration: seed default inventory categories

INSERT INTO public.inventory_categories (name)
VALUES
  ('Dry Food'),
  ('Fresh Food'),
  ('Fresh Vegetable'),
  ('Take Way')
ON CONFLICT DO NOTHING;
