import { env } from "cloudflare:workers";
import { getCatalogValidationErrors, products as defaultProducts, type Product } from "../app/data/products";
import { siteConfig, type SiteConfig } from "../app/data/site-config";

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

type R2BucketLike = {
  put: (key: string, value: unknown, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }) => Promise<unknown>;
  get: (key: string) => Promise<unknown>;
  delete: (key: string) => Promise<void>;
};

type SiteRow = CmsSite;
type SettingsRow = { draft_config: string; published_config: string; updated_at: string; published_at: string | null };
type ProductRow = { product_id: string; draft_payload: string; published_payload: string | null; updated_at: string };

const DEFAULT_SITE_ID = "default";

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
  await database.prepare(`INSERT INTO cms_audit_logs (id, site_id, actor_user_id, actor_email, action, entity_type, entity_id, metadata, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`).bind(
    `audit_${crypto.randomUUID()}`,
    siteId,
    actor.userId,
    actor.email,
    action,
    entityType,
    entityId,
    metadata ? JSON.stringify(metadata) : null,
    now(),
  ).run();
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

export async function ensureCmsSchema(database: D1DatabaseLike) {
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
      customer_name TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'usd',
      subtotal REAL NOT NULL,
      shipping REAL NOT NULL,
      tax REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payment_status TEXT NOT NULL DEFAULT 'pending',
      fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled',
      stripe_session_id TEXT UNIQUE,
      stripe_payment_intent_id TEXT,
      shipping_address TEXT NOT NULL,
      tracking_number TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      paid_at TEXT,
      shipped_at TEXT
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
      processed_at TEXT
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
      UNIQUE(order_id, type)
    )`),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_sites_status_idx ON cms_sites(status)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_site_products_site_idx ON cms_site_products(site_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_members_email_idx ON cms_members(site_id, email)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_revisions_site_idx ON cms_revisions(site_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_assets_site_idx ON cms_assets(site_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_invitations_site_idx ON cms_invitations(site_id, status, expires_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_invitations_email_idx ON cms_invitations(site_id, email)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_audit_site_idx ON cms_audit_logs(site_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_schedules_site_idx ON cms_scheduled_publishes(site_id, status, scheduled_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_site_domains_site_idx ON cms_site_domains(site_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_inventory_site_sku_idx ON cms_inventory(site_id, sku)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_inventory_tx_site_idx ON cms_inventory_transactions(site_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_orders_site_status_idx ON cms_orders(site_id, status, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_orders_site_email_idx ON cms_orders(site_id, email)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_order_items_order_idx ON cms_order_items(order_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_order_items_site_idx ON cms_order_items(site_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_payment_events_site_idx ON cms_payment_events(site_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_order_notifications_site_idx ON cms_order_notifications(site_id, created_at)"),
  ]);
}

function parseConfig(value: string): SiteConfig {
  try {
    return JSON.parse(value) as SiteConfig;
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

export async function readSnapshot(siteId: string, mode: CmsMode, user?: { userId: string; email: string }): Promise<CmsSnapshot> {
  const database = getD1();
  await ensureCmsSchema(database);
  await processDueScheduledPublishes(database);
  const site = siteId === DEFAULT_SITE_ID ? await ensureSite(siteId, database) : await getExistingSite(siteId, database);
  let role: CmsRole | undefined;
  if (mode === "draft") {
    if (!user) throw new Error("AUTH_REQUIRED");
    role = (await ensureMember(siteId, user.userId, user.email, database)).role;
  }
  const settings = await database.prepare(`SELECT draft_config, published_config, updated_at, published_at
    FROM cms_site_settings WHERE site_id = ?1`).bind(siteId).first<SettingsRow>();
  if (!settings) throw new Error("CMS settings are unavailable.");
  const rows = await database.prepare(`SELECT product_id, draft_payload, published_payload, updated_at
    FROM cms_site_products WHERE site_id = ?1 ORDER BY product_id ASC`).bind(siteId).all<ProductRow>();
  const catalog = rows.results.map((row) => parseProduct(mode === "published" ? (row.published_payload ?? "") : row.draft_payload)).filter(Boolean) as Product[];
  return {
    site,
    config: parseConfig(mode === "published" ? settings.published_config : settings.draft_config),
    catalog,
    mode,
    updatedAt: mode === "published" ? settings.published_at ?? settings.updated_at : settings.updated_at,
    role,
  };
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

export async function writeDraft(siteId: string, config: SiteConfig, catalog: Product[], userId: string, userEmail: string) {
  const database = getD1();
  await ensureCmsSchema(database);
  const member = await ensureMember(siteId, userId, userEmail, database);
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
  const failures = validateSnapshot(draft.config, draft.catalog);
  if (failures.length) throw new Error(`PUBLISH_CHECKS:${JSON.stringify(failures)}`);
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
  await recordAudit(database, siteId, { userId, email: userEmail }, "publish.completed", "revision", revisionId, { label: label || "Published storefront", productCount: draft.catalog.length });
  return { revisionId, publishedAt: timestamp, site: draft.site };
}

export async function listRevisions(siteId: string, userId: string, userEmail: string): Promise<CmsRevision[]> {
  const database = getD1();
  await ensureCmsSchema(database);
  await ensureMember(siteId, userId, userEmail, database);
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

export async function listAssets(siteId: string, userId: string, userEmail: string): Promise<CmsAsset[]> {
  const database = getD1();
  await ensureCmsSchema(database);
  await ensureMember(siteId, userId, userEmail, database);
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

export async function getSnapshotDiff(siteId: string, userId: string, email: string): Promise<CmsSnapshotDiff> {
  const draft = await readSnapshot(siteId, "draft", { userId, email });
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
  const failures = validateSnapshot(config, catalog);
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
