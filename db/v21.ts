import { ensureCmsSchema, getCmsDatabase, getMediaBucket, recordAudit } from "./cms";
import { probeCommerceProvider } from "./commerce";
import { getSiteProviderCredentials, markSiteIntegrationCheck } from "./site-integrations";

function now() { return new Date().toISOString(); }
function changed(result: unknown) { return Number((result as { meta?: { changes?: number } })?.meta?.changes ?? 0); }
function parseJson<T>(value: string | null | undefined, fallback: T): T { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } }

export type ClientIntakePayload = {
  brandName: string; logoUrl: string; primaryColor: string; secondaryColor: string; heroUrl: string;
  homeCopy: string; shippingPolicy: string; returnPolicy: string; seoTitle: string; seoDescription: string;
  contactEmail: string; tradeEmail: string; productFile: string; domain: string; ownerEmail: string; notes: string;
};

export type ClientIntake = ClientIntakePayload & { siteId: string; status: "incomplete" | "submitted" | "approved"; submittedBy: string | null; approvedBy: string | null; submittedAt: string | null; approvedAt: string | null; updatedAt: string };

export type AfterSalesRequest = {
  id: string; siteId: string; orderId: string; orderNumber?: string; email: string; requestType: "refund" | "return" | "exchange";
  reason: string; customerNote: string | null; adminNote: string | null; requestedAmount: number | null;
  items: Array<{ productId: string; variantId: string; quantity: number }>; status: string; createdAt: string; updatedAt: string; resolvedAt: string | null;
};

const intakeDefaults: ClientIntakePayload = { brandName: "", logoUrl: "", primaryColor: "", secondaryColor: "", heroUrl: "", homeCopy: "", shippingPolicy: "", returnPolicy: "", seoTitle: "", seoDescription: "", contactEmail: "", tradeEmail: "", productFile: "", domain: "", ownerEmail: "", notes: "" };

function intakeFromRow(row: { siteId: string; status: string; payload: string; submittedBy: string | null; approvedBy: string | null; submittedAt: string | null; approvedAt: string | null; updatedAt: string }): ClientIntake {
  return { ...intakeDefaults, ...parseJson<Partial<ClientIntakePayload>>(row.payload, {}), siteId: row.siteId, status: ["submitted", "approved"].includes(row.status) ? row.status as ClientIntake["status"] : "incomplete", submittedBy: row.submittedBy, approvedBy: row.approvedBy, submittedAt: row.submittedAt, approvedAt: row.approvedAt, updatedAt: row.updatedAt };
}

export async function getClientIntake(siteId: string): Promise<ClientIntake> {
  const database = getCmsDatabase(); await ensureCmsSchema(database);
  const row = await database.prepare(`SELECT site_id AS siteId, status, payload, submitted_by AS submittedBy, approved_by AS approvedBy, submitted_at AS submittedAt, approved_at AS approvedAt, updated_at AS updatedAt FROM cms_client_intake WHERE site_id = ?1`).bind(siteId).first<{ siteId: string; status: string; payload: string; submittedBy: string | null; approvedBy: string | null; submittedAt: string | null; approvedAt: string | null; updatedAt: string }>();
  if (row) return intakeFromRow(row);
  const timestamp = now();
  await database.prepare(`INSERT INTO cms_client_intake (site_id, status, payload, updated_at) VALUES (?1, 'incomplete', ?2, ?3) ON CONFLICT(site_id) DO NOTHING`).bind(siteId, JSON.stringify(intakeDefaults), timestamp).run();
  return { ...intakeDefaults, siteId, status: "incomplete", submittedBy: null, approvedBy: null, submittedAt: null, approvedAt: null, updatedAt: timestamp };
}

export async function updateClientIntake(siteId: string, payload: Partial<ClientIntakePayload>, action: "save" | "submit" | "approve", userId: string, email: string) {
  const database = getCmsDatabase(); await ensureCmsSchema(database);
  const current = await getClientIntake(siteId);
  const nextPayload = { ...intakeDefaults, ...current, ...payload } as ClientIntakePayload;
  const timestamp = now();
  const status = action === "approve" ? "approved" : action === "submit" ? "submitted" : current.status === "approved" ? "approved" : "incomplete";
  const submittedBy = action === "submit" ? userId : current.submittedBy;
  const approvedBy = action === "approve" ? userId : current.approvedBy;
  const submittedAt = action === "submit" ? timestamp : current.submittedAt;
  const approvedAt = action === "approve" ? timestamp : current.approvedAt;
  await database.prepare(`INSERT INTO cms_client_intake (site_id, status, payload, submitted_by, approved_by, submitted_at, approved_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    ON CONFLICT(site_id) DO UPDATE SET status = excluded.status, payload = excluded.payload, submitted_by = excluded.submitted_by, approved_by = excluded.approved_by, submitted_at = excluded.submitted_at, approved_at = excluded.approved_at, updated_at = excluded.updated_at`).bind(siteId, status, JSON.stringify(nextPayload), submittedBy, approvedBy, submittedAt, approvedAt, timestamp).run();
  await recordAudit(database, siteId, { userId, email }, `client.intake_${action}`, "client_intake", siteId, { status });
  return getClientIntake(siteId);
}

function afterSalesFromRow(row: { id: string; siteId: string; orderId: string; orderNumber?: string; email: string; requestType: string; reason: string; customerNote: string | null; adminNote: string | null; requestedAmount: number | null; items: string | null; status: string; createdAt: string; updatedAt: string; resolvedAt: string | null }): AfterSalesRequest {
  return { ...row, requestType: ["refund", "return", "exchange"].includes(row.requestType) ? row.requestType as AfterSalesRequest["requestType"] : "return", items: parseJson(row.items, []) };
}

export async function createAfterSalesRequest(siteId: string, input: { orderNumber: string; email: string; requestType: string; reason: string; customerNote?: string; requestedAmount?: number; items?: Array<{ productId: string; variantId: string; quantity: number }> }) {
  const database = getCmsDatabase(); await ensureCmsSchema(database);
  const email = input.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || !input.orderNumber?.trim() || !input.reason?.trim()) throw new Error("INVALID_AFTER_SALES");
  if (!["refund", "return", "exchange"].includes(input.requestType)) throw new Error("INVALID_AFTER_SALES");
  const order = await database.prepare("SELECT id, total, refund_total AS refundTotal, payment_status AS paymentStatus FROM cms_orders WHERE site_id = ?1 AND lower(order_number) = lower(?2) AND lower(email) = lower(?3)").bind(siteId, input.orderNumber.trim(), email).first<{ id: string; total: number; refundTotal: number; paymentStatus: string }>();
  if (!order || !["paid", "partially_refunded", "refunded"].includes(order.paymentStatus)) throw new Error("ORDER_NOT_FOUND");
  const items = Array.isArray(input.items) ? input.items.filter((item) => item && Number.isInteger(item.quantity) && item.quantity > 0).slice(0, 50) : [];
  const amount = input.requestedAmount === undefined ? null : Number(input.requestedAmount);
  if (amount !== null && (!Number.isFinite(amount) || amount <= 0 || amount > order.total - order.refundTotal + 0.001)) throw new Error("INVALID_AFTER_SALES");
  const timestamp = now(); const id = `after_${crypto.randomUUID()}`;
  await database.prepare(`INSERT INTO cms_after_sales_requests (id, site_id, order_id, email, request_type, reason, customer_note, requested_amount, items, status, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'submitted', ?10, ?10)`).bind(id, siteId, order.id, email, input.requestType, input.reason.trim().slice(0, 500), input.customerNote?.trim().slice(0, 3000) || null, amount, JSON.stringify(items), timestamp).run();
  return getAfterSalesRequest(siteId, id);
}

export async function getAfterSalesRequest(siteId: string, id: string) {
  const database = getCmsDatabase(); await ensureCmsSchema(database);
  const row = await database.prepare(`SELECT r.id, r.site_id AS siteId, r.order_id AS orderId, o.order_number AS orderNumber, r.email, r.request_type AS requestType, r.reason, r.customer_note AS customerNote, r.admin_note AS adminNote, r.requested_amount AS requestedAmount, r.items, r.status, r.created_at AS createdAt, r.updated_at AS updatedAt, r.resolved_at AS resolvedAt FROM cms_after_sales_requests r JOIN cms_orders o ON o.id = r.order_id WHERE r.site_id = ?1 AND r.id = ?2`).bind(siteId, id).first<Parameters<typeof afterSalesFromRow>[0]>();
  if (!row) throw new Error("AFTER_SALES_NOT_FOUND");
  return afterSalesFromRow(row);
}

export async function listAfterSalesRequests(siteId: string, status?: string) {
  const database = getCmsDatabase(); await ensureCmsSchema(database);
  const query = status ? " AND r.status = ?2" : "";
  const statement = database.prepare(`SELECT r.id, r.site_id AS siteId, r.order_id AS orderId, o.order_number AS orderNumber, r.email, r.request_type AS requestType, r.reason, r.customer_note AS customerNote, r.admin_note AS adminNote, r.requested_amount AS requestedAmount, r.items, r.status, r.created_at AS createdAt, r.updated_at AS updatedAt, r.resolved_at AS resolvedAt FROM cms_after_sales_requests r JOIN cms_orders o ON o.id = r.order_id WHERE r.site_id = ?1${query} ORDER BY r.created_at DESC LIMIT 100`);
  const rows = status ? await statement.bind(siteId, status).all<Parameters<typeof afterSalesFromRow>[0]>() : await statement.bind(siteId).all<Parameters<typeof afterSalesFromRow>[0]>();
  return rows.results.map(afterSalesFromRow);
}

export async function updateAfterSalesRequest(siteId: string, id: string, status: string, adminNote: string, userId: string, email: string) {
  if (!["submitted", "approved", "rejected", "processing", "completed"].includes(status)) throw new Error("INVALID_AFTER_SALES");
  const database = getCmsDatabase(); await ensureCmsSchema(database);
  const current = await getAfterSalesRequest(siteId, id); const timestamp = now();
  await database.prepare("UPDATE cms_after_sales_requests SET status = ?1, admin_note = ?2, resolved_at = ?3, updated_at = ?4 WHERE site_id = ?5 AND id = ?6").bind(status, adminNote.trim().slice(0, 3000) || null, ["rejected", "completed"].includes(status) ? timestamp : current.resolvedAt, timestamp, siteId, id).run();
  await recordAudit(database, siteId, { userId, email }, "after_sales.updated", "after_sales", id, { from: current.status, to: status });
  return getAfterSalesRequest(siteId, id);
}

export async function recordAnalyticsEvent(siteId: string, input: { eventType: string; productId?: string; orderId?: string; sessionId?: string; payload?: Record<string, unknown> }) {
  const allowed = new Set(["page_view", "product_view", "add_to_cart", "checkout_started", "purchase", "search", "wishlist_add"]);
  if (!allowed.has(input.eventType)) throw new Error("INVALID_ANALYTICS_EVENT");
  const database = getCmsDatabase(); await ensureCmsSchema(database);
  await database.prepare(`INSERT INTO cms_analytics_events (id, site_id, event_type, product_id, order_id, session_id, payload, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`).bind(`analytics_${crypto.randomUUID()}`, siteId, input.eventType, input.productId?.slice(0, 120) || null, input.orderId?.slice(0, 120) || null, input.sessionId?.slice(0, 120) || null, input.payload ? JSON.stringify(input.payload).slice(0, 4000) : null, now()).run();
  return { ok: true };
}

export async function getAnalyticsSummary(siteId: string, days = 30) {
  const database = getCmsDatabase(); await ensureCmsSchema(database);
  const since = new Date(Date.now() - Math.max(1, Math.min(days, 365)) * 86400000).toISOString();
  const events = await database.prepare("SELECT event_type AS eventType, COUNT(*) AS count FROM cms_analytics_events WHERE site_id = ?1 AND created_at >= ?2 GROUP BY event_type ORDER BY count DESC").bind(siteId, since).all<{ eventType: string; count: number }>();
  const orders = await database.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS revenue FROM cms_orders WHERE site_id = ?1 AND payment_status IN ('paid', 'partially_refunded', 'refunded') AND created_at >= ?2").bind(siteId, since).first<{ count: number; revenue: number }>();
  const abandoned = await database.prepare("SELECT COUNT(*) AS count FROM cms_abandoned_checkouts WHERE site_id = ?1 AND status IN ('open', 'sent') AND created_at >= ?2").bind(siteId, since).first<{ count: number }>();
  return { days, since, events: events.results, paidOrders: Number(orders?.count || 0), revenue: Number(orders?.revenue || 0), openAbandonedCheckouts: Number(abandoned?.count || 0) };
}

export async function recordAbandonedCheckout(siteId: string, input: { email?: string; cart: unknown; subtotal?: number; currency?: string }) {
  const database = getCmsDatabase(); await ensureCmsSchema(database); const timestamp = now();
  await database.prepare(`INSERT INTO cms_abandoned_checkouts (id, site_id, email, cart_payload, subtotal, currency, status, created_at, last_seen_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'open', ?7, ?7)`).bind(`abandoned_${crypto.randomUUID()}`, siteId, input.email?.trim().toLowerCase() || null, JSON.stringify(input.cart).slice(0, 12000), Number(input.subtotal || 0), input.currency || "usd", timestamp).run();
  return { ok: true };
}

export async function retryAbandonedCheckoutEmails(siteId: string) {
  const database = getCmsDatabase(); await ensureCmsSchema(database);
  const rows = await database.prepare(`SELECT id, email FROM cms_abandoned_checkouts WHERE site_id = ?1 AND status = 'open' AND email IS NOT NULL AND last_seen_at <= ?2 ORDER BY last_seen_at ASC LIMIT 25`).bind(siteId, new Date(Date.now() - 60 * 60 * 1000).toISOString()).all<{ id: string; email: string }>();
  const values = await getSiteProviderCredentials(siteId, "resend");
  let sent = 0; let failed = 0;
  for (const row of rows.results) {
    try {
      if (!values.apiKey?.trim() || !values.fromEmail?.trim()) throw new Error("RESEND_NOT_CONFIGURED");
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${values.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: values.fromEmail, to: [row.email], subject: "Your cart is still waiting", html: `<p>You left items in your cart. Return to the storefront to finish checkout.</p>` }) });
      if (!response.ok) throw new Error("RESEND_REJECTED");
      await database.prepare("UPDATE cms_abandoned_checkouts SET status = 'sent', last_seen_at = ?1 WHERE id = ?2 AND site_id = ?3").bind(now(), row.id, siteId).run(); sent += 1;
    } catch { await database.prepare("UPDATE cms_abandoned_checkouts SET status = 'failed', last_seen_at = ?1 WHERE id = ?2 AND site_id = ?3").bind(now(), row.id, siteId).run(); failed += 1; }
  }
  return { sent, failed };
}

export type Coupon = { id: string; siteId: string; code: string; discountType: "percent" | "fixed"; discountValue: number; minSubtotal: number; maxUses: number | null; uses: number; startsAt: string | null; endsAt: string | null; active: boolean; createdAt: string; updatedAt: string };
function couponFromRow(row: Record<string, unknown>): Coupon { return { id: String(row.id), siteId: String(row.siteId), code: String(row.code), discountType: row.discountType === "fixed" ? "fixed" : "percent", discountValue: Number(row.discountValue || 0), minSubtotal: Number(row.minSubtotal || 0), maxUses: row.maxUses === null || row.maxUses === undefined ? null : Number(row.maxUses), uses: Number(row.uses || 0), startsAt: row.startsAt as string | null, endsAt: row.endsAt as string | null, active: Number(row.active || 0) === 1, createdAt: String(row.createdAt), updatedAt: String(row.updatedAt) }; }
const couponSelect = "id, site_id AS siteId, code, discount_type AS discountType, discount_value AS discountValue, min_subtotal AS minSubtotal, max_uses AS maxUses, uses, starts_at AS startsAt, ends_at AS endsAt, active, created_at AS createdAt, updated_at AS updatedAt";
export async function listCoupons(siteId: string) { const database = getCmsDatabase(); await ensureCmsSchema(database); const rows = await database.prepare(`SELECT ${couponSelect} FROM cms_coupons WHERE site_id = ?1 ORDER BY created_at DESC`).bind(siteId).all<Record<string, unknown>>(); return rows.results.map(couponFromRow); }
export async function saveCoupon(siteId: string, input: Partial<Coupon>, userId: string, email: string) { const database = getCmsDatabase(); await ensureCmsSchema(database); const code = String(input.code || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40); const value = Number(input.discountValue); if (!code || !Number.isFinite(value) || value <= 0 || value > 100000) throw new Error("INVALID_COUPON"); const timestamp = now(); const id = input.id || `coupon_${crypto.randomUUID()}`; await database.prepare(`INSERT INTO cms_coupons (id, site_id, code, discount_type, discount_value, min_subtotal, max_uses, active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9) ON CONFLICT(site_id, code) DO UPDATE SET discount_type = excluded.discount_type, discount_value = excluded.discount_value, min_subtotal = excluded.min_subtotal, max_uses = excluded.max_uses, active = excluded.active, updated_at = excluded.updated_at`).bind(id, siteId, code, input.discountType === "fixed" ? "fixed" : "percent", value, Math.max(0, Number(input.minSubtotal || 0)), input.maxUses === null || input.maxUses === undefined ? null : Math.max(1, Number(input.maxUses)), input.active === false ? 0 : 1, timestamp).run(); await recordAudit(database, siteId, { userId, email }, "coupon.saved", "coupon", id, { code }); return listCoupons(siteId); }
export async function validateCoupon(siteId: string, codeInput: string, subtotal: number) { const database = getCmsDatabase(); await ensureCmsSchema(database); const code = codeInput.trim().toUpperCase(); const row = await database.prepare(`SELECT ${couponSelect} FROM cms_coupons WHERE site_id = ?1 AND code = ?2 AND active = 1`).bind(siteId, code).first<Record<string, unknown>>(); if (!row) return { coupon: null, discount: 0 }; const coupon = couponFromRow(row); const timestamp = now(); if (coupon.startsAt && coupon.startsAt > timestamp || coupon.endsAt && coupon.endsAt < timestamp || subtotal < coupon.minSubtotal || coupon.maxUses !== null && coupon.uses >= coupon.maxUses) return { coupon: null, discount: 0 }; const discount = Math.min(subtotal, coupon.discountType === "percent" ? subtotal * coupon.discountValue / 100 : coupon.discountValue); return { coupon, discount: Math.round(discount * 100) / 100 }; }

export type Bundle = { id: string; siteId: string; name: string; slug: string; productIds: string[]; discountType: "percent" | "fixed"; discountValue: number; active: boolean; createdAt: string; updatedAt: string };
function bundleFromRow(row: Record<string, unknown>): Bundle { return { id: String(row.id), siteId: String(row.siteId), name: String(row.name), slug: String(row.slug), productIds: parseJson<string[]>(typeof row.productIds === "string" ? row.productIds : null, []), discountType: row.discountType === "fixed" ? "fixed" : "percent", discountValue: Number(row.discountValue || 0), active: Number(row.active || 0) === 1, createdAt: String(row.createdAt), updatedAt: String(row.updatedAt) }; }
export async function listBundles(siteId: string, activeOnly = false) { const database = getCmsDatabase(); await ensureCmsSchema(database); const rows = await database.prepare(`SELECT id, site_id AS siteId, name, slug, product_ids AS productIds, discount_type AS discountType, discount_value AS discountValue, active, created_at AS createdAt, updated_at AS updatedAt FROM cms_bundles WHERE site_id = ?1${activeOnly ? " AND active = 1" : ""} ORDER BY created_at DESC`).bind(siteId).all<Record<string, unknown>>(); return rows.results.map(bundleFromRow); }
export async function saveBundle(siteId: string, input: { id?: string; name?: string; slug?: string; productIds?: string[]; discountType?: string; discountValue?: number; active?: boolean }, userId: string, email: string) { const database = getCmsDatabase(); await ensureCmsSchema(database); const name = String(input.name || "").trim().slice(0, 120); const slug = String(input.slug || name).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80); const productIds = Array.isArray(input.productIds) ? input.productIds.filter((id) => typeof id === "string").slice(0, 20) : []; const value = Number(input.discountValue || 0); if (!name || !slug || productIds.length < 2 || !Number.isFinite(value) || value < 0) throw new Error("INVALID_BUNDLE"); const timestamp = now(); const id = input.id || `bundle_${crypto.randomUUID()}`; await database.prepare(`INSERT INTO cms_bundles (id, site_id, name, slug, product_ids, discount_type, discount_value, active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9) ON CONFLICT(site_id, slug) DO UPDATE SET name = excluded.name, product_ids = excluded.product_ids, discount_type = excluded.discount_type, discount_value = excluded.discount_value, active = excluded.active, updated_at = excluded.updated_at`).bind(id, siteId, name, slug, JSON.stringify(productIds), input.discountType === "fixed" ? "fixed" : "percent", value, input.active === false ? 0 : 1, timestamp).run(); await recordAudit(database, siteId, { userId, email }, "bundle.saved", "bundle", id, { productIds }); return listBundles(siteId); }

export async function listPublishedReviews(siteId: string, productId: string) { const database = getCmsDatabase(); await ensureCmsSchema(database); const rows = await database.prepare("SELECT id, rating, title, body, created_at AS createdAt FROM cms_reviews WHERE site_id = ?1 AND product_id = ?2 AND status = 'approved' ORDER BY created_at DESC LIMIT 100").bind(siteId, productId).all<{ id: string; rating: number; title: string | null; body: string; createdAt: string }>(); return rows.results; }
export async function createReview(siteId: string, input: { productId: string; orderNumber?: string; email: string; rating: number; title?: string; body: string }) { const database = getCmsDatabase(); await ensureCmsSchema(database); const rating = Math.floor(Number(input.rating)); if (!input.productId || !/^\S+@\S+\.\S+$/.test(input.email.trim()) || rating < 1 || rating > 5 || !input.body.trim()) throw new Error("INVALID_REVIEW"); let orderId: string | null = null; if (input.orderNumber) { const order = await database.prepare("SELECT id FROM cms_orders WHERE site_id = ?1 AND order_number = ?2 AND lower(email) = lower(?3)").bind(siteId, input.orderNumber.trim(), input.email.trim()).first<{ id: string }>(); if (!order) throw new Error("ORDER_NOT_FOUND"); const item = await database.prepare("SELECT id FROM cms_order_items WHERE site_id = ?1 AND order_id = ?2 AND product_id = ?3").bind(siteId, order.id, input.productId).first<{ id: string }>(); if (!item) throw new Error("INVALID_REVIEW"); orderId = order.id; } const timestamp = now(); const id = `review_${crypto.randomUUID()}`; await database.prepare("INSERT INTO cms_reviews (id, site_id, product_id, order_id, email, rating, title, body, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9, ?9)").bind(id, siteId, input.productId, orderId, input.email.trim().toLowerCase(), rating, input.title?.trim().slice(0, 120) || null, input.body.trim().slice(0, 2000), timestamp).run(); return { id, status: "pending" }; }
export async function listReviewsForAdmin(siteId: string) { const database = getCmsDatabase(); await ensureCmsSchema(database); const rows = await database.prepare("SELECT id, product_id AS productId, order_id AS orderId, email, rating, title, body, status, created_at AS createdAt FROM cms_reviews WHERE site_id = ?1 ORDER BY created_at DESC LIMIT 200").bind(siteId).all<Record<string, unknown>>(); return rows.results; }
export async function moderateReview(siteId: string, id: string, status: string, userId: string, email: string) { if (!["pending", "approved", "rejected"].includes(status)) throw new Error("INVALID_REVIEW"); const database = getCmsDatabase(); await ensureCmsSchema(database); const result = await database.prepare("UPDATE cms_reviews SET status = ?1, updated_at = ?2 WHERE site_id = ?3 AND id = ?4").bind(status, now(), siteId, id).run(); if (changed(result) !== 1) throw new Error("REVIEW_NOT_FOUND"); await recordAudit(database, siteId, { userId, email }, "review.moderated", "review", id, { status }); return listReviewsForAdmin(siteId); }

export async function runHealthChecks(siteId: string) {
  const database = getCmsDatabase(); const checks: Array<{ key: string; status: string; detail: string }> = [];
  try { await ensureCmsSchema(database); await database.prepare("SELECT 1 AS ok").first(); checks.push({ key: "d1", status: "ready", detail: "D1 schema and query are available." }); } catch (error) { checks.push({ key: "d1", status: "error", detail: error instanceof Error ? error.message : "D1 unavailable." }); }
  for (const provider of ["paypal", "resend"] as const) { try { const probe = await probeCommerceProvider(provider, siteId); checks.push({ key: provider, status: probe.status, detail: probe.detail }); await markSiteIntegrationCheck(siteId, provider, probe.status === "ready" ? "ready" : probe.status === "missing" ? "missing" : "error", probe.status === "ready" ? null : probe.detail, database); } catch (error) { const detail = error instanceof Error ? error.message : "Provider check failed."; checks.push({ key: provider, status: "error", detail }); await markSiteIntegrationCheck(siteId, provider, "error", detail, database); } }
  try { getMediaBucket(); checks.push({ key: "r2", status: "ready", detail: "R2 media binding is present." }); } catch (error) { checks.push({ key: "r2", status: "error", detail: error instanceof Error ? error.message : "R2 unavailable." }); }
  const domain = await database.prepare("SELECT hostname, status FROM cms_site_domains WHERE site_id = ?1 ORDER BY created_at DESC LIMIT 1").bind(siteId).first<{ hostname: string; status: string }>(); checks.push({ key: "domain", status: domain?.status === "active" || domain?.status === "verified" ? "ready" : domain ? "error" : "missing", detail: domain ? `${domain.hostname} is ${domain.status}.` : "No custom domain mapping." });
  checks.push({ key: "worker", status: "ready", detail: "Scheduled operations are available in the worker runtime." });
  const timestamp = now(); await database.batch(checks.map((check) => database.prepare("INSERT INTO cms_health_checks (site_id, check_key, status, detail, checked_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(site_id, check_key) DO UPDATE SET status = excluded.status, detail = excluded.detail, checked_at = excluded.checked_at").bind(siteId, check.key, check.status, check.detail, timestamp)));
  return listHealthChecks(siteId);
}
export async function listHealthChecks(siteId: string) { const database = getCmsDatabase(); await ensureCmsSchema(database); const rows = await database.prepare("SELECT check_key AS key, status, detail, checked_at AS checkedAt FROM cms_health_checks WHERE site_id = ?1 ORDER BY check_key").bind(siteId).all<{ key: string; status: string; detail: string; checkedAt: string }>(); return rows.results; }

export async function updateCouponWindow(siteId: string, codeInput: string, startsAt: string | null, endsAt: string | null, userId: string, email: string) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const code = codeInput.trim().toUpperCase();
  if (!code || (startsAt && Number.isNaN(Date.parse(startsAt))) || (endsAt && Number.isNaN(Date.parse(endsAt))) || (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt))) throw new Error("INVALID_COUPON");
  const result = await database.prepare("UPDATE cms_coupons SET starts_at = ?1, ends_at = ?2, active = CASE WHEN ?1 IS NOT NULL AND ?1 > ?3 THEN 0 ELSE active END, updated_at = ?3 WHERE site_id = ?4 AND code = ?5").bind(startsAt || null, endsAt || null, now(), siteId, code).run();
  if (changed(result) !== 1) throw new Error("INVALID_COUPON");
  await recordAudit(database, siteId, { userId, email }, "coupon.window_updated", "coupon", code, { startsAt, endsAt });
  return listCoupons(siteId);
}
