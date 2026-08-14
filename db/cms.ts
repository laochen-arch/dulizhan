import { env } from "cloudflare:workers";
import { products as defaultProducts, type Product } from "../app/data/products";
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

type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  run: () => Promise<unknown>;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results: T[] }>;
};

type D1DatabaseLike = {
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

function getD1(): D1DatabaseLike {
  const database = (env as unknown as { DB?: D1DatabaseLike }).DB;
  if (!database) throw new Error("CMS database is not available. Configure the Sites D1 binding as DB.");
  return database;
}

export function getMediaBucket(): R2BucketLike {
  const bucket = (env as unknown as { MEDIA?: R2BucketLike }).MEDIA;
  if (!bucket) throw new Error("Media storage is not available. Configure the Sites R2 binding as MEDIA.");
  return bucket;
}

async function ensureCmsSchema(database: D1DatabaseLike) {
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
    database.prepare("CREATE INDEX IF NOT EXISTS cms_sites_status_idx ON cms_sites(status)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_site_products_site_idx ON cms_site_products(site_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_members_email_idx ON cms_members(site_id, email)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_revisions_site_idx ON cms_revisions(site_id, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS cms_assets_site_idx ON cms_assets(site_id, created_at)"),
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
  return { ...site, role: "owner" };
}

async function ensureMember(siteId: string, userId: string, email: string, database: D1DatabaseLike): Promise<CmsMember> {
  const existing = await database.prepare(`SELECT site_id AS siteId, user_id AS userId, email, role, created_at AS createdAt
    FROM cms_members WHERE site_id = ?1 AND (user_id = ?2 OR lower(email) = lower(?3)) LIMIT 1`).bind(siteId, userId, email).first<CmsMember>();
  if (existing) return existing;
  const count = await database.prepare("SELECT COUNT(*) AS count FROM cms_members WHERE site_id = ?1").bind(siteId).first<{ count: number }>();
  if ((count?.count ?? 0) > 0) throw new Error("FORBIDDEN");
  const member: CmsMember = { siteId, userId, email, role: "owner", createdAt: now() };
  await database.prepare("INSERT INTO cms_members (site_id, user_id, email, role, created_at) VALUES (?1, ?2, ?3, ?4, ?5)").bind(siteId, userId, email, member.role, member.createdAt).run();
  return member;
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
  return { ...member, siteId, createdAt };
}

export async function readSnapshot(siteId: string, mode: CmsMode, user?: { userId: string; email: string }): Promise<CmsSnapshot> {
  const database = getD1();
  await ensureCmsSchema(database);
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
  const checks = [
    ["Brand name", Boolean(config.brand.name.trim())],
    ["Logo mark", Boolean(config.brand.mark.trim())],
    ["Primary colors", Boolean(config.theme.colors.ink && config.theme.colors.paper)],
    ["Hero image", Boolean(config.assets.hero.trim())],
    ["SEO title and description", Boolean(config.seo.title.trim() && config.seo.description.trim())],
    ["Contact email", Boolean(config.content.contact.email.trim())],
    ["Active catalog item", catalog.some((product) => product.status === "active")],
    ["Active products have SKU and image", catalog.filter((product) => product.status === "active").every((product) => Boolean(product.sku && (product.images[0] || product.image)))],
  ];
  return checks.filter(([, ok]) => !ok).map(([label]) => label);
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
  return asset;
}
