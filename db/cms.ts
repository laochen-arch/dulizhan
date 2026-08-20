import { env } from "cloudflare:workers";
import { getCatalogValidationErrors, products as defaultProducts, type Product } from "../app/data/products";
import { siteConfig, type SiteConfig } from "../app/data/site-config";
import { applyPlatformTemplateVariant, getPlatformTemplate } from "../app/platform/template-catalog";
import { getSiteIntegrationReadiness } from "./site-integrations";

export type CmsMode = "draft" | "published";
export type CmsRole = "owner" | "editor" | "viewer";

export type CmsSite = {
  id: string;
  slug: string;
  name: string;
  status: string;
  domain: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CmsMember = {
  siteId: string;
  userId: string;
  email: string;
  role: CmsRole;
  createdAt: string;
};

export type CmsInvitation = {
  id: string;
  siteId: string;
  email: string;
  role: CmsRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  invitedBy: string;
  createdAt: string;
  acceptedAt: string | null;
  inviteUrl?: string;
};

export type CmsAuditLog = {
  id: string;
  siteId: string;
  actorUserId: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type CmsSchedule = {
  id: string;
  siteId: string;
  label: string;
  scheduledAt: string;
  status: "pending" | "processing" | "published" | "cancelled" | "failed";
  createdBy: string;
  createdByEmail: string;
  createdAt: string;
  publishedAt: string | null;
};

export type CmsDomain = {
  id: string;
  siteId: string;
  hostname: string;
  status: "pending" | "verified" | "active" | "failed";
  verificationToken: string;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  dnsTarget?: string | null;
  sslStatus?: string | null;
  lastError?: string | null;
  createdAt: string;
};

export type CmsSnapshotDiff = {
  configChanged: boolean;
  productsAdded: number;
  productsRemoved: number;
  productsUpdated: number;
  totalChanges: number;
  changes: string[];
};

export type CmsRevision = {
  id: string;
  siteId: string;
  kind: string;
  label: string;
  createdAt: string;
  createdBy: string;
};

export type CmsAsset = {
  id: string;
  siteId: string;
  assetKey: string;
  kind: string;
  url: string;
  objectKey: string | null;
  alt: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  createdBy: string;
};

export type CmsLaunchCheck = {
  key: string;
  label: string;
  done: boolean;
  detail: string;
  required: boolean;
  manual?: boolean;
};

export type CmsManualLaunchCheck = CmsLaunchCheck & { manual: true };

export const V20_MANUAL_LAUNCH_CHECKS = [
  { key: "test.paypal-order", label: "Sandbox PayPal order completed", detail: "Create a sandbox order and confirm the return URL capture." },
  { key: "test.paypal-webhook", label: "PayPal webhook event processed", detail: "Deliver a signed event and confirm it is visible as processed in the event log." },
  { key: "test.refund-inventory", label: "Refund and inventory rule verified", detail: "Complete a full or partial refund and verify the selected items are restocked only once." },
  { key: "test.resend-email", label: "Resend payment and shipping email delivered", detail: "Confirm the customer and operator messages arrive and retry records are clear." },
] as const;

export type CmsReplacementItem = {
  key: string;
  label: string;
  source: string;
  required: boolean;
  done: boolean;
};

export type CmsSnapshot = {
  site: CmsSite;
  config: SiteConfig;
  catalog: Product[];
  mode: CmsMode;
  updatedAt: string;
  role?: CmsRole;
};

export type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  run: () => Promise<unknown>;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results: T[] }>;
};

export type D1DatabaseLike = {
  prepare: (sql: string) => D1Statement;
  batch: (statements: D1Statement[]) => Promise<unknown>;
};

// D1 bindings live for the lifetime of a Worker isolate. Coalesce the schema
// check so the public storefront does not replay every CREATE/ALTER statement
// on every request (the first request still performs the full safety check).
const schemaInitializationPromises = new WeakMap<object, Promise<void>>();

const PUBLISHED_SNAPSHOT_TTL_MS = 15_000;
const MAX_PUBLISHED_SNAPSHOT_CACHE_ENTRIES = 50;
const publishedSnapshotCache = new Map<string, { expiresAt: number; snapshot: CmsSnapshot }>();

export function clearPublishedSnapshotCache(siteId?: string) {
  if (siteId) {
    publishedSnapshotCache.delete(siteId);
    return;
  }
  publishedSnapshotCache.clear();
}

function readCachedPublishedSnapshot(siteId: string) {
  const entry = publishedSnapshotCache.get(siteId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    publishedSnapshotCache.delete(siteId);
    return null;
  }
  return entry.snapshot;
}

function writeCachedPublishedSnapshot(siteId: string, snapshot: CmsSnapshot) {
  if (publishedSnapshotCache.size >= MAX_PUBLISHED_SNAPSHOT_CACHE_ENTRIES) {
    const oldestKey = publishedSnapshotCache.keys().next().value;
    if (oldestKey) publishedSnapshotCache.delete(oldestKey);
  }
  publishedSnapshotCache.set(siteId, { expiresAt: Date.now() + PUBLISHED_SNAPSHOT_TTL_MS, snapshot });
}

async function ensureColumn(database: D1DatabaseLike, table: string, column: string, definition: string) {
  const columns = await database.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  if (columns.results.some((item) => item.name === column)) return;
  try {
    await database.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("duplicate column") && !message.includes("already exists")) throw error;
  }
}

type R2BucketLike = {
  put: (key: string, value: unknown, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }) => Promise<unknown>;
  get: (key: string) => Promise<unknown>;
  delete: (key: string) => Promise<void>;
};

type SiteRow = CmsSite;
type SettingsRow = { draft_config: string; published_config: string; updated_at: string; published_at: string | null };
type ProductRow = { product_id: string; draft_payload: string; published_payload: string | null; updated_at: string };

export const DEFAULT_SITE_ID = "default";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function now() {
  return new Date().toISOString();
}

export function normalizeDomain(value: string | null | undefined) {
  const raw = value?.trim().toLowerCase() ?? "";
  if (!raw) return null;
  const candidate = raw.includes("://") ? raw : `https://${raw}`;
  try {
    const hostname = new URL(candidate).hostname.toLowerCase().replace(/^www\./, "");
    if (!hostname || hostname.includes("/") || hostname.length > 253) return null;
    if (!/^[a-z0-9.-]+$/.test(hostname) || hostname.startsWith(".") || hostname.endsWith(".")) return null;
    return hostname;
  } catch {
    return null;
  }
}

function hostnameFromRequestHost(host: string | null) {
  if (!host) return "";
  return normalizeDomain(host) ?? "";
}

export async function recordAudit(
  database: D1DatabaseLike,
  siteId: string,
  actor: { userId: string; email: string },
  action: string,
  entityType: string,
  entityId: string | null = null,
  metadata?: Record<string, unknown>,
) {
  const timestamp = now();
  const metadataText = metadata ? JSON.stringify(metadata) : null;
  const status = action.includes("blocked") || action.includes("failed") ? "failed" : "success";
  const severity = status === "failed" ? "error" : "info";
  await database.batch([
    database.prepare(`INSERT INTO cms_audit_logs (id, site_id, actor_user_id, actor_email, action, entity_type, entity_id, metadata, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`).bind(
      `audit_${crypto.randomUUID()}`,
      siteId,
      actor.userId,
      actor.email,
      action,
      entityType,
      entityId,
      metadataText,
      timestamp,
    ),
    database.prepare(`INSERT INTO cms_operation_events (id, site_id, category, action, status, severity, entity_type, entity_id, message, metadata, attempts, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?11, ?11)`).bind(
      `operation_${crypto.randomUUID()}`,
      siteId,
      entityType || "cms",
      action,
      status,
      severity,
      entityType,
      entityId,
      action,
      metadataText,
      timestamp,
    ),
  ]);
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

function getD1(): D1DatabaseLike {
  const database = (env as unknown as { DB?: D1DatabaseLike }).DB;
  if (!database) throw new Error("CMS database is not available. Configure the Sites D1 binding as DB.");
  return database;
}

export const getCmsDatabase = getD1;

export function getMediaBucket(): R2BucketLike {
  const bucket = (env as unknown as { MEDIA?: R2BucketLike }).MEDIA;
  if (!bucket) throw new Error("Media storage is not available. Configure the Sites R2 binding as MEDIA.");
  return bucket;
}

async function initializeCmsSchema(database: D1DatabaseLike) {
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_sites (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      domain TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_site_settings (
      site_id TEXT PRIMARY KEY,
      draft_config TEXT NOT NULL,
      published_config TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT,
      published_at TEXT,
      published_by TEXT
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_site_integrations (
      site_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'missing',
      client_id_cipher TEXT,
      client_secret_cipher TEXT,
      webhook_id_cipher TEXT,
      api_key_cipher TEXT,
      environment TEXT NOT NULL DEFAULT 'sandbox',
      from_email TEXT,
      from_domain TEXT,
      last_checked_at TEXT,
      last_error TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (site_id, provider)
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_site_products (
      site_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      draft_payload TEXT NOT NULL,
      published_payload TEXT,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT,
      published_at TEXT,
      published_by TEXT,
      PRIMARY KEY (site_id, product_id)
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_members (
      site_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_at TEXT NOT NULL,
      PRIMARY KEY (site_id, user_id)
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_revisions (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_assets (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      asset_key TEXT NOT NULL,
      kind TEXT NOT NULL,
      url TEXT NOT NULL,
      object_key TEXT,
      alt TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_invitations (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at TEXT NOT NULL,
      invited_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      accepted_at TEXT
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_audit_logs (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_operation_events (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      category TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'success',
      severity TEXT NOT NULL DEFAULT 'info',
      entity_type TEXT,
      entity_id TEXT,
      message TEXT NOT NULL,
      metadata TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TEXT,
      next_retry_at TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_delivery_runs (
      site_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress',
      current_step TEXT NOT NULL DEFAULT 'intake',
      package_name TEXT,
      package_summary TEXT,
      import_revision_id TEXT,
      last_error TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_scheduled_publishes (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      label TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_by TEXT NOT NULL,
      created_by_email TEXT NOT NULL,
      created_at TEXT NOT NULL,
      published_at TEXT
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_site_domains (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      hostname TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      verification_token TEXT NOT NULL,
      verified_at TEXT,
      last_checked_at TEXT,
      created_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_launch_checks (
      site_id TEXT NOT NULL,
      check_key TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      PRIMARY KEY (site_id, check_key)
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_inventory (
      site_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      reserved_quantity INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (site_id, product_id, variant_id)
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_inventory_transactions (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      reference_id TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_orders (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      order_number TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      customer_user_id TEXT,
      customer_name TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'usd',
      subtotal REAL NOT NULL,
      shipping REAL NOT NULL,
      tax REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payment_status TEXT NOT NULL DEFAULT 'pending',
      fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled',
      paypal_order_id TEXT UNIQUE,
      paypal_approval_url TEXT,
      paypal_capture_id TEXT,
      checkout_idempotency_key TEXT UNIQUE,
      shipping_address TEXT NOT NULL,
      tracking_number TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      paid_at TEXT,
       shipped_at TEXT,
       admin_note TEXT,
       refund_total REAL NOT NULL DEFAULT 0,
       refunded_at TEXT
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      variant_label TEXT NOT NULL,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      payload TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_payment_events (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      provider_event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
       processed_at TEXT,
       attempts INTEGER NOT NULL DEFAULT 0,
       last_error TEXT,
       next_retry_at TEXT
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_order_notifications (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      provider_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
       sent_at TEXT,
       attempts INTEGER NOT NULL DEFAULT 0,
       next_retry_at TEXT,
       UNIQUE(order_id, type)
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_refunds (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      paypal_refund_id TEXT UNIQUE,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'usd',
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      restock_items TEXT,
      error TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_order_state_events (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      reason TEXT,
      actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_order_access_tokens (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      last_used_at TEXT,
      request_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_after_sales_requests (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      email TEXT NOT NULL,
      request_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      customer_note TEXT,
      admin_note TEXT,
      requested_amount REAL,
      items TEXT,
      status TEXT NOT NULL DEFAULT 'submitted',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_client_intake (
      site_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'incomplete',
      payload TEXT NOT NULL,
      submitted_by TEXT,
      approved_by TEXT,
      submitted_at TEXT,
      approved_at TEXT,
      updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_coupons (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      code TEXT NOT NULL,
      discount_type TEXT NOT NULL DEFAULT 'percent',
      discount_value REAL NOT NULL,
      min_subtotal REAL NOT NULL DEFAULT 0,
      max_uses INTEGER,
      uses INTEGER NOT NULL DEFAULT 0,
      starts_at TEXT,
      ends_at TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(site_id, code)
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_bundles (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      product_ids TEXT NOT NULL,
      discount_type TEXT NOT NULL DEFAULT 'percent',
      discount_value REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(site_id, slug)
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_collections (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      product_ids TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(site_id, slug)
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_recommendation_rules (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      name TEXT NOT NULL,
      strategy TEXT NOT NULL DEFAULT 'manual',
      source_product_id TEXT,
      product_ids TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_campaign_schedules (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled',
      created_by TEXT NOT NULL,
      created_by_email TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_reviews (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      order_id TEXT,
      email TEXT NOT NULL,
      rating INTEGER NOT NULL,
      title TEXT,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_analytics_events (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      product_id TEXT,
      order_id TEXT,
      session_id TEXT,
      payload TEXT,
      created_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_abandoned_checkouts (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      email TEXT,
      cart_payload TEXT NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'usd',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      recovered_at TEXT
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_health_checks (
      site_id TEXT NOT NULL,
      check_key TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT NOT NULL,
      checked_at TEXT NOT NULL,
      PRIMARY KEY(site_id, check_key)
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_release_requests (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      label TEXT NOT NULL,
      note TEXT,
      requested_by TEXT NOT NULL,
      requested_by_email TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      reviewed_by TEXT,
      reviewed_by_email TEXT,
      reviewed_at TEXT,
      revision_id TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_preview_tokens (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      mode TEXT NOT NULL DEFAULT 'draft',
      expires_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS merchant_members (
      site_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'merchant_staff',
      source TEXT NOT NULL DEFAULT 'invited',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (site_id, user_id)
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_applications (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      email TEXT NOT NULL,
      applicant_type TEXT NOT NULL DEFAULT 'business',
      contact_name TEXT NOT NULL,
      phone TEXT,
      company_name TEXT NOT NULL,
      brand_name TEXT NOT NULL,
      category TEXT NOT NULL,
      website TEXT,
      target_domain TEXT,
      markets TEXT,
      product_source TEXT,
      notes TEXT,
      template_site_id TEXT NOT NULL DEFAULT 'default',
      brand_logo_url TEXT,
      brand_primary_color TEXT,
      home_copy TEXT,
      product_import_payload TEXT,
      access_token_hash TEXT,
      access_token_expires_at TEXT,
      agreement_version TEXT,
      agreement_accepted_at TEXT,
      status TEXT NOT NULL DEFAULT 'submitted',
      assigned_site_id TEXT,
      admin_note TEXT,
      owner_invite_token_hash TEXT,
      owner_invite_expires_at TEXT,
      owner_invite_status TEXT NOT NULL DEFAULT 'not_sent',
      owner_invited_at TEXT,
      owner_activated_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_application_events (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      note TEXT,
      actor_user_id TEXT,
      actor_email TEXT,
      payload TEXT,
      created_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_domain_requests (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      site_id TEXT,
      hostname TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT,
      requested_by TEXT NOT NULL,
      requested_by_email TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_application_assets (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      asset_key TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'general',
      url TEXT NOT NULL,
      object_key TEXT,
      alt TEXT,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_support_tickets (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_by TEXT NOT NULL,
      created_by_email TEXT NOT NULL,
      assigned_to TEXT,
      admin_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS platform_application_notifications (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      sent_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS store_customers (
      site_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      display_name TEXT NOT NULL,
      phone TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (site_id, user_id)
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS customer_sessions (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS customer_addresses (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT 'Shipping address',
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      region TEXT NOT NULL,
      zip TEXT NOT NULL,
      country TEXT NOT NULL,
      phone TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_sites_status_idx ON cms_sites(status)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_site_products_site_idx ON cms_site_products(site_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_site_integrations_status_idx ON cms_site_integrations(site_id, status)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_members_email_idx ON cms_members(site_id, email)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_revisions_site_idx ON cms_revisions(site_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_assets_site_idx ON cms_assets(site_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_invitations_site_idx ON cms_invitations(site_id, status, expires_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_invitations_email_idx ON cms_invitations(site_id, email)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_audit_site_idx ON cms_audit_logs(site_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_operations_site_idx ON cms_operation_events(site_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_operations_status_idx ON cms_operation_events(site_id, status, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_delivery_runs_status_idx ON cms_delivery_runs(status, updated_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_schedules_site_idx ON cms_scheduled_publishes(site_id, status, scheduled_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_site_domains_site_idx ON cms_site_domains(site_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_launch_checks_site_idx ON cms_launch_checks(site_id, updated_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_inventory_site_sku_idx ON cms_inventory(site_id, sku)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_inventory_tx_site_idx ON cms_inventory_transactions(site_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_orders_site_status_idx ON cms_orders(site_id, status, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_orders_site_email_idx ON cms_orders(site_id, email)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_order_items_order_idx ON cms_order_items(order_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_order_items_site_idx ON cms_order_items(site_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_payment_events_site_idx ON cms_payment_events(site_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_order_notifications_site_idx ON cms_order_notifications(site_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_refunds_site_order_idx ON cms_refunds(site_id, order_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_order_state_events_idx ON cms_order_state_events(site_id, order_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_order_access_tokens_idx ON cms_order_access_tokens(site_id, order_id, email)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_after_sales_site_idx ON cms_after_sales_requests(site_id, status, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_after_sales_order_idx ON cms_after_sales_requests(site_id, order_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_coupons_site_idx ON cms_coupons(site_id, active, starts_at, ends_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_bundles_site_idx ON cms_bundles(site_id, active, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_collections_site_idx ON cms_collections(site_id, active, sort_order, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_recommendations_site_idx ON cms_recommendation_rules(site_id, active, updated_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_campaign_schedules_site_idx ON cms_campaign_schedules(site_id, status, starts_at, ends_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_reviews_product_idx ON cms_reviews(site_id, product_id, status, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_analytics_site_idx ON cms_analytics_events(site_id, event_type, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_abandoned_site_idx ON cms_abandoned_checkouts(site_id, status, last_seen_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_health_site_idx ON cms_health_checks(site_id, checked_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_release_requests_site_idx ON cms_release_requests(site_id, status, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_preview_tokens_site_idx ON cms_preview_tokens(site_id, expires_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS merchant_members_site_role_idx ON merchant_members(site_id, role, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS merchant_members_site_email_idx ON merchant_members(site_id, email)"),
    database.prepare("CREATE INDEX IF NOT EXISTS platform_applications_email_idx ON platform_applications(email, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS platform_applications_status_idx ON platform_applications(status, updated_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS platform_application_events_idx ON platform_application_events(application_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS platform_domain_requests_idx ON platform_domain_requests(application_id, status, updated_at)"),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS platform_domain_requests_hostname_idx ON platform_domain_requests(hostname) WHERE status IN ('pending', 'reviewing', 'active')"),
    database.prepare("CREATE INDEX IF NOT EXISTS platform_application_assets_idx ON platform_application_assets(application_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS platform_support_tickets_idx ON platform_support_tickets(application_id, status, updated_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS platform_application_notifications_idx ON platform_application_notifications(application_id, status, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS store_customers_site_email_idx ON store_customers(site_id, email)"),
    database.prepare("CREATE INDEX IF NOT EXISTS customer_addresses_user_idx ON customer_addresses(site_id, user_id, is_default, updated_at)"),
  ]);
  await ensureColumn(database, "cms_orders", "admin_note", "TEXT");
  await ensureColumn(database, "cms_orders", "paypal_order_id", "TEXT");
  await ensureColumn(database, "cms_orders", "paypal_approval_url", "TEXT");
  await ensureColumn(database, "cms_orders", "paypal_capture_id", "TEXT");
  await ensureColumn(database, "cms_orders", "checkout_idempotency_key", "TEXT");
  await ensureColumn(database, "cms_orders", "refund_total", "REAL NOT NULL DEFAULT 0");
  await ensureColumn(database, "cms_orders", "refunded_at", "TEXT");
  await ensureColumn(database, "cms_orders", "discount", "REAL NOT NULL DEFAULT 0");
  await ensureColumn(database, "cms_orders", "coupon_code", "TEXT");
  await ensureColumn(database, "cms_orders", "customer_user_id", "TEXT");
  await database.prepare("CREATE INDEX IF NOT EXISTS cms_orders_site_customer_idx ON cms_orders(site_id, customer_user_id)").run();
  await ensureColumn(database, "cms_payment_events", "attempts", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(database, "cms_payment_events", "last_error", "TEXT");
  await ensureColumn(database, "cms_payment_events", "next_retry_at", "TEXT");
  await ensureColumn(database, "cms_payment_events", "dead_lettered", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(database, "cms_payment_events", "last_attempt_at", "TEXT");
  await ensureColumn(database, "cms_order_notifications", "attempts", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(database, "cms_order_notifications", "next_retry_at", "TEXT");
  await ensureColumn(database, "cms_refunds", "paypal_refund_id", "TEXT");
  await ensureColumn(database, "cms_inventory_transactions", "idempotency_key", "TEXT");
  await ensureColumn(database, "cms_site_domains", "dns_target", "TEXT");
  await ensureColumn(database, "cms_site_domains", "ssl_status", "TEXT");
  await ensureColumn(database, "cms_site_domains", "last_error", "TEXT");
  await ensureColumn(database, "platform_applications", "applicant_type", "TEXT NOT NULL DEFAULT 'business'");
  await ensureColumn(database, "platform_applications", "phone", "TEXT");
  await ensureColumn(database, "platform_applications", "template_site_id", "TEXT NOT NULL DEFAULT 'default'");
  await ensureColumn(database, "platform_applications", "brand_logo_url", "TEXT");
  await ensureColumn(database, "platform_applications", "brand_primary_color", "TEXT");
  await ensureColumn(database, "platform_applications", "home_copy", "TEXT");
  await ensureColumn(database, "platform_applications", "product_import_payload", "TEXT");
  await ensureColumn(database, "platform_applications", "access_token_hash", "TEXT");
  await ensureColumn(database, "platform_applications", "access_token_expires_at", "TEXT");
  await ensureColumn(database, "platform_applications", "agreement_version", "TEXT");
  await ensureColumn(database, "platform_applications", "agreement_accepted_at", "TEXT");
  await ensureColumn(database, "platform_applications", "locale", "TEXT NOT NULL DEFAULT 'en-US'");
  await ensureColumn(database, "platform_applications", "referral_code", "TEXT");
  await ensureColumn(database, "platform_applications", "owner_invite_token_hash", "TEXT");
  await ensureColumn(database, "platform_applications", "owner_invite_expires_at", "TEXT");
  await ensureColumn(database, "platform_applications", "owner_invite_status", "TEXT NOT NULL DEFAULT 'not_sent'");
  await ensureColumn(database, "platform_applications", "owner_invited_at", "TEXT");
  await ensureColumn(database, "platform_applications", "owner_activated_at", "TEXT");
  await database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS cms_inventory_tx_idempotency_unique ON cms_inventory_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL").run();
}

export async function ensureCmsSchema(database: D1DatabaseLike) {
  const key = database as unknown as object;
  const existing = schemaInitializationPromises.get(key);
  if (existing) return existing;

  const initialization = initializeCmsSchema(database);
  schemaInitializationPromises.set(key, initialization);
  try {
    await initialization;
  } catch (error) {
    schemaInitializationPromises.delete(key);
    throw error;
  }
}

function parseConfig(value: string): SiteConfig {
  try {
    // Merge new white-label defaults into older tenant records so a V20
    // deployment can read and publish sites created by earlier versions.
    return mergeRecords(clone(siteConfig), JSON.parse(value)) as SiteConfig;
  } catch {
    return clone(siteConfig);
  }
}

function parseProduct(value: string): Product | null {
  try {
    const product = JSON.parse(value) as Product;
    return product.id && product.slug && product.name ? product : null;
  } catch {
    return null;
  }
}

async function readLegacySeed(database: D1DatabaseLike) {
  const setting = await database.prepare("SELECT config FROM cms_settings WHERE id = ?1").bind(DEFAULT_SITE_ID).first<{ config: string }>();
  const rows = await database.prepare("SELECT payload FROM cms_products ORDER BY featured DESC, name ASC").all<{ payload: string }>();
  const catalog = rows.results.map((row) => parseProduct(row.payload)).filter(Boolean) as Product[];
  return {
    config: setting ? parseConfig(setting.config) : clone(siteConfig),
    catalog: catalog.length ? catalog : clone(defaultProducts),
  };
}

function siteRowToSite(row: SiteRow): CmsSite {
  return { ...row };
}

async function getExistingSite(siteId: string, database: D1DatabaseLike): Promise<CmsSite> {
  const existing = await database.prepare("SELECT id, slug, name, status, domain, created_at AS createdAt, updated_at AS updatedAt FROM cms_sites WHERE id = ?1").bind(siteId).first<SiteRow>();
  if (!existing) throw new Error("SITE_NOT_FOUND");
  return siteRowToSite(existing);
}

export async function resolveSiteByHost(host: string | null): Promise<CmsSite> {
  const database = getD1();
  await ensureCmsSchema(database);
  await ensureSite(DEFAULT_SITE_ID, database);
  const domain = hostnameFromRequestHost(host);
  const sharedHost = domain === "localhost" || domain === "127.0.0.1" || domain.endsWith(".chatgpt.site") || domain.endsWith(".openai.com");
  if (!domain || sharedHost) return getExistingSite(DEFAULT_SITE_ID, database);
  const site = await database.prepare(`SELECT id, slug, name, status, domain, created_at AS createdAt, updated_at AS updatedAt
    FROM cms_sites WHERE lower(domain) = lower(?1) LIMIT 1`).bind(domain).first<SiteRow>();
  if (!site) throw new Error("SITE_NOT_FOUND");
  return siteRowToSite(site);
}

export async function getSiteById(siteId: string): Promise<CmsSite> {
  const database = getD1();
  await ensureCmsSchema(database);
  return siteId === DEFAULT_SITE_ID ? ensureSite(siteId, database) : getExistingSite(siteId, database);
}

export async function updateSiteIdentity(siteId: string, changes: { name?: string; slug?: string; domain?: string | null }, userId: string, email: string) {
  const database = getD1();
  await ensureCmsSchema(database);
  const actor = await ensureMember(siteId, userId, email, database);
  if (actor.role !== "owner") throw new Error("FORBIDDEN");
  const current = await getExistingSite(siteId, database);
  const name = changes.name?.trim() || current.name;
  const slug = changes.slug?.trim().toLowerCase() || current.slug;
  const domain = changes.domain === undefined ? current.domain : normalizeDomain(changes.domain);
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("INVALID_SITE");
  if (domain) {
    const conflict = await database.prepare("SELECT id FROM cms_sites WHERE lower(domain) = lower(?1) AND id <> ?2 LIMIT 1").bind(domain, siteId).first<{ id: string }>();
    if (conflict) throw new Error("DOMAIN_IN_USE");
  }
  const timestamp = now();
  await database.prepare("UPDATE cms_sites SET name = ?1, slug = ?2, domain = ?3, updated_at = ?4 WHERE id = ?5").bind(name, slug, domain, timestamp, siteId).run();
  if (domain) {
    await database.prepare(`INSERT INTO cms_site_domains (id, site_id, hostname, status, verification_token, verified_at, last_checked_at, created_at)
      VALUES (?1, ?2, ?3, 'pending', ?4, NULL, NULL, ?5)
      ON CONFLICT(hostname) DO UPDATE SET site_id = excluded.site_id, status = CASE WHEN cms_site_domains.status = 'verified' THEN cms_site_domains.status ELSE 'pending' END`).bind(`domain_${crypto.randomUUID()}`, siteId, domain, `verify_${crypto.randomUUID()}`, timestamp).run();
  } else {
    await database.prepare("DELETE FROM cms_site_domains WHERE site_id = ?1").bind(siteId).run();
  }
  await recordAudit(database, siteId, { userId, email }, "site.updated", "site", siteId, { name, slug, domain });
  return { ...current, name, slug, domain, updatedAt: timestamp };
}

async function insertSite(
  database: D1DatabaseLike,
  site: CmsSite,
  config: SiteConfig,
  catalog: Product[],
  owner?: { userId: string; email: string },
) {
  const timestamp = now();
  await database.batch([
    database.prepare("INSERT INTO cms_sites (id, slug, name, status, domain, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)").bind(site.id, site.slug, site.name, site.status, site.domain, site.createdAt, timestamp),
    database.prepare("INSERT INTO cms_site_settings (site_id, draft_config, published_config, updated_at, updated_by, published_at, published_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)").bind(site.id, JSON.stringify(config), JSON.stringify(config), timestamp, owner?.userId ?? "system-seed", timestamp, owner?.userId ?? "system-seed"),
    ...catalog.map((product) => database.prepare(`INSERT INTO cms_site_products (site_id, product_id, draft_payload, published_payload, status, updated_at, updated_by, published_at, published_by)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`).bind(site.id, product.id, JSON.stringify(product), JSON.stringify(product), product.status, timestamp, owner?.userId ?? "system-seed", timestamp, owner?.userId ?? "system-seed")),
    ...(owner ? [database.prepare("INSERT INTO cms_members (site_id, user_id, email, role, created_at) VALUES (?1, ?2, ?3, ?4, ?5)").bind(site.id, owner.userId, owner.email, "owner", timestamp)] : []),
  ]);
}

async function ensureSite(siteId: string, database: D1DatabaseLike): Promise<CmsSite> {
  const existing = await database.prepare("SELECT id, slug, name, status, domain, created_at AS createdAt, updated_at AS updatedAt FROM cms_sites WHERE id = ?1").bind(siteId).first<SiteRow>();
  if (existing) return siteRowToSite(existing);

  const seed = siteId === DEFAULT_SITE_ID ? await readLegacySeed(database) : { config: clone(siteConfig), catalog: clone(defaultProducts) };
  const timestamp = now();
  const config = clone(seed.config) as SiteConfig & { client: { demoName: string }; brand: { name: string } };
  const name = siteId === DEFAULT_SITE_ID ? config.brand.name : `New client / ${siteId}`;
  config.client.demoName = name;
  config.brand.name = name;
  const site: CmsSite = { id: siteId, slug: siteId, name, status: "active", domain: null, createdAt: timestamp, updatedAt: timestamp };
  await insertSite(database, site, config, seed.catalog);
  return site;
}

export async function listSites(userId: string, email: string): Promise<Array<CmsSite & { role: CmsRole }>> {
  const database = getD1();
  await ensureCmsSchema(database);
  await ensureSite(DEFAULT_SITE_ID, database);
  await ensureMember(DEFAULT_SITE_ID, userId, email, database);
  const rows = await database.prepare(`SELECT s.id, s.slug, s.name, s.status, s.domain, s.created_at AS createdAt, s.updated_at AS updatedAt,
    m.role AS role FROM cms_sites s INNER JOIN cms_members m ON m.site_id = s.id
    WHERE m.user_id = ?1 OR lower(m.email) = lower(?2) ORDER BY s.created_at ASC`).bind(userId, email).all<CmsSite & { role: CmsRole }>();
  return rows.results;
}

export async function createSite(name: string, slug: string, userId: string, email: string): Promise<CmsSite & { role: CmsRole }> {
  const database = getD1();
  await ensureCmsSchema(database);
  const timestamp = now();
  const config = clone(siteConfig) as SiteConfig & { client: { demoName: string }; brand: { name: string } };
  config.client.demoName = name;
  config.brand.name = name;
  config.content.home.heroLabel = `${name} / Est. 2024`;
  const site: CmsSite = { id: `site_${crypto.randomUUID()}`, slug, name, status: "active", domain: null, createdAt: timestamp, updatedAt: timestamp };
  await insertSite(database, site, config, [], { userId, email });
  await recordAudit(database, site.id, { userId, email }, "site.created", "site", site.id, { name, slug });
  return { ...site, role: "owner" };
}

function mergeRecords<T>(base: T, incoming: unknown): T {
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return incoming === undefined ? base : incoming as T;
  const result = clone(base) as Record<string, unknown>;
  Object.entries(incoming as Record<string, unknown>).forEach(([key, value]) => {
    result[key] = value && typeof value === "object" && !Array.isArray(value) ? mergeRecords(result[key], value) : value;
  });
  return result as T;
}

function replaceAssetUrls<T>(value: T, replacements: Map<string, string>): T {
  const serialized = JSON.stringify(value);
  let replaced = serialized;
  replacements.forEach((target, source) => { replaced = replaced.split(source).join(target); });
  return JSON.parse(replaced) as T;
}

async function copySiteAssets(sourceSiteId: string, targetSiteId: string, userId: string, sourceAssets: CmsAsset[]) {
  const bucket = getMediaBucket();
  const replacements = new Map<string, string>();
  const copied: CmsAsset[] = [];
  for (const source of sourceAssets) {
    const assetId = `asset_${crypto.randomUUID()}`;
    const safeName = source.assetKey || "image";
    let objectKey = source.objectKey ? `sites/${targetSiteId}/assets/${assetId}-${safeName}` : null;
    let url = source.url;
    if (source.objectKey && objectKey) {
      const object = await bucket.get(source.objectKey) as { arrayBuffer?: () => Promise<ArrayBuffer> } | null;
      if (object?.arrayBuffer) {
        await bucket.put(objectKey, await object.arrayBuffer(), { httpMetadata: { contentType: source.mimeType, cacheControl: "public, max-age=31536000, immutable" } });
        url = `/api/cms/assets/${assetId}?siteId=${encodeURIComponent(targetSiteId)}`;
      } else {
        objectKey = null;
      }
    }
    const target: CmsAsset = { ...source, id: assetId, siteId: targetSiteId, url, objectKey, createdAt: now(), createdBy: userId };
    copied.push(target);
    if (source.url !== target.url) replacements.set(source.url, target.url);
  }
  return { copied, replacements };
}

export async function createSiteFromTemplate(name: string, slug: string, templateSiteId: string, userId: string, email: string) {
  const database = getD1();
  await ensureCmsSchema(database);
  const normalizedTemplate = templateSiteId || DEFAULT_SITE_ID;
  const publicTemplate = getPlatformTemplate(normalizedTemplate);
  const sourceSiteId = publicTemplate?.sourceSiteId || normalizedTemplate;
  if (!publicTemplate && normalizedTemplate === DEFAULT_SITE_ID) throw new Error("INVALID_TEMPLATE");
  if (sourceSiteId !== DEFAULT_SITE_ID) {
    const sourceMember = await ensureMember(sourceSiteId, userId, email, database);
    if (sourceMember.role === "viewer") throw new Error("FORBIDDEN");
  }
  const source = await readSnapshot(sourceSiteId, "published");
  const sourceAssets = await listAssets(sourceSiteId, userId, email);
  const siteId = `site_${crypto.randomUUID()}`;
  const site: CmsSite = { id: siteId, slug, name, status: "active", domain: null, createdAt: now(), updatedAt: now() };
  const copiedAssets = await copySiteAssets(sourceSiteId, siteId, userId, sourceAssets);
  const editableConfig = replaceAssetUrls(clone(source.config), copiedAssets.replacements) as unknown as { client: { demoName: string }; brand: { name: string }; content: { home: { heroLabel: string } } };
  const config = publicTemplate
    ? applyPlatformTemplateVariant(editableConfig as unknown as SiteConfig, publicTemplate.id)
    : editableConfig as unknown as SiteConfig;
  // The tenant's submitted brand identity remains authoritative after the
  // visual template variant is applied.
  config.client.demoName = name;
  config.brand.name = name;
  config.content.home.heroLabel = `${name} / Client draft`;
  const catalog = replaceAssetUrls(clone(source.catalog), copiedAssets.replacements);
  await insertSite(database, site, config, catalog, { userId, email });
  if (copiedAssets.copied.length) {
    await database.batch(copiedAssets.copied.map((asset) => database.prepare(`INSERT INTO cms_assets (id, site_id, asset_key, kind, url, object_key, alt, mime_type, size_bytes, created_at, created_by)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`).bind(asset.id, asset.siteId, asset.assetKey, asset.kind, asset.url, asset.objectKey, asset.alt, asset.mimeType, asset.sizeBytes, asset.createdAt, userId)));
  }
  await recordAudit(database, siteId, { userId, email }, "site.created_from_template", "site", siteId, { templateSiteId: normalizedTemplate, sourceSiteId, copiedProducts: catalog.length, copiedAssets: copiedAssets.copied.length });
  return { ...site, role: "owner" as const, templateSiteId: normalizedTemplate, copiedProducts: catalog.length, copiedAssets: copiedAssets.copied.length };
}

export async function createSitesFromTemplateBatch(entries: Array<{ name: string; slug: string; templateSiteId?: string }>, userId: string, email: string) {
  const results: Array<Record<string, unknown>> = [];
  const errors: Array<{ name: string; slug: string; error: string }> = [];
  for (const entry of entries.slice(0, 20)) {
    try {
      results.push(await createSiteFromTemplate(entry.name, entry.slug, entry.templateSiteId || DEFAULT_SITE_ID, userId, email));
    } catch (error) {
      errors.push({ name: entry.name, slug: entry.slug, error: error instanceof Error ? error.message : "SITE_CREATE_FAILED" });
    }
  }
  return { results, errors };
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && next === "\n") index += 1; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); }
  return rows;
}

function importedProduct(row: Record<string, string>, current: Product[]) {
  const existing = current.find((item) => item.id === row.id || item.slug === row.slug || item.sku === row.sku);
  const base = clone(existing ?? defaultProducts[0]);
  const text = (value: unknown, fallback = "") => Array.isArray(value) ? value.map(String).join("|") : typeof value === "string" ? value : value === undefined || value === null ? fallback : String(value);
  const imageList = text(row.images, text(row.image, base.images.join("|"))).split("|").map((item) => item.trim()).filter(Boolean);
  const colors = text(row.colors, base.colors.join("|")).split("|").map((item) => item.trim()).filter(Boolean);
  const parsedPrice = row.price === undefined || row.price === "" ? base.price : Number(row.price);
  const parsedStock = row.stock === undefined || row.stock === "" ? base.stock : Number(row.stock);
  const incoming = row as unknown as Partial<Product>;
  return { ...base, id: text(row.id) || existing?.id || `product_${crypto.randomUUID()}`, slug: text(row.slug, base.slug), name: text(row.name, base.name), shortName: text(row.shortName || row.shortname, text(row.name, base.shortName)), category: text(row.category, base.category), sku: text(row.sku, base.sku), status: row.status === "draft" ? "draft" : "active", featured: row.featured === "true" || row.featured === "1" || incoming.featured === true, price: Number.isFinite(parsedPrice) ? parsedPrice : base.price, stock: Number.isInteger(parsedStock) && parsedStock >= 0 ? parsedStock : base.stock, description: text(row.description, base.description), details: text(row.details, base.details), image: imageList[0] || base.image, images: imageList, alt: text(row.alt, base.alt), colors, options: Array.isArray(incoming.options) ? incoming.options : [{ name: "Color", values: colors }], variants: Array.isArray(incoming.variants) && incoming.variants.length ? incoming.variants : base.variants, specs: Array.isArray(incoming.specs) ? incoming.specs : base.specs, tags: text(row.tags, base.tags.join("|")).split("|").map((item) => item.trim()).filter(Boolean), relatedSlugs: text(row.relatedSlugs || row.relatedslugs, base.relatedSlugs.join("|")).split("|").map((item) => item.trim()).filter(Boolean) } as Product;
}

type ClientImportPayload = { config?: unknown; products?: unknown; productCsv?: string; assetBindings?: Record<string, string> };

async function prepareClientImport(siteId: string, payload: ClientImportPayload, userId: string, email: string, allowMerchant = false) {
  const database = getD1();
  await ensureCmsSchema(database);
  const access = allowMerchant ? await getOperationalMember(siteId, userId, email, true) : await ensureMember(siteId, userId, email, database);
  if (access.role === "viewer") throw new Error("VIEWER_READ_ONLY");
  const draft = await readSnapshot(siteId, "draft", { userId, email }, false, allowMerchant);
  const bindings = new Map(Object.entries(payload.assetBindings || {}));
  let config = replaceAssetUrls(mergeRecords(draft.config, payload.config), bindings);
  let catalog = draft.catalog;
  if (Array.isArray(payload.products)) catalog = payload.products.map((item) => item && typeof item === "object" ? importedProduct(item as Record<string, string>, catalog) : null).filter(Boolean) as Product[];
  if (typeof payload.productCsv === "string" && payload.productCsv.trim()) {
    const rows = parseCsv(payload.productCsv);
    if (rows.length < 2) throw new Error("INVALID_IMPORT");
    const headers = rows[0].map((header) => header.trim());
    const imported = rows.slice(1).map((values) => importedProduct(Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])), catalog));
    const next = [...catalog];
    imported.forEach((product) => { const index = next.findIndex((item) => item.id === product.id || item.slug === product.slug || item.sku === product.sku); if (index >= 0) next[index] = product; else next.push(product); });
    catalog = next;
  }
  config = replaceAssetUrls(config, bindings);
  catalog = replaceAssetUrls(catalog, bindings);
  return { database, config, catalog, bindings, draft };
}

export async function previewClientImport(siteId: string, payload: ClientImportPayload, userId: string, email: string, allowMerchant = false) {
  const prepared = await prepareClientImport(siteId, payload, userId, email, allowMerchant);
  const errors = getCatalogValidationErrors(prepared.catalog);
  const warnings: string[] = [];
  if (!payload.config) warnings.push("No brand/content config was included; existing draft content will be preserved.");
  if (!payload.products && !payload.productCsv) warnings.push("No product data was included; existing draft products will be preserved.");
  if (!Object.keys(payload.assetBindings || {}).length) warnings.push("No media bindings were included; existing asset URLs will be preserved.");
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      configChanged: JSON.stringify(prepared.config) !== JSON.stringify(prepared.draft.config),
      totalProducts: prepared.catalog.length,
      activeProducts: prepared.catalog.filter((product) => product.status === "active").length,
      importedProducts: Array.isArray(payload.products) ? payload.products.length : typeof payload.productCsv === "string" ? Math.max(0, parseCsv(payload.productCsv).length - 1) : 0,
      assetBindings: prepared.bindings.size,
    },
  };
}

export async function importClientData(siteId: string, payload: ClientImportPayload, userId: string, email: string, allowMerchant = false) {
  const prepared = await prepareClientImport(siteId, payload, userId, email, allowMerchant);
  const errors = getCatalogValidationErrors(prepared.catalog);
  if (errors.length) throw new Error(`INVALID_IMPORT:${JSON.stringify(errors)}`);
  const { database, config, catalog, bindings, draft } = prepared;
  const revisionId = `rev_${crypto.randomUUID()}`;
  const revisionTimestamp = now();
  await database.prepare("INSERT INTO cms_revisions (id, site_id, kind, label, snapshot, created_at, created_by) VALUES (?1, ?2, 'import-backup', ?3, ?4, ?5, ?6)").bind(revisionId, siteId, "Before client import", JSON.stringify({ config: draft.config, catalog: draft.catalog }), revisionTimestamp, userId).run();
  await writeDraft(siteId, config, catalog, userId, email, allowMerchant);
  await recordAudit(database, siteId, { userId, email }, "client.imported", "import", siteId, { products: catalog.length, hasConfig: Boolean(payload.config), bindings: bindings.size, revisionId });
  return { config, catalog, importedProducts: catalog.length, assetBindings: bindings.size, revisionId };
}

async function readManualLaunchChecks(database: D1DatabaseLike, siteId: string) {
  const rows = await database.prepare(`SELECT check_key AS checkKey, completed, note, updated_at AS updatedAt, updated_by AS updatedBy
    FROM cms_launch_checks WHERE site_id = ?1`).bind(siteId).all<{ checkKey: string; completed: number; note: string | null; updatedAt: string; updatedBy: string }>();
  return new Map(rows.results.map((row) => [row.checkKey, row]));
}

async function buildSiteLaunchChecks(database: D1DatabaseLike, siteId: string, config: SiteConfig, catalog: Product[]) {
  const domain = await database.prepare("SELECT status, hostname FROM cms_site_domains WHERE site_id = ?1 ORDER BY created_at DESC LIMIT 1").bind(siteId).first<{ status: CmsDomain["status"]; hostname: string }>();
  const catalogErrors = getCatalogValidationErrors(catalog);
  const readiness = await getSiteIntegrationReadiness(database, siteId);
  const isClientSite = siteId !== DEFAULT_SITE_ID;
  const intake = await database.prepare("SELECT status FROM cms_client_intake WHERE site_id = ?1").bind(siteId).first<{ status: string }>();
  const manualRows = await readManualLaunchChecks(database, siteId);
  const brandReady = Boolean(config.brand.name.trim() && config.brand.mark.trim() && (!isClientSite || config.brand.mark !== siteConfig.brand.mark));
  const heroReady = Boolean(config.assets.hero.trim() && (!isClientSite || config.assets.hero !== siteConfig.assets.hero));
  const seoReady = Boolean(config.seo.title.trim() && config.seo.description.trim() && (!isClientSite || config.seo.title !== siteConfig.seo.title || config.seo.description !== siteConfig.seo.description));
  const policiesReady = Boolean(config.content.policies.shippingLead.trim() && config.content.policies.returnsLead.trim() && (!isClientSite || config.content.policies.shippingLead !== siteConfig.content.policies.shippingLead || config.content.policies.returnsLead !== siteConfig.content.policies.returnsLead));
  const catalogReady = catalog.some((product) => product.status === "active") && (!isClientSite || JSON.stringify(catalog) !== JSON.stringify(defaultProducts));
  const manualChecks: CmsManualLaunchCheck[] = V20_MANUAL_LAUNCH_CHECKS.map((definition) => ({
    ...definition,
    done: manualRows.get(definition.key)?.completed === 1,
    required: isClientSite,
    manual: true,
  }));
  const checks: CmsLaunchCheck[] = [
    { key: "brand", label: "Brand name and logo mark", done: brandReady, required: true, detail: brandReady ? "The client brand identity is ready." : isClientSite ? "Replace the template logo mark with the client's mark." : "Add the client brand name and logo mark." },
    { key: "hero", label: "Hero media", done: heroReady, required: true, detail: heroReady ? "The client hero image is ready." : isClientSite ? "Replace the template hero image with a client asset." : "Bind a hero image from the client media library." },
    { key: "seo", label: "SEO title and description", done: seoReady, required: true, detail: seoReady ? "The client SEO metadata is ready." : isClientSite ? "Replace the template SEO title or description." : "Complete the storefront SEO fields." },
    { key: "contact", label: "Customer contact email", done: Boolean(config.content.contact.email.trim()), required: true, detail: "Add the operational customer email." },
    { key: "policies", label: "Shipping and returns copy", done: policiesReady, required: true, detail: policiesReady ? "The client delivery and returns policies are ready." : isClientSite ? "Replace the template shipping or returns copy." : "Confirm the client delivery and returns policies." },
    { key: "catalog", label: "At least one active product", done: catalogReady, required: true, detail: catalogReady ? "The client product catalog is ready." : isClientSite ? "Import the client catalog instead of publishing the template catalog." : "Import or activate at least one product." },
    { key: "commerce", label: "Active product commerce validation", done: catalogErrors.length === 0, required: true, detail: catalogErrors[0] || "All active products have valid variants, SKUs, prices and images." },
    { key: "secrets-key", label: "Tenant secrets encryption key", done: !isClientSite || readiness.encryptionKey, required: isClientSite, detail: readiness.encryptionKey ? "The shared encryption key is available to protect tenant credentials." : "Add CMS_SECRETS_KEY (32+ characters) in the Sites production environment." },
    { key: "paypal", label: "PayPal site credentials", done: !isClientSite || readiness.paypal, required: isClientSite, detail: readiness.paypal ? "This tenant has encrypted PayPal credentials." : "Save this tenant's PayPal credentials in the configuration center." },
    { key: "paypal-webhook", label: "PayPal site webhook identity", done: !isClientSite || readiness.webhook, required: isClientSite, detail: readiness.webhook ? "This tenant has an encrypted PayPal webhook identity." : "Save this tenant's PayPal webhook ID in the configuration center." },
    { key: "resend", label: "Resend site credentials", done: !isClientSite || readiness.resend, required: isClientSite, detail: readiness.resend ? "This tenant has encrypted Resend credentials and a sender." : "Save this tenant's Resend API key and sender in the configuration center." },
    { key: "domain", label: "Custom domain mapping", done: !isClientSite || Boolean(domain?.hostname && (domain.status === "verified" || domain.status === "active")), required: isClientSite, detail: domain ? `${domain.hostname} is ${domain.status}.` : "Map and verify the client domain." },
    { key: "client-intake", label: "Client handoff intake approved", done: !isClientSite || intake?.status === "approved", required: isClientSite, detail: !isClientSite ? "Template site does not require client intake." : intake?.status === "approved" ? "Client delivery intake is approved." : "Collect and approve the client's brand, content, legal and domain details." },
    ...manualChecks,
  ];
  const replacements: CmsReplacementItem[] = [
    { key: "brand.name", label: "Brand name", source: config.brand.name, required: true, done: config.brand.name !== siteConfig.brand.name },
    { key: "brand.mark", label: "Logo / mark", source: config.brand.mark, required: true, done: config.brand.mark !== siteConfig.brand.mark },
    { key: "theme.colors", label: "Theme palette", source: "theme.colors", required: false, done: JSON.stringify(config.theme.colors) !== JSON.stringify(siteConfig.theme.colors) },
    { key: "assets.hero", label: "Hero image", source: config.assets.hero, required: true, done: config.assets.hero !== siteConfig.assets.hero },
    { key: "catalog", label: "Client product catalog", source: `${catalog.length} products`, required: true, done: JSON.stringify(catalog) !== JSON.stringify(defaultProducts) },
    { key: "policies", label: "Shipping / returns policy", source: config.content.policies.returnsLead, required: true, done: config.content.policies.returnsLead !== siteConfig.content.policies.returnsLead },
    { key: "seo", label: "SEO metadata", source: config.seo.title, required: true, done: config.seo.title !== siteConfig.seo.title },
  ];
  const requiredChecks = checks.filter((check) => check.required);
  return {
    domain,
    checks,
    manualChecks,
    replacements,
    readiness: {
      score: requiredChecks.length ? Math.round(requiredChecks.filter((check) => check.done).length / requiredChecks.length * 100) : 100,
      done: requiredChecks.filter((check) => check.done).length,
      total: requiredChecks.length,
    },
  };
}

export async function getSiteLaunchChecks(siteId: string, userId: string, email: string, allowMerchant = false) {
  const database = getD1();
  await ensureCmsSchema(database);
  const snapshot = await readSnapshot(siteId, "draft", { userId, email }, false, allowMerchant);
  const result = await buildSiteLaunchChecks(database, siteId, snapshot.config, snapshot.catalog);
  return { ...result, progress: result.readiness };
}

async function getSiteLaunchFailures(database: D1DatabaseLike, siteId: string, config: SiteConfig, catalog: Product[]) {
  const result = await buildSiteLaunchChecks(database, siteId, config, catalog);
  return result.checks.filter((check) => check.required && !check.done).map((check) => check.label);
}

export async function updateLaunchCheck(siteId: string, checkKey: string, completed: boolean, userId: string, email: string) {
  const database = getD1();
  await ensureCmsSchema(database);
  const member = await ensureMember(siteId, userId, email, database);
  if (member.role === "viewer") throw new Error("VIEWER_READ_ONLY");
  if (!V20_MANUAL_LAUNCH_CHECKS.some((check) => check.key === checkKey)) throw new Error("INVALID_LAUNCH_CHECK");
  const timestamp = now();
  await database.prepare(`INSERT INTO cms_launch_checks (site_id, check_key, completed, note, updated_at, updated_by)
    VALUES (?1, ?2, ?3, NULL, ?4, ?5)
    ON CONFLICT(site_id, check_key) DO UPDATE SET completed = excluded.completed, updated_at = excluded.updated_at, updated_by = excluded.updated_by`).bind(siteId, checkKey, completed ? 1 : 0, timestamp, userId).run();
  await recordAudit(database, siteId, { userId, email }, "launch_check.updated", "launch_check", checkKey, { completed });
  return getSiteLaunchChecks(siteId, userId, email);
}

async function ensureMember(siteId: string, userId: string, email: string, database: D1DatabaseLike): Promise<CmsMember> {
  const existing = await database.prepare(`SELECT site_id AS siteId, user_id AS userId, email, role, created_at AS createdAt
    FROM cms_members WHERE site_id = ?1 AND (user_id = ?2 OR lower(email) = lower(?3)) LIMIT 1`).bind(siteId, userId, email).first<CmsMember>();
  if (existing) return existing;
  const member: CmsMember = { siteId, userId, email, role: "owner", createdAt: now() };
  // The first signed-in user bootstraps a site as owner. Use one atomic
  // INSERT ... SELECT so concurrent CMS requests cannot both observe an empty
  // membership table and race into the composite primary key.
  await database.prepare(`INSERT INTO cms_members (site_id, user_id, email, role, created_at)
    SELECT ?1, ?2, ?3, ?4, ?5
    WHERE NOT EXISTS (SELECT 1 FROM cms_members WHERE site_id = ?1)
    ON CONFLICT(site_id, user_id) DO NOTHING`).bind(siteId, userId, email, member.role, member.createdAt).run();
  const created = await database.prepare(`SELECT site_id AS siteId, user_id AS userId, email, role, created_at AS createdAt
    FROM cms_members WHERE site_id = ?1 AND (user_id = ?2 OR lower(email) = lower(?3)) LIMIT 1`).bind(siteId, userId, email).first<CmsMember>();
  if (created) return created;
  throw new Error("FORBIDDEN");
}

export async function getMember(siteId: string, userId: string, email: string): Promise<CmsMember> {
  const database = getD1();
  await ensureCmsSchema(database);
  await getExistingSite(siteId, database);
  return ensureMember(siteId, userId, email, database);
}

/**
 * Resolve a member for merchant self-service without widening the platform
 * CMS APIs. The normal CMS routes continue to use getMember/ensureMember.
 */
export async function getOperationalMember(siteId: string, userId: string, email: string, allowMerchant = false): Promise<CmsMember> {
  const database = getD1();
  await ensureCmsSchema(database);
  await getExistingSite(siteId, database);
  const cmsMember = await database.prepare(`SELECT site_id AS siteId, user_id AS userId, email, role, created_at AS createdAt
    FROM cms_members WHERE site_id = ?1 AND (user_id = ?2 OR lower(email) = lower(?3)) LIMIT 1`).bind(siteId, userId, email).first<CmsMember>();
  if (cmsMember) return cmsMember;
  if (allowMerchant) {
    const merchant = await database.prepare(`SELECT site_id AS siteId, user_id AS userId, email, role, created_at AS createdAt
      FROM merchant_members WHERE site_id = ?1 AND (user_id = ?2 OR lower(email) = lower(?3)) LIMIT 1`).bind(siteId, userId, email).first<{ siteId: string; userId: string; email: string; role: string; createdAt: string }>();
    if (merchant) {
      const role: CmsRole = merchant.role === "merchant_owner" ? "owner" : merchant.role === "merchant_manager" ? "editor" : "viewer";
      return { ...merchant, role };
    }
  }
  throw new Error("FORBIDDEN");
}

/**
 * Read-only membership lookup for identity-aware public UI. Unlike getMember,
 * this never bootstraps a new CMS owner when the site has no matching member.
 */
export async function findMember(siteId: string, userId: string, email: string): Promise<CmsMember | null> {
  const database = getD1();
  await ensureCmsSchema(database);
  await getExistingSite(siteId, database);
  return database.prepare(`SELECT site_id AS siteId, user_id AS userId, email, role, created_at AS createdAt
    FROM cms_members WHERE site_id = ?1 AND (user_id = ?2 OR lower(email) = lower(?3)) LIMIT 1`).bind(siteId, userId, email).first<CmsMember>();
}

export async function listMembers(siteId: string, userId: string, email: string): Promise<CmsMember[]> {
  const database = getD1();
  await ensureCmsSchema(database);
  await ensureMember(siteId, userId, email, database);
  const rows = await database.prepare(`SELECT site_id AS siteId, user_id AS userId, email, role, created_at AS createdAt
    FROM cms_members WHERE site_id = ?1 ORDER BY created_at ASC`).bind(siteId).all<CmsMember>();
  return rows.results;
}

export async function addMember(siteId: string, member: { userId: string; email: string; role: CmsRole }, actorId: string, actorEmail: string) {
  const database = getD1();
  await ensureCmsSchema(database);
  const actor = await ensureMember(siteId, actorId, actorEmail, database);
  if (actor.role !== "owner") throw new Error("Only site owners can manage members.");
  const createdAt = now();
  await database.prepare(`INSERT INTO cms_members (site_id, user_id, email, role, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(site_id, user_id) DO UPDATE SET email = excluded.email, role = excluded.role`).bind(siteId, member.userId, member.email, member.role, createdAt).run();
  await recordAudit(database, siteId, { userId: actorId, email: actorEmail }, "member.upserted", "member", member.userId, { email: member.email, role: member.role });
  return { ...member, siteId, createdAt };
}

function invitationRowToInvitation(row: {
  id: string; siteId: string; email: string; role: CmsRole; status: CmsInvitation["status"]; expiresAt: string; invitedBy: string; createdAt: string; acceptedAt: string | null;
}): CmsInvitation {
  return { ...row };
}

export async function createInvitation(siteId: string, email: string, role: CmsRole, actorId: string, actorEmail: string) {
  const database = getD1();
  await ensureCmsSchema(database);
  const actor = await ensureMember(siteId, actorId, actorEmail, database);
  if (actor.role !== "owner") throw new Error("FORBIDDEN");
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) throw new Error("INVALID_MEMBER");
  const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const invitation: CmsInvitation = {
    id: `invite_${crypto.randomUUID()}`,
    siteId,
    email: normalizedEmail,
    role,
    status: "pending",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    invitedBy: actorId,
    createdAt: now(),
    acceptedAt: null,
  };
  await database.batch([
    database.prepare("UPDATE cms_invitations SET status = 'revoked' WHERE site_id = ?1 AND lower(email) = lower(?2) AND status = 'pending'").bind(siteId, normalizedEmail),
    database.prepare(`INSERT INTO cms_invitations (id, site_id, email, role, token_hash, status, expires_at, invited_by, created_at, accepted_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`).bind(invitation.id, siteId, normalizedEmail, role, await hashToken(token), invitation.status, invitation.expiresAt, actorId, invitation.createdAt, null),
  ]);
  await recordAudit(database, siteId, { userId: actorId, email: actorEmail }, "invitation.created", "invitation", invitation.id, { email: normalizedEmail, role });
  return { ...invitation, inviteUrl: `/invite/${encodeURIComponent(token)}?siteId=${encodeURIComponent(siteId)}` };
}

export async function listInvitations(siteId: string, userId: string, email: string): Promise<CmsInvitation[]> {
  const database = getD1();
  await ensureCmsSchema(database);
  const actor = await ensureMember(siteId, userId, email, database);
  if (actor.role !== "owner") throw new Error("FORBIDDEN");
  const timestamp = now();
  await database.prepare("UPDATE cms_invitations SET status = 'expired' WHERE site_id = ?1 AND status = 'pending' AND expires_at <= ?2").bind(siteId, timestamp).run();
  const rows = await database.prepare(`SELECT id, site_id AS siteId, email, role, status, expires_at AS expiresAt, invited_by AS invitedBy, created_at AS createdAt, accepted_at AS acceptedAt
    FROM cms_invitations WHERE site_id = ?1 ORDER BY created_at DESC LIMIT 50`).bind(siteId).all<CmsInvitation>();
  return rows.results.map(invitationRowToInvitation);
}

export async function revokeInvitation(siteId: string, invitationId: string, userId: string, email: string) {
  const database = getD1();
  await ensureCmsSchema(database);
  const actor = await ensureMember(siteId, userId, email, database);
  if (actor.role !== "owner") throw new Error("FORBIDDEN");
  await database.prepare("UPDATE cms_invitations SET status = 'revoked' WHERE id = ?1 AND site_id = ?2 AND status = 'pending'").bind(invitationId, siteId).run();
  await recordAudit(database, siteId, { userId, email }, "invitation.revoked", "invitation", invitationId);
  return { ok: true };
}

export async function readInvitation(token: string) {
  const database = getD1();
  await ensureCmsSchema(database);
  const row = await database.prepare(`SELECT id, site_id AS siteId, email, role, status, expires_at AS expiresAt, invited_by AS invitedBy, created_at AS createdAt, accepted_at AS acceptedAt
    FROM cms_invitations WHERE token_hash = ?1 LIMIT 1`).bind(await hashToken(token)).first<CmsInvitation>();
  if (!row) throw new Error("INVITATION_NOT_FOUND");
  if (row.status === "pending" && new Date(row.expiresAt).getTime() <= Date.now()) {
    await database.prepare("UPDATE cms_invitations SET status = 'expired' WHERE id = ?1").bind(row.id).run();
    row.status = "expired";
  }
  return invitationRowToInvitation(row);
}

export async function acceptInvitation(token: string, userId: string, email: string) {
  const database = getD1();
  await ensureCmsSchema(database);
  const invitation = await readInvitation(token);
  if (invitation.status !== "pending") throw new Error("INVITATION_NOT_ACTIVE");
  if (invitation.email !== email.trim().toLowerCase()) throw new Error("INVITATION_EMAIL_MISMATCH");
  const timestamp = now();
  await database.batch([
    database.prepare(`INSERT INTO cms_members (site_id, user_id, email, role, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(site_id, user_id) DO UPDATE SET email = excluded.email, role = excluded.role`).bind(invitation.siteId, userId, invitation.email, invitation.role, timestamp),
    database.prepare("UPDATE cms_invitations SET status = 'accepted', accepted_at = ?1 WHERE id = ?2 AND status = 'pending'").bind(timestamp, invitation.id),
  ]);
  await recordAudit(database, invitation.siteId, { userId, email }, "invitation.accepted", "invitation", invitation.id, { role: invitation.role });
  return { ...invitation, status: "accepted" as const, acceptedAt: timestamp };
}

export async function updateMember(siteId: string, memberUserId: string, role: CmsRole, actorId: string, actorEmail: string) {
  const database = getD1();
  await ensureCmsSchema(database);
  const actor = await ensureMember(siteId, actorId, actorEmail, database);
  if (actor.role !== "owner") throw new Error("FORBIDDEN");
  const target = await database.prepare("SELECT user_id AS userId, email, role FROM cms_members WHERE site_id = ?1 AND user_id = ?2").bind(siteId, memberUserId).first<{ userId: string; email: string; role: CmsRole }>();
  if (!target) throw new Error("MEMBER_NOT_FOUND");
  if (target.role === "owner" && role !== "owner") {
    const owners = await database.prepare("SELECT COUNT(*) AS count FROM cms_members WHERE site_id = ?1 AND role = 'owner'").bind(siteId).first<{ count: number }>();
    if ((owners?.count ?? 0) <= 1) throw new Error("LAST_OWNER");
  }
  await database.prepare("UPDATE cms_members SET role = ?1 WHERE site_id = ?2 AND user_id = ?3").bind(role, siteId, memberUserId).run();
  await recordAudit(database, siteId, { userId: actorId, email: actorEmail }, "member.role_changed", "member", memberUserId, { from: target.role, to: role });
  return { siteId, userId: memberUserId, email: target.email, role, createdAt: now() } as CmsMember;
}

export async function removeMember(siteId: string, memberUserId: string, actorId: string, actorEmail: string) {
  const database = getD1();
  await ensureCmsSchema(database);
  const actor = await ensureMember(siteId, actorId, actorEmail, database);
  if (actor.role !== "owner") throw new Error("FORBIDDEN");
  if (memberUserId === actorId) throw new Error("CANNOT_REMOVE_SELF");
  const target = await database.prepare("SELECT user_id AS userId, email, role FROM cms_members WHERE site_id = ?1 AND user_id = ?2").bind(siteId, memberUserId).first<{ userId: string; email: string; role: CmsRole }>();
  if (!target) throw new Error("MEMBER_NOT_FOUND");
  if (target.role === "owner") {
    const owners = await database.prepare("SELECT COUNT(*) AS count FROM cms_members WHERE site_id = ?1 AND role = 'owner'").bind(siteId).first<{ count: number }>();
    if ((owners?.count ?? 0) <= 1) throw new Error("LAST_OWNER");
  }
  await database.prepare("DELETE FROM cms_members WHERE site_id = ?1 AND user_id = ?2").bind(siteId, memberUserId).run();
  await recordAudit(database, siteId, { userId: actorId, email: actorEmail }, "member.removed", "member", memberUserId, { email: target.email, role: target.role });
  return { ok: true };
}

export async function readSnapshot(siteId: string, mode: CmsMode, user?: { userId: string; email: string }, allowSharedDraft = false, allowMerchant = false): Promise<CmsSnapshot> {
  if (mode === "published") {
    const cached = readCachedPublishedSnapshot(siteId);
    if (cached) return cached;
  }
  const database = getD1();
  await ensureCmsSchema(database);
  await processDueScheduledPublishes(database);
  const site = siteId === DEFAULT_SITE_ID ? await ensureSite(siteId, database) : await getExistingSite(siteId, database);
  let role: CmsRole | undefined;
  if (mode === "draft") {
    if (!user && !allowSharedDraft) throw new Error("AUTH_REQUIRED");
    if (user) role = (allowMerchant ? await getOperationalMember(siteId, user.userId, user.email, true) : await ensureMember(siteId, user.userId, user.email, database)).role;
  }
  const settings = await database.prepare(`SELECT draft_config, published_config, updated_at, published_at
    FROM cms_site_settings WHERE site_id = ?1`).bind(siteId).first<SettingsRow>();
  if (!settings) throw new Error("CMS settings are unavailable.");
  const rows = await database.prepare(`SELECT product_id, draft_payload, published_payload, updated_at
    FROM cms_site_products WHERE site_id = ?1 ORDER BY product_id ASC`).bind(siteId).all<ProductRow>();
  const catalog = rows.results.map((row) => parseProduct(mode === "published" ? (row.published_payload ?? "") : row.draft_payload)).filter(Boolean) as Product[];
  const snapshot = {
    site,
    config: parseConfig(mode === "published" ? settings.published_config : settings.draft_config),
    catalog,
    mode,
    updatedAt: mode === "published" ? settings.published_at ?? settings.updated_at : settings.updated_at,
    role,
  };
  if (mode === "published") writeCachedPublishedSnapshot(siteId, snapshot);
  return snapshot;
}

function validateSnapshot(config: SiteConfig, catalog: Product[]) {
  const checks: Array<[string, boolean]> = [
    ["Brand name", Boolean(config.brand.name.trim())],
    ["Logo mark", Boolean(config.brand.mark.trim())],
    ["Primary colors", Boolean(config.theme.colors.ink && config.theme.colors.paper)],
    ["Hero image", Boolean(config.assets.hero.trim())],
    ["SEO title and description", Boolean(config.seo.title.trim() && config.seo.description.trim())],
    ["Contact email", Boolean(config.content.contact.email.trim())],
    ["Active catalog item", catalog.some((product) => product.status === "active")],
    ["Active products have valid commerce fields", getCatalogValidationErrors(catalog).length === 0],
  ];
  return [
    ...checks.filter(([, ok]) => !ok).map(([label]) => label),
    ...getCatalogValidationErrors(catalog),
  ].filter((value, index, values) => values.indexOf(value) === index);
}

export function getLaunchFailures(config: SiteConfig, catalog: Product[]) {
  return validateSnapshot(config, catalog);
}

export async function writeDraft(siteId: string, config: SiteConfig, catalog: Product[], userId: string, userEmail: string, allowMerchant = false) {
  const database = getD1();
  await ensureCmsSchema(database);
  const member = allowMerchant ? await getOperationalMember(siteId, userId, userEmail, true) : await ensureMember(siteId, userId, userEmail, database);
  if (member.role === "viewer") throw new Error("VIEWER_READ_ONLY");
  const site = await getExistingSite(siteId, database);
  const existing = await database.prepare("SELECT product_id, published_payload, published_at, published_by FROM cms_site_products WHERE site_id = ?1").bind(siteId).all<{ product_id: string; published_payload: string | null; published_at: string | null; published_by: string | null }>();
  const publishedById = new Map(existing.results.map((row) => [row.product_id, row]));
  const timestamp = now();
  const ids = catalog.map((product) => product.id);
  const deleteStatement = ids.length
    ? database.prepare(`DELETE FROM cms_site_products WHERE site_id = ?1 AND product_id NOT IN (${ids.map((_, index) => `?${index + 2}`).join(",")})`).bind(siteId, ...ids)
    : database.prepare("DELETE FROM cms_site_products WHERE site_id = ?1").bind(siteId);
  await database.batch([
    deleteStatement,
    database.prepare(`UPDATE cms_site_settings SET draft_config = ?1, updated_at = ?2, updated_by = ?3 WHERE site_id = ?4`).bind(JSON.stringify(config), timestamp, userId, siteId),
    database.prepare("UPDATE cms_sites SET updated_at = ?1 WHERE id = ?2").bind(timestamp, siteId),
    ...catalog.map((product) => {
      const published = publishedById.get(product.id);
      return database.prepare(`INSERT INTO cms_site_products (site_id, product_id, draft_payload, published_payload, status, updated_at, updated_by, published_at, published_by)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        ON CONFLICT(site_id, product_id) DO UPDATE SET draft_payload = excluded.draft_payload, status = excluded.status, updated_at = excluded.updated_at, updated_by = excluded.updated_by`).bind(siteId, product.id, JSON.stringify(product), published?.published_payload ?? null, product.status, timestamp, userId, published?.published_at ?? null, published?.published_by ?? null);
    }),
  ]);
  await recordAudit(database, siteId, { userId, email: userEmail }, "draft.saved", "draft", siteId, { productCount: catalog.length });
  return { site, updatedAt: timestamp };
}

export async function publishDraft(siteId: string, label: string, userId: string, userEmail: string) {
  const database = getD1();
  await ensureCmsSchema(database);
  const member = await ensureMember(siteId, userId, userEmail, database);
  if (member.role === "viewer") throw new Error("VIEWER_READ_ONLY");
  const draft = await readSnapshot(siteId, "draft", { userId, email: userEmail });
  const failures = await getSiteLaunchFailures(database, siteId, draft.config, draft.catalog);
  if (failures.length) {
    await recordAudit(database, siteId, { userId, email: userEmail }, "publish.blocked", "release", siteId, { failures });
    throw new Error(`PUBLISH_CHECKS:${JSON.stringify(failures)}`);
  }
  const timestamp = now();
  const revisionId = `rev_${crypto.randomUUID()}`;
  const snapshot = JSON.stringify({ config: draft.config, catalog: draft.catalog });
  const ids = draft.catalog.map((product) => product.id);
  const deleteStatement = ids.length
    ? database.prepare(`DELETE FROM cms_site_products WHERE site_id = ?1 AND product_id NOT IN (${ids.map((_, index) => `?${index + 2}`).join(",")})`).bind(siteId, ...ids)
    : database.prepare("DELETE FROM cms_site_products WHERE site_id = ?1").bind(siteId);
  await database.batch([
    database.prepare("UPDATE cms_site_settings SET published_config = ?1, published_at = ?2, published_by = ?3 WHERE site_id = ?4").bind(JSON.stringify(draft.config), timestamp, userId, siteId),
    deleteStatement,
    ...draft.catalog.map((product) => database.prepare("UPDATE cms_site_products SET published_payload = ?1, status = ?2, published_at = ?3, published_by = ?4 WHERE site_id = ?5 AND product_id = ?6").bind(JSON.stringify(product), product.status, timestamp, userId, siteId, product.id)),
    database.prepare("INSERT INTO cms_revisions (id, site_id, kind, label, snapshot, created_at, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)").bind(revisionId, siteId, "publish", label || "Published storefront", snapshot, timestamp, userId),
    database.prepare("UPDATE cms_sites SET updated_at = ?1, status = 'active' WHERE id = ?2").bind(timestamp, siteId),
  ]);
  clearPublishedSnapshotCache(siteId);
  await recordAudit(database, siteId, { userId, email: userEmail }, "publish.completed", "revision", revisionId, { label: label || "Published storefront", productCount: draft.catalog.length });
  return { revisionId, publishedAt: timestamp, site: draft.site };
}

export async function listRevisions(siteId: string, userId: string, userEmail: string, allowMerchant = false): Promise<CmsRevision[]> {
  const database = getD1();
  await ensureCmsSchema(database);
  if (allowMerchant) await getOperationalMember(siteId, userId, userEmail, true);
  else await ensureMember(siteId, userId, userEmail, database);
  const rows = await database.prepare(`SELECT id, site_id AS siteId, kind, label, created_at AS createdAt, created_by AS createdBy
    FROM cms_revisions WHERE site_id = ?1 ORDER BY created_at DESC LIMIT 30`).bind(siteId).all<CmsRevision>();
  return rows.results;
}

export async function rollbackRevision(siteId: string, revisionId: string, userId: string, userEmail: string) {
  const database = getD1();
  await ensureCmsSchema(database);
  const member = await ensureMember(siteId, userId, userEmail, database);
  if (member.role === "viewer") throw new Error("VIEWER_READ_ONLY");
  const row = await database.prepare("SELECT snapshot FROM cms_revisions WHERE id = ?1 AND site_id = ?2").bind(revisionId, siteId).first<{ snapshot: string }>();
  if (!row) throw new Error("REVISION_NOT_FOUND");
  const snapshot = JSON.parse(row.snapshot) as { config: SiteConfig; catalog: Product[] };
  await writeDraft(siteId, snapshot.config, snapshot.catalog, userId, userEmail);
  await recordAudit(database, siteId, { userId, email: userEmail }, "revision.rollback", "revision", revisionId);
  return { ok: true };
}

export async function listAssets(siteId: string, userId: string, userEmail: string, allowMerchant = false): Promise<CmsAsset[]> {
  const database = getD1();
  await ensureCmsSchema(database);
  if (allowMerchant) await getOperationalMember(siteId, userId, userEmail, true);
  else await ensureMember(siteId, userId, userEmail, database);
  const rows = await database.prepare(`SELECT id, site_id AS siteId, asset_key AS assetKey, kind, url, object_key AS objectKey, alt, mime_type AS mimeType, size_bytes AS sizeBytes, created_at AS createdAt, created_by AS createdBy
    FROM cms_assets WHERE site_id = ?1 ORDER BY created_at DESC`).bind(siteId).all<CmsAsset>();
  return rows.results;
}

export async function insertAsset(asset: CmsAsset) {
  const database = getD1();
  await ensureCmsSchema(database);
  await database.prepare(`INSERT INTO cms_assets (id, site_id, asset_key, kind, url, object_key, alt, mime_type, size_bytes, created_at, created_by)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`).bind(asset.id, asset.siteId, asset.assetKey, asset.kind, asset.url, asset.objectKey, asset.alt, asset.mimeType, asset.sizeBytes, asset.createdAt, asset.createdBy).run();
  await recordAudit(database, asset.siteId, { userId: asset.createdBy, email: asset.createdBy }, "asset.uploaded", "asset", asset.id, { kind: asset.kind, assetKey: asset.assetKey });
  return asset;
}

export async function readAsset(assetId: string): Promise<CmsAsset | null> {
  const database = getD1();
  await ensureCmsSchema(database);
  return database.prepare(`SELECT id, site_id AS siteId, asset_key AS assetKey, kind, url, object_key AS objectKey, alt, mime_type AS mimeType, size_bytes AS sizeBytes, created_at AS createdAt, created_by AS createdBy
    FROM cms_assets WHERE id = ?1`).bind(assetId).first<CmsAsset>();
}

export async function deleteAsset(assetId: string, siteId: string, userId: string, userEmail: string): Promise<CmsAsset> {
  const database = getD1();
  await ensureCmsSchema(database);
  const member = await ensureMember(siteId, userId, userEmail, database);
  if (member.role === "viewer") throw new Error("VIEWER_READ_ONLY");
  const asset = await database.prepare(`SELECT id, site_id AS siteId, asset_key AS assetKey, kind, url, object_key AS objectKey, alt, mime_type AS mimeType, size_bytes AS sizeBytes, created_at AS createdAt, created_by AS createdBy
    FROM cms_assets WHERE id = ?1 AND site_id = ?2`).bind(assetId, siteId).first<CmsAsset>();
  if (!asset) throw new Error("ASSET_NOT_FOUND");
  await database.prepare("DELETE FROM cms_assets WHERE id = ?1 AND site_id = ?2").bind(assetId, siteId).run();
  await recordAudit(database, siteId, { userId, email: userEmail }, "asset.deleted", "asset", assetId, { assetKey: asset.assetKey });
  return asset;
}

export async function listAuditLogs(siteId: string, userId: string, email: string): Promise<CmsAuditLog[]> {
  const database = getD1();
  await ensureCmsSchema(database);
  await ensureMember(siteId, userId, email, database);
  const rows = await database.prepare(`SELECT id, site_id AS siteId, actor_user_id AS actorUserId, actor_email AS actorEmail,
    action, entity_type AS entityType, entity_id AS entityId, metadata, created_at AS createdAt
    FROM cms_audit_logs WHERE site_id = ?1 ORDER BY created_at DESC LIMIT 100`).bind(siteId).all<Omit<CmsAuditLog, "metadata"> & { metadata: string | null }>();
  return rows.results.map((row) => ({ ...row, metadata: row.metadata ? JSON.parse(row.metadata) as Record<string, unknown> : null }));
}

export async function getSnapshotDiff(siteId: string, userId: string, email: string, allowMerchant = false): Promise<CmsSnapshotDiff> {
  const draft = await readSnapshot(siteId, "draft", { userId, email }, false, allowMerchant);
  const published = await readSnapshot(siteId, "published");
  const draftProducts = new Map(draft.catalog.map((product) => [product.id, product]));
  const publishedProducts = new Map(published.catalog.map((product) => [product.id, product]));
  const added = [...draftProducts.keys()].filter((id) => !publishedProducts.has(id));
  const removed = [...publishedProducts.keys()].filter((id) => !draftProducts.has(id));
  const updated = [...draftProducts.keys()].filter((id) => publishedProducts.has(id) && JSON.stringify(draftProducts.get(id)) !== JSON.stringify(publishedProducts.get(id)));
  const configChanged = JSON.stringify(draft.config) !== JSON.stringify(published.config);
  const changes = [
    ...(configChanged ? ["Storefront configuration changed"] : []),
    ...(added.length ? [`${added.length} product${added.length === 1 ? "" : "s"} added`] : []),
    ...(updated.length ? [`${updated.length} product${updated.length === 1 ? "" : "s"} updated`] : []),
    ...(removed.length ? [`${removed.length} product${removed.length === 1 ? "" : "s"} removed`] : []),
  ];
  return { configChanged, productsAdded: added.length, productsRemoved: removed.length, productsUpdated: updated.length, totalChanges: changes.length, changes };
}

export async function createSchedule(siteId: string, label: string, scheduledAt: string, userId: string, email: string) {
  const database = getD1();
  await ensureCmsSchema(database);
  const member = await ensureMember(siteId, userId, email, database);
  if (member.role === "viewer") throw new Error("VIEWER_READ_ONLY");
  const time = new Date(scheduledAt);
  if (Number.isNaN(time.getTime()) || time.getTime() <= Date.now()) throw new Error("INVALID_SCHEDULE");
  const schedule: CmsSchedule = { id: `schedule_${crypto.randomUUID()}`, siteId, label: label.trim() || "Scheduled storefront release", scheduledAt: time.toISOString(), status: "pending", createdBy: userId, createdByEmail: email, createdAt: now(), publishedAt: null };
  await database.prepare(`INSERT INTO cms_scheduled_publishes (id, site_id, label, scheduled_at, status, created_by, created_by_email, created_at, published_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`).bind(schedule.id, schedule.siteId, schedule.label, schedule.scheduledAt, schedule.status, schedule.createdBy, schedule.createdByEmail, schedule.createdAt, null).run();
  await recordAudit(database, siteId, { userId, email }, "publish.scheduled", "schedule", schedule.id, { scheduledAt: schedule.scheduledAt, label: schedule.label });
  return schedule;
}

export async function listSchedules(siteId: string, userId: string, email: string): Promise<CmsSchedule[]> {
  const database = getD1();
  await ensureCmsSchema(database);
  await ensureMember(siteId, userId, email, database);
  const rows = await database.prepare(`SELECT id, site_id AS siteId, label, scheduled_at AS scheduledAt, status, created_by AS createdBy,
    created_by_email AS createdByEmail, created_at AS createdAt, published_at AS publishedAt
    FROM cms_scheduled_publishes WHERE site_id = ?1 ORDER BY scheduled_at DESC LIMIT 30`).bind(siteId).all<CmsSchedule>();
  return rows.results;
}

export async function cancelSchedule(siteId: string, scheduleId: string, userId: string, email: string) {
  const database = getD1();
  await ensureCmsSchema(database);
  const member = await ensureMember(siteId, userId, email, database);
  if (member.role === "viewer") throw new Error("VIEWER_READ_ONLY");
  await database.prepare("UPDATE cms_scheduled_publishes SET status = 'cancelled' WHERE id = ?1 AND site_id = ?2 AND status = 'pending'").bind(scheduleId, siteId).run();
  await recordAudit(database, siteId, { userId, email }, "publish.schedule_cancelled", "schedule", scheduleId);
  return { ok: true };
}

async function publishStoredDraft(database: D1DatabaseLike, schedule: CmsSchedule) {
  const settings = await database.prepare("SELECT draft_config FROM cms_site_settings WHERE site_id = ?1").bind(schedule.siteId).first<{ draft_config: string }>();
  if (!settings) throw new Error("SITE_NOT_FOUND");
  const rows = await database.prepare("SELECT draft_payload FROM cms_site_products WHERE site_id = ?1 ORDER BY product_id ASC").bind(schedule.siteId).all<{ draft_payload: string }>();
  const catalog = rows.results.map((row) => parseProduct(row.draft_payload)).filter(Boolean) as Product[];
  const config = parseConfig(settings.draft_config);
  const failures = await getSiteLaunchFailures(database, schedule.siteId, config, catalog);
  if (failures.length) throw new Error(`PUBLISH_CHECKS:${JSON.stringify(failures)}`);
  const timestamp = now();
  const revisionId = `rev_${crypto.randomUUID()}`;
  const snapshot = JSON.stringify({ config, catalog });
  const ids = catalog.map((product) => product.id);
  const deleteStatement = ids.length
    ? database.prepare(`DELETE FROM cms_site_products WHERE site_id = ?1 AND product_id NOT IN (${ids.map((_, index) => `?${index + 2}`).join(",")})`).bind(schedule.siteId, ...ids)
    : database.prepare("DELETE FROM cms_site_products WHERE site_id = ?1").bind(schedule.siteId);
  await database.batch([
    database.prepare("UPDATE cms_site_settings SET published_config = ?1, published_at = ?2, published_by = ?3 WHERE site_id = ?4").bind(JSON.stringify(config), timestamp, schedule.createdBy, schedule.siteId),
    deleteStatement,
    ...catalog.map((product) => database.prepare("UPDATE cms_site_products SET published_payload = ?1, status = ?2, published_at = ?3, published_by = ?4 WHERE site_id = ?5 AND product_id = ?6").bind(JSON.stringify(product), product.status, timestamp, schedule.createdBy, schedule.siteId, product.id)),
    database.prepare("INSERT INTO cms_revisions (id, site_id, kind, label, snapshot, created_at, created_by) VALUES (?1, ?2, 'scheduled-publish', ?3, ?4, ?5, ?6)").bind(revisionId, schedule.siteId, schedule.label, snapshot, timestamp, schedule.createdBy),
    database.prepare("UPDATE cms_sites SET updated_at = ?1, status = 'active' WHERE id = ?2").bind(timestamp, schedule.siteId),
    database.prepare("UPDATE cms_scheduled_publishes SET status = 'published', published_at = ?1 WHERE id = ?2").bind(timestamp, schedule.id),
  ]);
  clearPublishedSnapshotCache(schedule.siteId);
  await recordAudit(database, schedule.siteId, { userId: schedule.createdBy, email: schedule.createdByEmail }, "publish.scheduled_completed", "schedule", schedule.id, { revisionId });
}

async function processDueScheduledPublishes(database: D1DatabaseLike) {
  const due = await database.prepare(`SELECT id, site_id AS siteId, label, scheduled_at AS scheduledAt, status, created_by AS createdBy,
    created_by_email AS createdByEmail, created_at AS createdAt, published_at AS publishedAt
    FROM cms_scheduled_publishes WHERE status = 'pending' AND scheduled_at <= ?1 LIMIT 10`).bind(now()).all<CmsSchedule>();
  for (const schedule of due.results) {
    await database.prepare("UPDATE cms_scheduled_publishes SET status = 'processing' WHERE id = ?1 AND status = 'pending'").bind(schedule.id).run();
    const claimed = await database.prepare("SELECT status FROM cms_scheduled_publishes WHERE id = ?1").bind(schedule.id).first<{ status: CmsSchedule["status"] }>();
    if (claimed?.status !== "processing") continue;
    try {
      await publishStoredDraft(database, schedule);
    } catch (error) {
      await database.prepare("UPDATE cms_scheduled_publishes SET status = 'failed' WHERE id = ?1").bind(schedule.id).run();
      await recordAudit(database, schedule.siteId, { userId: schedule.createdBy, email: schedule.createdByEmail }, "publish.scheduled_failed", "schedule", schedule.id, { error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
}
