ALTER TABLE `cms_orders` ADD `paypal_order_id` text;
--> statement-breakpoint
ALTER TABLE `cms_orders` ADD `paypal_capture_id` text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `cms_orders_paypal_order_unique` ON `cms_orders` (`paypal_order_id`);
--> statement-breakpoint
ALTER TABLE `cms_refunds` ADD `paypal_refund_id` text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `cms_refunds_paypal_unique` ON `cms_refunds` (`paypal_refund_id`);
