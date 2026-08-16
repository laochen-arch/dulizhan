CREATE TABLE IF NOT EXISTS `store_newsletter_subscribers` (
	`site_id` text NOT NULL,
	`email` text NOT NULL,
	`status` text DEFAULT 'subscribed' NOT NULL,
	`source` text DEFAULT 'storefront' NOT NULL,
	`consent_at` text NOT NULL,
	`last_email_status` text DEFAULT 'not_sent' NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`site_id`, `email`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `store_newsletter_site_status_idx` ON `store_newsletter_subscribers` (`site_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `store_stock_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`email` text NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`notified_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `store_stock_alerts_unique` ON `store_stock_alerts` (`site_id`,`email`,`product_id`,`variant_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `store_stock_alerts_product_idx` ON `store_stock_alerts` (`site_id`,`product_id`,`variant_id`,`status`);
