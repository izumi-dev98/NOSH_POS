-- Run this in the Supabase SQL Editor.
-- Shared maintenance-mode setting for the NOSH POS application.

CREATE TABLE IF NOT EXISTS public.app_settings (
  setting_key TEXT PRIMARY KEY,
  maintenance_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by BIGINT REFERENCES public."user"(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.app_settings (setting_key, maintenance_enabled)
VALUES ('maintenance_mode', FALSE)
ON CONFLICT (setting_key) DO NOTHING;

GRANT SELECT, UPDATE ON public.app_settings TO anon, authenticated;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_settings_read_policy ON public.app_settings;
CREATE POLICY app_settings_read_policy
  ON public.app_settings FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS app_settings_update_policy ON public.app_settings;
CREATE POLICY app_settings_update_policy
  ON public.app_settings FOR UPDATE
  TO anon, authenticated
  USING (setting_key = 'maintenance_mode')
  WITH CHECK (setting_key = 'maintenance_mode');
