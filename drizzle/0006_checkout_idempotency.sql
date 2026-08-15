ALTER TABLE `cms_orders` ADD `paypal_approval_url` text;
--> statement-breakpoint
ALTER TABLE `cms_orders` ADD `checkout_idempotency_key` text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `cms_orders_checkout_idempotency_unique` ON `cms_orders` (`checkout_idempotency_key`);
