CREATE TABLE IF NOT EXISTS `cms_release_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `site_id` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `label` text NOT NULL,
  `note` text,
  `requested_by` text NOT NULL,
  `requested_by_email` text NOT NULL,
  `requested_at` text NOT NULL,
  `reviewed_by` text,
  `reviewed_by_email` text,
  `reviewed_at` text,
  `revision_id` text,
  `published_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cms_release_requests_site_idx` ON `cms_release_requests` (`site_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cms_preview_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `site_id` text NOT NULL,
  `token_hash` text NOT NULL,
  `mode` text DEFAULT 'draft' NOT NULL,
  `expires_at` text NOT NULL,
  `created_by` text NOT NULL,
  `created_at` text NOT NULL,
  `last_used_at` text,
  CONSTRAINT `cms_preview_tokens_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cms_preview_tokens_site_idx` ON `cms_preview_tokens` (`site_id`,`expires_at`);
