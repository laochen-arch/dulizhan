-- V33 platform portal onboarding records. Runtime schema initialization also
-- adds the new application columns for existing Sites databases.
CREATE TABLE IF NOT EXISTS platform_applications (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT NOT NULL,
  applicant_type TEXT NOT NULL DEFAULT 'business',
  contact_name TEXT NOT NULL,
  phone TEXT,
  company_name TEXT NOT NULL,
  brand_name TEXT NOT NULL,
  category TEXT NOT NULL,
  website TEXT,
  target_domain TEXT,
  markets TEXT,
  product_source TEXT,
  notes TEXT,
  template_site_id TEXT NOT NULL DEFAULT 'default',
  brand_logo_url TEXT,
  brand_primary_color TEXT,
  home_copy TEXT,
  product_import_payload TEXT,
  access_token_hash TEXT,
  access_token_expires_at TEXT,
  agreement_version TEXT,
  agreement_accepted_at TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  assigned_site_id TEXT,
  admin_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS platform_applications_email_idx ON platform_applications(email, created_at);
CREATE INDEX IF NOT EXISTS platform_applications_status_idx ON platform_applications(status, updated_at);

CREATE TABLE IF NOT EXISTS platform_application_events (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  actor_user_id TEXT,
  actor_email TEXT,
  payload TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS platform_application_events_idx ON platform_application_events(application_id, created_at);

CREATE TABLE IF NOT EXISTS platform_domain_requests (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  site_id TEXT,
  hostname TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  requested_by TEXT NOT NULL,
  requested_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_domain_requests_hostname_idx ON platform_domain_requests(hostname) WHERE status IN ('pending', 'reviewing', 'active');
CREATE INDEX IF NOT EXISTS platform_domain_requests_idx ON platform_domain_requests(application_id, status, updated_at);

CREATE TABLE IF NOT EXISTS platform_application_assets (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'general',
  url TEXT NOT NULL,
  object_key TEXT,
  alt TEXT,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS platform_application_assets_idx ON platform_application_assets(application_id, created_at);

CREATE TABLE IF NOT EXISTS platform_support_tickets (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT NOT NULL,
  created_by_email TEXT NOT NULL,
  assigned_to TEXT,
  admin_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS platform_support_tickets_idx ON platform_support_tickets(application_id, status, updated_at);
