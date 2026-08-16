import { ensureCmsSchema, getCmsDatabase, readSnapshot, type D1DatabaseLike } from "./cms";

export type StoreCartLine = { productId: string; variantId: string; quantity: number };

function now() {
  return new Date().toISOString();
}

const schemaInitializationPromises = new WeakMap<object, Promise<void>>();

export async function ensureV31Schema(database: D1DatabaseLike = getCmsDatabase()) {
  const key = database as unknown as object;
  const existing = schemaInitializationPromises.get(key);
  if (existing) return existing;
  const initialization = (async () => {
    await ensureCmsSchema(database);
    await database.batch([
      database.prepare(`CREATE TABLE IF NOT EXISTS store_carts (
        site_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        items_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (site_id, user_id)
      )`),
      database.prepare("CREATE INDEX IF NOT EXISTS store_carts_user_idx ON store_carts(site_id, user_id, updated_at)"),
    ]);
  })();
  schemaInitializationPromises.set(key, initialization);
  try {
    await initialization;
  } catch (error) {
    schemaInitializationPromises.delete(key);
    throw error;
  }
}

function rawLines(input: unknown): StoreCartLine[] {
  if (!Array.isArray(input)) return [];
  return input.map((item) => {
    const value = item as Partial<StoreCartLine>;
    return {
      productId: typeof value.productId === "string" ? value.productId.trim() : "",
      variantId: typeof value.variantId === "string" ? value.variantId.trim() : "",
      quantity: Number.isFinite(Number(value.quantity)) ? Math.floor(Number(value.quantity)) : 0,
    };
  }).filter((item) => item.productId && item.quantity > 0).slice(0, 100);
}

async function normalizeLines(siteId: string, input: unknown) {
  const snapshot = await readSnapshot(siteId, "published");
  const products = new Map(snapshot.catalog.filter((product) => product.status === "active").map((product) => [product.id, product]));
  const merged = new Map<string, StoreCartLine>();
  rawLines(input).forEach((line) => {
    const product = products.get(line.productId);
    if (!product) return;
    const variant = product.variants.find((candidate) => candidate.id === line.variantId) ?? product.variants[0];
    if (!variant || variant.available === false) return;
    const key = `${product.id}:${variant.id}`;
    const next = Math.min(20, (merged.get(key)?.quantity || 0) + line.quantity);
    merged.set(key, { productId: product.id, variantId: variant.id, quantity: next });
  });
  return Array.from(merged.values());
}

async function readStoredLines(database: D1DatabaseLike, siteId: string, userId: string) {
  const row = await database.prepare("SELECT items_json AS itemsJson FROM store_carts WHERE site_id = ?1 AND user_id = ?2").bind(siteId, userId).first<{ itemsJson: string }>();
  if (!row?.itemsJson) return [] as StoreCartLine[];
  try {
    return rawLines(JSON.parse(row.itemsJson));
  } catch {
    return [] as StoreCartLine[];
  }
}

async function writeLines(database: D1DatabaseLike, siteId: string, userId: string, lines: StoreCartLine[]) {
  await database.prepare(`INSERT INTO store_carts (site_id, user_id, items_json, updated_at)
    VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(site_id, user_id) DO UPDATE SET items_json = excluded.items_json, updated_at = excluded.updated_at`).bind(siteId, userId, JSON.stringify(lines), now()).run();
  return lines;
}

export async function listCustomerCart(siteId: string, userId: string) {
  const database = getCmsDatabase();
  await ensureV31Schema(database);
  const lines = await readStoredLines(database, siteId, userId);
  return normalizeLines(siteId, lines);
}

export async function mergeCustomerCart(siteId: string, userId: string, incoming: unknown) {
  const database = getCmsDatabase();
  await ensureV31Schema(database);
  const existing = await readStoredLines(database, siteId, userId);
  const merged = await normalizeLines(siteId, [...existing, ...rawLines(incoming)]);
  return writeLines(database, siteId, userId, merged);
}

export async function replaceCustomerCart(siteId: string, userId: string, incoming: unknown) {
  const database = getCmsDatabase();
  await ensureV31Schema(database);
  const lines = await normalizeLines(siteId, incoming);
  return writeLines(database, siteId, userId, lines);
}

export async function clearCustomerCart(siteId: string, userId: string) {
  const database = getCmsDatabase();
  await ensureV31Schema(database);
  await database.prepare("DELETE FROM store_carts WHERE site_id = ?1 AND user_id = ?2").bind(siteId, userId).run();
  return [] as StoreCartLine[];
}
