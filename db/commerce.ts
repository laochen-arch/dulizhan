import { env } from "cloudflare:workers";
import { readSnapshot, ensureCmsSchema, getCmsDatabase, recordAudit, type D1DatabaseLike, type D1Statement } from "./cms";
import type { Product, ProductVariant } from "../app/data/products";

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
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  shippingAddress: Record<string, string>;
  trackingNumber: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  shippedAt: string | null;
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

type WorkerEnv = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
};

type InventoryRow = CmsInventoryRow;
type OrderRow = Omit<CmsOrder, "shippingAddress"> & { shipping_address: string };
type OrderItemRow = Omit<CmsOrderItem, "payload"> & { payload: string };

function workerEnv() {
  return env as unknown as WorkerEnv;
}

function now() {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

async function readOrder(database: D1DatabaseLike, orderId: string, siteId: string) {
  const row = await database.prepare(`SELECT id, site_id AS siteId, order_number AS orderNumber, email, customer_name AS customerName, currency,
    subtotal, shipping, tax, total, status, payment_status AS paymentStatus, fulfillment_status AS fulfillmentStatus,
    stripe_session_id AS stripeSessionId, stripe_payment_intent_id AS stripePaymentIntentId, shipping_address, tracking_number AS trackingNumber,
    created_at AS createdAt, updated_at AS updatedAt, paid_at AS paidAt, shipped_at AS shippedAt
    FROM cms_orders WHERE id = ?1 AND site_id = ?2`).bind(orderId, siteId).first<OrderRow>();
  if (!row) throw new Error("ORDER_NOT_FOUND");
  const items = await database.prepare(`SELECT id, order_id AS orderId, site_id AS siteId, product_id AS productId, variant_id AS variantId,
    sku, name, variant_label AS variantLabel, unit_price AS unitPrice, quantity, payload
    FROM cms_order_items WHERE order_id = ?1 AND site_id = ?2 ORDER BY id ASC`).bind(orderId, siteId).all<OrderItemRow>();
  return { order: orderToPublic(row), items: items.results.map(itemToPublic) };
}

async function releaseReservations(database: D1DatabaseLike, siteId: string, orderId: string) {
  const items = await database.prepare("SELECT product_id AS productId, variant_id AS variantId, quantity FROM cms_order_items WHERE order_id = ?1 AND site_id = ?2").bind(orderId, siteId).all<{ productId: string; variantId: string; quantity: number }>();
  await database.batch(items.results.map((item) => database.prepare(`UPDATE cms_inventory SET reserved_quantity = MAX(0, reserved_quantity - ?1), updated_at = ?2
    WHERE site_id = ?3 AND product_id = ?4 AND variant_id = ?5`).bind(item.quantity, now(), siteId, item.productId, item.variantId)));
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

function orderNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `NL-${date}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

function stripeBody(order: CmsOrder, items: CmsOrderItem[], origin: string) {
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", `${origin}/checkout?order_id=${encodeURIComponent(order.id)}&session_id={CHECKOUT_SESSION_ID}`);
  body.set("cancel_url", `${origin}/checkout?order_id=${encodeURIComponent(order.id)}&cancelled=1`);
  body.set("customer_email", order.email);
  body.set("metadata[order_id]", order.id);
  body.set("metadata[site_id]", order.siteId);
  body.set("payment_intent_data[metadata][order_id]", order.id);
  items.forEach((item, index) => {
    body.set(`line_items[${index}][quantity]`, String(item.quantity));
    body.set(`line_items[${index}][price_data][currency]`, order.currency);
    body.set(`line_items[${index}][price_data][unit_amount]`, String(Math.round(item.unitPrice * 100)));
    body.set(`line_items[${index}][price_data][product_data][name]`, `${item.name} / ${item.variantLabel}`);
    body.set(`line_items[${index}][price_data][product_data][metadata][sku]`, item.sku);
  });
  if (order.shipping > 0) {
    body.set(`shipping_options[0][shipping_rate_data][type]`, "fixed_amount");
    body.set(`shipping_options[0][shipping_rate_data][display_name]`, "Standard delivery");
    body.set(`shipping_options[0][shipping_rate_data][fixed_amount][amount]`, String(Math.round(order.shipping * 100)));
    body.set(`shipping_options[0][shipping_rate_data][fixed_amount][currency]`, order.currency);
  }
  return body;
}

async function createStripeSession(order: CmsOrder, items: CmsOrderItem[], origin: string) {
  const secret = workerEnv().STRIPE_SECRET_KEY?.trim();
  if (!secret) throw new Error("PAYMENT_NOT_CONFIGURED");
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Basic ${btoa(`${secret}:`)}`, "Content-Type": "application/x-www-form-urlencoded" }, body: stripeBody(order, items, origin) });
  const payload = await response.json().catch(() => ({})) as { id?: string; url?: string; error?: { message?: string } };
  if (!response.ok || !payload.id || !payload.url) throw new Error(payload.error?.message || "PAYMENT_PROVIDER_ERROR");
  return { id: payload.id, url: payload.url };
}

export async function createCheckout(siteId: string, payload: CheckoutPayload, origin: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const snapshot = await readSnapshot(siteId, "published");
  const catalog = snapshot.catalog.filter((product) => product.status === "active");
  await ensureInventoryRows(database, siteId, catalog);
  const requested = new Map<string, number>();
  for (const item of payload.items || []) {
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
  if (![payload.firstName, payload.lastName, payload.address, payload.city, payload.region, payload.zip, payload.country].every((value) => typeof value === "string" && value.trim())) throw new Error("INVALID_CHECKOUT");
  const subtotal = lineItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const shipping = payload.deliveryMethod.toLowerCase().includes("express") ? 18 : subtotal >= 100 ? 0 : 8;
  const timestamp = now();
  const order: CmsOrder = { id: `order_${crypto.randomUUID()}`, siteId, orderNumber: orderNumber(), email, customerName: `${payload.firstName.trim()} ${payload.lastName.trim()}`.trim(), currency: "usd", subtotal, shipping, tax: 0, total: subtotal + shipping, status: "pending", paymentStatus: "pending", fulfillmentStatus: "unfulfilled", stripeSessionId: null, stripePaymentIntentId: null, shippingAddress: { address: payload.address.trim(), city: payload.city.trim(), region: payload.region.trim(), zip: payload.zip.trim(), country: payload.country.trim() }, trackingNumber: null, createdAt: timestamp, updatedAt: timestamp, paidAt: null, shippedAt: null };
  lineItems.forEach((item) => { item.orderId = order.id; });
  await database.batch([
    database.prepare(`INSERT INTO cms_orders (id, site_id, order_number, email, customer_name, currency, subtotal, shipping, tax, total, status, payment_status, fulfillment_status, stripe_session_id, stripe_payment_intent_id, shipping_address, tracking_number, created_at, updated_at, paid_at, shipped_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, NULL, NULL, ?14, NULL, ?15, ?15, NULL, NULL)`).bind(order.id, order.siteId, order.orderNumber, order.email, order.customerName, order.currency, order.subtotal, order.shipping, order.tax, order.total, order.status, order.paymentStatus, order.fulfillmentStatus, JSON.stringify(order.shippingAddress), timestamp),
    ...lineItems.map((item) => database.prepare(`INSERT INTO cms_order_items (id, order_id, site_id, product_id, variant_id, sku, name, variant_label, unit_price, quantity, payload)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`).bind(item.id, item.orderId, item.siteId, item.productId, item.variantId, item.sku, item.name, item.variantLabel, item.unitPrice, item.quantity, JSON.stringify(item.payload))),
  ]);
  try {
    await reserveItems(database, siteId, lineItems.map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity })));
    const session = await createStripeSession(order, lineItems, origin);
    await database.prepare("UPDATE cms_orders SET stripe_session_id = ?1, updated_at = ?2 WHERE id = ?3 AND site_id = ?4").bind(session.id, now(), order.id, siteId).run();
    return { order: { ...order, stripeSessionId: session.id }, items: lineItems, checkoutUrl: session.url };
  } catch (error) {
    await releaseReservations(database, siteId, order.id);
    await database.prepare("UPDATE cms_orders SET status = 'cancelled', updated_at = ?1 WHERE id = ?2 AND site_id = ?3").bind(now(), order.id, siteId).run();
    throw error;
  }
}

export async function attachLiveInventoryToCatalog(siteId: string, catalog: Product[]) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
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

export async function getCheckoutStatus(siteId: string, orderId: string, sessionId: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const row = await database.prepare(`SELECT order_number AS orderNumber, status, payment_status AS paymentStatus, fulfillment_status AS fulfillmentStatus
    FROM cms_orders WHERE id = ?1 AND site_id = ?2 AND stripe_session_id = ?3`).bind(orderId, siteId, sessionId).first<{ orderNumber: string; status: string; paymentStatus: string; fulfillmentStatus: string }>();
  return row;
}

export async function listInventory(siteId: string, userId: string, email: string): Promise<CmsInventoryRow[]> {
  void userId;
  void email;
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
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
  const query = status ? ` AND status = ?2` : "";
  const statement = database.prepare(`SELECT id, site_id AS siteId, order_number AS orderNumber, email, customer_name AS customerName, currency,
    subtotal, shipping, tax, total, status, payment_status AS paymentStatus, fulfillment_status AS fulfillmentStatus,
    stripe_session_id AS stripeSessionId, stripe_payment_intent_id AS stripePaymentIntentId, shipping_address, tracking_number AS trackingNumber,
    created_at AS createdAt, updated_at AS updatedAt, paid_at AS paidAt, shipped_at AS shippedAt FROM cms_orders WHERE site_id = ?1${query} ORDER BY created_at DESC LIMIT 100`);
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

export async function updateOrderFulfillment(siteId: string, orderId: string, fulfillmentStatus: string, trackingNumber: string, userId: string, email: string) {
  void userId;
  void email;
  if (!["unfulfilled", "processing", "shipped", "delivered", "cancelled"].includes(fulfillmentStatus)) throw new Error("INVALID_ORDER_STATUS");
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const existing = await readOrder(database, orderId, siteId);
  const timestamp = now();
  const shippedAt = fulfillmentStatus === "shipped" || fulfillmentStatus === "delivered" ? existing.order.shippedAt || timestamp : existing.order.shippedAt;
  await database.prepare(`UPDATE cms_orders SET fulfillment_status = ?1, tracking_number = ?2, shipped_at = ?3, updated_at = ?4 WHERE id = ?5 AND site_id = ?6`).bind(fulfillmentStatus, trackingNumber.trim() || null, shippedAt, timestamp, orderId, siteId).run();
  await recordAudit(database, siteId, { userId, email }, "order.fulfillment_updated", "order", orderId, { status: fulfillmentStatus, trackingNumber: trackingNumber.trim() || null });
  if (fulfillmentStatus === "shipped" && existing.order.fulfillmentStatus !== "shipped") await sendOrderNotification(database, { ...existing.order, fulfillmentStatus, trackingNumber: trackingNumber.trim() || null, shippedAt }, existing.items, "shipped");
  return { ...existing.order, fulfillmentStatus, trackingNumber: trackingNumber.trim() || null, shippedAt };
}

async function sendOrderNotification(database: D1DatabaseLike, order: CmsOrder, items: CmsOrderItem[], type: "paid" | "shipped") {
  const id = `notify_${crypto.randomUUID()}`;
  const insert = await database.prepare(`INSERT INTO cms_order_notifications (id, site_id, order_id, type, status, provider_id, error, created_at, sent_at)
    VALUES (?1, ?2, ?3, ?4, 'pending', NULL, NULL, ?5, NULL) ON CONFLICT(order_id, type) DO NOTHING`).bind(id, order.siteId, order.id, type, now()).run();
  if (changed(insert) === 0) return;
  const apiKey = workerEnv().RESEND_API_KEY?.trim();
  const from = workerEnv().RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    await database.prepare("UPDATE cms_order_notifications SET status = 'not_configured', error = ?1 WHERE id = ?2").bind("RESEND_API_KEY and RESEND_FROM_EMAIL are not configured.", id).run();
    return;
  }
  const subject = type === "paid" ? `Order ${order.orderNumber} confirmed` : `Order ${order.orderNumber} is on the way`;
  const rows = items.map((item) => `<li>${item.name} / ${item.variantLabel} × ${item.quantity} — $${(item.unitPrice * item.quantity).toFixed(2)}</li>`).join("");
  const html = `<p>Hi ${order.customerName || "there"},</p><p>${type === "paid" ? "Thanks for your order. Payment has been confirmed." : "Your order has shipped."}</p><p><strong>${order.orderNumber}</strong></p><ul>${rows}</ul>${order.trackingNumber ? `<p>Tracking: ${order.trackingNumber}</p>` : ""}`;
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [order.email], subject, html }) });
    const payload = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok) throw new Error(payload.message || "Email provider rejected the message.");
    await database.prepare("UPDATE cms_order_notifications SET status = 'sent', provider_id = ?1, sent_at = ?2 WHERE id = ?3").bind(payload.id || null, now(), id).run();
  } catch (error) {
    await database.prepare("UPDATE cms_order_notifications SET status = 'failed', error = ?1 WHERE id = ?2").bind(error instanceof Error ? error.message : "Email delivery failed.", id).run();
  }
}

async function finalizePaidOrder(database: D1DatabaseLike, orderId: string, siteId: string, paymentIntentId: string | null) {
  const existing = await readOrder(database, orderId, siteId);
  if (existing.order.paymentStatus === "paid") return existing;
  const timestamp = now();
  await database.batch([
    ...existing.items.map((item) => database.prepare(`UPDATE cms_inventory SET quantity = quantity - ?1, reserved_quantity = MAX(0, reserved_quantity - ?1), updated_at = ?2
      WHERE site_id = ?3 AND product_id = ?4 AND variant_id = ?5 AND reserved_quantity >= ?1`).bind(item.quantity, timestamp, siteId, item.productId, item.variantId)),
    ...existing.items.map((item) => database.prepare(`INSERT INTO cms_inventory_transactions (id, site_id, product_id, variant_id, sku, delta, reason, reference_id, created_by, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'sale', ?7, 'stripe', ?8)`).bind(`invtx_${crypto.randomUUID()}`, siteId, item.productId, item.variantId, item.sku, -item.quantity, orderId, timestamp)),
    database.prepare(`UPDATE cms_orders SET status = 'paid', payment_status = 'paid', stripe_payment_intent_id = ?1, paid_at = ?2, updated_at = ?2 WHERE id = ?3 AND site_id = ?4 AND payment_status <> 'paid'`).bind(paymentIntentId, timestamp, orderId, siteId),
  ]);
  const paid = await readOrder(database, orderId, siteId);
  await sendOrderNotification(database, paid.order, paid.items, "paid");
  return paid;
}

export async function verifyStripeSignature(payload: string, signature: string | null) {
  const secret = workerEnv().STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret || !signature) return false;
  const parts = signature.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const expected = parts.find((part) => part.startsWith("v1="))?.slice(3);
  if (!timestamp || !expected || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const actual = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
  if (actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < actual.length; index += 1) mismatch |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  return mismatch === 0;
}

export async function processStripeEvent(event: { id: string; type: string; data?: { object?: Record<string, unknown> } }) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const object = event.data?.object || {};
  const metadata = (object.metadata || {}) as Record<string, string>;
  const siteId = metadata.site_id || "default";
  const inserted = await database.prepare(`INSERT INTO cms_payment_events (id, site_id, provider_event_id, event_type, payload, created_at, processed_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL) ON CONFLICT(provider_event_id) DO NOTHING`).bind(`payment_${crypto.randomUUID()}`, siteId, event.id, event.type, JSON.stringify(event), now()).run();
  if (changed(inserted) === 0) return { duplicate: true };
  const orderId = metadata.order_id;
  if (event.type === "checkout.session.completed" && orderId) await finalizePaidOrder(database, orderId, siteId, typeof object.payment_intent === "string" ? object.payment_intent : null);
  if (event.type === "checkout.session.expired" && orderId) {
    await releaseReservations(database, siteId, orderId);
    await database.prepare("UPDATE cms_orders SET status = 'cancelled', updated_at = ?1 WHERE id = ?2 AND site_id = ?3 AND payment_status = 'pending'").bind(now(), orderId, siteId).run();
  }
  await database.prepare("UPDATE cms_payment_events SET processed_at = ?1 WHERE provider_event_id = ?2").bind(now(), event.id).run();
  return { duplicate: false };
}

export function checkoutErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "CHECKOUT_ERROR";
  if (["INVALID_CHECKOUT", "PRODUCT_UNAVAILABLE", "STOCK_UNAVAILABLE", "PAYMENT_NOT_CONFIGURED", "ORDER_NOT_FOUND", "INVALID_INVENTORY", "INVENTORY_BELOW_RESERVED", "INVALID_ORDER_STATUS", "PRODUCT_NOT_FOUND"].includes(message)) return message;
  return message === "PAYMENT_PROVIDER_ERROR" ? message : "CHECKOUT_ERROR";
}
