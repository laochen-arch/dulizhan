ALTER TABLE platform_plans ADD COLUMN paypal_monthly_plan_id TEXT;
ALTER TABLE platform_plans ADD COLUMN paypal_annual_plan_id TEXT;

ALTER TABLE platform_subscriptions ADD COLUMN provider TEXT;
ALTER TABLE platform_subscriptions ADD COLUMN provider_subscription_id TEXT;
ALTER TABLE platform_subscriptions ADD COLUMN provider_plan_id TEXT;
ALTER TABLE platform_subscriptions ADD COLUMN provider_status TEXT;
ALTER TABLE platform_subscriptions ADD COLUMN provider_updated_at TEXT;
ALTER TABLE platform_subscriptions ADD COLUMN entitlement_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE platform_subscriptions ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE platform_subscriptions ADD COLUMN next_retry_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS platform_subscriptions_provider_idx
  ON platform_subscriptions(provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS platform_billing_webhook_events (
  id TEXT PRIMARY KEY,
  provider_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  resource_id TEXT,
  application_id TEXT,
  status TEXT NOT NULL DEFAULT 'processing',
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  next_retry_at TEXT,
  last_error TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS platform_billing_webhook_retry_idx
  ON platform_billing_webhook_events(status, next_retry_at);

CREATE TABLE IF NOT EXISTS platform_delivery_jobs (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  current_step TEXT NOT NULL DEFAULT 'validate',
  template_site_id TEXT,
  site_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS platform_delivery_jobs_retry_idx
  ON platform_delivery_jobs(status, next_retry_at);

CREATE TABLE IF NOT EXISTS platform_security_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  risk_level TEXT NOT NULL DEFAULT 'normal',
  request_id TEXT,
  ip_hash TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS platform_security_events_created_idx
  ON platform_security_events(created_at DESC, risk_level);

CREATE TABLE IF NOT EXISTS platform_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS platform_rate_limits_expiry_idx
  ON platform_rate_limits(expires_at);
