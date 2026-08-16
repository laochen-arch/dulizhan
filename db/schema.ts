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

export const cmsSiteIntegrations = sqliteTable("cms_site_integrations", {
  siteId: text("site_id").notNull(),
  provider: text("provider").notNull(),
  status: text("status").notNull().default("missing"),
  clientIdCipher: text("client_id_cipher"),
  clientSecretCipher: text("client_secret_cipher"),
  webhookIdCipher: text("webhook_id_cipher"),
  apiKeyCipher: text("api_key_cipher"),
  environment: text("environment").notNull().default("sandbox"),
  fromEmail: text("from_email"),
  fromDomain: text("from_domain"),
  lastCheckedAt: text("last_checked_at"),
  lastError: text("last_error"),
  updatedBy: text("updated_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.siteId, table.provider] }),
  index("cms_site_integrations_status_idx").on(table.siteId, table.status),
]);

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

export const cmsOperationEvents = sqliteTable("cms_operation_events", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  category: text("category").notNull(),
  action: text("action").notNull(),
  status: text("status").notNull().default("success"),
  severity: text("severity").notNull().default("info"),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  message: text("message").notNull(),
  metadata: text("metadata"),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: text("last_attempt_at"),
  nextRetryAt: text("next_retry_at"),
  resolvedAt: text("resolved_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("cms_operations_site_idx").on(table.siteId, table.createdAt), index("cms_operations_status_idx").on(table.siteId, table.status, table.createdAt)]);

export const cmsDeliveryRuns = sqliteTable("cms_delivery_runs", {
  siteId: text("site_id").primaryKey(),
  runId: text("run_id").notNull(),
  status: text("status").notNull().default("in_progress"),
  currentStep: text("current_step").notNull().default("intake"),
  packageName: text("package_name"),
  packageSummary: text("package_summary"),
  importRevisionId: text("import_revision_id"),
  lastError: text("last_error"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("cms_delivery_runs_status_idx").on(table.status, table.updatedAt)]);

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

export const cmsLaunchChecks = sqliteTable("cms_launch_checks", {
  siteId: text("site_id").notNull(),
  checkKey: text("check_key").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  note: text("note"),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
}, (table) => [primaryKey({ columns: [table.siteId, table.checkKey] }), index("cms_launch_checks_site_idx").on(table.siteId, table.updatedAt)]);

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
  idempotencyKey: text("idempotency_key"),
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
  paypalOrderId: text("paypal_order_id"),
  paypalApprovalUrl: text("paypal_approval_url"),
  paypalCaptureId: text("paypal_capture_id"),
  checkoutIdempotencyKey: text("checkout_idempotency_key"),
  shippingAddress: text("shipping_address").notNull(),
  trackingNumber: text("tracking_number"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  paidAt: text("paid_at"),
  shippedAt: text("shipped_at"),
  adminNote: text("admin_note"),
  refundTotal: real("refund_total").notNull().default(0),
  refundedAt: text("refunded_at"),
  discount: real("discount").notNull().default(0),
  couponCode: text("coupon_code"),
}, (table) => [uniqueIndex("cms_orders_number_unique").on(table.orderNumber), uniqueIndex("cms_orders_paypal_order_unique").on(table.paypalOrderId), uniqueIndex("cms_orders_checkout_idempotency_unique").on(table.checkoutIdempotencyKey), index("cms_orders_site_status_idx").on(table.siteId, table.status, table.createdAt), index("cms_orders_site_email_idx").on(table.siteId, table.email)]);

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
  deadLettered: integer("dead_lettered", { mode: "boolean" }).notNull().default(false),
  lastAttemptAt: text("last_attempt_at"),
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
  paypalRefundId: text("paypal_refund_id"),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("usd"),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  restockItems: text("restock_items"),
  error: text("error"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
}, (table) => [uniqueIndex("cms_refunds_paypal_unique").on(table.paypalRefundId), index("cms_refunds_site_order_idx").on(table.siteId, table.orderId, table.createdAt)]);

export const cmsOrderStateEvents = sqliteTable("cms_order_state_events", {
  id: text("id").primaryKey(), siteId: text("site_id").notNull(), orderId: text("order_id").notNull(), fromStatus: text("from_status"), toStatus: text("to_status").notNull(), reason: text("reason"), actorId: text("actor_id").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("cms_order_state_events_idx").on(table.siteId, table.orderId, table.createdAt)]);

export const cmsOrderAccessTokens = sqliteTable("cms_order_access_tokens", {
  id: text("id").primaryKey(), siteId: text("site_id").notNull(), orderId: text("order_id").notNull(), email: text("email").notNull(), tokenHash: text("token_hash").notNull().unique(), expiresAt: text("expires_at").notNull(), lastUsedAt: text("last_used_at"), requestCount: integer("request_count").notNull().default(0), createdAt: text("created_at").notNull(),
}, (table) => [index("cms_order_access_tokens_idx").on(table.siteId, table.orderId, table.email)]);

export const cmsAfterSalesRequests = sqliteTable("cms_after_sales_requests", {
  id: text("id").primaryKey(), siteId: text("site_id").notNull(), orderId: text("order_id").notNull(), email: text("email").notNull(), requestType: text("request_type").notNull(), reason: text("reason").notNull(), customerNote: text("customer_note"), adminNote: text("admin_note"), requestedAmount: real("requested_amount"), items: text("items"), status: text("status").notNull().default("submitted"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(), resolvedAt: text("resolved_at"),
}, (table) => [index("cms_after_sales_site_idx").on(table.siteId, table.status, table.createdAt)]);

export const cmsClientIntake = sqliteTable("cms_client_intake", {
  siteId: text("site_id").primaryKey(), status: text("status").notNull().default("incomplete"), payload: text("payload").notNull(), submittedBy: text("submitted_by"), approvedBy: text("approved_by"), submittedAt: text("submitted_at"), approvedAt: text("approved_at"), updatedAt: text("updated_at").notNull(),
});

export const cmsCoupons = sqliteTable("cms_coupons", {
  id: text("id").primaryKey(), siteId: text("site_id").notNull(), code: text("code").notNull(), discountType: text("discount_type").notNull().default("percent"), discountValue: real("discount_value").notNull(), minSubtotal: real("min_subtotal").notNull().default(0), maxUses: integer("max_uses"), uses: integer("uses").notNull().default(0), startsAt: text("starts_at"), endsAt: text("ends_at"), active: integer("active", { mode: "boolean" }).notNull().default(true), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("cms_coupons_site_code_unique").on(table.siteId, table.code)]);

export const cmsBundles = sqliteTable("cms_bundles", {
  id: text("id").primaryKey(), siteId: text("site_id").notNull(), name: text("name").notNull(), slug: text("slug").notNull(), productIds: text("product_ids").notNull(), discountType: text("discount_type").notNull().default("percent"), discountValue: real("discount_value").notNull().default(0), active: integer("active", { mode: "boolean" }).notNull().default(true), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("cms_bundles_site_slug_unique").on(table.siteId, table.slug), index("cms_bundles_site_idx").on(table.siteId, table.active, table.createdAt)]);

export const cmsReviews = sqliteTable("cms_reviews", {
  id: text("id").primaryKey(), siteId: text("site_id").notNull(), productId: text("product_id").notNull(), orderId: text("order_id"), email: text("email").notNull(), rating: integer("rating").notNull(), title: text("title"), body: text("body").notNull(), status: text("status").notNull().default("pending"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("cms_reviews_product_idx").on(table.siteId, table.productId, table.status, table.createdAt)]);

export const cmsAnalyticsEvents = sqliteTable("cms_analytics_events", {
  id: text("id").primaryKey(), siteId: text("site_id").notNull(), eventType: text("event_type").notNull(), productId: text("product_id"), orderId: text("order_id"), sessionId: text("session_id"), payload: text("payload"), createdAt: text("created_at").notNull(),
}, (table) => [index("cms_analytics_site_idx").on(table.siteId, table.eventType, table.createdAt)]);

export const cmsAbandonedCheckouts = sqliteTable("cms_abandoned_checkouts", {
  id: text("id").primaryKey(), siteId: text("site_id").notNull(), email: text("email"), cartPayload: text("cart_payload").notNull(), subtotal: real("subtotal").notNull().default(0), currency: text("currency").notNull().default("usd"), status: text("status").notNull().default("open"), createdAt: text("created_at").notNull(), lastSeenAt: text("last_seen_at").notNull(), recoveredAt: text("recovered_at"),
}, (table) => [index("cms_abandoned_site_idx").on(table.siteId, table.status, table.lastSeenAt)]);

export const cmsHealthChecks = sqliteTable("cms_health_checks", {
  siteId: text("site_id").notNull(), checkKey: text("check_key").notNull(), status: text("status").notNull(), detail: text("detail").notNull(), checkedAt: text("checked_at").notNull(),
}, (table) => [primaryKey({ columns: [table.siteId, table.checkKey] }), index("cms_health_site_idx").on(table.siteId, table.checkedAt)]);

export const cmsReleaseRequests = sqliteTable("cms_release_requests", {
  id: text("id").primaryKey(), siteId: text("site_id").notNull(), status: text("status").notNull().default("pending"), label: text("label").notNull(), note: text("note"), requestedBy: text("requested_by").notNull(), requestedByEmail: text("requested_by_email").notNull(), requestedAt: text("requested_at").notNull(), reviewedBy: text("reviewed_by"), reviewedByEmail: text("reviewed_by_email"), reviewedAt: text("reviewed_at"), revisionId: text("revision_id"), publishedAt: text("published_at"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("cms_release_requests_site_idx").on(table.siteId, table.status, table.createdAt)]);

export const cmsPreviewTokens = sqliteTable("cms_preview_tokens", {
  id: text("id").primaryKey(), siteId: text("site_id").notNull(), tokenHash: text("token_hash").notNull().unique(), mode: text("mode").notNull().default("draft"), expiresAt: text("expires_at").notNull(), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(), lastUsedAt: text("last_used_at"),
}, (table) => [index("cms_preview_tokens_site_idx").on(table.siteId, table.expiresAt)]);

export const merchantMembers = sqliteTable("merchant_members", {
  siteId: text("site_id").notNull(),
  userId: text("user_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("merchant_staff"),
  source: text("source").notNull().default("invited"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.siteId, table.userId] }), index("merchant_members_site_role_idx").on(table.siteId, table.role, table.createdAt), index("merchant_members_site_email_idx").on(table.siteId, table.email)]);

export const storeCustomers = sqliteTable("store_customers", {
  siteId: text("site_id").notNull(),
  userId: text("user_id").notNull(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  phone: text("phone"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.siteId, table.userId] }), index("store_customers_site_email_idx").on(table.siteId, table.email)]);

export const customerSessions = sqliteTable("customer_sessions", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at"),
});

export const customerAddresses = sqliteTable("customer_addresses", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  userId: text("user_id").notNull(),
  label: text("label").notNull().default("Shipping address"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  region: text("region").notNull(),
  zip: text("zip").notNull(),
  country: text("country").notNull(),
  phone: text("phone"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("customer_addresses_user_idx").on(table.siteId, table.userId, table.isDefault, table.updatedAt)]);
