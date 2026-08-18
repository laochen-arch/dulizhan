-- V46 P0: durable platform application notification records.
-- Runtime initialization also creates this table for existing Sites databases.
CREATE TABLE IF NOT EXISTS platform_application_notifications (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS platform_application_notifications_idx
  ON platform_application_notifications(application_id, status, created_at);
