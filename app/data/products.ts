export type ProductStatus = "active" | "draft";

export type ProductOption = {
  name: string;
  values: string[];
};

export type ProductVariant = {
  id: string;
  label: string;
  swatch: string;
  price?: number;
  stock?: number;
  sku: string;
  optionType: string;
  size?: string;
  optionValues?: Record<string, string>;
  available: boolean;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  category: string;
  sku: string;
  status: ProductStatus;
  featured: boolean;
  price: number;
  compareAt?: number;
  description: string;
  details: string;
  image: string;
  images: string[];
  alt: string;
  badge?: string;
  colors: string[];
  options: ProductOption[];
  variants: ProductVariant[];
  specs: string[];
  tags: string[];
  stock: number;
  relatedSlugs: string[];
};

export function variantOptionValues(variant: ProductVariant): Record<string, string> {
  if (variant.optionValues && Object.keys(variant.optionValues).length) return variant.optionValues;
  return { [variant.optionType || "Option"]: variant.label };
}

export function getProductValidationErrors(product: Product, catalog: Product[] = []): string[] {
  const errors: string[] = [];
  const name = typeof product.name === "string" ? product.name : "";
  const category = typeof product.category === "string" ? product.category : "";
  const sku = typeof product.sku === "string" ? product.sku : "";
  const details = typeof product.details === "string" ? product.details : "";
  const images = Array.isArray(product.images) ? product.images : [];
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (!product.id) errors.push("Product ID is required");
  if (!product.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug)) errors.push("Slug must use lowercase letters, numbers, and hyphens");
  if (catalog.some((item) => item.id !== product.id && item.slug === product.slug)) errors.push("Slug must be unique");
  if (!name.trim()) errors.push("Product name is required");
  if (!category.trim()) errors.push("Category is required");
  if (!sku.trim()) errors.push("Product SKU is required");
  if (!Number.isFinite(product.price) || product.price < 0) errors.push("Price must be zero or greater");
  if (!Number.isInteger(product.stock) || product.stock < 0) errors.push("Product stock must be a whole number of zero or more");
  if (!images.length && !product.image) errors.push("At least one product image is required");
  if (!details.trim()) errors.push("Product details are required");
  if (!variants.length) errors.push("At least one sellable variant is required");

  const variantIds = new Set<string>();
  const variantSkus = new Set<string>();
  variants.forEach((variant) => {
    const variantId = typeof variant.id === "string" ? variant.id : "";
    const variantSku = typeof variant.sku === "string" ? variant.sku : "";
    const variantLabel = typeof variant.label === "string" ? variant.label : "";
    if (!variantId || variantIds.has(variantId)) errors.push("Variant IDs must be unique");
    if (variantId) variantIds.add(variantId);
    if (!variantSku || variantSkus.has(variantSku)) errors.push("Variant SKUs must be unique");
    if (variantSku) variantSkus.add(variantSku);
    if (variant.stock !== undefined && (!Number.isInteger(variant.stock) || variant.stock < 0)) errors.push("Variant stock must be a whole number of zero or more");
    if (!variantLabel.trim()) errors.push("Every variant needs an option label");
  });
  return Array.from(new Set(errors));
}

export function getCatalogValidationErrors(catalog: Product[]): string[] {
  const errors: string[] = [];
  const slugs = new Set<string>();
  catalog.forEach((product) => {
    if (slugs.has(product.slug)) errors.push(`Duplicate product slug: ${product.slug}`);
    slugs.add(product.slug);
    if (product.status === "active") {
      getProductValidationErrors(product, catalog).forEach((error) => errors.push(`${product.name || product.slug}: ${error}`));
    }
  });
  return Array.from(new Set(errors));
}

type CatalogItem = Omit<
  Product,
  | "sku"
  | "status"
  | "featured"
  | "images"
  | "options"
  | "variants"
  | "tags"
  | "stock"
  | "relatedSlugs"
>;

const catalog: CatalogItem[] = [
  {
    id: "northline-01",
    slug: "field-pack-28l",
    name: "Field Pack 28L",
    shortName: "Field Pack",
    category: "Carry",
    price: 168,
    description: "A calm, capable carry for the in-between miles.",
    details:
      "Built for one-bag weekends and long days out, the Field Pack keeps your kit close, protected, and easy to reach.",
    image:
      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1200&q=85",
    alt: "Black travel backpack resting on a rock",
    badge: "Best seller",
    colors: ["Obsidian", "Moss"],
    specs: ["28L carry capacity", "Recycled ripstop nylon", "Padded 16-inch laptop sleeve"],
  },
  {
    id: "northline-02",
    slug: "trail-bottle-750",
    name: "Trail Bottle 750",
    shortName: "Trail Bottle",
    category: "Hydration",
    price: 42,
    description: "Cold water, wherever the road turns.",
    details:
      "A double-wall stainless steel bottle with a soft-touch finish and a lid made to clip onto your everyday carry.",
    image:
      "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=1200&q=85",
    alt: "Stainless steel water bottle on a dark surface",
    badge: "New",
    colors: ["Steel", "Sand", "Pine"],
    specs: ["750ml capacity", "24-hour cold retention", "BPA-free stainless steel"],
  },
  {
    id: "northline-03",
    slug: "modular-cube-set",
    name: "Modular Cube Set",
    shortName: "Modular Cubes",
    category: "Organize",
    price: 76,
    compareAt: 88,
    description: "A better place for every layer.",
    details:
      "Three structured packing cubes in breathable recycled nylon, sized to make a week away feel surprisingly simple.",
    image:
      "https://images.unsplash.com/photo-1553531889-56a7c7d0f4d8?auto=format&fit=crop&w=1200&q=85",
    alt: "Neutral travel packing cubes arranged together",
    badge: "Set of 3",
    colors: ["Sand", "Slate"],
    specs: ["Set of 3 nesting cubes", "YKK reverse-coil zippers", "Lightweight recycled nylon"],
  },
  {
    id: "northline-04",
    slug: "summit-sling",
    name: "Summit Sling",
    shortName: "Summit Sling",
    category: "Carry",
    price: 88,
    description: "The essentials, carried with intention.",
    details:
      "A compact crossbody for passports, keys, and the small things that keep your day moving.",
    image:
      "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?auto=format&fit=crop&w=1200&q=85",
    alt: "Minimal black sling bag on a neutral background",
    colors: ["Obsidian", "Clay"],
    specs: ["3L daily capacity", "Weather-resistant shell", "Adjustable quick-release strap"],
  },
  {
    id: "northline-05",
    slug: "camp-cup-duo",
    name: "Camp Cup Duo",
    shortName: "Camp Cups",
    category: "Hydration",
    price: 38,
    description: "Slow mornings deserve good hardware.",
    details:
      "A pair of nesting titanium cups for camp coffee, trail tea, and the ritual that starts the day.",
    image:
      "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=85",
    alt: "Coffee cup outdoors beside a camp setting",
    colors: ["Titanium"],
    specs: ["Set of 2 nesting cups", "Ultralight titanium", "Fold-flat handles"],
  },
  {
    id: "northline-06",
    slug: "route-wallet",
    name: "Route Wallet",
    shortName: "Route Wallet",
    category: "Organize",
    price: 54,
    description: "The small detail that keeps you moving.",
    details:
      "A slim travel wallet with a dedicated passport sleeve, hidden cash pocket, and room for the cards you actually use.",
    image:
      "https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1200&q=85",
    alt: "Minimal leather wallet held in hand",
    colors: ["Walnut", "Black"],
    specs: ["Passport-ready profile", "RFID-shielded card sleeve", "Vegetable-tanned leather"],
  },
];

const swatches = ["#20211e", "#b7aa8f", "#687261", "#a7644e"];

export const products: Product[] = catalog.map((product, index) => {
  const sku = `NLS-${String(index + 1).padStart(3, "0")}`;
  const variants = product.colors.map((label, variantIndex) => ({
    id: `${product.id}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    label,
    swatch: swatches[variantIndex % swatches.length],
    sku: `${sku}-${String(variantIndex + 1).padStart(2, "0")}`,
    optionType: "Color",
    optionValues: { Color: label },
    available: true,
  }));

  return {
    ...product,
    sku,
    status: "active" as const,
    featured: index < 3,
    images: [product.image],
    options: [{ name: "Color", values: product.colors }],
    variants,
    tags: [product.category.toLowerCase(), "travel", "everyday"],
    stock: 18 + index * 7,
    relatedSlugs: [],
  };
});

export const activeProducts = products.filter((product) => product.status === "active");
export const productCategories = Array.from(new Set(products.map((product) => product.category)));

export const getProduct = (slug: string) => products.find((product) => product.slug === slug);
export const getActiveProduct = (slug: string) => activeProducts.find((product) => product.slug === slug);
