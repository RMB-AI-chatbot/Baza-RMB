-- Admin portal security: two-factor authentication, session invalidation, detailed audit trail,
-- and a migrations register (scripts/migrate.sh records each db/init file it applied). Safe to re-run.

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    filename   text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE portal.users ADD COLUMN IF NOT EXISTS totp_secret text;            -- base32, set once 2FA is confirmed
ALTER TABLE portal.users ADD COLUMN IF NOT EXISTS totp_pending text;           -- secret shown during enrolment
ALTER TABLE portal.users ADD COLUMN IF NOT EXISTS totp_last_step bigint;       -- blocks replay of a used code
-- Bumped on password change/reset, deactivation and 2FA reset: every open session of that user ends.
ALTER TABLE portal.users ADD COLUMN IF NOT EXISTS session_version int NOT NULL DEFAULT 1;
ALTER TABLE portal.users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

ALTER TABLE portal.audit_log ADD COLUMN IF NOT EXISTS action text;   -- e.g. login, login_failed, user_created
ALTER TABLE portal.audit_log ADD COLUMN IF NOT EXISTS detail text;
ALTER TABLE portal.audit_log ADD COLUMN IF NOT EXISTS ip_hash text;
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON portal.audit_log (created_at DESC);
