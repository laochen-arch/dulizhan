CREATE TABLE `cms_abandoned_checkouts` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`email` text,
	`cart_payload` text NOT NULL,
	`subtotal` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`recovered_at` text
);
--> statement-breakpoint
CREATE INDEX `cms_abandoned_site_idx` ON `cms_abandoned_checkouts` (`site_id`,`status`,`last_seen_at`);--> statement-breakpoint
CREATE TABLE `cms_after_sales_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`order_id` text NOT NULL,
	`email` text NOT NULL,
	`request_type` text NOT NULL,
	`reason` text NOT NULL,
	`customer_note` text,
	`admin_note` text,
	`requested_amount` real,
	`items` text,
	`status` text DEFAULT 'submitted' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `cms_after_sales_site_idx` ON `cms_after_sales_requests` (`site_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `cms_analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`event_type` text NOT NULL,
	`product_id` text,
	`order_id` text,
	`session_id` text,
	`payload` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cms_analytics_site_idx` ON `cms_analytics_events` (`site_id`,`event_type`,`created_at`);--> statement-breakpoint
CREATE TABLE `cms_bundles` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`product_ids` text NOT NULL,
	`discount_type` text DEFAULT 'percent' NOT NULL,
	`discount_value` real DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_bundles_site_slug_unique` ON `cms_bundles` (`site_id`,`slug`);--> statement-breakpoint
CREATE INDEX `cms_bundles_site_idx` ON `cms_bundles` (`site_id`,`active`,`created_at`);--> statement-breakpoint
CREATE TABLE `cms_client_intake` (
	`site_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'incomplete' NOT NULL,
	`payload` text NOT NULL,
	`submitted_by` text,
	`approved_by` text,
	`submitted_at` text,
	`approved_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cms_coupons` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`code` text NOT NULL,
	`discount_type` text DEFAULT 'percent' NOT NULL,
	`discount_value` real NOT NULL,
	`min_subtotal` real DEFAULT 0 NOT NULL,
	`max_uses` integer,
	`uses` integer DEFAULT 0 NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_coupons_site_code_unique` ON `cms_coupons` (`site_id`,`code`);--> statement-breakpoint
CREATE TABLE `cms_delivery_runs` (
	`site_id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`current_step` text DEFAULT 'intake' NOT NULL,
	`package_name` text,
	`package_summary` text,
	`import_revision_id` text,
	`last_error` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cms_delivery_runs_status_idx` ON `cms_delivery_runs` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `cms_health_checks` (
	`site_id` text NOT NULL,
	`check_key` text NOT NULL,
	`status` text NOT NULL,
	`detail` text NOT NULL,
	`checked_at` text NOT NULL,
	PRIMARY KEY(`site_id`, `check_key`)
);
--> statement-breakpoint
CREATE INDEX `cms_health_site_idx` ON `cms_health_checks` (`site_id`,`checked_at`);--> statement-breakpoint
CREATE TABLE `cms_launch_checks` (
	`site_id` text NOT NULL,
	`check_key` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`note` text,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	PRIMARY KEY(`site_id`, `check_key`)
);
--> statement-breakpoint
CREATE INDEX `cms_launch_checks_site_idx` ON `cms_launch_checks` (`site_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `cms_operation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`category` text NOT NULL,
	`action` text NOT NULL,
	`status` text DEFAULT 'success' NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`message` text NOT NULL,
	`metadata` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` text,
	`next_retry_at` text,
	`resolved_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cms_operations_site_idx` ON `cms_operation_events` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `cms_operations_status_idx` ON `cms_operation_events` (`site_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `cms_order_access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`order_id` text NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_used_at` text,
	`request_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_order_access_tokens_token_hash_unique` ON `cms_order_access_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `cms_order_access_tokens_idx` ON `cms_order_access_tokens` (`site_id`,`order_id`,`email`);--> statement-breakpoint
CREATE TABLE `cms_order_state_events` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`order_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`reason` text,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cms_order_state_events_idx` ON `cms_order_state_events` (`site_id`,`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `cms_preview_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`mode` text DEFAULT 'draft' NOT NULL,
	`expires_at` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_preview_tokens_token_hash_unique` ON `cms_preview_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `cms_preview_tokens_site_idx` ON `cms_preview_tokens` (`site_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `cms_release_requests` (
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
CREATE INDEX `cms_release_requests_site_idx` ON `cms_release_requests` (`site_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `cms_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`product_id` text NOT NULL,
	`order_id` text,
	`email` text NOT NULL,
	`rating` integer NOT NULL,
	`title` text,
	`body` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cms_reviews_product_idx` ON `cms_reviews` (`site_id`,`product_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `cms_site_integrations` (
	`site_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'missing' NOT NULL,
	`client_id_cipher` text,
	`client_secret_cipher` text,
	`webhook_id_cipher` text,
	`api_key_cipher` text,
	`environment` text DEFAULT 'sandbox' NOT NULL,
	`from_email` text,
	`from_domain` text,
	`last_checked_at` text,
	`last_error` text,
	`updated_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`site_id`, `provider`)
);
--> statement-breakpoint
CREATE INDEX `cms_site_integrations_status_idx` ON `cms_site_integrations` (`site_id`,`status`);--> statement-breakpoint
CREATE TABLE `customer_addresses` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`user_id` text NOT NULL,
	`label` text DEFAULT 'Shipping address' NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`address` text NOT NULL,
	`city` text NOT NULL,
	`region` text NOT NULL,
	`zip` text NOT NULL,
	`country` text NOT NULL,
	`phone` text,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customer_addresses_user_idx` ON `customer_addresses` (`site_id`,`user_id`,`is_default`,`updated_at`);--> statement-breakpoint
CREATE TABLE `customer_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_sessions_token_hash_unique` ON `customer_sessions` (`token_hash`);--> statement-breakpoint
CREATE TABLE `merchant_members` (
	`site_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'merchant_staff' NOT NULL,
	`source` text DEFAULT 'invited' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`site_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `merchant_members_site_role_idx` ON `merchant_members` (`site_id`,`role`,`created_at`);--> statement-breakpoint
CREATE INDEX `merchant_members_site_email_idx` ON `merchant_members` (`site_id`,`email`);--> statement-breakpoint
CREATE TABLE `store_customers` (
	`site_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`phone` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`site_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `store_customers_site_email_idx` ON `store_customers` (`site_id`,`email`);--> statement-breakpoint
CREATE TABLE `store_wishlists` (
	`site_id` text NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`site_id`, `user_id`, `product_id`)
);
--> statement-breakpoint
CREATE INDEX `store_wishlists_user_idx` ON `store_wishlists` (`site_id`,`user_id`,`created_at`);--> statement-breakpoint
DROP INDEX `cms_orders_stripe_session_unique`;--> statement-breakpoint
ALTER TABLE `cms_orders` ADD `paypal_order_id` text;--> statement-breakpoint
ALTER TABLE `cms_orders` ADD `paypal_approval_url` text;--> statement-breakpoint
ALTER TABLE `cms_orders` ADD `paypal_capture_id` text;--> statement-breakpoint
ALTER TABLE `cms_orders` ADD `checkout_idempotency_key` text;--> statement-breakpoint
ALTER TABLE `cms_orders` ADD `discount` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cms_orders` ADD `coupon_code` text;--> statement-breakpoint
CREATE UNIQUE INDEX `cms_orders_paypal_order_unique` ON `cms_orders` (`paypal_order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cms_orders_checkout_idempotency_unique` ON `cms_orders` (`checkout_idempotency_key`);--> statement-breakpoint
ALTER TABLE `cms_orders` DROP COLUMN `stripe_session_id`;--> statement-breakpoint
ALTER TABLE `cms_orders` DROP COLUMN `stripe_payment_intent_id`;--> statement-breakpoint
DROP INDEX `cms_refunds_stripe_unique`;--> statement-breakpoint
ALTER TABLE `cms_refunds` ADD `paypal_refund_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `cms_refunds_paypal_unique` ON `cms_refunds` (`paypal_refund_id`);--> statement-breakpoint
ALTER TABLE `cms_refunds` DROP COLUMN `stripe_refund_id`;--> statement-breakpoint
ALTER TABLE `cms_inventory_transactions` ADD `idempotency_key` text;--> statement-breakpoint
ALTER TABLE `cms_payment_events` ADD `dead_lettered` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `cms_payment_events` ADD `last_attempt_at` text;