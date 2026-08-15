"use client";

import Link from "../components/site-link";
import { useEffect, useMemo, useState } from "react";
import type { Product, ProductVariant } from "../data/products";
import { productCategories, products as defaultProducts } from "../data/products";
import { useSiteRuntime, type EditableSiteConfig } from "../components/site-runtime";

type AdminTab = "brand" | "catalog";
type ColorKey = keyof EditableSiteConfig["theme"]["colors"];

const colorFields: Array<{ key: ColorKey; label: string }> = [
  { key: "ink", label: "Ink" },
  { key: "paper", label: "Paper" },
  { key: "warm", label: "Warm surface" },
  { key: "rust", label: "Accent" },
  { key: "sage", label: "Sage" },
];

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function createProduct(template: Product = defaultProducts[0]): Product {
  const id = `custom-${Date.now()}`;
  return {
    ...copy(template),
    id,
    slug: "new-product",
    name: "New product",
    shortName: "New product",
    sku: "NEW-001",
    status: "draft",
    featured: false,
    badge: "New",
    price: 0,
    compareAt: undefined,
    description: "A short product description for your customer.",
    details: "Add the long-form product story, materials, and use cases here.",
    image: template.images[0] || template.image,
    images: [template.images[0] || template.image],
    alt: "Product image",
    colors: ["Default"],
    options: [{ name: "Option", values: ["Default"] }],
    variants: [{ id: `${id}-default`, label: "Default", swatch: "#20211e", sku: "NEW-001-01", optionType: "Option", available: true }],
    specs: ["Add a product specification"],
    tags: ["new"],
    stock: 0,
    relatedSlugs: [],
  };
}

function parseOptions(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [name, values] = line.split(":");
    return { name: name?.trim() || "Option", values: (values || "").split("|").map((item) => item.trim()).filter(Boolean) };
  }).filter((option) => option.values.length);
}

export function AdminStudio() {
  const { config, catalog, hydrated, cmsStatus, cmsError, refreshCms, updateConfig, updateCatalog, resetConfig, resetCatalog } = useSiteRuntime();
  const [tab, setTab] = useState<AdminTab>("brand");
  const [statusMessage, setStatusMessage] = useState("Changes are autosaved to the CMS.");
  const [editing, setEditing] = useState<Product | null>(null);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogStatus, setCatalogStatus] = useState("All status");
  const [catalogCategory, setCatalogCategory] = useState("All categories");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "catalog") {
      // The URL is the external source of truth for deep-linking into the catalog tab.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTab("catalog");
    }
  }, []);

  const checks = useMemo(() => [
    { label: "Brand name", ok: Boolean(config.brand.name.trim()) },
    { label: "Logo mark", ok: Boolean(config.brand.mark.trim()) },
    { label: "Primary colors", ok: Boolean(config.theme.colors.ink && config.theme.colors.paper) },
    { label: "Hero image", ok: Boolean(config.assets.hero.trim()) },
    { label: "SEO title and description", ok: Boolean(config.seo.title.trim() && config.seo.description.trim()) },
    { label: "Contact email", ok: Boolean(config.content.contact.email.trim()) },
    { label: "Active catalog item", ok: catalog.some((product) => product.status === "active") },
    { label: "Active products have SKU and image", ok: catalog.filter((product) => product.status === "active").every((product) => Boolean(product.sku && (product.images[0] || product.image))) },
  ], [catalog, config]);
  const completedChecks = checks.filter((check) => check.ok).length;
  const cmsLabel = {
    connecting: "Connecting to CMS...",
    synced: "CMS connected",
    saving: "Saving to CMS...",
    saved: "CMS saved",
    offline: "CMS unavailable; local fallback",
    "auth-required": "Sign in required to save",
    error: "CMS error",
  }[cmsStatus];

  const categories = Array.from(new Set([...productCategories, ...catalog.map((product) => product.category).filter(Boolean)]));
  const filteredCatalog = catalog.filter((product) => {
    const queryMatch = `${product.name} ${product.sku} ${product.slug}`.toLowerCase().includes(catalogQuery.toLowerCase());
    const statusMatch = catalogStatus === "All status" || product.status === catalogStatus;
    const categoryMatch = catalogCategory === "All categories" || product.category === catalogCategory;
    return queryMatch && statusMatch && categoryMatch;
  });

  function patchBrand(key: keyof EditableSiteConfig["brand"], value: string) {
    updateConfig((current) => { current.brand[key] = value; return current; });
  }
  function patchColor(key: ColorKey, value: string) {
    updateConfig((current) => { current.theme.colors[key] = value; return current; });
  }
  function patchHome(key: keyof EditableSiteConfig["content"]["home"], value: string) {
    updateConfig((current) => { current.content.home[key] = value; return current; });
  }
  function patchContact(key: keyof EditableSiteConfig["content"]["contact"], value: string) {
    updateConfig((current) => { current.content.contact[key] = value; return current; });
  }
  function patchPolicies(key: keyof EditableSiteConfig["content"]["policies"], value: string) {
    updateConfig((current) => { current.content.policies[key] = value; return current; });
  }
  function patchSeo(key: keyof EditableSiteConfig["seo"], value: string) {
    updateConfig((current) => { current.seo[key] = value; return current; });
  }
  function patchAsset(key: keyof EditableSiteConfig["assets"], value: string) {
    updateConfig((current) => { current.assets[key] = value; return current; });
  }

  function exportData() {
    const payload = JSON.stringify({ config, catalog }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(config.brand.name) || "client-storefront"}-handoff.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusMessage("Handoff JSON exported.");
  }

  function saveProduct() {
    if (!editing) return;
    const next = copy(editing);
    next.name = next.name.trim() || "Untitled product";
    next.shortName = next.shortName.trim() || next.name;
    next.slug = slugify(next.slug || next.name) || `product-${Date.now()}`;
    next.sku = next.sku.trim() || `SKU-${Date.now()}`;
    next.images = next.images.filter(Boolean);
    if (!next.images.length && next.image) next.images = [next.image];
    next.image = next.images[0] || next.image;
    next.variants = next.variants.length ? next.variants : [{ id: `${next.id}-default`, label: "Default", swatch: "#20211e", sku: `${next.sku}-01`, optionType: "Option", available: true }];
    next.colors = next.variants.filter((variant) => variant.optionType.toLowerCase() === "color").map((variant) => variant.label);
    next.options = next.options.length ? next.options : [{ name: "Option", values: next.variants.map((variant) => variant.label) }];
    updateCatalog((current) => current.some((product) => product.id === next.id) ? current.map((product) => product.id === next.id ? next : product) : [next, ...current]);
    setEditing(null);
    setStatusMessage(`${next.name} saved to the local catalog.`);
  }

  function duplicateProduct(product: Product) {
    const duplicate = copy(product);
    duplicate.id = `custom-${Date.now()}`;
    duplicate.slug = `${product.slug}-copy`;
    duplicate.name = `${product.name} Copy`;
    duplicate.sku = `${product.sku}-COPY`;
    duplicate.status = "draft";
    updateCatalog((current) => [duplicate, ...current]);
    setStatusMessage(`${product.name} duplicated as a draft.`);
  }

  function toggleStatus(product: Product) {
    updateCatalog((current) => current.map((item) => item.id === product.id ? { ...item, status: item.status === "active" ? "draft" : "active" } : item));
    setStatusMessage(`${product.name} is now ${product.status === "active" ? "a draft" : "published"}.`);
  }

  if (!hydrated) return <div className="loading-state container section-pad">Loading white-label studio...</div>;

  return <div className="admin-page container section-pad">
    <div className="admin-hero"><div><p className="eyebrow">B2B / White-label studio</p><h1>Shape the next<br /><em>client storefront.</em></h1><p>Manage brand identity, content, themes, products, and launch readiness from one reusable handoff surface.</p></div><div className="admin-hero-actions"><Link href="/preview" className="button button-dark">Preview storefront -&gt;</Link><button type="button" className="button button-outline" onClick={exportData}>Export handoff JSON</button></div></div>

    <div className="admin-toolbar"><div className="admin-tabs" role="tablist" aria-label="Studio sections"><button type="button" className={tab === "brand" ? "is-active" : ""} onClick={() => setTab("brand")}>Brand & content</button><button type="button" className={tab === "catalog" ? "is-active" : ""} onClick={() => setTab("catalog")}>Product management</button></div><div className="admin-save-state" title={cmsError || undefined}><span className="status-dot" />{statusMessage}<span className={`cms-status cms-status-${cmsStatus}`}>CMS: {cmsLabel}</span><button type="button" className="text-button" onClick={() => void refreshCms()}>Refresh</button>{cmsStatus === "auth-required" && <a className="text-button" href="/signin-with-chatgpt?return_to=%2Fadmin">Sign in</a>}</div></div>

    {tab === "brand" ? <div className="admin-brand-layout"><aside className="admin-checklist"><div className="admin-score"><span>{completedChecks}/{checks.length}</span><strong>Launch checks</strong></div>{checks.map((check) => <div className={`check-row ${check.ok ? "is-done" : ""}`} key={check.label}><span>{check.ok ? "OK" : "!"}</span>{check.label}</div>)}<div className="admin-note"><strong>Delivery model</strong><p>Published edits are stored in the Sites CMS. Local browser storage only keeps a temporary fallback while the CMS is unavailable.</p></div><button type="button" className="text-button" onClick={() => { resetConfig(); setStatusMessage("Brand config reset to the Northline demo."); }}>Reset brand config</button></aside><div className="admin-form-stack">
      <section className="admin-panel"><div className="admin-panel-heading"><div><p className="eyebrow">01 / Identity</p><h2>Brand foundation</h2></div><span>Required for every client</span></div><div className="admin-form-grid two"><Field label="Brand name"><input value={config.brand.name} onChange={(event) => patchBrand("name", event.target.value)} /></Field><Field label="Logo mark"><input value={config.brand.mark} maxLength={3} onChange={(event) => patchBrand("mark", event.target.value)} /></Field><Field label="Tagline"><input value={config.brand.tagline} onChange={(event) => patchBrand("tagline", event.target.value)} /></Field><Field label="Descriptor"><input value={config.brand.descriptor} onChange={(event) => patchBrand("descriptor", event.target.value)} /></Field><Field label="Footer line"><input value={config.brand.footerLine} onChange={(event) => patchBrand("footerLine", event.target.value)} /></Field><Field label="Origin line"><input value={config.brand.originLine} onChange={(event) => patchBrand("originLine", event.target.value)} /></Field></div></section>
      <section className="admin-panel"><div className="admin-panel-heading"><div><p className="eyebrow">02 / Theme</p><h2>Make it unmistakably theirs.</h2></div><span>Live CSS variables</span></div><div className="theme-swatch-grid">{colorFields.map((field) => <label className="theme-input" key={field.key}><span>{field.label}</span><div><input type="color" value={config.theme.colors[field.key]} onChange={(event) => patchColor(field.key, event.target.value)} /><input value={config.theme.colors[field.key]} onChange={(event) => patchColor(field.key, event.target.value)} aria-label={`${field.label} hex value`} /></div></label>)}</div></section>
      <section className="admin-panel"><div className="admin-panel-heading"><div><p className="eyebrow">03 / Media</p><h2>Set the visual world.</h2></div><span>Use hosted URLs for this demo</span></div><div className="admin-form-grid two"><Field label="Hero image URL"><input value={config.assets.hero} onChange={(event) => patchAsset("hero", event.target.value)} /></Field><Field label="Story image URL"><input value={config.assets.story} onChange={(event) => patchAsset("story", event.target.value)} /></Field><Field label="About image URL"><input value={config.assets.aboutHero} onChange={(event) => patchAsset("aboutHero", event.target.value)} /></Field><Field label="Journal image URL"><input value={config.assets.journalHero} onChange={(event) => patchAsset("journalHero", event.target.value)} /></Field></div></section>
      <section className="admin-panel"><div className="admin-panel-heading"><div><p className="eyebrow">04 / Homepage</p><h2>Replace the selling story.</h2></div><span>Homepage content</span></div><div className="admin-form-grid two"><Field label="Hero eyebrow"><input value={config.content.home.heroLabel} onChange={(event) => patchHome("heroLabel", event.target.value)} /></Field><Field label="Hero CTA"><input value={config.content.home.heroCta} onChange={(event) => patchHome("heroCta", event.target.value)} /></Field><Field label="Hero lead"><input value={config.content.home.heroTitleLead} onChange={(event) => patchHome("heroTitleLead", event.target.value)} /></Field><Field label="Hero accent"><input value={config.content.home.heroTitleAccent} onChange={(event) => patchHome("heroTitleAccent", event.target.value)} /></Field><Field label="Hero body" wide><textarea value={config.content.home.heroBody} onChange={(event) => patchHome("heroBody", event.target.value)} /></Field><Field label="Intro body" wide><textarea value={config.content.home.introBody} onChange={(event) => patchHome("introBody", event.target.value)} /></Field><Field label="Story body" wide><textarea value={config.content.home.storyBody} onChange={(event) => patchHome("storyBody", event.target.value)} /></Field><Field label="Newsletter body" wide><textarea value={config.content.home.newsletterBody} onChange={(event) => patchHome("newsletterBody", event.target.value)} /></Field></div></section>
      <section className="admin-panel"><div className="admin-panel-heading"><div><p className="eyebrow">05 / Contact & policy</p><h2>Build trust before launch.</h2></div><span>Support and legal copy</span></div><div className="admin-form-grid two"><Field label="Customer email"><input type="email" value={config.content.contact.email} onChange={(event) => patchContact("email", event.target.value)} /></Field><Field label="Trade email"><input type="email" value={config.content.contact.tradeEmail} onChange={(event) => patchContact("tradeEmail", event.target.value)} /></Field><Field label="Instagram URL"><input value={config.content.contact.instagram} onChange={(event) => patchContact("instagram", event.target.value)} /></Field><Field label="Pinterest URL"><input value={config.content.contact.pinterest} onChange={(event) => patchContact("pinterest", event.target.value)} /></Field><Field label="Shipping promise" wide><textarea value={config.content.policies.shippingLead} onChange={(event) => patchPolicies("shippingLead", event.target.value)} /></Field><Field label="Delivery promise" wide><textarea value={config.content.policies.deliveryLead} onChange={(event) => patchPolicies("deliveryLead", event.target.value)} /></Field><Field label="Returns promise" wide><textarea value={config.content.policies.returnsLead} onChange={(event) => patchPolicies("returnsLead", event.target.value)} /></Field><Field label="Free shipping threshold"><input value={config.content.policies.shippingThreshold} onChange={(event) => patchPolicies("shippingThreshold", event.target.value)} /></Field></div></section>
      <section className="admin-panel"><div className="admin-panel-heading"><div><p className="eyebrow">06 / SEO</p><h2>Prepare each client to be found.</h2></div><span>Metadata</span></div><div className="admin-form-grid"><Field label="SEO title"><input value={config.seo.title} onChange={(event) => patchSeo("title", event.target.value)} /></Field><Field label="Meta description"><textarea value={config.seo.description} onChange={(event) => patchSeo("description", event.target.value)} /></Field><Field label="Keywords"><input value={config.seo.keywords} onChange={(event) => patchSeo("keywords", event.target.value)} /></Field></div></section>
    </div></div> : <div className="admin-catalog-layout"><section className="admin-catalog-toolbar"><div><p className="eyebrow">P1 / Catalog</p><h2>Products that are ready to sell.</h2><p>Manage publishing, categories, imagery, pricing, variants, stock, recommendations, and SKU data.</p></div><button type="button" className="button button-dark" onClick={() => setEditing(createProduct(catalog[0]))}>+ New product</button></section><section className="catalog-summary"><div><strong>{catalog.length}</strong><span>Total products</span></div><div><strong>{catalog.filter((product) => product.status === "active").length}</strong><span>Published</span></div><div><strong>{catalog.filter((product) => product.status === "draft").length}</strong><span>Drafts</span></div><div><strong>{catalog.filter((product) => product.featured).length}</strong><span>Featured</span></div></section><section className="catalog-panel"><div className="catalog-filters"><label className="admin-search">Search catalog<input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Name, SKU, or slug" /></label><label>Category<select value={catalogCategory} onChange={(event) => setCatalogCategory(event.target.value)}><option>All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Status<select value={catalogStatus} onChange={(event) => setCatalogStatus(event.target.value)}><option>All status</option><option value="active">Published</option><option value="draft">Draft</option></select></label><button type="button" className="text-button" onClick={() => { resetCatalog(); setStatusMessage("Catalog reset to the Northline demo."); }}>Reset catalog</button></div><div className="catalog-table" role="table" aria-label="Product catalog"><div className="catalog-row catalog-head" role="row"><span>Product</span><span>Category</span><span>SKU</span><span>Price</span><span>Stock</span><span>Status</span><span>Actions</span></div>{filteredCatalog.map((product) => <div className="catalog-row" role="row" key={product.id}><div className="catalog-product"><img src={product.images[0] || product.image} alt="" /><div><strong>{product.name}</strong><small>{product.featured ? "Featured" : "Standard"} / {product.variants.length} variants</small></div></div><span>{product.category}</span><span>{product.sku}</span><span>${product.price}</span><span className={product.stock <= 0 ? "is-alert" : ""}>{product.stock}</span><span><b className={`product-status ${product.status}`}>{product.status === "active" ? "Published" : "Draft"}</b></span><div className="catalog-actions"><button type="button" onClick={() => setEditing(copy(product))}>Edit</button><button type="button" onClick={() => toggleStatus(product)}>{product.status === "active" ? "Unpublish" : "Publish"}</button><button type="button" onClick={() => duplicateProduct(product)}>Duplicate</button><button type="button" onClick={() => { updateCatalog((current) => current.filter((item) => item.id !== product.id)); setStatusMessage(`${product.name} removed from the catalog.`); }}>Delete</button></div></div>)}{!filteredCatalog.length && <div className="empty-state admin-empty"><h2>No matching products.</h2><p>Try a different search or filter.</p></div>}</div></section>{editing && <ProductEditor product={editing} categories={categories} onChange={setEditing} onSave={saveProduct} onCancel={() => setEditing(null)} />}</div>}
  </div>;
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? "admin-field admin-field-wide" : "admin-field"}><span>{label}</span>{children}</label>;
}

function ProductEditor({ product, categories, onChange, onSave, onCancel }: { product: Product; categories: string[]; onChange: (product: Product) => void; onSave: () => void; onCancel: () => void }) {
  function patchProduct(patch: Partial<Product>) { onChange({ ...product, ...patch }); }
  function patchVariant(index: number, patch: Partial<ProductVariant>) { onChange({ ...product, variants: product.variants.map((variant, variantIndex) => variantIndex === index ? { ...variant, ...patch } : variant) }); }
  return <div className="editor-overlay" role="dialog" aria-modal="true" aria-label="Edit product"><div className="product-editor"><div className="editor-heading"><div><p className="eyebrow">Catalog / Product editor</p><h2>{product.name}</h2></div><button type="button" className="close-button" onClick={onCancel} aria-label="Close product editor">x</button></div><div className="admin-form-grid two"><Field label="Product name"><input value={product.name} onChange={(event) => patchProduct({ name: event.target.value })} /></Field><Field label="URL slug"><input value={product.slug} onChange={(event) => patchProduct({ slug: event.target.value })} /></Field><Field label="SKU"><input value={product.sku} onChange={(event) => patchProduct({ sku: event.target.value })} /></Field><Field label="Category"><input list="category-options" value={product.category} onChange={(event) => patchProduct({ category: event.target.value })} /><datalist id="category-options">{categories.map((category) => <option key={category} value={category} />)}</datalist></Field><Field label="Price"><input type="number" min="0" value={product.price} onChange={(event) => patchProduct({ price: Number(event.target.value) })} /></Field><Field label="Compare-at price"><input type="number" min="0" value={product.compareAt ?? ""} onChange={(event) => patchProduct({ compareAt: event.target.value ? Number(event.target.value) : undefined })} /></Field><Field label="Inventory"><input type="number" min="0" value={product.stock} onChange={(event) => patchProduct({ stock: Math.max(0, Number(event.target.value)) })} /></Field><Field label="Status"><select value={product.status} onChange={(event) => patchProduct({ status: event.target.value as Product["status"] })}><option value="active">Published</option><option value="draft">Draft</option></select></Field><Field label="Badge"><input value={product.badge || ""} onChange={(event) => patchProduct({ badge: event.target.value || undefined })} /></Field><label className="admin-check-field"><input type="checkbox" checked={product.featured} onChange={(event) => patchProduct({ featured: event.target.checked })} /> Show as featured product</label><Field label="Short description" wide><textarea value={product.description} onChange={(event) => patchProduct({ description: event.target.value })} /></Field><Field label="Product story" wide><textarea value={product.details} onChange={(event) => patchProduct({ details: event.target.value })} /></Field><Field label="Image alt text" wide><input value={product.alt} onChange={(event) => patchProduct({ alt: event.target.value })} /></Field><Field label="Images (one URL per line)" wide><textarea value={product.images.join("\n")} onChange={(event) => { const images = event.target.value.split("\n").map((item) => item.trim()).filter(Boolean); patchProduct({ images, image: images[0] || product.image }); }} /></Field><Field label="Specifications (one per line)" wide><textarea value={product.specs.join("\n")} onChange={(event) => patchProduct({ specs: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></Field><Field label="Tags (comma separated)"><input value={product.tags.join(", ")} onChange={(event) => patchProduct({ tags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></Field><Field label="Related product slugs"><input value={product.relatedSlugs.join(", ")} onChange={(event) => patchProduct({ relatedSlugs: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></Field><Field label="Option groups (Color: Black | Sand)" wide><textarea value={product.options.map((option) => `${option.name}: ${option.values.join(" | ")}`).join("\n")} onChange={(event) => patchProduct({ options: parseOptions(event.target.value) })} /></Field></div><div className="variant-editor"><div className="editor-section-heading"><div><p className="eyebrow">Variants / SKU matrix</p><h3>Colors, sizes, and sellable options</h3></div><button type="button" className="text-button" onClick={() => onChange({ ...product, variants: [...product.variants, { id: `${product.id}-variant-${product.variants.length + 1}`, label: "New option", swatch: "#b7aa8f", sku: `${product.sku}-${String(product.variants.length + 1).padStart(2, "0")}`, optionType: "Option", available: true }] })}>+ Add variant</button></div>{product.variants.map((variant, index) => <div className="variant-row" key={variant.id}><label>Type<select value={variant.optionType} onChange={(event) => patchVariant(index, { optionType: event.target.value })}><option>Color</option><option>Size</option><option>Option</option></select></label><label>Option label<input value={variant.label} onChange={(event) => patchVariant(index, { label: event.target.value })} /></label><label>Variant SKU<input value={variant.sku} onChange={(event) => patchVariant(index, { sku: event.target.value })} /></label><label>Price override<input type="number" value={variant.price ?? ""} placeholder={`${product.price}`} onChange={(event) => patchVariant(index, { price: event.target.value ? Number(event.target.value) : undefined })} /></label><label>Size<input value={variant.size || ""} onChange={(event) => patchVariant(index, { size: event.target.value || undefined })} /></label><label className="variant-swatch">Swatch<input type="color" value={variant.swatch} onChange={(event) => patchVariant(index, { swatch: event.target.value })} /></label><label className="admin-check-field"><input type="checkbox" checked={variant.available} onChange={(event) => patchVariant(index, { available: event.target.checked })} /> Available</label><button type="button" className="text-button danger" disabled={product.variants.length === 1} onClick={() => onChange({ ...product, variants: product.variants.filter((_, variantIndex) => variantIndex !== index) })}>Remove</button></div>)}</div><div className="editor-actions"><button type="button" className="button button-outline" onClick={onCancel}>Cancel</button><button type="button" className="button button-dark" onClick={onSave}>Save product</button></div></div></div>;
}
