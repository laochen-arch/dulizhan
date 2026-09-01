import { ensureCmsSchema, getCmsDatabase, readSnapshot, type D1DatabaseLike } from "./cms";
import { getSiteProviderCredentials } from "./site-integrations";

type NewsletterRow = { siteId: string; email: string; status: string; lastEmailStatus: string; lastError: string | null };
type StockAlertRow = { id: string; siteId: string; email: string; productId: string; variantId: string; status: string; createdAt: string; updatedAt: string; notifiedAt: string | null };

const schemaInitializationPromises = new WeakMap<object, Promise<void>>();

function now() {
  return new Date().toISOString();
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("INVALID_EMAIL");
  return email.slice(0, 254);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function ensureNewsletterColumn(database: D1DatabaseLike, name: string, definition: string) {
  const columns = await database.prepare("PRAGMA table_info(store_newsletter_subscribers)").all<{ name: string }>();
  if (columns.results.some((column) => column.name === name)) return;
  try { await database.prepare(`ALTER TABLE store_newsletter_subscribers ADD COLUMN ${name} ${definition}`).run(); } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("duplicate column") && !message.includes("already exists")) throw error;
  }
}

export async function ensureV28Schema(database: D1DatabaseLike = getCmsDatabase()) {
  const key = database as unknown as object;
  const existing = schemaInitializationPromises.get(key);
  if (existing) return existing;
  const initialization = (async () => {
    await ensureCmsSchema(database);
    await database.batch([
      database.prepare(`CREATE TABLE IF NOT EXISTS store_newsletter_subscribers (
        site_id TEXT NOT NULL,
        email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'subscribed',
        source TEXT NOT NULL DEFAULT 'storefront',
        consent_at TEXT NOT NULL,
        last_email_status TEXT NOT NULL DEFAULT 'not_sent',
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (site_id, email)
      )`),
      database.prepare("CREATE INDEX IF NOT EXISTS store_newsletter_site_status_idx ON store_newsletter_subscribers(site_id, status, updated_at)"),
      database.prepare(`CREATE TABLE IF NOT EXISTS store_stock_alerts (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        email TEXT NOT NULL,
        product_id TEXT NOT NULL,
        variant_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        notified_at TEXT,
        UNIQUE (site_id, email, product_id, variant_id)
      )`),
      database.prepare("CREATE INDEX IF NOT EXISTS store_stock_alerts_product_idx ON store_stock_alerts(site_id, product_id, variant_id, status)"),
    ]);
    await ensureNewsletterColumn(database, "unsubscribe_token_hash", "TEXT");
    await ensureNewsletterColumn(database, "unsubscribed_at", "TEXT");
  })();
  schemaInitializationPromises.set(key, initialization);
  try {
    await initialization;
  } catch (error) {
    schemaInitializationPromises.delete(key);
    throw error;
  }
}

async function sendResendMessage(siteId: string, input: { to: string; subject: string; html: string }) {
  const credentials = await getSiteProviderCredentials(siteId, "resend");
  const apiKey = credentials.apiKey?.trim() || "";
  const from = credentials.fromEmail?.trim() || "";
  if (!apiKey || !from) return { sent: false, reason: "RESEND_NOT_CONFIGURED" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `newsletter:${siteId}:${await sha256(input.to)}` },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  const payload = await response.json().catch(() => ({})) as { id?: string; message?: string };
  if (!response.ok) throw new Error(payload.message || "RESEND_REJECTED");
  return { sent: true, providerId: payload.id || null };
}

export async function subscribeToNewsletter(siteId: string, emailInput: string, source = "storefront", origin = "") {
  const database = getCmsDatabase();
  await ensureV28Schema(database);
  const email = normalizeEmail(emailInput);
  const timestamp = now();
  const unsubscribeToken = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
  const unsubscribeTokenHash = await sha256(unsubscribeToken);
  const existing = await database.prepare("SELECT site_id AS siteId, email, status, last_email_status AS lastEmailStatus, last_error AS lastError FROM store_newsletter_subscribers WHERE site_id = ?1 AND email = ?2").bind(siteId, email).first<NewsletterRow>();
  await database.prepare(`INSERT INTO store_newsletter_subscribers (site_id, email, status, source, consent_at, last_email_status, last_error, unsubscribe_token_hash, unsubscribed_at, created_at, updated_at)
    VALUES (?1, ?2, 'subscribed', ?3, ?4, 'not_sent', NULL, ?5, NULL, ?4, ?4)
    ON CONFLICT(site_id, email) DO UPDATE SET status = 'subscribed', source = excluded.source, consent_at = excluded.consent_at, unsubscribe_token_hash = excluded.unsubscribe_token_hash, unsubscribed_at = NULL, updated_at = excluded.updated_at`).bind(siteId, email, source.slice(0, 80), timestamp, unsubscribeTokenHash).run();
  if (existing?.lastEmailStatus === "sent") return { subscribed: true, emailSent: true, alreadySubscribed: true };
  try {
    const snapshot = await readSnapshot(siteId, "published");
    const brand = snapshot.config.brand.name.trim() || "Storefront";
    const unsubscribeUrl = origin ? `${origin.replace(/\/$/, "")}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}` : "";
    const result = await sendResendMessage(siteId, { to: email, subject: `Welcome to ${brand}`, html: `<p><strong>${brand}</strong></p><p>You’re on the list. We’ll send occasional field notes, new gear and useful reasons to change your route.</p>${unsubscribeUrl ? `<p><a href="${unsubscribeUrl}">Unsubscribe</a> from marketing emails at any time.</p>` : ""}` });
    await database.prepare("UPDATE store_newsletter_subscribers SET last_email_status = ?1, last_error = ?2, updated_at = ?3 WHERE site_id = ?4 AND email = ?5").bind(result.sent ? "sent" : "not_sent", result.sent ? null : result.reason, now(), siteId, email).run();
    return { subscribed: true, emailSent: result.sent, alreadySubscribed: Boolean(existing) };
  } catch (error) {
    await database.prepare("UPDATE store_newsletter_subscribers SET last_email_status = 'failed', last_error = ?1, updated_at = ?2 WHERE site_id = ?3 AND email = ?4").bind(error instanceof Error ? error.message : "RESEND_REJECTED", now(), siteId, email).run();
    return { subscribed: true, emailSent: false, alreadySubscribed: Boolean(existing) };
  }
}

export async function unsubscribeFromNewsletter(siteId: string, input: { token?: string; email?: string }) {
  const database = getCmsDatabase();
  await ensureV28Schema(database);
  const timestamp = now();
  let result: unknown;
  if (input.token?.trim()) {
    result = await database.prepare("UPDATE store_newsletter_subscribers SET status = 'unsubscribed', unsubscribed_at = ?1, updated_at = ?1 WHERE site_id = ?2 AND unsubscribe_token_hash = ?3").bind(timestamp, siteId, await sha256(input.token.trim())).run();
  } else {
    const email = normalizeEmail(input.email || "");
    result = await database.prepare("UPDATE store_newsletter_subscribers SET status = 'unsubscribed', unsubscribed_at = ?1, updated_at = ?1 WHERE site_id = ?2 AND email = ?3").bind(timestamp, siteId, email).run();
  }
  const changes = Number((result as { meta?: { changes?: number } }).meta?.changes || 0);
  return { unsubscribed: changes > 0 };
}

export async function createStockAlert(siteId: string, emailInput: string, productId: string, variantId: string) {
  const database = getCmsDatabase();
  await ensureV28Schema(database);
  const email = normalizeEmail(emailInput);
  const snapshot = await readSnapshot(siteId, "published");
  const product = snapshot.catalog.find((item) => item.id === productId && item.status === "active");
  const variant = product?.variants.find((item) => item.id === variantId);
  if (!product || !variant) throw new Error("PRODUCT_NOT_FOUND");
  const timestamp = now();
  await database.prepare(`INSERT INTO store_stock_alerts (id, site_id, email, product_id, variant_id, status, created_at, updated_at, notified_at)
    VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?6, NULL)
    ON CONFLICT(site_id, email, product_id, variant_id) DO UPDATE SET status = 'active', updated_at = excluded.updated_at, notified_at = NULL`).bind(`stock_alert_${crypto.randomUUID()}`, siteId, email, productId, variantId, timestamp).run();
  return { subscribed: true, email, productId, variantId };
}

export async function listStockAlerts(siteId: string, productId: string, variantId: string) {
  const database = getCmsDatabase();
  await ensureV28Schema(database);
  const rows = await database.prepare(`SELECT id, site_id AS siteId, email, product_id AS productId, variant_id AS variantId, status, created_at AS createdAt, updated_at AS updatedAt, notified_at AS notifiedAt
    FROM store_stock_alerts WHERE site_id = ?1 AND product_id = ?2 AND variant_id = ?3 AND status = 'active' ORDER BY created_at ASC LIMIT 500`).bind(siteId, productId, variantId).all<StockAlertRow>();
  return rows.results;
}

export async function getPublicAfterSalesByAccessToken(siteId: string, token: string) {
  if (!token || token.length > 200) throw new Error("ORDER_NOT_FOUND");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const access = await database.prepare("SELECT order_id AS orderId, expires_at AS expiresAt FROM cms_order_access_tokens WHERE site_id = ?1 AND token_hash = ?2").bind(siteId, tokenHash).first<{ orderId: string; expiresAt: string }>();
  if (!access || access.expiresAt <= now()) throw new Error("ORDER_NOT_FOUND");
  const rows = await database.prepare(`SELECT id, request_type AS requestType, reason, requested_amount AS requestedAmount, status, created_at AS createdAt, updated_at AS updatedAt, resolved_at AS resolvedAt
    FROM cms_after_sales_requests WHERE site_id = ?1 AND order_id = ?2 ORDER BY created_at DESC`).bind(siteId, access.orderId).all<Record<string, unknown>>();
  return rows.results.map((row) => ({ id: String(row.id), requestType: String(row.requestType), reason: String(row.reason), requestedAmount: row.requestedAmount === null ? null : Number(row.requestedAmount), status: String(row.status), createdAt: String(row.createdAt), updatedAt: String(row.updatedAt), resolvedAt: row.resolvedAt ? String(row.resolvedAt) : null }));
}
