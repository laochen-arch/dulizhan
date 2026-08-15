import { integer, primaryKey, real, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const cmsSettings = sqliteTable("cms_settings", {
  id: text("id").primaryKey(),
  config: text("config").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by"),
});

export const cmsProducts = sqliteTable("cms_products", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  category: text("category").notNull(),
  sku: text("sku").notNull(),
  price: real("price").notNull(),
  stock: integer("stock").notNull().default(0),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const cmsSites = sqliteTable("cms_sites", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  domain: text("domain"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("cms_sites_slug_unique").on(table.slug)]);

export const cmsSiteSettings = sqliteTable("cms_site_settings", {
  siteId: text("site_id").primaryKey(),
  draftConfig: text("draft_config").notNull(),
  publishedConfig: text("published_config").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by"),
  publishedAt: text("published_at"),
  publishedBy: text("published_by"),
});

export const cmsSiteProducts = sqliteTable("cms_site_products", {
  siteId: text("site_id").notNull(),
  productId: text("product_id").notNull(),
  draftPayload: text("draft_payload").notNull(),
  publishedPayload: text("published_payload"),
  status: text("status").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by"),
  publishedAt: text("published_at"),
  publishedBy: text("published_by"),
}, (table) => [
  primaryKey({ columns: [table.siteId, table.productId] }),
  index("cms_site_products_site_status_idx").on(table.siteId, table.status),
]);

export const cmsMembers = sqliteTable("cms_members", {
  siteId: text("site_id").notNull(),
  userId: text("user_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("viewer"),
  createdAt: text("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.siteId, table.userId] }), index("cms_members_email_idx").on(table.siteId, table.email)]);

export const cmsRevisions = sqliteTable("cms_revisions", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  kind: text("kind").notNull(),
  label: text("label").notNull(),
  snapshot: text("snapshot").notNull(),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by").notNull(),
}, (table) => [index("cms_revisions_site_created_idx").on(table.siteId, table.createdAt)]);

export const cmsAssets = sqliteTable("cms_assets", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  assetKey: text("asset_key").notNull(),
  kind: text("kind").notNull(),
  url: text("url").notNull(),
  objectKey: text("object_key"),
  alt: text("alt").notNull().default(""),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by").notNull(),
}, (table) => [index("cms_assets_site_idx").on(table.siteId)]);

export const cmsInvitations = sqliteTable("cms_invitations", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("viewer"),
  tokenHash: text("token_hash").notNull().unique(),
  status: text("status").notNull().default("pending"),
  expiresAt: text("expires_at").notNull(),
  invitedBy: text("invited_by").notNull(),
  createdAt: text("created_at").notNull(),
  acceptedAt: text("accepted_at"),
}, (table) => [index("cms_invitations_site_idx").on(table.siteId, table.status), index("cms_invitations_email_idx").on(table.siteId, table.email)]);

export const cmsAuditLogs = sqliteTable("cms_audit_logs", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  metadata: text("metadata"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("cms_audit_site_idx").on(table.siteId, table.createdAt)]);

export const cmsScheduledPublishes = sqliteTable("cms_scheduled_publishes", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  label: text("label").notNull(),
  scheduledAt: text("scheduled_at").notNull(),
  status: text("status").notNull().default("pending"),
  createdBy: text("created_by").notNull(),
  createdByEmail: text("created_by_email").notNull(),
  createdAt: text("created_at").notNull(),
  publishedAt: text("published_at"),
}, (table) => [index("cms_schedules_site_idx").on(table.siteId, table.status, table.scheduledAt)]);

export const cmsSiteDomains = sqliteTable("cms_site_domains", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  hostname: text("hostname").notNull(),
  status: text("status").notNull().default("pending"),
  verificationToken: text("verification_token").notNull(),
  verifiedAt: text("verified_at"),
  lastCheckedAt: text("last_checked_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("cms_site_domains_hostname_unique").on(table.hostname), index("cms_site_domains_site_idx").on(table.siteId)]);

export const cmsInventory = sqliteTable("cms_inventory", {
  siteId: text("site_id").notNull(),
  productId: text("product_id").notNull(),
  variantId: text("variant_id").notNull(),
  sku: text("sku").notNull(),
  quantity: integer("quantity").notNull().default(0),
  reservedQuantity: integer("reserved_quantity").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.siteId, table.productId, table.variantId] }), index("cms_inventory_site_sku_idx").on(table.siteId, table.sku)]);

export const cmsInventoryTransactions = sqliteTable("cms_inventory_transactions", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  productId: text("product_id").notNull(),
  variantId: text("variant_id").notNull(),
  sku: text("sku").notNull(),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  referenceId: text("reference_id"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("cms_inventory_tx_site_idx").on(table.siteId, table.createdAt)]);

export const cmsOrders = sqliteTable("cms_orders", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  orderNumber: text("order_number").notNull(),
  email: text("email").notNull(),
  customerName: text("customer_name").notNull(),
  currency: text("currency").notNull().default("usd"),
  subtotal: real("subtotal").notNull(),
  shipping: real("shipping").notNull(),
  tax: real("tax").notNull().default(0),
  total: real("total").notNull(),
  status: text("status").notNull().default("pending"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  fulfillmentStatus: text("fulfillment_status").notNull().default("unfulfilled"),
  stripeSessionId: text("stripe_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  shippingAddress: text("shipping_address").notNull(),
  trackingNumber: text("tracking_number"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  paidAt: text("paid_at"),
  shippedAt: text("shipped_at"),
  adminNote: text("admin_note"),
  refundTotal: real("refund_total").notNull().default(0),
  refundedAt: text("refunded_at"),
}, (table) => [uniqueIndex("cms_orders_number_unique").on(table.orderNumber), uniqueIndex("cms_orders_stripe_session_unique").on(table.stripeSessionId), index("cms_orders_site_status_idx").on(table.siteId, table.status, table.createdAt), index("cms_orders_site_email_idx").on(table.siteId, table.email)]);

export const cmsOrderItems = sqliteTable("cms_order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  siteId: text("site_id").notNull(),
  productId: text("product_id").notNull(),
  variantId: text("variant_id").notNull(),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  variantLabel: text("variant_label").notNull(),
  unitPrice: real("unit_price").notNull(),
  quantity: integer("quantity").notNull(),
  payload: text("payload").notNull(),
}, (table) => [index("cms_order_items_order_idx").on(table.orderId), index("cms_order_items_site_idx").on(table.siteId)]);

export const cmsPaymentEvents = sqliteTable("cms_payment_events", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  providerEventId: text("provider_event_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
  processedAt: text("processed_at"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  nextRetryAt: text("next_retry_at"),
}, (table) => [uniqueIndex("cms_payment_events_provider_unique").on(table.providerEventId), index("cms_payment_events_site_idx").on(table.siteId, table.createdAt)]);

export const cmsOrderNotifications = sqliteTable("cms_order_notifications", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  orderId: text("order_id").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  providerId: text("provider_id"),
  error: text("error"),
  createdAt: text("created_at").notNull(),
  sentAt: text("sent_at"),
  attempts: integer("attempts").notNull().default(0),
  nextRetryAt: text("next_retry_at"),
}, (table) => [uniqueIndex("cms_order_notifications_order_type_unique").on(table.orderId, table.type), index("cms_order_notifications_site_idx").on(table.siteId, table.createdAt)]);

export const cmsRefunds = sqliteTable("cms_refunds", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  orderId: text("order_id").notNull(),
  stripeRefundId: text("stripe_refund_id"),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("usd"),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  restockItems: text("restock_items"),
  error: text("error"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
}, (table) => [uniqueIndex("cms_refunds_stripe_unique").on(table.stripeRefundId), index("cms_refunds_site_order_idx").on(table.siteId, table.orderId, table.createdAt)]);
