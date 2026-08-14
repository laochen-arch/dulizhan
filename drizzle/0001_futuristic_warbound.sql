CREATE TABLE `cms_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`asset_key` text NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`object_key` text,
	`alt` text DEFAULT '' NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cms_assets_site_idx` ON `cms_assets` (`site_id`);--> statement-breakpoint
CREATE TABLE `cms_members` (
	`site_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`site_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `cms_members_email_idx` ON `cms_members` (`site_id`,`email`);--> statement-breakpoint
CREATE TABLE `cms_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cms_revisions_site_created_idx` ON `cms_revisions` (`site_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `cms_site_products` (
	`site_id` text NOT NULL,
	`product_id` text NOT NULL,
	`draft_payload` text NOT NULL,
	`published_payload` text,
	`status` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text,
	`published_at` text,
	`published_by` text,
	PRIMARY KEY(`site_id`, `product_id`)
);
--> statement-breakpoint
CREATE INDEX `cms_site_products_site_status_idx` ON `cms_site_products` (`site_id`,`status`);--> statement-breakpoint
CREATE TABLE `cms_site_settings` (
	`site_id` text PRIMARY KEY NOT NULL,
	`draft_config` text NOT NULL,
	`published_config` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text,
	`published_at` text,
	`published_by` text
);
--> statement-breakpoint
CREATE TABLE `cms_sites` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`domain` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_sites_slug_unique` ON `cms_sites` (`slug`);