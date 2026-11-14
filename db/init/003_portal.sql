-- Admin portal: staff accounts and login throttling. Safe to re-run.
--   docker compose exec -T db psql -U baza -d baza < db/init/003_portal.sql

CREATE SCHEMA IF NOT EXISTS portal;

CREATE TABLE IF NOT EXISTS portal.users (
    id            bigserial PRIMARY KEY,
    name          text NOT NULL,
    email         text NOT NULL UNIQUE,
    role          text NOT NULL CHECK (role IN ('super_admin','licensing_officer','complaints_officer','analyst','support_agent')),
    password_hash text NOT NULL,
    active        boolean NOT NULL DEFAULT true,
    must_change_password boolean NOT NULL DEFAULT false,
    last_login_at timestamptz,
    created_by    text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Failed logins, for lockout (5 failures in 15 minutes per email or per IP hash)
CREATE TABLE IF NOT EXISTS portal.login_attempts (
    id         bigserial PRIMARY KEY,
    email      text,
    ip_hash    text,
    success    boolean NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_idx ON portal.login_attempts (created_at DESC);

-- Staff actions done through the portal (who did what, when)
CREATE TABLE IF NOT EXISTS portal.audit_log (
    id         bigserial PRIMARY KEY,
    user_email text NOT NULL,
    method     text NOT NULL,
    path       text NOT NULL,
    status     int,
    created_at timestamptz NOT NULL DEFAULT now()
);
