-- Activity log / audit trail for all user actions and print events.
-- Run this file in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES public."user"(id) ON DELETE SET NULL,
  username TEXT,
  user_role TEXT,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  description TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at
  ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id
  ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_module_action
  ON public.activity_logs(module, action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity
  ON public.activity_logs(entity_type, entity_id);

GRANT SELECT, INSERT ON public.activity_logs TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.activity_logs_id_seq TO anon, authenticated;

-- The app uses its own user table and the Supabase anon key, so allow the
-- application client to write and read the audit trail through PostgREST.
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_logs_read_policy ON public.activity_logs;
CREATE POLICY activity_logs_read_policy
  ON public.activity_logs FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS activity_logs_insert_policy ON public.activity_logs;
CREATE POLICY activity_logs_insert_policy
  ON public.activity_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Retain audit records for six months. The scheduled database job runs daily,
-- so the frontend does not need to be open for cleanup to happen.
CREATE OR REPLACE FUNCTION public.delete_old_activity_logs()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count BIGINT;
BEGIN
  DELETE FROM public.activity_logs
  WHERE created_at < NOW() - INTERVAL '6 months';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- User profile and password security update.
ALTER TABLE public."user"
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS position TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Existing plaintext passwords are retained only for one-time login migration.
-- The application replaces password_hash after a successful legacy login.
CREATE INDEX IF NOT EXISTS idx_user_department ON public."user"(department);
CREATE INDEX IF NOT EXISTS idx_user_position ON public."user"(position);

REVOKE ALL ON FUNCTION public.delete_old_activity_logs() FROM PUBLIC, anon, authenticated;

-- pg_cron is available in Supabase. Re-running this migration replaces the
-- existing job instead of creating duplicate cleanup schedules.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
DECLARE
  existing_job_id BIGINT;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'delete-old-activity-logs';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'delete-old-activity-logs',
    '0 2 * * *',
    $job$SELECT public.delete_old_activity_logs();$job$
  );
END;
$$;
