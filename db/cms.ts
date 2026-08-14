import { env } from "cloudflare:workers";
import { products as defaultProducts, type Product } from "../app/data/products";
import { siteConfig, type SiteConfig } from "../app/data/site-config";

const SETTINGS_ID = "default";

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

type SettingsRow = {
  config: string;
  updated_at: string;
};

type ProductRow = {
  payload: string;
};

export type CmsSnapshot = {
  config: SiteConfig;
  catalog: Product[];
  updatedAt: string;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getD1(): D1DatabaseLike {
  const database = (env as unknown as { DB?: D1DatabaseLike }).DB;
  if (!database) {
    throw new Error("CMS database is not available. Configure the Sites D1 binding as DB.");
  }
  return database;
}

async function ensureCmsSchema(database: D1DatabaseLike) {
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_settings (
      id TEXT PRIMARY KEY,
      config TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS cms_products (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      category TEXT NOT NULL,
      sku TEXT NOT NULL,
      price REAL NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      featured INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_cms_products_status ON cms_products(status)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_cms_products_category ON cms_products(category)"),
  ]);
}

function parseConfig(raw: string): SiteConfig {
  try {
    return JSON.parse(raw) as SiteConfig;
  } catch {
    return clone(siteConfig);
  }
}

function parseProduct(raw: string): Product | null {
  try {
    const product = JSON.parse(raw) as Product;
    return product.id && product.slug && product.name ? product : null;
  } catch {
    return null;
  }
}

async function seedCms(database: D1DatabaseLike): Promise<CmsSnapshot> {
  const snapshot = {
    config: clone(siteConfig),
    catalog: clone(defaultProducts),
  };
  await writeCmsSnapshot(snapshot.config, snapshot.catalog, "system-seed", database);
  return { ...snapshot, updatedAt: new Date().toISOString() };
}

export async function readCmsSnapshot(): Promise<CmsSnapshot> {
  const database = getD1();
  await ensureCmsSchema(database);
  const setting = await database
    .prepare("SELECT config, updated_at FROM cms_settings WHERE id = ?1")
    .bind(SETTINGS_ID)
    .first<SettingsRow>();

  if (!setting) return seedCms(database);

  const rows = await database
    .prepare("SELECT payload FROM cms_products ORDER BY featured DESC, name ASC")
    .all<ProductRow>();

  return {
    config: parseConfig(setting.config),
    catalog: rows.results.map((row) => parseProduct(row.payload)).filter(Boolean) as Product[],
    updatedAt: setting.updated_at,
  };
}

export async function writeCmsSnapshot(
  config: SiteConfig,
  catalog: Product[],
  updatedBy: string,
  existingDatabase?: D1DatabaseLike,
) {
  const database = existingDatabase ?? getD1();
  await ensureCmsSchema(database);
  const updatedAt = new Date().toISOString();
  const statements = [
    database.prepare("DELETE FROM cms_products"),
    database
      .prepare(`INSERT INTO cms_settings (id, config, updated_at, updated_by)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(id) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
      .bind(SETTINGS_ID, JSON.stringify(config), updatedAt, updatedBy),
    ...catalog.map((product) => database
      .prepare(`INSERT INTO cms_products (id, slug, name, status, category, sku, price, stock, featured, payload, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`)
      .bind(
        product.id,
        product.slug,
        product.name,
        product.status,
        product.category,
        product.sku,
        product.price,
        product.stock,
        product.featured ? 1 : 0,
        JSON.stringify(product),
        updatedAt,
      )),
  ];
  await database.batch(statements);
  return { updatedAt };
}
