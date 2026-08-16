import { ensureCmsSchema, getCmsDatabase, readSnapshot, type D1DatabaseLike } from "./cms";

export type WishlistItem = { productId: string; createdAt: string };

function now() {
  return new Date().toISOString();
}

const schemaInitializationPromises = new WeakMap<object, Promise<void>>();

export async function ensureV26Schema(database: D1DatabaseLike = getCmsDatabase()) {
  const key = database as unknown as object;
  const existing = schemaInitializationPromises.get(key);
  if (existing) return existing;
  const initialization = (async () => {
    await ensureCmsSchema(database);
    await database.batch([
      database.prepare(`CREATE TABLE IF NOT EXISTS store_wishlists (
        site_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (site_id, user_id, product_id)
      )`),
      database.prepare("CREATE INDEX IF NOT EXISTS store_wishlists_user_idx ON store_wishlists(site_id, user_id, created_at)"),
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

export async function listCustomerWishlist(siteId: string, userId: string): Promise<WishlistItem[]> {
  const database = getCmsDatabase();
  await ensureV26Schema(database);
  const rows = await database.prepare(`SELECT product_id AS productId, created_at AS createdAt
    FROM store_wishlists WHERE site_id = ?1 AND user_id = ?2 ORDER BY created_at DESC`).bind(siteId, userId).all<WishlistItem>();
  return rows.results;
}

async function assertPublishedProduct(siteId: string, productId: string) {
  const snapshot = await readSnapshot(siteId, "published");
  const product = snapshot.catalog.find((item) => item.id === productId && item.status === "active");
  if (!product) throw new Error("PRODUCT_NOT_FOUND");
}

export async function addCustomerWishlist(siteId: string, userId: string, productId: string) {
  const database = getCmsDatabase();
  await ensureV26Schema(database);
  await assertPublishedProduct(siteId, productId);
  await database.prepare(`INSERT INTO store_wishlists (site_id, user_id, product_id, created_at)
    VALUES (?1, ?2, ?3, ?4) ON CONFLICT(site_id, user_id, product_id) DO NOTHING`).bind(siteId, userId, productId, now()).run();
  return listCustomerWishlist(siteId, userId);
}

export async function removeCustomerWishlist(siteId: string, userId: string, productId: string) {
  const database = getCmsDatabase();
  await ensureV26Schema(database);
  await database.prepare("DELETE FROM store_wishlists WHERE site_id = ?1 AND user_id = ?2 AND product_id = ?3").bind(siteId, userId, productId).run();
  return listCustomerWishlist(siteId, userId);
}
