-- V34 platform commercial layer: plans, agreements, billing ledger and referrals.
ALTER TABLE platform_applications ADD COLUMN locale TEXT NOT NULL DEFAULT 'en-US';
ALTER TABLE platform_applications ADD COLUMN referral_code TEXT;

CREATE TABLE IF NOT EXISTS platform_plans (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  setup_fee REAL NOT NULL DEFAULT 0,
  monthly_fee REAL NOT NULL DEFAULT 0,
  annual_fee REAL NOT NULL DEFAULT 0,
  service_fee_percent REAL NOT NULL DEFAULT 0,
  referral_reward REAL NOT NULL DEFAULT 0,
  features_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_subscriptions (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  billing_interval TEXT NOT NULL DEFAULT 'monthly',
  currency TEXT NOT NULL DEFAULT 'USD',
  setup_fee REAL NOT NULL DEFAULT 0,
  recurring_fee REAL NOT NULL DEFAULT 0,
  service_fee_percent REAL NOT NULL DEFAULT 0,
  current_period_start TEXT,
  current_period_end TEXT,
  next_billing_at TEXT,
  grace_until TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  agreement_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_agreements (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  agreement_version TEXT NOT NULL,
  plan_snapshot TEXT NOT NULL,
  signer_user_id TEXT NOT NULL,
  signer_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  signed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_billing_invoices (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'open',
  due_at TEXT NOT NULL,
  paid_at TEXT,
  payment_provider TEXT,
  provider_reference TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  retry_count INTEGER NOT NULL DEFAULT 0,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_billing_payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'created',
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_reference TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_referral_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  referrer_user_id TEXT NOT NULL,
  referrer_email TEXT NOT NULL,
  reward_amount REAL NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_referrals (
  id TEXT PRIMARY KEY,
  code_id TEXT NOT NULL,
  application_id TEXT NOT NULL UNIQUE,
  referred_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'applied',
  reward_amount REAL NOT NULL DEFAULT 0,
  qualified_at TEXT,
  rewarded_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_referral_rewards (
  id TEXT PRIMARY KEY,
  referral_id TEXT NOT NULL UNIQUE,
  recipient_email TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS platform_subscriptions_status_idx ON platform_subscriptions(status, next_billing_at);
CREATE INDEX IF NOT EXISTS platform_invoices_application_idx ON platform_billing_invoices(application_id, status, due_at);
CREATE INDEX IF NOT EXISTS platform_referrals_code_idx ON platform_referrals(code_id, status);
