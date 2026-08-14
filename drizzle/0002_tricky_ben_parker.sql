CREATE TABLE `cms_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`metadata` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cms_audit_site_idx` ON `cms_audit_logs` (`site_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `cms_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` text NOT NULL,
	`invited_by` text NOT NULL,
	`created_at` text NOT NULL,
	`accepted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_invitations_token_hash_unique` ON `cms_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `cms_invitations_site_idx` ON `cms_invitations` (`site_id`,`status`);--> statement-breakpoint
CREATE INDEX `cms_invitations_email_idx` ON `cms_invitations` (`site_id`,`email`);--> statement-breakpoint
CREATE TABLE `cms_scheduled_publishes` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`label` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_by` text NOT NULL,
	`created_by_email` text NOT NULL,
	`created_at` text NOT NULL,
	`published_at` text
);
--> statement-breakpoint
CREATE INDEX `cms_schedules_site_idx` ON `cms_scheduled_publishes` (`site_id`,`status`,`scheduled_at`);