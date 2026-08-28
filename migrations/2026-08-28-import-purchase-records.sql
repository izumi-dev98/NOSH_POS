-- Import purchase records from spec/purchase.csv.
-- Run from the repository root with psql so the relative CSV path resolves:
--   psql "$DATABASE_URL" -f migrations/2026-08-28-import-purchase-records.sql
--
-- The CSV has no supplier or invoice number. Each CSV line becomes one received
-- purchase record with supplier_id set to NULL and a generated invoice number.

BEGIN;

CREATE TEMP TABLE purchase_csv_import (
  purchase_date TEXT,
  ingredient_code TEXT,
  item_name TEXT,
  category TEXT,
  inventory_uom TEXT,
  listed_price TEXT,
  purchase_qty TEXT,
  purchase_price_per_unit TEXT
) ON COMMIT DROP;

\copy purchase_csv_import (purchase_date, ingredient_code, item_name, category, inventory_uom, listed_price, purchase_qty, purchase_price_per_unit) FROM 'spec/purchase.csv' WITH (FORMAT csv, HEADER true, NULL '');

CREATE TEMP TABLE purchase_imported_rows ON COMMIT DROP AS
SELECT
  row_number() OVER (ORDER BY import_order)::BIGINT AS import_number,
  to_date(trim(purchase_date), 'DD/MM/YY') AS purchase_date,
  trim(item_name) AS item_name,
  trim(inventory_uom) AS inventory_uom,
  replace(trim(purchase_qty), ',', '')::NUMERIC AS purchase_qty,
  replace(trim(purchase_price_per_unit), ',', '')::NUMERIC AS unit_price
FROM (
  SELECT *, row_number() OVER () AS import_order
  FROM purchase_csv_import
) source
WHERE NULLIF(trim(item_name), '') IS NOT NULL
  AND NULLIF(trim(purchase_date), '') IS NOT NULL
  AND NULLIF(replace(trim(purchase_qty), ',', ''), '') IS NOT NULL
  AND NULLIF(replace(trim(purchase_price_per_unit), ',', ''), '') IS NOT NULL;

CREATE TEMP TABLE purchase_imported_ids (
  import_number BIGINT PRIMARY KEY,
  purchase_id BIGINT NOT NULL
) ON COMMIT DROP;

INSERT INTO public.purchases (
  invoice_number,
  date,
  supplier_id,
  total_amount,
  notes,
  status,
  discount,
  tax,
  payment_type
)
SELECT
  'CSV-' || to_char(rows.purchase_date, 'YYYYMMDD') || '-' || lpad(rows.import_number::TEXT, 4, '0'),
  rows.purchase_date,
  NULL,
  rows.purchase_qty * rows.unit_price,
  'Imported from spec/purchase.csv',
  'received',
  0,
  0,
  'Cash Down'
FROM purchase_imported_rows rows
WHERE NOT EXISTS (
  SELECT 1
  FROM public.purchases existing
  WHERE existing.invoice_number = 'CSV-' || to_char(rows.purchase_date, 'YYYYMMDD') || '-' || lpad(rows.import_number::TEXT, 4, '0')
);

INSERT INTO purchase_imported_ids (import_number, purchase_id)
SELECT rows.import_number, purchases.id
FROM purchase_imported_rows rows
JOIN public.purchases purchases
  ON purchases.invoice_number = 'CSV-' || to_char(rows.purchase_date, 'YYYYMMDD') || '-' || lpad(rows.import_number::TEXT, 4, '0');

INSERT INTO public.purchase_items (
  purchase_id,
  item_name,
  original_qty,
  qty,
  foc_qty,
  unit_price,
  total_price,
  type,
  expiry_date
)
SELECT
  imported.purchase_id,
  rows.item_name,
  rows.purchase_qty,
  rows.purchase_qty,
  0,
  rows.unit_price,
  rows.purchase_qty * rows.unit_price,
  NULLIF(rows.inventory_uom, ''),
  NULL
FROM purchase_imported_rows rows
JOIN purchase_imported_ids imported USING (import_number)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.purchase_items existing
  WHERE existing.purchase_id = imported.purchase_id
);

COMMIT;
