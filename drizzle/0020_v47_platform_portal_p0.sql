-- V47 P0: owner activation and durable portal delivery state.
ALTER TABLE platform_applications ADD COLUMN owner_invite_token_hash TEXT;
ALTER TABLE platform_applications ADD COLUMN owner_invite_expires_at TEXT;
ALTER TABLE platform_applications ADD COLUMN owner_invite_status TEXT NOT NULL DEFAULT 'not_sent';
ALTER TABLE platform_applications ADD COLUMN owner_invited_at TEXT;
ALTER TABLE platform_applications ADD COLUMN owner_activated_at TEXT;

CREATE INDEX IF NOT EXISTS platform_applications_owner_invite_idx
  ON platform_applications(owner_invite_status, owner_invite_expires_at);
