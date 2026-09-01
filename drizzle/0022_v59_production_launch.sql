CREATE TABLE IF NOT EXISTS `cms_tenant_backups` (
  `id` text PRIMARY KEY NOT NULL,
  `site_id` text NOT NULL,
  `object_key` text NOT NULL UNIQUE,
  `status` text NOT NULL,
  `reason` text NOT NULL,
  `checksum` text NOT NULL,
  `row_counts` text NOT NULL,
  `size_bytes` integer DEFAULT 0 NOT NULL,
  `created_by` text NOT NULL,
  `created_at` text NOT NULL,
  `verified_at` text,
  `last_error` text
);
CREATE INDEX IF NOT EXISTS `cms_tenant_backups_site_idx` ON `cms_tenant_backups` (`site_id`,`created_at`);
