CREATE TABLE IF NOT EXISTS `cms_launch_checks` (
  `site_id` text NOT NULL,
  `check_key` text NOT NULL,
  `completed` integer NOT NULL DEFAULT 0,
  `note` text,
  `updated_at` text NOT NULL,
  `updated_by` text NOT NULL,
  PRIMARY KEY(`site_id`, `check_key`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cms_launch_checks_site_idx` ON `cms_launch_checks` (`site_id`, `updated_at`);
