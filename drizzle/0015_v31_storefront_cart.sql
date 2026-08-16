-- V31 durable customer cart. Runtime initialization keeps this migration safe
-- for existing Sites databases that already contain the table.
CREATE TABLE IF NOT EXISTS store_carts (
  site_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  items_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (site_id, user_id)
);
CREATE INDEX IF NOT EXISTS store_carts_user_idx ON store_carts(site_id, user_id, updated_at);
