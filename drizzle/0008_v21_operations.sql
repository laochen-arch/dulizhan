CREATE TABLE IF NOT EXISTS `cms_order_state_events` (`id` text PRIMARY KEY NOT NULL, `site_id` text NOT NULL, `order_id` text NOT NULL, `from_status` text, `to_status` text NOT NULL, `reason` text, `actor_id` text NOT NULL, `created_at` text NOT NULL);
CREATE INDEX IF NOT EXISTS `cms_order_state_events_idx` ON `cms_order_state_events` (`site_id`, `order_id`, `created_at`);
CREATE TABLE IF NOT EXISTS `cms_order_access_tokens` (`id` text PRIMARY KEY NOT NULL, `site_id` text NOT NULL, `order_id` text NOT NULL, `email` text NOT NULL, `token_hash` text NOT NULL UNIQUE, `expires_at` text NOT NULL, `last_used_at` text, `request_count` integer NOT NULL DEFAULT 0, `created_at` text NOT NULL);
CREATE INDEX IF NOT EXISTS `cms_order_access_tokens_idx` ON `cms_order_access_tokens` (`site_id`, `order_id`, `email`);
CREATE TABLE IF NOT EXISTS `cms_after_sales_requests` (`id` text PRIMARY KEY NOT NULL, `site_id` text NOT NULL, `order_id` text NOT NULL, `email` text NOT NULL, `request_type` text NOT NULL, `reason` text NOT NULL, `customer_note` text, `admin_note` text, `requested_amount` real, `items` text, `status` text NOT NULL DEFAULT 'submitted', `created_at` text NOT NULL, `updated_at` text NOT NULL, `resolved_at` text);
CREATE INDEX IF NOT EXISTS `cms_after_sales_site_idx` ON `cms_after_sales_requests` (`site_id`, `status`, `created_at`);
CREATE TABLE IF NOT EXISTS `cms_client_intake` (`site_id` text PRIMARY KEY NOT NULL, `status` text NOT NULL DEFAULT 'incomplete', `payload` text NOT NULL, `submitted_by` text, `approved_by` text, `submitted_at` text, `approved_at` text, `updated_at` text NOT NULL);
CREATE TABLE IF NOT EXISTS `cms_coupons` (`id` text PRIMARY KEY NOT NULL, `site_id` text NOT NULL, `code` text NOT NULL, `discount_type` text NOT NULL DEFAULT 'percent', `discount_value` real NOT NULL, `min_subtotal` real NOT NULL DEFAULT 0, `max_uses` integer, `uses` integer NOT NULL DEFAULT 0, `starts_at` text, `ends_at` text, `active` integer NOT NULL DEFAULT 1, `created_at` text NOT NULL, `updated_at` text NOT NULL, UNIQUE(`site_id`, `code`));
CREATE TABLE IF NOT EXISTS `cms_bundles` (`id` text PRIMARY KEY NOT NULL, `site_id` text NOT NULL, `name` text NOT NULL, `slug` text NOT NULL, `product_ids` text NOT NULL, `discount_type` text NOT NULL DEFAULT 'percent', `discount_value` real NOT NULL DEFAULT 0, `active` integer NOT NULL DEFAULT 1, `created_at` text NOT NULL, `updated_at` text NOT NULL, UNIQUE(`site_id`, `slug`));
CREATE INDEX IF NOT EXISTS `cms_bundles_site_idx` ON `cms_bundles` (`site_id`, `active`, `created_at`);
CREATE TABLE IF NOT EXISTS `cms_reviews` (`id` text PRIMARY KEY NOT NULL, `site_id` text NOT NULL, `product_id` text NOT NULL, `order_id` text, `email` text NOT NULL, `rating` integer NOT NULL, `title` text, `body` text NOT NULL, `status` text NOT NULL DEFAULT 'pending', `created_at` text NOT NULL, `updated_at` text NOT NULL);
CREATE INDEX IF NOT EXISTS `cms_reviews_product_idx` ON `cms_reviews` (`site_id`, `product_id`, `status`, `created_at`);
CREATE TABLE IF NOT EXISTS `cms_analytics_events` (`id` text PRIMARY KEY NOT NULL, `site_id` text NOT NULL, `event_type` text NOT NULL, `product_id` text, `order_id` text, `session_id` text, `payload` text, `created_at` text NOT NULL);
CREATE INDEX IF NOT EXISTS `cms_analytics_site_idx` ON `cms_analytics_events` (`site_id`, `event_type`, `created_at`);
CREATE TABLE IF NOT EXISTS `cms_abandoned_checkouts` (`id` text PRIMARY KEY NOT NULL, `site_id` text NOT NULL, `email` text, `cart_payload` text NOT NULL, `subtotal` real NOT NULL DEFAULT 0, `currency` text NOT NULL DEFAULT 'usd', `status` text NOT NULL DEFAULT 'open', `created_at` text NOT NULL, `last_seen_at` text NOT NULL, `recovered_at` text);
CREATE INDEX IF NOT EXISTS `cms_abandoned_site_idx` ON `cms_abandoned_checkouts` (`site_id`, `status`, `last_seen_at`);
CREATE TABLE IF NOT EXISTS `cms_health_checks` (`site_id` text NOT NULL, `check_key` text NOT NULL, `status` text NOT NULL, `detail` text NOT NULL, `checked_at` text NOT NULL, PRIMARY KEY(`site_id`, `check_key`));
CREATE INDEX IF NOT EXISTS `cms_health_site_idx` ON `cms_health_checks` (`site_id`, `checked_at`);
--> statement-breakpoint
ALTER TABLE `cms_orders` ADD `discount` real NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `cms_orders` ADD `coupon_code` text;
--> statement-breakpoint
ALTER TABLE `cms_payment_events` ADD `dead_lettered` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `cms_payment_events` ADD `last_attempt_at` text;
--> statement-breakpoint
ALTER TABLE `cms_inventory_transactions` ADD `idempotency_key` text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `cms_inventory_tx_idempotency_unique` ON `cms_inventory_transactions` (`idempotency_key`) WHERE `idempotency_key` IS NOT NULL;
