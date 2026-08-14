CREATE TABLE `cms_inventory` (
	`site_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`sku` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`reserved_quantity` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`site_id`, `product_id`, `variant_id`)
);
--> statement-breakpoint
CREATE INDEX `cms_inventory_site_sku_idx` ON `cms_inventory` (`site_id`,`sku`);--> statement-breakpoint
CREATE TABLE `cms_inventory_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`sku` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`reference_id` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cms_inventory_tx_site_idx` ON `cms_inventory_transactions` (`site_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `cms_order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`site_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`variant_label` text NOT NULL,
	`unit_price` real NOT NULL,
	`quantity` integer NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cms_order_items_order_idx` ON `cms_order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `cms_order_items_site_idx` ON `cms_order_items` (`site_id`);--> statement-breakpoint
CREATE TABLE `cms_order_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`order_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider_id` text,
	`error` text,
	`created_at` text NOT NULL,
	`sent_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_order_notifications_order_type_unique` ON `cms_order_notifications` (`order_id`,`type`);--> statement-breakpoint
CREATE INDEX `cms_order_notifications_site_idx` ON `cms_order_notifications` (`site_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `cms_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`order_number` text NOT NULL,
	`email` text NOT NULL,
	`customer_name` text NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`subtotal` real NOT NULL,
	`shipping` real NOT NULL,
	`tax` real DEFAULT 0 NOT NULL,
	`total` real NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`fulfillment_status` text DEFAULT 'unfulfilled' NOT NULL,
	`stripe_session_id` text,
	`stripe_payment_intent_id` text,
	`shipping_address` text NOT NULL,
	`tracking_number` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`paid_at` text,
	`shipped_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_orders_number_unique` ON `cms_orders` (`order_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `cms_orders_stripe_session_unique` ON `cms_orders` (`stripe_session_id`);--> statement-breakpoint
CREATE INDEX `cms_orders_site_status_idx` ON `cms_orders` (`site_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `cms_orders_site_email_idx` ON `cms_orders` (`site_id`,`email`);--> statement-breakpoint
CREATE TABLE `cms_payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`processed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_payment_events_provider_unique` ON `cms_payment_events` (`provider_event_id`);--> statement-breakpoint
CREATE INDEX `cms_payment_events_site_idx` ON `cms_payment_events` (`site_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `cms_site_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`hostname` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`verification_token` text NOT NULL,
	`verified_at` text,
	`last_checked_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_site_domains_hostname_unique` ON `cms_site_domains` (`hostname`);--> statement-breakpoint
CREATE INDEX `cms_site_domains_site_idx` ON `cms_site_domains` (`site_id`);