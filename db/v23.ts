import { ensureCmsSchema, getCmsDatabase, getMember, getOperationalMember, readSnapshot, recordAudit, writeDraft, type CmsMember, type CmsSnapshot, type CmsRole } from "./cms";
import { getSiteIntegrationStatuses, type SiteIntegrationStatus } from "./site-integrations";
import { getProductValidationErrors, type Product, type ProductOption, type ProductVariant } from "../app/data/products";
import type { SiteConfig } from "../app/data/site-config";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export type ClientPortalOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  email: string;
  currency: string;
  total: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  trackingNumber: string | null;
  createdAt: string;
};

export type ClientPortalOverview = {
  siteId: string;
  role: CmsRole;
  member: CmsMember;
  snapshot: CmsSnapshot;
  orders: ClientPortalOrder[];
  inventory: { products: number; lowStock: number; units: number };
  integrations: SiteIntegrationStatus[];
};

type EditableConfig = {
  brand: Record<string, string>;
  theme: { colors: Record<string, string> };
  assets: Record<string, string>;
  content: { contact: Record<string, string> };
};

export async function getClientPortalOverview(siteId: string, userId: string, email: string, allowMerchant = false): Promise<ClientPortalOverview> {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const member = allowMerchant ? await getOperationalMember(siteId, userId, email, true) : await getMember(siteId, userId, email);
  const snapshot = await readSnapshot(siteId, "draft", { userId, email }, false, allowMerchant);
  const orderRows = await database.prepare(`SELECT id, order_number AS orderNumber, customer_name AS customerName, email, currency, total,
      payment_status AS paymentStatus, fulfillment_status AS fulfillmentStatus, tracking_number AS trackingNumber, created_at AS createdAt
    FROM cms_orders WHERE site_id = ?1 ORDER BY created_at DESC LIMIT 50`).bind(siteId).all<ClientPortalOrder>();
  const inventory = await database.prepare(`SELECT COUNT(DISTINCT product_id) AS products,
      SUM(CASE WHEN quantity - reserved_quantity <= 5 THEN 1 ELSE 0 END) AS lowStock,
      COALESCE(SUM(MAX(0, quantity - reserved_quantity)), 0) AS units
    FROM cms_inventory WHERE site_id = ?1`).bind(siteId).first<{ products: number; lowStock: number; units: number }>();
  return { siteId, role: member.role, member, snapshot, orders: orderRows.results, inventory: { products: Number(inventory?.products || snapshot.catalog.length), lowStock: Number(inventory?.lowStock || 0), units: Number(inventory?.units || 0) }, integrations: await getSiteIntegrationStatuses(siteId, database) };
}

function validText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : undefined;
}

function validColor(value: unknown) {
  return typeof value === "string" && (/^#[0-9a-f]{6}$/i.test(value.trim()) || /^rgba?\([^)]{1,80}\)$/i.test(value.trim())) ? value.trim() : undefined;
}

function getProductIdentityErrors(product: Product, catalog: Product[]) {
  const errors: string[] = [];
  if (catalog.some((item) => item.id !== product.id && item.sku.trim().toLowerCase() === product.sku.trim().toLowerCase())) errors.push("Product SKU must be unique");
  const variantSkus = new Set<string>();
  product.variants.forEach((variant) => {
    const sku = variant.sku.trim().toLowerCase();
    if (sku && variantSkus.has(sku)) errors.push("Variant SKUs must be unique");
    if (sku) variantSkus.add(sku);
    if (catalog.some((item) => item.id !== product.id && item.variants.some((candidate) => candidate.sku.trim().toLowerCase() === sku))) errors.push("Variant SKUs must be unique across the catalog");
  });
  return Array.from(new Set(errors));
}

export async function updateClientBrand(siteId: string, input: { brand?: Partial<Record<"name" | "mark" | "descriptor" | "tagline" | "footerLine" | "originLine", string>>; colors?: Partial<Record<"ink" | "muted" | "paper" | "warm" | "white" | "line" | "rust" | "sage", string>>; hero?: string; contactEmail?: string; tradeEmail?: string }, userId: string, email: string, allowMerchant = false) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const member = allowMerchant ? await getOperationalMember(siteId, userId, email, true) : await getMember(siteId, userId, email);
  if (member.role === "viewer") throw new Error("VIEWER_READ_ONLY");
  const snapshot = await readSnapshot(siteId, "draft", { userId, email }, false, allowMerchant);
  const config = clone(snapshot.config) as unknown as EditableConfig;
  for (const field of ["name", "mark", "descriptor", "tagline", "footerLine", "originLine"] as const) {
    const value = validText(input.brand?.[field], field === "name" ? 120 : 500);
    if (value !== undefined) config.brand[field] = value;
  }
  if (input.colors) for (const field of ["ink", "muted", "paper", "warm", "white", "line", "rust", "sage"] as const) {
    const value = validColor(input.colors[field]);
    if (value !== undefined) config.theme.colors[field] = value;
  }
  const hero = validText(input.hero, 1000);
  if (hero !== undefined) config.assets.hero = hero;
  const contactEmail = validText(input.contactEmail, 160);
  if (contactEmail !== undefined) config.content.contact.email = contactEmail;
  const tradeEmail = validText(input.tradeEmail, 160);
  if (tradeEmail !== undefined) config.content.contact.tradeEmail = tradeEmail;
  if (!config.brand.name.trim() || !config.brand.mark.trim()) throw new Error("INVALID_BRAND");
  await writeDraft(siteId, config as SiteConfig, snapshot.catalog, userId, email, allowMerchant);
  await recordAudit(database, siteId, { userId, email }, "client.brand_updated", "brand", siteId, { fields: Object.keys(input) });
  return readSnapshot(siteId, "draft", { userId, email }, false, allowMerchant);
}

export async function updateClientProduct(siteId: string, productId: string, input: Partial<Pick<Product, "slug" | "name" | "shortName" | "category" | "sku" | "price" | "compareAt" | "stock" | "status" | "featured" | "image" | "images" | "alt" | "badge" | "colors" | "options" | "variants" | "specs" | "tags" | "description" | "details" | "relatedSlugs">>, userId: string, email: string, allowMerchant = false) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const member = allowMerchant ? await getOperationalMember(siteId, userId, email, true) : await getMember(siteId, userId, email);
  if (member.role === "viewer") throw new Error("VIEWER_READ_ONLY");
  const snapshot = await readSnapshot(siteId, "draft", { userId, email }, false, allowMerchant);
  const product = snapshot.catalog.find((item) => item.id === productId);
  if (!product) throw new Error("PRODUCT_NOT_FOUND");
  const next = clone(product);
  const textFields = ["slug", "name", "shortName", "category", "sku", "image", "alt", "badge", "description", "details"] as const;
  for (const field of textFields) {
    const value = validText(input[field], field === "details" ? 4000 : field === "slug" || field === "sku" ? 160 : 500);
    if (value !== undefined) next[field] = value;
  }
  if (Array.isArray(input.images)) next.images = input.images.map((value) => validText(value, 1000)).filter(Boolean) as string[];
  if (Array.isArray(input.colors)) next.colors = input.colors.map((value) => validText(value, 80)).filter(Boolean) as string[];
  if (Array.isArray(input.tags)) next.tags = input.tags.map((value) => validText(value, 80)).filter(Boolean) as string[];
  if (Array.isArray(input.specs)) next.specs = input.specs.map((value) => validText(value, 240)).filter(Boolean) as string[];
  if (Array.isArray(input.relatedSlugs)) next.relatedSlugs = input.relatedSlugs.map((value) => validText(value, 160)).filter(Boolean) as string[];
  if (Array.isArray(input.options)) next.options = input.options.slice(0, 10).map((option) => ({ name: validText(option.name, 80) || "Option", values: Array.isArray(option.values) ? option.values.map((value) => validText(value, 80)).filter(Boolean) as string[] : [] })) as ProductOption[];
  if (Array.isArray(input.variants) && input.variants.length) next.variants = input.variants.slice(0, 50).map((variant, index) => ({
    ...next.variants[index % Math.max(1, next.variants.length)],
    ...variant,
    id: validText(variant.id, 160) || `${productId}-variant-${index + 1}`,
    label: validText(variant.label, 120) || `Option ${index + 1}`,
    sku: validText(variant.sku, 160) || `${next.sku}-${String(index + 1).padStart(2, "0")}`,
    swatch: validText(variant.swatch, 80) || "#20211e",
    optionType: validText(variant.optionType, 80) || "Option",
    available: variant.available !== false,
    stock: variant.stock === undefined ? undefined : Math.max(0, Math.floor(Number(variant.stock) || 0)),
  })) as ProductVariant[];
  if (input.price !== undefined && Number.isFinite(Number(input.price)) && Number(input.price) >= 0) next.price = Math.round(Number(input.price) * 100) / 100;
  if (input.compareAt !== undefined && Number.isFinite(Number(input.compareAt)) && Number(input.compareAt) >= 0) next.compareAt = Math.round(Number(input.compareAt) * 100) / 100;
  if (input.stock !== undefined && Number.isInteger(Number(input.stock)) && Number(input.stock) >= 0) next.stock = Number(input.stock);
  if (input.status === "active" || input.status === "draft") next.status = input.status;
  if (input.featured !== undefined) next.featured = Boolean(input.featured);
  if (next.image && !next.images.includes(next.image)) next.images = [next.image, ...next.images];
  const validationErrors = [...getProductIdentityErrors(next, snapshot.catalog), ...getProductValidationErrors(next, snapshot.catalog)];
  if (validationErrors.length) throw new Error(`INVALID_PRODUCT:${JSON.stringify(validationErrors)}`);
  const catalog = snapshot.catalog.map((item) => item.id === productId ? next : item);
  await writeDraft(siteId, snapshot.config, catalog, userId, email, allowMerchant);
  await recordAudit(database, siteId, { userId, email }, "client.product_updated", "product", productId, { fields: Object.keys(input) });
  return next;
}

type ClientProductInput = Partial<Pick<Product, "id" | "slug" | "name" | "shortName" | "category" | "sku" | "price" | "compareAt" | "stock" | "status" | "featured" | "image" | "images" | "alt" | "badge" | "colors" | "options" | "variants" | "specs" | "tags" | "description" | "details" | "relatedSlugs">>;

function productSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120) || `product-${crypto.randomUUID().slice(0, 8)}`;
}

export async function createClientProduct(siteId: string, input: ClientProductInput, userId: string, email: string, allowMerchant = false) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const member = allowMerchant ? await getOperationalMember(siteId, userId, email, true) : await getMember(siteId, userId, email);
  if (member.role === "viewer") throw new Error("VIEWER_READ_ONLY");
  const snapshot = await readSnapshot(siteId, "draft", { userId, email }, false, allowMerchant);
  const id = validText(input.id, 160) || `product_${crypto.randomUUID()}`;
  const name = validText(input.name, 500) || "New product";
  const sku = validText(input.sku, 160) || `SKU-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const colors = Array.isArray(input.colors) && input.colors.length ? input.colors.map((value) => validText(value, 80)).filter(Boolean) as string[] : ["Default"];
  const imageList = Array.isArray(input.images) ? input.images.map((value) => validText(value, 1000)).filter(Boolean) as string[] : [];
  const image = validText(input.image, 1000) || imageList[0] || "";
  const stock = Number.isInteger(Number(input.stock)) && Number(input.stock) >= 0 ? Number(input.stock) : 0;
  const variants = Array.isArray(input.variants) && input.variants.length ? input.variants.slice(0, 50).map((variant, index) => ({
    id: validText(variant.id, 160) || `${id}-variant-${index + 1}`,
    label: validText(variant.label, 120) || `Option ${index + 1}`,
    swatch: validText(variant.swatch, 80) || "#334155",
    sku: validText(variant.sku, 160) || `${sku}-${String(index + 1).padStart(2, "0")}`,
    optionType: validText(variant.optionType, 80) || "Option",
    optionValues: variant.optionValues,
    available: variant.available !== false,
    stock: variant.stock === undefined ? undefined : Math.max(0, Math.floor(Number(variant.stock) || 0)),
  })) : [{
    id: `${id}-default`,
    label: colors[0],
    swatch: "#334155",
    sku: `${sku}-01`,
    optionType: "Color",
    optionValues: { Color: colors[0] },
    available: true,
    stock,
  }];
  const product: Product = {
    id,
    slug: productSlug(validText(input.slug, 120) || name),
    name,
    shortName: validText(input.shortName, 500) || name,
    category: validText(input.category, 120) || "General",
    sku,
    status: input.status === "active" ? "active" : "draft",
    featured: Boolean(input.featured),
    price: Number.isFinite(Number(input.price)) && Number(input.price) >= 0 ? Math.round(Number(input.price) * 100) / 100 : 0,
    compareAt: input.compareAt === undefined ? undefined : Math.max(0, Number(input.compareAt) || 0),
    description: validText(input.description, 500) || `${name} for everyday use.`,
    details: validText(input.details, 4000) || `Details for ${name}.`,
    image,
    images: image && !imageList.includes(image) ? [image, ...imageList] : imageList,
    alt: validText(input.alt, 500) || name,
    badge: validText(input.badge, 120),
    colors,
    options: Array.isArray(input.options) && input.options.length ? input.options : [{ name: "Color", values: colors }],
    variants: variants as Product["variants"],
    specs: Array.isArray(input.specs) ? input.specs.map((value) => validText(value, 240)).filter(Boolean) as string[] : [],
    tags: Array.isArray(input.tags) ? input.tags.map((value) => validText(value, 80)).filter(Boolean) as string[] : ["new"],
    stock,
    relatedSlugs: Array.isArray(input.relatedSlugs) ? input.relatedSlugs.map((value) => validText(value, 160)).filter(Boolean) as string[] : [],
  };
  const validationErrors = [...getProductIdentityErrors(product, snapshot.catalog), ...getProductValidationErrors(product, snapshot.catalog)];
  if (validationErrors.length) throw new Error(`INVALID_PRODUCT:${JSON.stringify(validationErrors)}`);
  await writeDraft(siteId, snapshot.config, [...snapshot.catalog, product], userId, email, allowMerchant);
  await recordAudit(database, siteId, { userId, email }, "client.product_created", "product", id, { slug: product.slug });
  return product;
}

export async function deleteClientProduct(siteId: string, productId: string, userId: string, email: string, allowMerchant = false) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  const member = allowMerchant ? await getOperationalMember(siteId, userId, email, true) : await getMember(siteId, userId, email);
  if (member.role === "viewer") throw new Error("VIEWER_READ_ONLY");
  const snapshot = await readSnapshot(siteId, "draft", { userId, email }, false, allowMerchant);
  const product = snapshot.catalog.find((item) => item.id === productId);
  if (!product) throw new Error("PRODUCT_NOT_FOUND");
  const reserved = await database.prepare("SELECT COALESCE(SUM(reserved_quantity), 0) AS reserved FROM cms_inventory WHERE site_id = ?1 AND product_id = ?2").bind(siteId, productId).first<{ reserved: number }>();
  if (Number(reserved?.reserved || 0) > 0) throw new Error("PRODUCT_IN_USE");
  await writeDraft(siteId, snapshot.config, snapshot.catalog.filter((item) => item.id !== productId), userId, email, allowMerchant);
  await database.prepare("DELETE FROM cms_inventory WHERE site_id = ?1 AND product_id = ?2").bind(siteId, productId).run();
  await recordAudit(database, siteId, { userId, email }, "client.product_deleted", "product", productId, { slug: product.slug });
  return { ok: true, productId };
}

export async function listClientOrders(siteId: string, userId: string, email: string, allowMerchant = false) {
  const database = getCmsDatabase();
  await ensureCmsSchema(database);
  if (allowMerchant) await getOperationalMember(siteId, userId, email, true);
  else await getMember(siteId, userId, email);
  const rows = await database.prepare(`SELECT id, order_number AS orderNumber, customer_name AS customerName, email, currency, total,
      payment_status AS paymentStatus, fulfillment_status AS fulfillmentStatus, tracking_number AS trackingNumber, created_at AS createdAt
    FROM cms_orders WHERE site_id = ?1 ORDER BY created_at DESC LIMIT 100`).bind(siteId).all<ClientPortalOrder>();
  return rows.results;
}

export function portalErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "CMS_ERROR";
  return message === "INVALID_BRAND" ? "INVALID_BRAND" : message;
}
