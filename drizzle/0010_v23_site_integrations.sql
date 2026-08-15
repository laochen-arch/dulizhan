CREATE TABLE IF NOT EXISTS cms_site_integrations (
  site_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'missing',
  client_id_cipher TEXT,
  client_secret_cipher TEXT,
  webhook_id_cipher TEXT,
  api_key_cipher TEXT,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  from_email TEXT,
  from_domain TEXT,
  last_checked_at TEXT,
  last_error TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (site_id, provider)
);
CREATE INDEX IF NOT EXISTS cms_site_integrations_status_idx ON cms_site_integrations(site_id, status);
