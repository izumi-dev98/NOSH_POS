-- Run this in Supabase SQL Editor.
-- Adds profile fields and the password hash column used by the app.

ALTER TABLE public."user"
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS position TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_user_department ON public."user"(department);
CREATE INDEX IF NOT EXISTS idx_user_position ON public."user"(position);

-- Existing plaintext passwords are migrated by the app after the user's next
-- successful login. Do not copy plaintext values into password_hash here.
