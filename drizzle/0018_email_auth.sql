-- Email identity for platform, merchant and storefront account access.
CREATE TABLE IF NOT EXISTS email_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  email_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS email_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS email_auth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS email_sessions_user_idx ON email_sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS email_tokens_user_idx ON email_auth_tokens(user_id, kind, expires_at);
