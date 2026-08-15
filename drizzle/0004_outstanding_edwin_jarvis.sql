CREATE TABLE `cms_refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`order_id` text NOT NULL,
	`stripe_refund_id` text,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`reason` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`restock_items` text,
	`error` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_refunds_stripe_unique` ON `cms_refunds` (`stripe_refund_id`);--> statement-breakpoint
CREATE INDEX `cms_refunds_site_order_idx` ON `cms_refunds` (`site_id`,`order_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `cms_order_notifications` ADD `attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cms_order_notifications` ADD `next_retry_at` text;--> statement-breakpoint
ALTER TABLE `cms_orders` ADD `admin_note` text;--> statement-breakpoint
ALTER TABLE `cms_orders` ADD `refund_total` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cms_orders` ADD `refunded_at` text;--> statement-breakpoint
ALTER TABLE `cms_payment_events` ADD `attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cms_payment_events` ADD `last_error` text;--> statement-breakpoint
ALTER TABLE `cms_payment_events` ADD `next_retry_at` text;