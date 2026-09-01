ALTER TABLE platform_subscriptions ADD COLUMN trial_ends_at TEXT;

CREATE INDEX IF NOT EXISTS platform_subscriptions_trial_idx
  ON platform_subscriptions(status, trial_ends_at, grace_until);
