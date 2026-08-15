import { readSnapshot, ensureCmsSchema, getCmsDatabase, recordAudit, type D1DatabaseLike, type D1Statement } from "./cms";
import { getSiteIntegrationStatuses, getSiteProviderCredentials } from "./site-integrations";
import type { Product, ProductVariant } from "../app/data/products";
import type { SiteConfig } from "../app/data/site-config";
import { formatMoney } from "../app/lib/format-money";

export type CheckoutItemInput = { productId: string; variantId?: string; quantity: number };

export type CheckoutPayload = {
  email: string;
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  region: string;
  zip: string;
  country: string;
  deliveryMethod: string;
  items: CheckoutItemInput[];
  couponCode?: string;
};

export type CmsInventoryRow = {
  siteId: string;
  productId: string;
  variantId: string;
  sku: string;
  quantity: number;
  reservedQuantity: number;
  updatedAt: string;
  productName?: string;
  variantLabel?: string;
};

export type CmsOrder = {
  id: string;
  siteId: string;
  orderNumber: string;
  email: string;
  customerName: string;
  currency: string;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  paypalOrderId: string | null;
  paypalApprovalUrl: string | null;
  paypalCaptureId: string | null;
  shippingAddress: Record<string, string>;
  trackingNumber: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  shippedAt: string | null;
  adminNote: string | null;
  refundTotal: number;
  refundedAt: string | null;
  discount: number;
  couponCode: string | null;
};

export type CmsOrderItem = {
  id: string;
  orderId: string;
  siteId: string;
  productId: string;
  variantId: string;
  sku: string;
  name: string;
  variantLabel: string;
  unitPrice: number;
  quantity: number;
  payload: Product;
};

export type CmsOrderNotification = {
  id: string;
  siteId: string;
  orderId: string;
  type: string;
  status: string;
  providerId: string | null;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
  attempts: number;
  nextRetryAt: string | null;
};

export type CmsRefund = {
  id: string;
  siteId: string;
  orderId: string;
  paypalRefundId: string | null;
  amount: number;
  currency: string;
  reason: string | null;
  status: string;
  restockItems: Array<{ productId: string; variantId: string; quantity: number }>;
  error: string | null;
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
};

export type CmsPaymentEvent = {
  id: string;
  siteId: string;
  providerEventId: string;
  eventType: string;
  createdAt: string;
  processedAt: string | null;
  attempts: number;
  lastError: string | null;
  nextRetryAt: string | null;
  deadLettered: boolean;
  lastAttemptAt: string | null;
};

export type CmsOrderDetail = {
  order: CmsOrder;
  items: CmsOrderItem[];
  notifications: CmsOrderNotification[];
  refunds: CmsRefund[];
  stateEvents: CmsOrderStateEvent[];
};

export type CmsOrderStateEvent = { id: string; fromStatus: string | null; toStatus: string; reason: string | null; actorId: string; createdAt: string };

export type CommerceProvider = "paypal" | "resend";

export type CommerceProbe = {
  provider: CommerceProvider;
  configured: boolean;
  reachable: boolean;
  status: "ready" | "missing" | "error";
  detail: string;
  checkedAt: string;
  mode?: "sandbox" | "live" | "unknown";
};

export type StoreCommerceProfile = {
  currency: string;
  orderPrefix: string;
  shipping: { standard: number; express: number; freeThreshold: number };
};

type InventoryRow = CmsInventoryRow;
type OrderRow = Omit<CmsOrder, "shippingAddress"> & { shipping_address: string };
type OrderItemRow = Omit<CmsOrderItem, "payload"> & { payload: string };
type OrderNotificationRow = CmsOrderNotification;
type RefundRow = Omit<CmsRefund, "restockItems"> & { restockItems: string | null };

function now() {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getStoreCommerceProfile(config: SiteConfig, siteId: string): StoreCommerceProfile {
  const raw = (config as SiteConfig & { commerce?: Partial<StoreCommerceProfile> }).commerce;
  const currency = typeof raw?.currency === "string" && /^[A-Za-z]{3}$/.test(raw.currency) ? raw.currency.toLowerCase() : "usd";
  const prefixCandidate = typeof raw?.orderPrefix === "string" ? raw.orderPrefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) : "";
  const fallbackPrefix = siteId === "default" ? "NL" : siteId.replace(/[^A-Za-z0-9]/g, "").slice(-6).toUpperCase() || "SITE";
  const shipping = raw?.shipping || {};
  const numberOr = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : fallback;
  return {
    currency,
    orderPrefix: prefixCandidate || fallbackPrefix,
    shipping: {
      standard: numberOr(shipping.standard, 8),
      express: numberOr(shipping.express, 18),
      freeThreshold: numberOr(shipping.freeThreshold, 100),
    },
  };
}

function variantFor(product: Product, variantId?: string): ProductVariant {
  return product.variants.find((variant) => variant.id === variantId) ?? product.variants[0] ?? {
    id: `${product.id}-default`,
    label: "Standard",
    swatch: "#20211e",
    sku: `${product.sku}-01`,
    optionType: "Option",
    available: true,
  };
}

function initialVariantQuantity(product: Product, index: number, count: number, variant: ProductVariant) {
  const declared = (variant as ProductVariant & { stock?: number }).stock;
  if (typeof declared === "number") return Math.max(0, Math.floor(declared));
  const base = Math.floor(Math.max(0, product.stock) / Math.max(count, 1));
  return base + (index < Math.max(0, product.stock) % Math.max(count, 1) ? 1 : 0);
}

function changed(result: unknown) {
  return Number((result as { meta?: { changes?: number } })?.meta?.changes ?? 0);
}

async function checkoutCoupon(database: D1DatabaseLike, siteId: string, codeInput: string | undefined, subtotal: number) {
  const code = codeInput?.trim().toUpperCase();
  if (!code) return { code: null as string | null, discount: 0 };
  const row = await database.prepare(`SELECT code, discount_type AS discountType, discount_value AS discountValue, min_subtotal AS minSubtotal, max_uses AS maxUses, uses, starts_at AS startsAt, ends_at AS endsAt, active FROM cms_coupons WHERE site_id = ?1 AND code = ?2 AND active = 1`).bind(siteId, code).first<{ code: string; discountType: string; discountValue: number; minSubtotal: number; maxUses: number | null; uses: number; startsAt: string | null; endsAt: string | null; active: number }>();
  if (!row) return { code: null, discount: 0 };
  const timestamp = now();
  if (row.startsAt && row.startsAt > timestamp || row.endsAt && row.endsAt < timestamp || subtotal < row.minSubtotal || row.maxUses !== null && row.uses >= row.maxUses) return { code: null, discount: 0 };
  const discount = Math.min(subtotal, row.discountType === "fixed" ? row.discountValue : subtotal * row.discountValue / 100);
  return { code: row.code, discount: Math.round(discount * 100) / 100 };
}

async function ensureInventoryRows(database: D1DatabaseLike, siteId: string, catalog: Product[]) {
  const timestamp = now();
  const statements: D1Statement[] = [];
  catalog.forEach((product) => {
    const variants = product.variants.length ? product.variants : [variantFor(product)];
    variants.forEach((variant, index) => {
      statements.push(database.prepare(`INSERT INTO cms_inventory (site_id, product_id, variant_id, sku, quantity, reserved_quantity, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6) ON CONFLICT(site_id, product_id, variant_id) DO NOTHING`).bind(siteId, product.id, variant.id, variant.sku || `${product.sku}-${index + 1}`, initialVariantQuantity(product, index, variants.length, variant), timestamp));
    });
  });
  if (statements.length) await database.batch(statements);
}

function inventoryToPublic(row: InventoryRow): CmsInventoryRow {
  return { ...row };
}

function orderToPublic(row: OrderRow): CmsOrder {
  return { ...row, shippingAddress: JSON.parse(row.shipping_address) as Record<string, string> };
}

function itemToPublic(row: OrderItemRow): CmsOrderItem {
  return { ...row, payload: JSON.parse(row.payload) as Product };
}

function notificationToPublic(row: OrderNotificationRow): CmsOrderNotification {
  return { ...row };
}

export async function readOrder(database: D1DatabaseLike, orderId: string, siteId: string): Promise<CmsOrderDetail> {
  const row = await database.prepare(`SELECT id, site_id AS siteId, order_number AS orderNumber, email, customer_name AS customerName, currency,
    subtotal, shipping, tax, total, status, payment_status AS paymentStatus, fulfillment_status AS fulfillmentStatus,
    paypal_order_id AS paypalOrderId, paypal_approval_url AS paypalApprovalUrl, paypal_capture_id AS paypalCaptureId, shipping_address, tracking_number AS trackingNumber,
    created_at AS createdAt, updated_at AS updatedAt, paid_at AS paidAt, shipped_at AS shippedAt,
    admin_note AS adminNote, refund_total AS refundTotal, refunded_at AS refundedAt, discount, coupon_code AS couponCode
    FROM cms_orders WHERE id = ?1 AND site_id = ?2`).bind(orderId, siteId).first<OrderRow>();
  if (!row) throw new Error("ORDER_NOT_FOUND");
  const items = await database.prepare(`SELECT id, order_id AS orderId, site_id AS siteId, product_id AS productId, variant_id AS variantId,
    sku, name, variant_label AS variantLabel, unit_price AS unitPrice, quantity, payload
    FROM cms_order_items WHERE order_id = ?1 AND site_id = ?2 ORDER BY id ASC`).bind(orderId, siteId).all<OrderItemRow>();
  const notifications = await database.prepare(`SELECT id, site_id AS siteId, order_id AS orderId, type, status,
    provider_id AS providerId, error, created_at AS createdAt, sent_at AS sentAt, attempts, next_retry_at AS nextRetryAt
    FROM cms_order_notifications WHERE order_id = ?1 AND site_id = ?2 ORDER BY created_at ASC`).bind(orderId, siteId).all<OrderNotificationRow>();
  const refunds = await database.prepare(`SELECT id, site_id AS siteId, order_id AS orderId, paypal_refund_id AS paypalRefundId,
    amount, currency, reason, status, restock_items AS restockItems, error, created_by AS createdBy, created_at AS createdAt, completed_at AS completedAt
    FROM cms_refunds WHERE order_id = ?1 AND site_id = ?2 ORDER BY created_at DESC`).bind(orderId, siteId).all<RefundRow>();
  const stateEvents = await database.prepare(`SELECT id, from_status AS fromStatus, to_status AS toStatus, reason, actor_id AS actorId, created_at AS createdAt
    FROM cms_order_state_events WHERE order_id = ?1 AND site_id = ?2 ORDER BY created_at ASC`).bind(orderId, siteId).all<CmsOrderStateEvent>();
  return {
    order: orderToPublic(row),
    items: items.results.map(itemToPublic),
    notifications: notifications.results.map(notificationToPublic),
    refunds: refunds.results.map((refund) => ({ ...refund, restockItems: refund.restockItems ? JSON.parse(refund.restockItems) as CmsRefund["restockItems"] : [] })),
    stateEvents: stateEvents.results,
  };
}

export async function expirePendingOrders(siteId: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const rows = await database.prepare(`SELECT id FROM cms_orders WHERE site_id = ?1 AND payment_status = 'pending' AND created_at <= ?2
    ORDER BY created_at ASC LIMIT 100`).bind(siteId, cutoff).all<{ id: string }>();
  for (const row of rows.results) await transitionPendingOrder(database, siteId, row.id, "cancelled", "cancelled");
  return rows.results.length;
}

export async function releaseExpiredOrderReservations(siteId: string, userId: string, email: string) {
  const released = await expirePendingOrders(siteId);
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  await recordAudit(database, siteId, { userId, email }, "orders.expired_reservations_released", "inventory", siteId, { released });
  return { released };
}

async function releaseReservations(database: D1DatabaseLike, siteId: string, orderId: string) {
  const items = await database.prepare("SELECT product_id AS productId, variant_id AS variantId, quantity FROM cms_order_items WHERE order_id = ?1 AND site_id = ?2").bind(orderId, siteId).all<{ productId: string; variantId: string; quantity: number }>();
  await database.batch(items.results.map((item) => database.prepare(`UPDATE cms_inventory SET reserved_quantity = MAX(0, reserved_quantity - ?1), updated_at = ?2
    WHERE site_id = ?3 AND product_id = ?4 AND variant_id = ?5
      AND EXISTS (SELECT 1 FROM cms_orders WHERE id = ?6 AND site_id = ?3 AND payment_status = 'pending')`).bind(item.quantity, now(), siteId, item.productId, item.variantId, orderId)));
}

async function transitionPendingOrder(database: D1DatabaseLike, siteId: string, orderId: string, status: "cancelled" | "payment_failed", paymentStatus: "cancelled" | "failed") {
  const existing = await readOrder(database, orderId, siteId);
  if (existing.order.paymentStatus !== "pending") return existing;
  const items = await database.prepare("SELECT product_id AS productId, variant_id AS variantId, quantity FROM cms_order_items WHERE order_id = ?1 AND site_id = ?2").bind(orderId, siteId).all<{ productId: string; variantId: string; quantity: number }>();
  const timestamp = now();
  await database.batch([
    ...items.results.map((item) => database.prepare(`UPDATE cms_inventory SET reserved_quantity = MAX(0, reserved_quantity - ?1), updated_at = ?2
      WHERE site_id = ?3 AND product_id = ?4 AND variant_id = ?5
        AND EXISTS (SELECT 1 FROM cms_orders WHERE id = ?6 AND site_id = ?3 AND payment_status = 'pending')`).bind(item.quantity, timestamp, siteId, item.productId, item.variantId, orderId)),
    database.prepare(`UPDATE cms_orders SET status = ?1, payment_status = ?2, updated_at = ?3
      WHERE id = ?4 AND site_id = ?5 AND payment_status = 'pending'`).bind(status, paymentStatus, timestamp, orderId, siteId),
  ]);
  await recordOrderState(database, siteId, orderId, "pending", status, "system", paymentStatus === "failed" ? "PayPal payment failed" : "pending order expired or cancelled");
  return readOrder(database, orderId, siteId);
}

async function reserveItems(database: D1DatabaseLike, siteId: string, items: Array<{ productId: string; variantId: string; quantity: number }>) {
  const reserved: typeof items = [];
  try {
    for (const item of items) {
      const result = await database.prepare(`UPDATE cms_inventory SET reserved_quantity = reserved_quantity + ?1, updated_at = ?2
        WHERE site_id = ?3 AND product_id = ?4 AND variant_id = ?5 AND quantity - reserved_quantity >= ?1`).bind(item.quantity, now(), siteId, item.productId, item.variantId).run();
      if (changed(result) !== 1) throw new Error("STOCK_UNAVAILABLE");
      reserved.push(item);
    }
  } catch (error) {
    await database.batch(reserved.map((item) => database.prepare(`UPDATE cms_inventory SET reserved_quantity = MAX(0, reserved_quantity - ?1), updated_at = ?2 WHERE site_id = ?3 AND product_id = ?4 AND variant_id = ?5`).bind(item.quantity, now(), siteId, item.productId, item.variantId)));
    throw error;
  }
}

function orderNumber(prefix: string) {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `${prefix}-${date}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

function paypalBaseUrl(environment = "sandbox") {
  return environment.trim().toLowerCase() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

async function getPayPalAccessToken(siteId: string) {
  const credentials = await getSiteProviderCredentials(siteId, "paypal");
  const clientId = credentials.clientId?.trim();
  const clientSecret = credentials.clientSecret?.trim();
  if (!clientId || !clientSecret) throw new Error("PAYMENT_NOT_CONFIGURED");
  const response = await fetch(`${paypalBaseUrl(credentials.environment)}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const payload = await response.json().catch(() => ({})) as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !payload.access_token) {
    console.error("[PayPal] OAuth token request failed", {
      status: response.status,
      error: payload.error || null,
      description: payload.error_description || null,
      environment: credentials.environment || "sandbox",
    });
    throw new Error("PAYMENT_PROVIDER_ERROR");
  }
  return { token: payload.access_token, environment: credentials.environment };
}

function paypalCountryCode(country: string) {
  const normalized = country.trim().toLowerCase();
  const codes: Record<string, string> = { "united states": "US", usa: "US", canada: "CA", "united kingdom": "GB", uk: "GB", australia: "AU" };
  return codes[normalized] || (country.trim().toUpperCase().match(/^[A-Z]{2}$/)?.[0] || "US");
}

function paypalOrderBody(order: CmsOrder, items: CmsOrderItem[], origin: string, brandName: string) {
  const currency = order.currency.toUpperCase();
  const address = order.shippingAddress;
  return {
    intent: "CAPTURE",
    purchase_units: [{
      reference_id: order.id,
      custom_id: `${order.siteId}:${order.id}`,
      description: `${brandName} order ${order.orderNumber}`.slice(0, 127),
      shipping: {
        name: { full_name: order.customerName.slice(0, 300) },
        address: {
          address_line_1: address.address.slice(0, 300),
          admin_area_2: address.city.slice(0, 120),
          admin_area_1: address.region.slice(0, 120),
          postal_code: address.zip.slice(0, 60),
          country_code: paypalCountryCode(address.country),
        },
      },
      amount: {
        currency_code: currency,
        value: order.total.toFixed(2),
        breakdown: { item_total: { currency_code: currency, value: order.subtotal.toFixed(2) }, shipping: { currency_code: currency, value: order.shipping.toFixed(2) }, ...(order.discount > 0 ? { discount: { currency_code: currency, value: order.discount.toFixed(2) } } : {}) },
      },
      items: items.map((item) => ({ name: `${item.name} / ${item.variantLabel}`.slice(0, 127), sku: item.sku.slice(0, 127), quantity: String(item.quantity), category: "PHYSICAL_GOODS", unit_amount: { currency_code: currency, value: item.unitPrice.toFixed(2) } })),
    }],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: brandName.slice(0, 127),
          user_action: "PAY_NOW",
          shipping_preference: "SET_PROVIDED_ADDRESS",
          return_url: `${origin}/checkout?order_id=${encodeURIComponent(order.id)}&paypal_return=1`,
          cancel_url: `${origin}/checkout?order_id=${encodeURIComponent(order.id)}&cancelled=1`,
        },
      },
    },
  };
}

async function createPayPalOrder(order: CmsOrder, items: CmsOrderItem[], origin: string, requestId: string, brandName: string) {
  const session = await getPayPalAccessToken(order.siteId);
  const response = await fetch(`${paypalBaseUrl(session.environment)}/v2/checkout/orders`, { method: "POST", headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json", Prefer: "return=representation", "PayPal-Request-Id": requestId }, body: JSON.stringify(paypalOrderBody(order, items, origin, brandName)) });
  const payload = await response.json().catch(() => ({})) as { id?: string; links?: Array<{ rel?: string; href?: string }>; name?: string; message?: string; debug_id?: string; details?: Array<{ field?: string; issue?: string; description?: string }> };
  const approval = payload.links?.find((link) => link.rel === "payer-action" || link.rel === "approve")?.href;
  if (!response.ok || !payload.id || !approval) {
    console.error("[PayPal] order creation failed", {
      status: response.status,
      name: payload.name || null,
      message: payload.message || null,
      debugId: payload.debug_id || null,
      details: payload.details?.map((detail) => ({ field: detail.field || null, issue: detail.issue || null, description: detail.description || null })) || [],
    });
    throw new Error("PAYMENT_PROVIDER_ERROR");
  }
  return { id: payload.id, url: approval };
}

export async function createCheckout(siteId: string, payload: CheckoutPayload, origin: string, idempotencyKey = "") {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  await expirePendingOrders(siteId);
  const snapshot = await readSnapshot(siteId, "published");
  const profile = getStoreCommerceProfile(snapshot.config, siteId);
  const catalog = snapshot.catalog.filter((product) => product.status === "active");
  await ensureInventoryRows(database, siteId, catalog);
  const requested = new Map<string, number>();
  for (const item of Array.isArray(payload.items) ? payload.items : []) {
    if (!item.productId || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) throw new Error("INVALID_CHECKOUT");
    const key = `${item.productId}:${item.variantId || ""}`;
    requested.set(key, (requested.get(key) || 0) + item.quantity);
  }
  if (!requested.size || requested.size > 50) throw new Error("INVALID_CHECKOUT");
  const productsById = new Map(catalog.map((product) => [product.id, product]));
  const lineItems: CmsOrderItem[] = [];
  for (const [key, quantity] of requested) {
    const [productId, variantId] = key.split(":");
    const product = productsById.get(productId);
    if (!product) throw new Error("PRODUCT_UNAVAILABLE");
    const variant = variantFor(product, variantId || undefined);
    if (variant.available === false) throw new Error("PRODUCT_UNAVAILABLE");
    const inventory = await database.prepare("SELECT quantity, reserved_quantity FROM cms_inventory WHERE site_id = ?1 AND product_id = ?2 AND variant_id = ?3").bind(siteId, product.id, variant.id).first<{ quantity: number; reserved_quantity: number }>();
    if (!inventory || inventory.quantity - inventory.reserved_quantity < quantity) throw new Error("STOCK_UNAVAILABLE");
    lineItems.push({ id: `item_${crypto.randomUUID()}`, orderId: "", siteId, productId: product.id, variantId: variant.id, sku: variant.sku || product.sku, name: product.name, variantLabel: variant.label, unitPrice: variant.price ?? product.price, quantity, payload: clone(product) });
  }
  const email = payload.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("INVALID_CHECKOUT");
  if (![payload.firstName, payload.lastName, payload.address, payload.city, payload.region, payload.zip, payload.country, payload.deliveryMethod].every((value) => typeof value === "string" && value.trim())) throw new Error("INVALID_CHECKOUT");
  const subtotal = lineItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const coupon = await checkoutCoupon(database, siteId, payload.couponCode, subtotal);
  const shipping = payload.deliveryMethod.toLowerCase().includes("express") ? profile.shipping.express : subtotal - coupon.discount >= profile.shipping.freeThreshold ? 0 : profile.shipping.standard;
  const timestamp = now();
  const normalizedIdempotencyKey = idempotencyKey.trim().slice(0, 160);
  if (normalizedIdempotencyKey) {
    const previous = await database.prepare(`SELECT id, paypal_order_id AS paypalOrderId, paypal_approval_url AS paypalApprovalUrl
      FROM cms_orders WHERE site_id = ?1 AND checkout_idempotency_key = ?2`).bind(siteId, normalizedIdempotencyKey).first<{ id: string; paypalOrderId: string | null; paypalApprovalUrl: string | null }>();
    if (previous?.paypalOrderId && previous.paypalApprovalUrl) {
      const existing = await readOrder(database, previous.id, siteId);
      return { order: existing.order, items: existing.items, checkoutUrl: previous.paypalApprovalUrl };
    }
  }
  const order: CmsOrder = { id: `order_${crypto.randomUUID()}`, siteId, orderNumber: orderNumber(profile.orderPrefix), email, customerName: `${payload.firstName.trim()} ${payload.lastName.trim()}`.trim(), currency: profile.currency, subtotal, shipping, tax: 0, total: subtotal + shipping - coupon.discount, status: "pending", paymentStatus: "pending", fulfillmentStatus: "unfulfilled", paypalOrderId: null, paypalApprovalUrl: null, paypalCaptureId: null, shippingAddress: { address: payload.address.trim(), city: payload.city.trim(), region: payload.region.trim(), zip: payload.zip.trim(), country: payload.country.trim() }, trackingNumber: null, createdAt: timestamp, updatedAt: timestamp, paidAt: null, shippedAt: null, adminNote: null, refundTotal: 0, refundedAt: null, discount: coupon.discount, couponCode: coupon.code };
  lineItems.forEach((item) => { item.orderId = order.id; });
  await database.batch([
    database.prepare(`INSERT INTO cms_orders (id, site_id, order_number, email, customer_name, currency, subtotal, shipping, tax, total, status, payment_status, fulfillment_status, paypal_order_id, paypal_approval_url, paypal_capture_id, checkout_idempotency_key, shipping_address, tracking_number, created_at, updated_at, paid_at, shipped_at, discount, coupon_code)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, NULL, NULL, NULL, ?14, ?15, NULL, ?16, ?16, NULL, NULL, ?17, ?18)`).bind(order.id, order.siteId, order.orderNumber, order.email, order.customerName, order.currency, order.subtotal, order.shipping, order.tax, order.total, order.status, order.paymentStatus, order.fulfillmentStatus, normalizedIdempotencyKey || null, JSON.stringify(order.shippingAddress), timestamp, order.discount, order.couponCode),
    ...lineItems.map((item) => database.prepare(`INSERT INTO cms_order_items (id, order_id, site_id, product_id, variant_id, sku, name, variant_label, unit_price, quantity, payload)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`).bind(item.id, item.orderId, item.siteId, item.productId, item.variantId, item.sku, item.name, item.variantLabel, item.unitPrice, item.quantity, JSON.stringify(item.payload))),
  ]);
  await recordOrderState(database, siteId, order.id, null, "pending", "system", "Checkout created");
  let reserved = false;
  try {
    await reserveItems(database, siteId, lineItems.map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity })));
    reserved = true;
    const paypalOrder = await createPayPalOrder(order, lineItems, origin, normalizedIdempotencyKey || order.id, snapshot.config.brand.name);
    await database.prepare("UPDATE cms_orders SET paypal_order_id = ?1, paypal_approval_url = ?2, updated_at = ?3 WHERE id = ?4 AND site_id = ?5").bind(paypalOrder.id, paypalOrder.url, now(), order.id, siteId).run();
    if (coupon.code) await database.prepare("UPDATE cms_coupons SET uses = uses + 1, updated_at = ?1 WHERE site_id = ?2 AND code = ?3 AND active = 1 AND (max_uses IS NULL OR uses < max_uses)").bind(now(), siteId, coupon.code).run();
    return { order: { ...order, paypalOrderId: paypalOrder.id, paypalApprovalUrl: paypalOrder.url }, items: lineItems, checkoutUrl: paypalOrder.url };
  } catch (error) {
    if (reserved) await releaseReservations(database, siteId, order.id);
    await database.prepare("UPDATE cms_orders SET status = 'cancelled', payment_status = 'cancelled', updated_at = ?1 WHERE id = ?2 AND site_id = ?3 AND payment_status = 'pending'").bind(now(), order.id, siteId).run();
    throw error;
  }
}

export async function attachLiveInventoryToCatalog(siteId: string, catalog: Product[]) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  await expirePendingOrders(siteId);
  const activeCatalog = catalog.filter((product) => product.status === "active");
  await ensureInventoryRows(database, siteId, activeCatalog);
  const rows = await database.prepare(`SELECT product_id AS productId, variant_id AS variantId, quantity, reserved_quantity AS reservedQuantity
    FROM cms_inventory WHERE site_id = ?1`).bind(siteId).all<{ productId: string; variantId: string; quantity: number; reservedQuantity: number }>();
  const inventory = new Map(rows.results.map((row) => [`${row.productId}:${row.variantId}`, row]));
  return catalog.map((product) => {
    const variants = product.variants.map((variant) => {
      const row = inventory.get(`${product.id}:${variant.id}`);
      if (!row) return variant;
      return { ...variant, stock: Math.max(0, row.quantity - row.reservedQuantity) };
    });
    const hasLiveRows = variants.some((variant) => inventory.has(`${product.id}:${variant.id}`));
    if (!hasLiveRows) return product;
    return { ...product, variants, stock: variants.reduce((sum, variant) => sum + (variant.stock ?? 0), 0) };
  });
}

export async function getCheckoutStatus(siteId: string, orderId: string, paypalOrderId: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const row = await database.prepare(`SELECT order_number AS orderNumber, status, payment_status AS paymentStatus, fulfillment_status AS fulfillmentStatus
    FROM cms_orders WHERE id = ?1 AND site_id = ?2 AND paypal_order_id = ?3`).bind(orderId, siteId, paypalOrderId).first<{ orderNumber: string; status: string; paymentStatus: string; fulfillmentStatus: string }>();
  return row;
}

function captureIdFromPayPalOrder(payload: { purchase_units?: Array<{ payments?: { captures?: Array<{ id?: string }> } }> }) {
  return payload.purchase_units?.[0]?.payments?.captures?.[0]?.id || null;
}

async function getPayPalOrder(paypalOrderId: string, token: string, environment: "sandbox" | "live") {
  const response = await fetch(`${paypalBaseUrl(environment)}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  const payload = await response.json().catch(() => ({})) as { status?: string; name?: string; message?: string; purchase_units?: Array<{ payments?: { captures?: Array<{ id?: string; status?: string }> } }> };
  if (!response.ok) throw new Error(payload.message || payload.name || "PAYMENT_PROVIDER_ERROR");
  return payload;
}

export async function capturePayPalOrder(siteId: string, orderId: string, paypalOrderId: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const existing = await database.prepare("SELECT paypal_order_id AS paypalOrderId, payment_status AS paymentStatus FROM cms_orders WHERE id = ?1 AND site_id = ?2").bind(orderId, siteId).first<{ paypalOrderId: string | null; paymentStatus: string }>();
  if (!existing || existing.paypalOrderId !== paypalOrderId) throw new Error("ORDER_NOT_FOUND");
  if (existing.paymentStatus === "paid") return getCheckoutStatus(siteId, orderId, paypalOrderId);
  const session = await getPayPalAccessToken(siteId);
  const response = await fetch(`${paypalBaseUrl(session.environment)}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, { method: "POST", headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: "{}" });
  const payload = await response.json().catch(() => ({})) as { status?: string; name?: string; message?: string; details?: Array<{ description?: string }>; purchase_units?: Array<{ payments?: { captures?: Array<{ id?: string; status?: string }> } }> };
  if (!response.ok) {
    if (payload.name === "ORDER_ALREADY_CAPTURED") {
      const existingOrder = await getPayPalOrder(paypalOrderId, session.token, session.environment);
      const existingCaptureId = captureIdFromPayPalOrder(existingOrder);
      if (existingOrder.status === "COMPLETED") await finalizePaidOrder(database, orderId, siteId, existingCaptureId);
      return getCheckoutStatus(siteId, orderId, paypalOrderId);
    }
    throw new Error(payload.details?.[0]?.description || payload.message || payload.name || "PAYMENT_PROVIDER_ERROR");
  }
  const captureId = captureIdFromPayPalOrder(payload);
  if (payload.status === "COMPLETED") await finalizePaidOrder(database, orderId, siteId, captureId);
  if (["VOIDED", "DECLINED"].includes(payload.status || "")) await transitionPendingOrder(database, siteId, orderId, "payment_failed", "failed");
  return getCheckoutStatus(siteId, orderId, paypalOrderId);
}

export async function getCommerceConfiguration(siteId = "default") {
  const statuses = await getSiteIntegrationStatuses(siteId);
  const paypal = statuses.find((item) => item.provider === "paypal");
  const resend = statuses.find((item) => item.provider === "resend");
  return {
    paypal: { clientId: Boolean(paypal?.clientId), clientSecret: Boolean(paypal?.clientSecret), webhookId: Boolean(paypal?.webhookId), mode: paypal?.environment || "unknown", source: paypal?.source || "missing", hasEncryptionKey: Boolean(paypal?.hasEncryptionKey) },
    resend: { apiKey: Boolean(resend?.apiKey), fromEmail: Boolean(resend?.fromEmail), fromDomain: resend?.fromDomain || null, source: resend?.source || "missing", hasEncryptionKey: Boolean(resend?.hasEncryptionKey) },
  };
}

export async function probeCommerceProvider(provider: CommerceProvider, siteId = "default"): Promise<CommerceProbe> {
  const checkedAt = now();
  if (provider === "paypal") {
    const credentials = await getSiteProviderCredentials(siteId, "paypal");
    const clientId = credentials.clientId?.trim() || "";
    const clientSecret = credentials.clientSecret?.trim() || "";
    const webhook = Boolean(credentials.webhookId?.trim());
    const mode = credentials.environment || "unknown";
    if (!clientId || !clientSecret || !webhook) return { provider, configured: false, reachable: false, status: "missing", detail: "PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, and PAYPAL_WEBHOOK_ID are required.", checkedAt, mode };
    try {
      const session = await getPayPalAccessToken(siteId);
      const response = await fetch(`${paypalBaseUrl(session.environment)}/v1/identity/oauth2/userinfo?schema=paypalv1.1`, { headers: { Authorization: `Bearer ${session.token}` } });
      const payload = await response.json().catch(() => ({})) as { user_id?: string; message?: string; error_description?: string };
      if (!response.ok) throw new Error(payload.message || payload.error_description || "PayPal rejected the credentials.");
      return { provider, configured: true, reachable: true, status: "ready", detail: `PayPal ${mode} account ${payload.user_id || "connected"} responded successfully.`, checkedAt, mode };
    } catch (error) {
      return { provider, configured: true, reachable: false, status: "error", detail: error instanceof Error ? error.message : "PayPal connection failed.", checkedAt, mode };
    }
  }

  const credentials = await getSiteProviderCredentials(siteId, "resend");
  const apiKey = credentials.apiKey?.trim() || "";
  const fromEmail = credentials.fromEmail?.trim() || "";
  if (!apiKey || !fromEmail) return { provider, configured: false, reachable: false, status: "missing", detail: "RESEND_API_KEY and RESEND_FROM_EMAIL are both required.", checkedAt };
  try {
    const response = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${apiKey}` } });
    const payload = await response.json().catch(() => ({})) as { data?: Array<{ name?: string; status?: string }>; message?: string };
    if (!response.ok) throw new Error(payload.message || "Resend rejected the credentials.");
    const domain = fromEmail.split("@").pop() || "sender domain";
    const matched = payload.data?.find((item) => item.name?.toLowerCase() === domain.toLowerCase());
    if (!matched) return { provider, configured: true, reachable: true, status: "error", detail: `Resend is connected, but ${domain} is not present in the verified domain list.`, checkedAt };
    if (matched.status && matched.status !== "verified") return { provider, configured: true, reachable: true, status: "error", detail: `${domain} is currently ${matched.status}. Verify it before sending production mail.`, checkedAt };
    return { provider, configured: true, reachable: true, status: "ready", detail: `${fromEmail} is ready to send through Resend.`, checkedAt };
  } catch (error) {
    return { provider, configured: true, reachable: false, status: "error", detail: error instanceof Error ? error.message : "Resend connection failed.", checkedAt };
  }
}

export async function listInventory(siteId: string, userId: string, email: string): Promise<CmsInventoryRow[]> {
  void userId;
  void email;
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  await expirePendingOrders(siteId);
  const snapshot = await readSnapshot(siteId, "published");
  await ensureInventoryRows(database, siteId, snapshot.catalog.filter((product) => product.status === "active"));
  const rows = await database.prepare(`SELECT site_id AS siteId, product_id AS productId, variant_id AS variantId, sku, quantity, reserved_quantity AS reservedQuantity, updated_at AS updatedAt
    FROM cms_inventory WHERE site_id = ?1 ORDER BY product_id, variant_id`).bind(siteId).all<InventoryRow>();
  const products = new Map(snapshot.catalog.map((product) => [product.id, product]));
  return rows.results.map((row) => ({ ...inventoryToPublic(row), productName: products.get(row.productId)?.name, variantLabel: products.get(row.productId) ? variantFor(products.get(row.productId)!, row.variantId).label : undefined }));
}

export async function updateInventory(siteId: string, productId: string, variantId: string, quantity: number, userId: string, email: string) {
  void email;
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000000) throw new Error("INVALID_INVENTORY");
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const snapshot = await readSnapshot(siteId, "published");
  const product = snapshot.catalog.find((item) => item.id === productId);
  if (!product) throw new Error("PRODUCT_NOT_FOUND");
  const variant = variantFor(product, variantId);
  await ensureInventoryRows(database, siteId, [product]);
  const current = await database.prepare("SELECT quantity, reserved_quantity FROM cms_inventory WHERE site_id = ?1 AND product_id = ?2 AND variant_id = ?3").bind(siteId, productId, variant.id).first<{ quantity: number; reserved_quantity: number }>();
  if (!current || quantity < current.reserved_quantity) throw new Error("INVENTORY_BELOW_RESERVED");
  const delta = quantity - current.quantity;
  await database.batch([
    database.prepare("UPDATE cms_inventory SET quantity = ?1, updated_at = ?2 WHERE site_id = ?3 AND product_id = ?4 AND variant_id = ?5").bind(quantity, now(), siteId, productId, variant.id),
    database.prepare(`INSERT INTO cms_inventory_transactions (id, site_id, product_id, variant_id, sku, delta, reason, reference_id, created_by, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'manual-adjustment', NULL, ?7, ?8)`).bind(`invtx_${crypto.randomUUID()}`, siteId, productId, variant.id, variant.sku || product.sku, delta, userId, now()),
  ]);
  await recordAudit(database, siteId, { userId, email }, "inventory.adjusted", "inventory", `${productId}:${variant.id}`, { sku: variant.sku || product.sku, from: current.quantity, to: quantity, delta });
  return { siteId, productId, variantId: variant.id, sku: variant.sku || product.sku, quantity, reservedQuantity: current.reserved_quantity };
}

export async function listOrders(siteId: string, userId: string, email: string, status?: string): Promise<CmsOrder[]> {
  void userId;
  void email;
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  await expirePendingOrders(siteId);
  const query = status ? ` AND status = ?2` : "";
  const statement = database.prepare(`SELECT id, site_id AS siteId, order_number AS orderNumber, email, customer_name AS customerName, currency,
    subtotal, shipping, tax, total, status, payment_status AS paymentStatus, fulfillment_status AS fulfillmentStatus,
    paypal_order_id AS paypalOrderId, paypal_approval_url AS paypalApprovalUrl, paypal_capture_id AS paypalCaptureId, shipping_address, tracking_number AS trackingNumber,
    created_at AS createdAt, updated_at AS updatedAt, paid_at AS paidAt, shipped_at AS shippedAt,
    admin_note AS adminNote, refund_total AS refundTotal, refunded_at AS refundedAt, discount, coupon_code AS couponCode FROM cms_orders WHERE site_id = ?1${query} ORDER BY created_at DESC LIMIT 100`);
  const rows = status ? await statement.bind(siteId, status).all<OrderRow>() : await statement.bind(siteId).all<OrderRow>();
  return rows.results.map(orderToPublic);
}

export async function getOrder(siteId: string, orderId: string, userId: string, email: string) {
  void userId;
  void email;
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  return readOrder(database, orderId, siteId);
}

async function recordOrderState(database: D1DatabaseLike, siteId: string, orderId: string, fromStatus: string | null, toStatus: string, actorId: string, reason: string) {
  await database.prepare(`INSERT INTO cms_order_state_events (id, site_id, order_id, from_status, to_status, reason, actor_id, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`).bind(`order_state_${crypto.randomUUID()}`, siteId, orderId, fromStatus, toStatus, reason.slice(0, 500), actorId, now()).run();
}

const fulfillmentTransitions: Record<string, string[]> = {
  unfulfilled: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export async function updateOrderFulfillment(siteId: string, orderId: string, fulfillmentStatus: string, trackingNumber: string, userId: string, email: string) {
  void userId;
  void email;
  if (!["unfulfilled", "processing", "shipped", "delivered", "cancelled"].includes(fulfillmentStatus)) throw new Error("INVALID_ORDER_STATUS");
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const existing = await readOrder(database, orderId, siteId);
  if (existing.order.fulfillmentStatus !== fulfillmentStatus && !fulfillmentTransitions[existing.order.fulfillmentStatus]?.includes(fulfillmentStatus)) throw new Error("INVALID_ORDER_STATUS");
  if (["processing", "shipped", "delivered"].includes(fulfillmentStatus) && !["paid", "partially_refunded"].includes(existing.order.paymentStatus)) throw new Error("ORDER_NOT_PAID");
  const timestamp = now();
  const shippedAt = fulfillmentStatus === "shipped" || fulfillmentStatus === "delivered" ? existing.order.shippedAt || timestamp : existing.order.shippedAt;
  await database.prepare(`UPDATE cms_orders SET fulfillment_status = ?1, tracking_number = ?2, shipped_at = ?3, updated_at = ?4 WHERE id = ?5 AND site_id = ?6`).bind(fulfillmentStatus, trackingNumber.trim() || null, shippedAt, timestamp, orderId, siteId).run();
  if (existing.order.fulfillmentStatus !== fulfillmentStatus) await recordOrderState(database, siteId, orderId, existing.order.fulfillmentStatus, fulfillmentStatus, userId, "admin fulfillment update");
  await recordAudit(database, siteId, { userId, email }, "order.fulfillment_updated", "order", orderId, { status: fulfillmentStatus, trackingNumber: trackingNumber.trim() || null });
  if (fulfillmentStatus === "shipped" && existing.order.fulfillmentStatus !== "shipped") await sendOrderNotification(database, { ...existing.order, fulfillmentStatus, trackingNumber: trackingNumber.trim() || null, shippedAt }, existing.items, "shipped");
  return { ...existing.order, fulfillmentStatus, trackingNumber: trackingNumber.trim() || null, shippedAt };
}

export async function updateOrderAdminNote(siteId: string, orderId: string, note: string, userId: string, email: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  await readOrder(database, orderId, siteId);
  const adminNote = note.trim().slice(0, 5000) || null;
  await database.prepare("UPDATE cms_orders SET admin_note = ?1, updated_at = ?2 WHERE id = ?3 AND site_id = ?4").bind(adminNote, now(), orderId, siteId).run();
  await recordAudit(database, siteId, { userId, email }, "order.note_updated", "order", orderId, { hasNote: Boolean(adminNote) });
  return (await readOrder(database, orderId, siteId)).order;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}

async function ownerEmail(database: D1DatabaseLike, siteId: string) {
  const owner = await database.prepare("SELECT email FROM cms_members WHERE site_id = ?1 AND role = 'owner' ORDER BY created_at ASC LIMIT 1").bind(siteId).first<{ email: string }>();
  return owner?.email?.trim().toLowerCase() || "";
}

async function sendOrderNotification(database: D1DatabaseLike, order: CmsOrder, items: CmsOrderItem[], type: "paid" | "shipped" | "admin_new_order") {
  const id = `notify_${crypto.randomUUID()}`;
  const insert = await database.prepare(`INSERT INTO cms_order_notifications (id, site_id, order_id, type, status, provider_id, error, created_at, sent_at)
    VALUES (?1, ?2, ?3, ?4, 'pending', NULL, NULL, ?5, NULL) ON CONFLICT(order_id, type) DO NOTHING`).bind(id, order.siteId, order.id, type, now()).run();
  let notificationId = id;
  if (changed(insert) === 0) {
    const existing = await database.prepare(`SELECT id, status, next_retry_at AS nextRetryAt FROM cms_order_notifications WHERE order_id = ?1 AND type = ?2`).bind(order.id, type).first<{ id: string; status: string; nextRetryAt: string | null }>();
    if (!existing || existing.status === "sent") return;
    if (existing.nextRetryAt && existing.nextRetryAt > now()) return;
    notificationId = existing.id;
  }
  await database.prepare("UPDATE cms_order_notifications SET status = 'sending', attempts = attempts + 1, error = NULL, next_retry_at = NULL WHERE id = ?1").bind(notificationId).run();
  let apiKey = "";
  let from = "";
  try {
    const resend = await getSiteProviderCredentials(order.siteId, "resend");
    apiKey = resend.apiKey?.trim() || "";
    from = resend.fromEmail?.trim() || "";
  } catch (error) {
    await database.prepare("UPDATE cms_order_notifications SET status = 'failed', error = ?1, next_retry_at = ?2 WHERE id = ?3").bind(error instanceof Error ? error.message : "RESEND_NOT_CONFIGURED", new Date(Date.now() + 15 * 60 * 1000).toISOString(), notificationId).run();
    return;
  }
  if (!apiKey || !from) {
    await database.prepare("UPDATE cms_order_notifications SET status = 'failed', error = ?1, next_retry_at = ?2 WHERE id = ?3").bind("RESEND_API_KEY and RESEND_FROM_EMAIL are not configured.", new Date(Date.now() + 15 * 60 * 1000).toISOString(), notificationId).run();
    return;
  }
  const recipient = type === "admin_new_order" ? await ownerEmail(database, order.siteId) : order.email;
  if (!recipient) {
    await database.prepare("UPDATE cms_order_notifications SET status = 'failed', error = ?1, next_retry_at = NULL WHERE id = ?2").bind("No recipient email is configured for this notification.", notificationId).run();
    return;
  }
  let brandName = "Storefront";
  let supportEmail = "";
  try {
    const snapshot = await readSnapshot(order.siteId, "published");
    brandName = snapshot.config.brand.name.trim() || brandName;
    supportEmail = snapshot.config.content.contact.email.trim();
  } catch {
    // Notification delivery should still be traceable if a tenant's CMS data
    // is temporarily unavailable.
  }
  const subject = type === "paid" ? `Order ${order.orderNumber} confirmed` : type === "shipped" ? `Order ${order.orderNumber} is on the way` : `New paid order ${order.orderNumber}`;
  const rows = items.map((item) => `<li>${escapeHtml(item.name)} / ${escapeHtml(item.variantLabel)} x ${item.quantity} — ${escapeHtml(formatMoney(item.unitPrice * item.quantity, order.currency))}</li>`).join("");
  const greeting = type === "admin_new_order" ? "A new order has been paid." : `Hi ${escapeHtml(order.customerName || "there")},`;
  const message = type === "paid" ? "Thanks for your order. Payment has been confirmed." : type === "shipped" ? "Your order has shipped." : "Review the order in your commerce dashboard.";
  const html = `<p><strong>${escapeHtml(brandName)}</strong></p><p>${greeting}</p><p>${message}</p><p><strong>${escapeHtml(order.orderNumber)}</strong></p><p>${escapeHtml(order.email)}</p><ul>${rows}</ul>${order.trackingNumber ? `<p>Tracking: ${escapeHtml(order.trackingNumber)}</p>` : ""}${supportEmail ? `<p>Questions? Reply to ${escapeHtml(supportEmail)}.</p>` : ""}`;
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [recipient], reply_to: supportEmail ? [supportEmail] : undefined, subject, html }) });
    const payload = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok) throw new Error(payload.message || "Email provider rejected the message.");
    await database.prepare("UPDATE cms_order_notifications SET status = 'sent', provider_id = ?1, sent_at = ?2, error = NULL, next_retry_at = NULL WHERE id = ?3").bind(payload.id || null, now(), notificationId).run();
  } catch (error) {
    const retryAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await database.prepare("UPDATE cms_order_notifications SET status = 'failed', error = ?1, next_retry_at = ?2 WHERE id = ?3").bind(error instanceof Error ? error.message : "Email delivery failed.", retryAt, notificationId).run();
  }
}

export async function retryOrderNotification(siteId: string, notificationId: string, userId: string, email: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const notification = await database.prepare("SELECT id, order_id AS orderId, type FROM cms_order_notifications WHERE id = ?1 AND site_id = ?2").bind(notificationId, siteId).first<{ id: string; orderId: string; type: "paid" | "shipped" | "admin_new_order" }>();
  if (!notification) throw new Error("NOTIFICATION_NOT_FOUND");
  await database.prepare("UPDATE cms_order_notifications SET next_retry_at = NULL WHERE id = ?1 AND site_id = ?2").bind(notificationId, siteId).run();
  const detail = await readOrder(database, notification.orderId, siteId);
  await sendOrderNotification(database, detail.order, detail.items, notification.type);
  await recordAudit(database, siteId, { userId, email }, "order.notification_retried", "notification", notificationId);
  return readOrder(database, notification.orderId, siteId);
}

export async function retryDueOrderNotifications(siteId: string, userId: string, email: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const rows = await database.prepare(`SELECT id, order_id AS orderId, type
    FROM cms_order_notifications WHERE site_id = ?1 AND status = 'failed' AND next_retry_at IS NOT NULL AND next_retry_at <= ?2
    ORDER BY next_retry_at ASC LIMIT 50`).bind(siteId, now()).all<{ id: string; orderId: string; type: "paid" | "shipped" | "admin_new_order" }>();
  for (const row of rows.results) {
    const detail = await readOrder(database, row.orderId, siteId);
    await sendOrderNotification(database, detail.order, detail.items, row.type);
  }
  await recordAudit(database, siteId, { userId, email }, "order.notifications_retried_due", "notification", siteId, { count: rows.results.length });
  return { retried: rows.results.length };
}

async function finalizePaidOrder(database: D1DatabaseLike, orderId: string, siteId: string, paypalCaptureId: string | null) {
  const existing = await readOrder(database, orderId, siteId);
  if (existing.order.paymentStatus === "paid") return existing;
  if (!["pending", "processing"].includes(existing.order.paymentStatus)) return existing;
  const claim = await database.prepare(`UPDATE cms_orders SET status = 'processing', payment_status = 'processing', updated_at = ?1
    WHERE id = ?2 AND site_id = ?3 AND payment_status = 'pending'`).bind(now(), orderId, siteId).run();
  if (changed(claim) === 0) {
    const current = await readOrder(database, orderId, siteId);
    if (current.order.paymentStatus === "paid") return current;
    if (current.order.paymentStatus === "processing") return current;
    return current;
  }
  const inventory = await database.prepare(`SELECT product_id AS productId, variant_id AS variantId, reserved_quantity AS reservedQuantity, quantity
    FROM cms_inventory WHERE site_id = ?1 AND product_id IN (${existing.items.map((_, index) => `?${index + 2}`).join(",")})`).bind(siteId, ...existing.items.map((item) => item.productId)).all<{ productId: string; variantId: string; reservedQuantity: number; quantity: number }>();
  const inventoryByVariant = new Map(inventory.results.map((row) => [`${row.productId}:${row.variantId}`, row]));
  if (existing.items.some((item) => (inventoryByVariant.get(`${item.productId}:${item.variantId}`)?.reservedQuantity ?? 0) < item.quantity)) {
    await database.prepare("UPDATE cms_orders SET status = 'payment_failed', payment_status = 'failed', updated_at = ?1 WHERE id = ?2 AND site_id = ?3 AND payment_status = 'processing'").bind(now(), orderId, siteId).run();
    throw new Error("STOCK_UNAVAILABLE");
  }
  const timestamp = now();
  try {
    await database.batch([
      ...existing.items.map((item) => database.prepare(`UPDATE cms_inventory SET quantity = quantity - ?1, reserved_quantity = MAX(0, reserved_quantity - ?1), updated_at = ?2
        WHERE site_id = ?3 AND product_id = ?4 AND variant_id = ?5 AND reserved_quantity >= ?1`).bind(item.quantity, timestamp, siteId, item.productId, item.variantId)),
      ...existing.items.map((item) => database.prepare(`INSERT OR IGNORE INTO cms_inventory_transactions (id, site_id, product_id, variant_id, sku, delta, reason, reference_id, idempotency_key, created_by, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'sale', ?7, ?8, 'paypal', ?9)`).bind(`invtx_${crypto.randomUUID()}`, siteId, item.productId, item.variantId, item.sku, -item.quantity, orderId, `sale:${orderId}:${item.productId}:${item.variantId}`, timestamp)),
      database.prepare(`UPDATE cms_orders SET status = 'paid', payment_status = 'paid', paypal_capture_id = ?1, paid_at = ?2, updated_at = ?2 WHERE id = ?3 AND site_id = ?4 AND payment_status = 'processing'`).bind(paypalCaptureId, timestamp, orderId, siteId),
    ]);
  } catch (error) {
    await database.prepare("UPDATE cms_orders SET status = 'pending', payment_status = 'pending', updated_at = ?1 WHERE id = ?2 AND site_id = ?3 AND payment_status = 'processing'").bind(now(), orderId, siteId).run();
    throw error;
  }
  await recordOrderState(database, siteId, orderId, "pending", "paid", "paypal", "PayPal capture confirmed");
  const paid = await readOrder(database, orderId, siteId);
  await database.prepare("UPDATE cms_abandoned_checkouts SET status = 'recovered', recovered_at = ?1, last_seen_at = ?1 WHERE site_id = ?2 AND email = ?3 AND status IN ('open', 'sent')").bind(timestamp, siteId, paid.order.email).run();
  await sendOrderNotification(database, paid.order, paid.items, "paid");
  await sendOrderNotification(database, paid.order, paid.items, "admin_new_order");
  return paid;
}

export async function verifyPayPalWebhook(siteId: string, payload: string, headers: Headers) {
  const transmissionId = headers.get("paypal-transmission-id");
  const transmissionTime = headers.get("paypal-transmission-time");
  const transmissionSig = headers.get("paypal-transmission-sig");
  const certUrl = headers.get("paypal-cert-url");
  const authAlgo = headers.get("paypal-auth-algo");
  if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) return false;
  try {
    const credentials = await getSiteProviderCredentials(siteId, "paypal");
    if (!credentials.webhookId) return false;
    const session = await getPayPalAccessToken(siteId);
    const response = await fetch(`${paypalBaseUrl(session.environment)}/v1/notifications/verify-webhook-signature`, { method: "POST", headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ auth_algo: authAlgo, cert_url: certUrl, transmission_id: transmissionId, transmission_sig: transmissionSig, transmission_time: transmissionTime, webhook_id: credentials.webhookId, webhook_event: JSON.parse(payload) }) });
    const result = await response.json().catch(() => ({})) as { verification_status?: string };
    return response.ok && result.verification_status === "SUCCESS";
  } catch {
    return false;
  }
}

type PayPalEvent = { id: string; event_type: string; resource?: Record<string, unknown> };

function paypalEventReference(event: PayPalEvent) {
  const resource = event.resource || {};
  const purchaseUnit = Array.isArray(resource.purchase_units) ? resource.purchase_units[0] as Record<string, unknown> | undefined : undefined;
  const customId = typeof resource.custom_id === "string" ? resource.custom_id : typeof purchaseUnit?.custom_id === "string" ? purchaseUnit.custom_id : "";
  const [siteId, orderId] = customId.split(":");
  const supplementary = resource.supplementary_data as { related_ids?: { order_id?: string } } | undefined;
  const relatedOrderId = supplementary?.related_ids?.order_id;
  const captureId = event.event_type.startsWith("PAYMENT.CAPTURE.") && typeof resource.id === "string" ? resource.id : typeof purchaseUnit?.payments === "object" && purchaseUnit.payments && Array.isArray((purchaseUnit.payments as { captures?: unknown[] }).captures) ? (((purchaseUnit.payments as { captures: Array<{ id?: string }> }).captures[0]?.id) || null) : null;
  const paypalOrderId = relatedOrderId || (event.event_type.startsWith("CHECKOUT.ORDER.") && typeof resource.id === "string" ? resource.id : null);
  return { siteId: siteId || "", orderId: orderId || "", paypalOrderId, captureId };
}

export async function resolvePayPalWebhookSiteId(event: PayPalEvent) {
  const reference = paypalEventReference(event);
  if (reference.siteId) return reference.siteId;
  if (reference.paypalOrderId) {
    const database = getCmsDatabase();
    await ensureCmsSchema(database);
    const row = await database.prepare("SELECT site_id AS siteId FROM cms_orders WHERE paypal_order_id = ?1").bind(reference.paypalOrderId).first<{ siteId: string }>();
    if (row?.siteId) return row.siteId;
  }
  return "default";
}

export async function processPayPalEvent(event: PayPalEvent) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const reference = paypalEventReference(event);
  let siteId = reference.siteId || "default";
  let orderId = reference.orderId || "";
  if ((!orderId || !reference.siteId) && reference.paypalOrderId) {
    const row = await database.prepare("SELECT id, site_id AS siteId FROM cms_orders WHERE paypal_order_id = ?1").bind(reference.paypalOrderId).first<{ id: string; siteId: string }>();
    if (row) { orderId = row.id; siteId = row.siteId; }
  }
  const inserted = await database.prepare(`INSERT INTO cms_payment_events (id, site_id, provider_event_id, event_type, payload, created_at, processed_at, dead_lettered)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, 0) ON CONFLICT(provider_event_id) DO NOTHING`).bind(`payment_${crypto.randomUUID()}`, siteId, event.id, event.event_type, JSON.stringify(event), now()).run();
  if (changed(inserted) === 0) {
    const previous = await database.prepare("SELECT processed_at AS processedAt, dead_lettered AS deadLettered FROM cms_payment_events WHERE provider_event_id = ?1").bind(event.id).first<{ processedAt: string | null; deadLettered: number }>();
    if (previous?.processedAt) return { duplicate: true };
    if (previous?.deadLettered === 1) return { duplicate: false, deadLettered: true };
  }
  await database.prepare("UPDATE cms_payment_events SET attempts = attempts + 1, last_attempt_at = ?1, last_error = NULL, next_retry_at = NULL WHERE provider_event_id = ?2").bind(now(), event.id).run();
  const paidEvent = event.event_type === "PAYMENT.CAPTURE.COMPLETED" || event.event_type === "CHECKOUT.ORDER.COMPLETED";
  const failedEvent = event.event_type === "PAYMENT.CAPTURE.DENIED" || event.event_type === "PAYMENT.CAPTURE.REVERSED";
  const cancelledEvent = event.event_type === "CHECKOUT.ORDER.VOIDED";
  const refundEvent = event.event_type === "PAYMENT.CAPTURE.REFUNDED";
  try {
    if (paidEvent && orderId) await finalizePaidOrder(database, orderId, siteId, reference.captureId);
    if (cancelledEvent && orderId) await transitionPendingOrder(database, siteId, orderId, "cancelled", "cancelled");
    if (failedEvent && orderId) await transitionPendingOrder(database, siteId, orderId, "payment_failed", "failed");
    if (refundEvent && typeof event.resource?.id === "string") {
      const refund = await database.prepare("SELECT id, site_id AS siteId FROM cms_refunds WHERE paypal_refund_id = ?1").bind(event.resource.id).first<{ id: string; siteId: string }>();
      if (refund) {
        await completeRefundRecord(database, refund.id, event.resource.id, now());
        siteId = refund.siteId;
      }
    }
    await database.prepare("UPDATE cms_payment_events SET processed_at = ?1, last_error = NULL, next_retry_at = NULL WHERE provider_event_id = ?2").bind(now(), event.id).run();
    return { duplicate: false };
  } catch (error) {
    const retryAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const attempts = await database.prepare("SELECT attempts FROM cms_payment_events WHERE provider_event_id = ?1").bind(event.id).first<{ attempts: number }>();
    const deadLettered = Number(attempts?.attempts || 0) >= 5;
    await database.prepare("UPDATE cms_payment_events SET last_error = ?1, next_retry_at = ?2, dead_lettered = ?3 WHERE provider_event_id = ?4").bind(error instanceof Error ? error.message : "PayPal event processing failed.", deadLettered ? null : retryAt, deadLettered ? 1 : 0, event.id).run();
    throw error;
  }
}

export async function listPaymentEvents(siteId: string, userId: string, email: string): Promise<CmsPaymentEvent[]> {
  void userId;
  void email;
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const rows = await database.prepare(`SELECT id, site_id AS siteId, provider_event_id AS providerEventId, event_type AS eventType,
    created_at AS createdAt, processed_at AS processedAt, attempts, last_error AS lastError, next_retry_at AS nextRetryAt, dead_lettered AS deadLettered, last_attempt_at AS lastAttemptAt
    FROM cms_payment_events WHERE site_id = ?1 ORDER BY created_at DESC LIMIT 100`).bind(siteId).all<CmsPaymentEvent>();
  return rows.results;
}

export async function retryPaymentEvent(siteId: string, eventId: string, userId: string, email: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const row = await database.prepare("SELECT payload FROM cms_payment_events WHERE id = ?1 AND site_id = ?2").bind(eventId, siteId).first<{ payload: string }>();
  if (!row) throw new Error("PAYMENT_EVENT_NOT_FOUND");
  await database.prepare("UPDATE cms_payment_events SET next_retry_at = NULL, dead_lettered = 0, last_error = NULL WHERE id = ?1 AND site_id = ?2").bind(eventId, siteId).run();
  const result = await processPayPalEvent(JSON.parse(row.payload) as PayPalEvent);
  await recordAudit(database, siteId, { userId, email }, "payment.event_retried", "payment_event", eventId);
  return result;
}

export async function retryDuePaymentEvents(siteId: string, userId: string, email: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const rows = await database.prepare(`SELECT id, payload FROM cms_payment_events
    WHERE site_id = ?1 AND processed_at IS NULL AND dead_lettered = 0 AND next_retry_at IS NOT NULL AND next_retry_at <= ?2
    ORDER BY next_retry_at ASC LIMIT 50`).bind(siteId, now()).all<{ id: string; payload: string }>();
  let retried = 0;
  let failed = 0;
  for (const row of rows.results) {
    try { await processPayPalEvent(JSON.parse(row.payload) as PayPalEvent); retried += 1; } catch { failed += 1; }
  }
  await recordAudit(database, siteId, { userId, email }, "payment.events_retried_due", "payment_event", siteId, { retried, failed });
  return { retried, failed };
}

export async function reconcilePayPalOrders(siteId: string, userId: string, email: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const session = await getPayPalAccessToken(siteId);
  const rows = await database.prepare(`SELECT id, paypal_order_id AS paypalOrderId FROM cms_orders
    WHERE site_id = ?1 AND paypal_order_id IS NOT NULL AND payment_status IN ('pending', 'processing')
    ORDER BY created_at ASC LIMIT 50`).bind(siteId).all<{ id: string; paypalOrderId: string }>();
  const result = { checked: rows.results.length, paid: 0, failed: 0, errors: 0 };
  for (const row of rows.results) {
    try {
      const remote = await getPayPalOrder(row.paypalOrderId, session.token, session.environment);
      if (remote.status === "COMPLETED") { await finalizePaidOrder(database, row.id, siteId, captureIdFromPayPalOrder(remote)); result.paid += 1; }
      else if (["VOIDED", "DECLINED"].includes(remote.status || "")) { await transitionPendingOrder(database, siteId, row.id, "payment_failed", "failed"); result.failed += 1; }
    } catch { result.errors += 1; }
  }
  await recordAudit(database, siteId, { userId, email }, "payment.orders_reconciled", "order", siteId, result);
  return result;
}

export async function listOrderStateEvents(siteId: string, orderId: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const rows = await database.prepare(`SELECT id, from_status AS fromStatus, to_status AS toStatus, reason, actor_id AS actorId, created_at AS createdAt
    FROM cms_order_state_events WHERE site_id = ?1 AND order_id = ?2 ORDER BY created_at ASC`).bind(siteId, orderId).all<{ id: string; fromStatus: string | null; toStatus: string; reason: string | null; actorId: string; createdAt: string }>();
  return rows.results;
}

export async function listRefunds(siteId: string, orderId: string, userId: string, email: string): Promise<CmsRefund[]> {
  void userId;
  void email;
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const rows = await database.prepare(`SELECT id, site_id AS siteId, order_id AS orderId, paypal_refund_id AS paypalRefundId,
    amount, currency, reason, status, restock_items AS restockItems, error, created_by AS createdBy, created_at AS createdAt, completed_at AS completedAt
    FROM cms_refunds WHERE site_id = ?1 AND order_id = ?2 ORDER BY created_at DESC`).bind(siteId, orderId).all<RefundRow>();
  return rows.results.map((refund) => ({ ...refund, restockItems: refund.restockItems ? JSON.parse(refund.restockItems) as CmsRefund["restockItems"] : [] }));
}

async function completeRefundRecord(database: D1DatabaseLike, refundId: string, paypalRefundId: string, completedAt: string) {
  const refund = await database.prepare(`SELECT id, site_id AS siteId, order_id AS orderId, amount, restock_items AS restockItems, status
    FROM cms_refunds WHERE id = ?1`).bind(refundId).first<{ id: string; siteId: string; orderId: string; amount: number; restockItems: string | null; status: string }>();
  if (!refund) return false;
  if (refund.status === "succeeded") return true;
  const detail = await readOrder(database, refund.orderId, refund.siteId);
  const restockItems = refund.restockItems ? JSON.parse(refund.restockItems) as Array<{ productId: string; variantId: string; quantity: number }> : [];
  const nextRefundTotal = Number((detail.order.refundTotal + refund.amount).toFixed(2));
  const fullRefund = nextRefundTotal >= detail.order.total - 0.001;
  await database.batch([
    database.prepare("UPDATE cms_refunds SET paypal_refund_id = ?1, status = 'succeeded', completed_at = ?2, error = NULL WHERE id = ?3").bind(paypalRefundId, completedAt, refundId),
    database.prepare("UPDATE cms_orders SET refund_total = ?1, payment_status = ?2, status = ?2, refunded_at = ?3, updated_at = ?4 WHERE id = ?5 AND site_id = ?6").bind(nextRefundTotal, fullRefund ? "refunded" : "partially_refunded", fullRefund ? completedAt : detail.order.refundedAt, completedAt, refund.orderId, refund.siteId),
    ...restockItems.map((item) => database.prepare(`UPDATE cms_inventory SET quantity = quantity + ?1, updated_at = ?2 WHERE site_id = ?3 AND product_id = ?4 AND variant_id = ?5`).bind(item.quantity, completedAt, refund.siteId, item.productId, item.variantId)),
    ...restockItems.map((item) => { const orderItem = detail.items.find((candidate) => candidate.productId === item.productId && candidate.variantId === item.variantId); return orderItem ? database.prepare(`INSERT OR IGNORE INTO cms_inventory_transactions (id, site_id, product_id, variant_id, sku, delta, reason, reference_id, idempotency_key, created_by, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'refund-restock', ?7, ?8, 'paypal', ?9)`).bind(`invtx_${crypto.randomUUID()}`, refund.siteId, item.productId, item.variantId, orderItem.sku, item.quantity, refundId, `refund:${refundId}:${item.productId}:${item.variantId}`, completedAt) : null; }).filter((statement): statement is D1Statement => Boolean(statement)),
  ]);
  await recordOrderState(database, refund.siteId, refund.orderId, detail.order.paymentStatus, fullRefund ? "refunded" : "partially_refunded", "paypal", "PayPal refund completed");
  return true;
}

export async function createRefund(siteId: string, orderId: string, amountInput: number | undefined, reason: string, restockItemsInput: Array<{ productId: string; variantId: string; quantity: number }> | undefined, userId: string, email: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const detail = await readOrder(database, orderId, siteId);
  if (!detail.order.paypalCaptureId) throw new Error("REFUND_PAYMENT_NOT_FOUND");
  if (![
    "paid",
    "partially_refunded",
  ].includes(detail.order.paymentStatus)) throw new Error("ORDER_NOT_REFUNDABLE");
  const pending = await database.prepare("SELECT COALESCE(SUM(amount), 0) AS amount FROM cms_refunds WHERE site_id = ?1 AND order_id = ?2 AND status = 'pending'").bind(siteId, orderId).first<{ amount: number }>();
  const remaining = Math.max(0, detail.order.total - detail.order.refundTotal - Number(pending?.amount || 0));
  const amount = amountInput === undefined || amountInput === null ? remaining : Number(amountInput);
  if (!Number.isFinite(amount) || amount <= 0 || amount > remaining + 0.001) throw new Error("INVALID_REFUND_AMOUNT");
  const restockItems = Array.isArray(restockItemsInput) ? restockItemsInput.filter((item) => Number.isInteger(item.quantity) && item.quantity > 0) : [];
  const allowed = new Map(detail.items.map((item) => [`${item.productId}:${item.variantId}`, item.quantity]));
  const seen = new Set<string>();
  for (const item of restockItems) {
    const key = `${item.productId}:${item.variantId}`;
    if (seen.has(key) || !allowed.has(key) || item.quantity > (allowed.get(key) || 0)) throw new Error("INVALID_REFUND_RESTOCK");
    seen.add(key);
  }
  const refundId = `refund_${crypto.randomUUID()}`;
  const timestamp = now();
  await database.prepare(`INSERT INTO cms_refunds (id, site_id, order_id, paypal_refund_id, amount, currency, reason, status, restock_items, error, created_by, created_at, completed_at)
    VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, 'pending', ?7, NULL, ?8, ?9, NULL)`).bind(refundId, siteId, orderId, amount, detail.order.currency, reason.trim() || null, JSON.stringify(restockItems), userId, timestamp).run();
  try {
    const session = await getPayPalAccessToken(siteId);
    const response = await fetch(`${paypalBaseUrl(session.environment)}/v2/payments/captures/${encodeURIComponent(detail.order.paypalCaptureId)}/refund`, { method: "POST", headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ amount: { value: amount.toFixed(2), currency_code: detail.order.currency.toUpperCase() }, note_to_payer: reason.trim() || undefined }) });
    const payload = await response.json().catch(() => ({})) as { id?: string; status?: string; name?: string; message?: string; details?: Array<{ description?: string }> };
    if (!response.ok || !payload.id) throw new Error(payload.details?.[0]?.description || payload.message || payload.name || "PayPal refund failed.");
    const completedAt = now();
    if (payload.status === "PENDING") await database.prepare("UPDATE cms_refunds SET paypal_refund_id = ?1, status = 'pending', completed_at = NULL, error = NULL WHERE id = ?2").bind(payload.id, refundId).run();
    else await completeRefundRecord(database, refundId, payload.id, completedAt);
    const fullRefund = payload.status === "PENDING" ? false : Number((detail.order.refundTotal + amount).toFixed(2)) >= detail.order.total - 0.001;
    await recordAudit(database, siteId, { userId, email }, "order.refunded", "refund", refundId, { orderId, amount, fullRefund, restocked: restockItems });
    return (await readOrder(database, orderId, siteId));
  } catch (error) {
    await database.prepare("UPDATE cms_refunds SET status = 'failed', error = ?1 WHERE id = ?2").bind(error instanceof Error ? error.message : "PayPal refund failed.", refundId).run();
    throw new Error("REFUND_PROVIDER_ERROR");
  }
}

export async function getPublicOrderByNumber(siteId: string, orderNumberValue: string, email: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const row = await database.prepare("SELECT id FROM cms_orders WHERE site_id = ?1 AND lower(order_number) = lower(?2) AND lower(email) = lower(?3)").bind(siteId, orderNumberValue.trim(), email.trim()).first<{ id: string }>();
  if (!row) throw new Error("ORDER_NOT_FOUND");
  const detail = await readOrder(database, row.id, siteId);
  const token = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await database.prepare("DELETE FROM cms_order_access_tokens WHERE site_id = ?1 AND order_id = ?2 AND lower(email) = lower(?3)").bind(siteId, row.id, email.trim()).run();
  await database.prepare(`INSERT INTO cms_order_access_tokens (id, site_id, order_id, email, token_hash, expires_at, last_used_at, request_count, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?7)`).bind(`access_${crypto.randomUUID()}`, siteId, row.id, email.trim().toLowerCase(), tokenHash, expiresAt, now()).run();
  return {
    order: { ...detail.order, shippingAddress: undefined, paypalOrderId: undefined, paypalApprovalUrl: undefined, paypalCaptureId: undefined, adminNote: undefined },
    items: detail.items.map((item) => ({ id: item.id, name: item.name, variantLabel: item.variantLabel, quantity: item.quantity, unitPrice: item.unitPrice })),
    accessToken: token,
    accessExpiresAt: expiresAt,
  };
}

export async function getPublicOrderByAccessToken(siteId: string, token: string) {
  if (!token || token.length > 160) throw new Error("ORDER_NOT_FOUND");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const row = await database.prepare(`SELECT order_id AS orderId, email, expires_at AS expiresAt, request_count AS requestCount
    FROM cms_order_access_tokens WHERE site_id = ?1 AND token_hash = ?2`).bind(siteId, tokenHash).first<{ orderId: string; email: string; expiresAt: string; requestCount: number }>();
  if (!row || row.expiresAt <= now() || row.requestCount >= 100) throw new Error("ORDER_NOT_FOUND");
  await database.prepare("UPDATE cms_order_access_tokens SET last_used_at = ?1, request_count = request_count + 1 WHERE site_id = ?2 AND token_hash = ?3").bind(now(), siteId, tokenHash).run();
  const detail = await readOrder(database, row.orderId, siteId);
  return {
    order: { ...detail.order, shippingAddress: undefined, paypalOrderId: undefined, paypalApprovalUrl: undefined, paypalCaptureId: undefined, adminNote: undefined },
    items: detail.items.map((item) => ({ id: item.id, productId: item.productId, name: item.name, variantLabel: item.variantLabel, quantity: item.quantity, unitPrice: item.unitPrice })),
  };
}

export function checkoutErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "CHECKOUT_ERROR";
  if (["INVALID_CHECKOUT", "PRODUCT_UNAVAILABLE", "STOCK_UNAVAILABLE", "PAYMENT_NOT_CONFIGURED", "CMS_SECRETS_NOT_CONFIGURED", "CMS_SECRETS_INVALID", "ORDER_NOT_FOUND", "INVALID_INVENTORY", "INVENTORY_BELOW_RESERVED", "INVALID_ORDER_STATUS", "ORDER_NOT_PAID", "PRODUCT_NOT_FOUND", "ORDER_NOT_REFUNDABLE", "INVALID_REFUND_AMOUNT", "INVALID_REFUND_RESTOCK", "REFUND_PAYMENT_NOT_FOUND", "REFUND_PROVIDER_ERROR", "PAYMENT_EVENT_NOT_FOUND", "NOTIFICATION_NOT_FOUND"].includes(message)) return message;
  return message === "PAYMENT_PROVIDER_ERROR" ? message : "CHECKOUT_ERROR";
}
