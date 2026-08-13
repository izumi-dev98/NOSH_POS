-- Migration: add add_stock_category_id to internal_consumption_items

ALTER TABLE public.internal_consumption_items
  ADD COLUMN IF NOT EXISTS add_stock_category_id BIGINT,
  ADD COLUMN IF NOT EXISTS usage_stock_category_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_internal_consumption_items_add_stock_category'
  ) THEN
    ALTER TABLE public.internal_consumption_items
      ADD CONSTRAINT fk_internal_consumption_items_add_stock_category
      FOREIGN KEY (add_stock_category_id)
      REFERENCES public.add_stock_categories (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_internal_consumption_items_usage_stock_category'
  ) THEN
    ALTER TABLE public.internal_consumption_items
      ADD CONSTRAINT fk_internal_consumption_items_usage_stock_category
      FOREIGN KEY (usage_stock_category_id)
      REFERENCES public.usage_stock_categories (id);
  END IF;
END$$;
