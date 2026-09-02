CREATE TABLE IF NOT EXISTS platform_work_items (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  application_id TEXT,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  source_status TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  assigned_to_user_id TEXT,
  assigned_to_email TEXT,
  due_at TEXT NOT NULL,
  snoozed_until TEXT,
  resolved_at TEXT,
  source_updated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_type, source_id)
);

CREATE INDEX IF NOT EXISTS platform_work_items_queue_idx
  ON platform_work_items(status, priority, due_at);
CREATE INDEX IF NOT EXISTS platform_work_items_assignee_idx
  ON platform_work_items(assigned_to_user_id, status, due_at);
CREATE INDEX IF NOT EXISTS platform_work_items_application_idx
  ON platform_work_items(application_id, category, updated_at);

CREATE TABLE IF NOT EXISTS platform_work_item_events (
  id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS platform_work_item_events_idx
  ON platform_work_item_events(work_item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_saved_work_views (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  filters_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS platform_saved_work_views_user_idx
  ON platform_saved_work_views(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS platform_work_reminders (
  id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL UNIQUE,
  reminder_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  generated_at TEXT NOT NULL,
  dismissed_by TEXT,
  dismissed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS platform_work_reminders_status_idx
  ON platform_work_reminders(status, reminder_type, updated_at DESC);
