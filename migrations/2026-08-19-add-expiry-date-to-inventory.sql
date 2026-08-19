-- Store an expiry date on inventory items edited from the Inventory page.
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS expiry_date date;