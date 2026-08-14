CREATE TABLE `cms_products` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`category` text NOT NULL,
	`sku` text NOT NULL,
	`price` real NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_products_slug_unique` ON `cms_products` (`slug`);--> statement-breakpoint
CREATE TABLE `cms_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`config` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text
);
