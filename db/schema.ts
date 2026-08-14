import { integer, primaryKey, real, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const cmsSettings = sqliteTable("cms_settings", {
  id: text("id").primaryKey(),
  config: text("config").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by"),
});

export const cmsProducts = sqliteTable("cms_products", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  category: text("category").notNull(),
  sku: text("sku").notNull(),
  price: real("price").notNull(),
  stock: integer("stock").notNull().default(0),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const cmsSites = sqliteTable("cms_sites", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  domain: text("domain"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("cms_sites_slug_unique").on(table.slug)]);

export const cmsSiteSettings = sqliteTable("cms_site_settings", {
  siteId: text("site_id").primaryKey(),
  draftConfig: text("draft_config").notNull(),
  publishedConfig: text("published_config").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by"),
  publishedAt: text("published_at"),
  publishedBy: text("published_by"),
});

export const cmsSiteProducts = sqliteTable("cms_site_products", {
  siteId: text("site_id").notNull(),
  productId: text("product_id").notNull(),
  draftPayload: text("draft_payload").notNull(),
  publishedPayload: text("published_payload"),
  status: text("status").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by"),
  publishedAt: text("published_at"),
  publishedBy: text("published_by"),
}, (table) => [
  primaryKey({ columns: [table.siteId, table.productId] }),
  index("cms_site_products_site_status_idx").on(table.siteId, table.status),
]);

export const cmsMembers = sqliteTable("cms_members", {
  siteId: text("site_id").notNull(),
  userId: text("user_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("viewer"),
  createdAt: text("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.siteId, table.userId] }), index("cms_members_email_idx").on(table.siteId, table.email)]);

export const cmsRevisions = sqliteTable("cms_revisions", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  kind: text("kind").notNull(),
  label: text("label").notNull(),
  snapshot: text("snapshot").notNull(),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by").notNull(),
}, (table) => [index("cms_revisions_site_created_idx").on(table.siteId, table.createdAt)]);

export const cmsAssets = sqliteTable("cms_assets", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  assetKey: text("asset_key").notNull(),
  kind: text("kind").notNull(),
  url: text("url").notNull(),
  objectKey: text("object_key"),
  alt: text("alt").notNull().default(""),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by").notNull(),
}, (table) => [index("cms_assets_site_idx").on(table.siteId)]);
