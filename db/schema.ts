import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
