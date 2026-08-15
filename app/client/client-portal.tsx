"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CmsAsset, CmsSite } from "../../db/cms";
import type { Product, ProductVariant } from "../data/products";
import { formatMoney } from "../lib/format-money";

type PortalProduct = Pick<Product, "id" | "slug" | "name" | "shortName" | "category" | "sku" | "price" | "compareAt" | "stock" | "status" | "featured" | "image" | "images" | "description" | "details" | "alt" | "badge" | "colors" | "options" | "variants" | "specs" | "tags" | "relatedSlugs">;
type Integration = { provider: "paypal" | "resend"; source: string; status: string; configured: boolean; hasEncryptionKey: boolean; environment?: "sandbox" | "live"; clientId: boolean; clientSecret: boolean; webhookId: boolean; apiKey: boolean; fromEmail: boolean; fromDomain: string | null; lastCheckedAt: string | null; lastError: string | null };
type PortalConfig = { brand?: Record<string, string>; assets?: { hero?: string }; content?: { contact?: Record<string, string> }; theme?: { colors?: Record<string, string> } };
type PortalOrder = { id: string; orderNumber: string; customerName: string; email: string; currency: string; total: number; paymentStatus: string; fulfillmentStatus: string; trackingNumber: string | null; createdAt: string };
type PortalOverview = { siteId: string; role: "owner" | "editor" | "viewer"; snapshot: { config: PortalConfig; catalog: PortalProduct[] }; orders: PortalOrder[]; inventory: { products: number; lowStock: number; units: number }; integrations: Integration[] };
type InventoryRow = { siteId: string; productId: string; variantId: string; sku: string; quantity: number; reservedQuantity: number; updatedAt: string; productName?: string; variantLabel?: string };
type AfterSales = { id: string; orderId: string; orderNumber?: string; email: string; requestType: "refund" | "return" | "exchange"; reason: string; customerNote: string | null; adminNote: string | null; requestedAmount: number | null; status: string; createdAt: string; updatedAt: string; resolvedAt: string | null };
type ClientOrderDetail = { order: PortalOrder & { shippingAddress: Record<string, string>; subtotal: number; shipping: number; tax: number; refundTotal: number; paidAt: string | null; shippedAt: string | null }; items: Array<{ id: string; productId: string; variantId: string; sku: string; name: string; variantLabel: string; unitPrice: number; quantity: number }>; refunds: Array<{ id: string; amount: number; currency: string; reason: string | null; status: string; error: string | null; createdAt: string; completedAt: string | null }>; stateEvents: Array<{ id: string; fromStatus: string | null; toStatus: string; reason: string | null; createdAt: string }>; afterSales: AfterSales[] };
type LaunchCenter = { readiness: { score: number; blockers: Array<{ key: string; label: string; detail: string; source: string }>; launch: { checks: Array<{ key: string; label: string; detail: string; done: boolean; required?: boolean }>; progress: { done: number; total: number } }; health: Array<{ key: string; status: string; detail: string; checkedAt: string }>; openOperations: number }; releases: Array<{ id: string; status: string; label: string; note: string | null; requestedByEmail: string; requestedAt: string; revisionId: string | null; publishedAt: string | null }>; diff: { totalChanges: number; changes: string[] }; operations: { orders: number; paidOrders: number; openAfterSales: number; lowStock: number; availableUnits: number; failedEvents: number } };

const csvHeaders = ["id", "name", "slug", "shortName", "category", "sku", "status", "featured", "price", "compareAt", "description", "details", "image", "images", "alt", "badge", "colors", "tags", "stock"] as const;

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function productCsv(products: PortalProduct[]) {
  return [csvHeaders.join(","), ...products.map((product) => csvHeaders.map((header) => csvEscape(header === "images" ? product.images.join("|") : header === "colors" ? product.colors.join("|") : header === "tags" ? product.tags.join("|") : product[header])).join(","))].join("\n");
}

function downloadText(filename: string, value: string, type: string) {
  const url = URL.createObjectURL(new Blob([`\ufeff${value}`], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ClientPortal({ userName }: { userName: string }) {
  const searchParams = useSearchParams();
  const importInput = useRef<HTMLInputElement>(null);
  const [sites, setSites] = useState<CmsSite[]>([]);
  const [siteId, setSiteId] = useState(searchParams.get("siteId") || "default");
  const [overview, setOverview] = useState<PortalOverview | null>(null);
  const [launch, setLaunch] = useState<LaunchCenter | null>(null);
  const [assets, setAssets] = useState<CmsAsset[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [afterSales, setAfterSales] = useState<AfterSales[]>([]);
  const [section, setSection] = useState<"brand" | "products" | "orders" | "after-sales" | "operations" | "integrations">("brand");
  const [brand, setBrand] = useState({ name: "", mark: "", descriptor: "", tagline: "", hero: "", contactEmail: "", tradeEmail: "" });
  const [colors, setColors] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<PortalProduct[]>([]);
  const [integrationForm, setIntegrationForm] = useState({ provider: "paypal" as "paypal" | "resend", clientId: "", clientSecret: "", webhookId: "", environment: "sandbox", apiKey: "", fromEmail: "" });
  const [orderDetail, setOrderDetail] = useState<ClientOrderDetail | null>(null);
  const [afterSalesForm, setAfterSalesForm] = useState({ orderNumber: "", email: "", requestType: "return", reason: "", requestedAmount: "", customerNote: "" });
  const [releaseNote, setReleaseNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const loadSites = useCallback(async () => {
    const response = await fetch("/api/cms/sites", { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as { sites?: CmsSite[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to load client sites.");
    const next = payload.sites || [];
    setSites(next);
    if (!next.some((item) => item.id === siteId) && next[0]) setSiteId(next[0].id);
  }, [siteId]);

  const loadOverview = useCallback(async () => {
    const response = await fetch(`/api/client/overview?siteId=${encodeURIComponent(siteId)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as PortalOverview & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to load this client site.");
    setOverview(payload);
    setProducts(payload.snapshot.catalog || []);
    const config = payload.snapshot.config || {};
    setBrand({ name: config.brand?.name || "", mark: config.brand?.mark || "", descriptor: config.brand?.descriptor || "", tagline: config.brand?.tagline || "", hero: config.assets?.hero || "", contactEmail: config.content?.contact?.email || "", tradeEmail: config.content?.contact?.tradeEmail || "" });
    setColors({ ...(config.theme?.colors || {}) });
  }, [siteId]);

  const loadOperations = useCallback(async () => {
    const query = `?siteId=${encodeURIComponent(siteId)}`;
    const [launchResponse, inventoryResponse, assetsResponse, afterSalesResponse] = await Promise.all([
      fetch(`/api/cms/launch-center${query}`, { cache: "no-store" }),
      fetch(`/api/client/inventory${query}`, { cache: "no-store" }),
      fetch(`/api/cms/assets${query}`, { cache: "no-store" }),
      fetch(`/api/client/after-sales${query}`, { cache: "no-store" }),
    ]);
    const [launchPayload, inventoryPayload, assetsPayload, afterSalesPayload] = await Promise.all([
      launchResponse.json().catch(() => ({})) as Promise<LaunchCenter & { error?: string }>,
      inventoryResponse.json().catch(() => ({})) as Promise<{ inventory?: InventoryRow[] }>,
      assetsResponse.json().catch(() => ({})) as Promise<{ assets?: CmsAsset[] }>,
      afterSalesResponse.json().catch(() => ({})) as Promise<{ requests?: AfterSales[] }>,
    ]);
    if (!launchResponse.ok) throw new Error(launchPayload.error || "Unable to load operations.");
    setLaunch(launchPayload);
    if (inventoryResponse.ok) setInventory(inventoryPayload.inventory || []);
    if (assetsResponse.ok) setAssets(assetsPayload.assets || []);
    if (afterSalesResponse.ok) setAfterSales(afterSalesPayload.requests || []);
  }, [siteId]);

  // These effects synchronize tenant-scoped D1 state into the customer workspace.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadSites().catch((error) => setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to load client sites." })); }, [loadSites]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void Promise.all([loadOverview(), loadOperations()]).catch((error) => setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to load the client portal." })); }, [loadOperations, loadOverview]);

  const activeSite = useMemo(() => sites.find((item) => item.id === siteId), [siteId, sites]);
  const canEdit = overview?.role === "owner" || overview?.role === "editor";
  const canConfigure = overview?.role === "owner";
  const paypal = overview?.integrations.find((item) => item.provider === "paypal");
  const resend = overview?.integrations.find((item) => item.provider === "resend");

  async function saveBrand(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/client/brand", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId, brand: { name: brand.name, mark: brand.mark, descriptor: brand.descriptor, tagline: brand.tagline }, hero: brand.hero, contactEmail: brand.contactEmail, tradeEmail: brand.tradeEmail, colors }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to save brand settings.");
      setNotice({ tone: "success", text: "Brand settings saved to the draft storefront." });
      await Promise.all([loadOverview(), loadOperations()]);
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to save brand settings." }); }
    finally { setBusy(false); }
  }

  async function saveProduct(product: PortalProduct) {
    setBusy(true);
    try {
      const response = await fetch("/api/client/products", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId, ...product }) });
      const payload = await response.json().catch(() => ({})) as { product?: PortalProduct; error?: string };
      if (!response.ok || !payload.product) throw new Error(payload.error || "Unable to save product.");
      setProducts((current) => current.map((item) => item.id === product.id ? payload.product as PortalProduct : item));
      setNotice({ tone: "success", text: `${product.name} saved to the draft catalog.` });
      await loadOperations();
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to save product." }); }
    finally { setBusy(false); }
  }

  async function importProducts(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const body = { siteId, productCsv: text };
      const previewResponse = await fetch("/api/client/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, dryRun: true }) });
      const preview = await previewResponse.json().catch(() => ({})) as { valid?: boolean; errors?: string[]; error?: string; summary?: { importedProducts?: number } };
      if (!previewResponse.ok || !preview.valid) throw new Error(preview.error || preview.errors?.join(" ") || "The product file failed validation.");
      const response = await fetch("/api/client/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({})) as { catalog?: PortalProduct[]; importedProducts?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to import products.");
      if (payload.catalog) setProducts(payload.catalog);
      await Promise.all([loadOverview(), loadOperations()]);
      setNotice({ tone: "success", text: `Validated import complete. ${payload.importedProducts || preview.summary?.importedProducts || 0} product rows processed.` });
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to import products." }); }
    finally { setBusy(false); event.target.value = ""; }
  }

  function exportProducts() {
    downloadText(`${activeSite?.slug || "client-site"}-products.csv`, productCsv(products), "text/csv;charset=utf-8");
    setNotice({ tone: "success", text: "Draft product CSV exported." });
  }

  async function loadOrderDetail(orderId: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/client/orders?siteId=${encodeURIComponent(siteId)}&orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as ClientOrderDetail & { error?: string };
      if (!response.ok || !payload.order) throw new Error(payload.error || "Unable to load order detail.");
      setOrderDetail(payload);
      setAfterSales((current) => [...current.filter((item) => item.orderId !== orderId), ...(payload.afterSales || [])]);
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to load order detail." }); }
    finally { setBusy(false); }
  }

  async function updateInventory(row: InventoryRow, quantity: number) {
    setBusy(true);
    try {
      const response = await fetch("/api/client/inventory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId, productId: row.productId, variantId: row.variantId, quantity }) });
      const payload = await response.json().catch(() => ({})) as { inventory?: InventoryRow; error?: string };
      if (!response.ok || !payload.inventory) throw new Error(payload.error || "Unable to adjust inventory.");
      setInventory((current) => current.map((item) => item.productId === row.productId && item.variantId === row.variantId ? { ...item, ...payload.inventory } : item));
      setNotice({ tone: "success", text: `${row.sku} inventory adjusted.` });
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to adjust inventory." }); }
    finally { setBusy(false); }
  }

  async function saveIntegration(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/client/integrations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId, ...integrationForm }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to save integration settings.");
      setIntegrationForm((current) => ({ ...current, clientId: "", clientSecret: "", webhookId: "", apiKey: "", fromEmail: "" }));
      setNotice({ tone: "success", text: "Credentials were encrypted and saved for this tenant only." });
      await Promise.all([loadOverview(), loadOperations()]);
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to save integration settings." }); }
    finally { setBusy(false); }
  }

  async function submitAfterSales(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/client/after-sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId, ...afterSalesForm, requestedAmount: afterSalesForm.requestedAmount ? Number(afterSalesForm.requestedAmount) : undefined }) });
      const payload = await response.json().catch(() => ({})) as { request?: AfterSales; error?: string };
      if (!response.ok || !payload.request) throw new Error(payload.error || "Unable to submit after-sales request.");
      setAfterSales((current) => [payload.request as AfterSales, ...current]);
      setAfterSalesForm((current) => ({ ...current, reason: "", requestedAmount: "", customerNote: "" }));
      await loadOperations();
      setNotice({ tone: "success", text: "After-sales request submitted and is now visible to operations." });
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to submit after-sales request." }); }
    finally { setBusy(false); }
  }

  async function requestRelease() {
    setBusy(true);
    try {
      const response = await fetch("/api/cms/releases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId, label: "Client storefront release", note: releaseNote }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to request release.");
      setReleaseNote("");
      await loadOperations();
      setNotice({ tone: "success", text: "Release request sent to the site owner." });
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to request release." }); }
    finally { setBusy(false); }
  }

  async function copyPreviewShare() {
    setBusy(true);
    try {
      const response = await fetch("/api/cms/preview-share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId, hours: 24 }) });
      const payload = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error || "Unable to create preview link.");
      await navigator.clipboard?.writeText(payload.url);
      setNotice({ tone: "success", text: "24-hour draft preview link copied." });
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to create preview link." }); }
    finally { setBusy(false); }
  }

  function updateLocalProduct(productId: string, patch: Partial<PortalProduct>) {
    setProducts((current) => current.map((item) => item.id === productId ? { ...item, ...patch } : item));
  }

  function updateLocalVariant(productId: string, variantId: string, patch: Partial<ProductVariant>) {
    setProducts((current) => current.map((product) => product.id === productId ? { ...product, variants: product.variants.map((variant) => variant.id === variantId ? { ...variant, ...patch } : variant) } : product));
  }

  if (!overview) return <main className="client-portal"><div className="client-portal-card"><p className="eyebrow">Client workspace</p><h1>Loading your storefront.</h1><p className="v6-muted">Signed in as {userName}. Reading the tenant draft and operational status...</p></div></main>;

  return <main className="client-portal">
    <header className="client-portal-header"><div><p className="eyebrow">Northline CMS / V24 client portal</p><h1>Run {activeSite?.name || overview.siteId} yourself.</h1><p className="v6-muted">Signed in as {userName}. Draft edits, fulfillment and release requests stay isolated to this client site.</p></div><div className="client-portal-actions"><button type="button" className="button button-outline" onClick={() => void copyPreviewShare()} disabled={!canEdit || busy}>Copy draft link</button><a className="button button-dark" href={`/admin?tab=v24&siteId=${encodeURIComponent(siteId)}`}>Open launch center →</a></div></header>
    {notice && <div className={`client-notice ${notice.tone}`} role="status">{notice.text}<button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notification">×</button></div>}
    <section className="client-portal-toolbar"><label className="v6-field"><span>Client site</span><select value={siteId} onChange={(event) => setSiteId(event.target.value)}>{sites.map((site) => <option key={site.id} value={site.id}>{site.name} · {site.slug}</option>)}</select></label><div className="client-stat"><span>Role</span><strong>{overview.role}</strong></div><div className="client-stat"><span>Draft products</span><strong>{overview.snapshot.catalog.length}</strong></div><div className="client-stat"><span>Orders</span><strong>{overview.orders.length}</strong></div><div className="client-stat"><span>Available units</span><strong>{overview.inventory.units}</strong></div></section>
    <nav className="client-portal-tabs" aria-label="Client portal sections">{(["brand", "products", "orders", "after-sales", "operations", "integrations"] as const).map((item) => <button type="button" key={item} className={section === item ? "is-active" : ""} onClick={() => setSection(item)}>{item === "brand" ? "Brand & storefront" : item === "products" ? "Products & stock" : item === "orders" ? "Orders" : item === "after-sales" ? "After-sales" : item === "operations" ? "Launch operations" : "Payments & email"}</button>)}</nav>

    {section === "brand" && <form className="client-portal-grid" onSubmit={saveBrand}><article className="client-portal-card"><p className="eyebrow">White-label identity</p><h2>Keep the storefront on brand.</h2><div className="v6-form-grid"><label className="v6-field"><span>Brand name</span><input value={brand.name} onChange={(event) => setBrand((current) => ({ ...current, name: event.target.value }))} disabled={!canEdit} /></label><label className="v6-field"><span>Logo mark</span><input value={brand.mark} onChange={(event) => setBrand((current) => ({ ...current, mark: event.target.value }))} disabled={!canEdit} /></label><label className="v6-field"><span>Tagline</span><input value={brand.tagline} onChange={(event) => setBrand((current) => ({ ...current, tagline: event.target.value }))} disabled={!canEdit} /></label><label className="v6-field"><span>Descriptor</span><input value={brand.descriptor} onChange={(event) => setBrand((current) => ({ ...current, descriptor: event.target.value }))} disabled={!canEdit} /></label><label className="v6-field"><span>Hero image URL</span><input value={brand.hero} onChange={(event) => setBrand((current) => ({ ...current, hero: event.target.value }))} disabled={!canEdit} /></label><label className="v6-field"><span>Customer contact email</span><input type="email" value={brand.contactEmail} onChange={(event) => setBrand((current) => ({ ...current, contactEmail: event.target.value }))} disabled={!canEdit} /></label><label className="v6-field"><span>Trade email</span><input type="email" value={brand.tradeEmail} onChange={(event) => setBrand((current) => ({ ...current, tradeEmail: event.target.value }))} disabled={!canEdit} /></label></div><div className="client-color-grid">{["ink", "paper", "warm", "rust", "sage"].map((key) => <label className="v6-field" key={key}><span>{key}</span><input type="text" value={colors[key] || ""} onChange={(event) => setColors((current) => ({ ...current, [key]: event.target.value }))} disabled={!canEdit} /></label>)}</div><button className="button button-dark" disabled={!canEdit || busy}>{busy ? "Saving..." : "Save draft storefront"}</button></article><aside className="client-portal-card client-portal-callout"><p className="eyebrow">Delivery rule</p><h2>Draft first. Publish with approval.</h2><p className="v6-muted">The public storefront stays on the last published version until the release checks pass and an owner approves the request.</p><div className="client-check-list"><span>✓ Tenant data isolated by site ID</span><span>✓ Autosaved to the CMS draft</span><span>✓ Preview links expire automatically</span></div></aside></form>}

    {section === "products" && <section className="client-portal-card"><div className="v6-card-heading"><div><p className="eyebrow">Catalog operations</p><h2>Update products without a developer.</h2></div><div className="v6-actions"><button type="button" className="button button-outline" onClick={() => importInput.current?.click()} disabled={!canEdit || busy}>Import CSV</button><input ref={importInput} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void importProducts(event)} /><button type="button" className="button button-outline" onClick={exportProducts} disabled={!products.length}>Export CSV</button></div></div><p className="v6-help">CSV import validates first, then writes a rollback backup. Product image URLs can be separated with <code>|</code>; saved variants keep their SKU and stock fields.</p><div className="client-product-list">{products.map((product) => <article key={product.id} className="client-product-row"><div className="client-product-main"><strong>{product.name}</strong><small>{product.category} · {product.status} · {product.variants.length} variant(s)</small><label className="v6-field"><span>Primary image URL</span><input value={product.image} disabled={!canEdit} onChange={(event) => updateLocalProduct(product.id, { image: event.target.value, images: [event.target.value, ...product.images.filter((image) => image !== event.target.value)] })} /></label><label className="v6-field"><span>Bind uploaded media</span><select value="" disabled={!canEdit} onChange={(event) => { if (event.target.value) updateLocalProduct(product.id, { image: event.target.value, images: [event.target.value, ...product.images.filter((image) => image !== event.target.value)] }); }}><option value="">Choose asset...</option>{assets.map((asset) => <option value={asset.url} key={asset.id}>{asset.assetKey}</option>)}</select></label></div><label className="v6-field"><span>SKU</span><input value={product.sku} disabled={!canEdit} onChange={(event) => updateLocalProduct(product.id, { sku: event.target.value })} /></label><label className="v6-field"><span>Price</span><input type="number" min="0" step="0.01" value={product.price} disabled={!canEdit} onChange={(event) => updateLocalProduct(product.id, { price: Number(event.target.value) })} /></label><label className="v6-field"><span>Stock</span><input type="number" min="0" step="1" value={product.stock} disabled={!canEdit} onChange={(event) => updateLocalProduct(product.id, { stock: Number(event.target.value) })} /></label><label className="v6-field"><span>Status</span><select value={product.status} disabled={!canEdit} onChange={(event) => updateLocalProduct(product.id, { status: event.target.value as "active" | "draft" })}><option value="active">Active</option><option value="draft">Draft</option></select></label><div className="client-variant-list"><strong>Variant / SKU management</strong>{product.variants.map((variant) => <div key={variant.id}><input aria-label={`${product.name} variant label`} value={variant.label} disabled={!canEdit} onChange={(event) => updateLocalVariant(product.id, variant.id, { label: event.target.value })} /><input aria-label={`${product.name} variant SKU`} value={variant.sku} disabled={!canEdit} onChange={(event) => updateLocalVariant(product.id, variant.id, { sku: event.target.value })} /><input aria-label={`${product.name} variant stock`} type="number" min="0" value={variant.stock ?? 0} disabled={!canEdit} onChange={(event) => updateLocalVariant(product.id, variant.id, { stock: Number(event.target.value) })} /></div>)}</div><button type="button" className="button button-outline" disabled={!canEdit || busy} onClick={() => void saveProduct(product)}>Save draft</button></article>)}</div>{!products.length && <div className="v6-empty">No products in this tenant draft.</div>}<div className="v6-divider"><div className="v6-card-heading"><div><p className="eyebrow">Live inventory</p><h3>{inventory.filter((row) => row.quantity - row.reservedQuantity <= 5).length} low-stock rows.</h3></div><span>Reserved stock cannot be reduced.</span></div><div className="v24-release-list">{inventory.map((row) => <div key={`${row.productId}-${row.variantId}`}><div><strong>{row.productName || row.productId} · {row.variantLabel || row.variantId}</strong><small>{row.sku} · {row.reservedQuantity} reserved · {Math.max(0, row.quantity - row.reservedQuantity)} available</small></div><label className="v6-inline-input"><span className="sr-only">Inventory quantity</span><input type="number" min={row.reservedQuantity} value={row.quantity} disabled={!canEdit || busy} onChange={(event) => setInventory((current) => current.map((item) => item.productId === row.productId && item.variantId === row.variantId ? { ...item, quantity: Number(event.target.value) } : item))} onBlur={(event) => void updateInventory(row, Number(event.target.value))} /></label></div>)}{!inventory.length && <div className="v6-empty">Inventory initializes from the published catalog.</div>}</div></div></section>}

    {section === "orders" && <section className="client-portal-card"><div className="v6-card-heading"><div><p className="eyebrow">Customer orders</p><h2>Know what needs attention.</h2></div><div className="v6-actions"><button type="button" className="text-button" onClick={() => downloadText(`${activeSite?.slug || "client-site"}-orders.csv`, ["Order,Created,Customer,Email,Payment,Fulfillment,Total,Tracking", ...overview.orders.map((order) => [order.orderNumber, order.createdAt, order.customerName, order.email, order.paymentStatus, order.fulfillmentStatus, order.total.toFixed(2), order.trackingNumber || ""].map(csvEscape).join(","))].join("\n"), "text/csv;charset=utf-8")}>Export orders</button><a className="text-link" href={`/admin?tab=commerce&siteId=${encodeURIComponent(siteId)}`}>Open fulfilment controls →</a></div></div><div className="client-order-list">{overview.orders.map((order) => <article key={order.id}><button type="button" className="client-order-button" onClick={() => void loadOrderDetail(order.id)}><strong>{order.orderNumber}</strong><small>{order.customerName} · {order.email} · {new Date(order.createdAt).toLocaleString()}</small></button><span>{formatMoney(order.total, order.currency)}</span><span className="v22-status">{order.paymentStatus} / {order.fulfillmentStatus}</span><small>{order.trackingNumber ? `Tracking: ${order.trackingNumber}` : "No tracking number yet"}</small></article>)}{!overview.orders.length && <div className="v6-empty">No orders have been created for this site yet.</div>}</div>{orderDetail && <article className="v24-order-detail"><div className="v6-card-heading"><div><p className="eyebrow">Order detail</p><h3>{orderDetail.order.orderNumber}</h3></div><span>{orderDetail.order.paymentStatus} / {orderDetail.order.fulfillmentStatus}</span></div><div className="v6-grid"><div><p className="eyebrow">Customer & delivery</p><p>{orderDetail.order.customerName}<br />{orderDetail.order.email}</p><p>{Object.values(orderDetail.order.shippingAddress).filter(Boolean).join(", ")}</p>{orderDetail.order.trackingNumber && <p><strong>Tracking:</strong> {orderDetail.order.trackingNumber}</p>}</div><div><p className="eyebrow">Items</p>{orderDetail.items.map((item) => <p key={item.id}>{item.name} / {item.variantLabel} · {item.quantity} · {formatMoney(item.unitPrice * item.quantity, orderDetail.order.currency)}</p>)}</div></div><div className="v6-divider"><p className="eyebrow">Timeline</p>{orderDetail.stateEvents.map((event) => <div className="v6-inline-row" key={event.id}><span>{event.toStatus}<small>{new Date(event.createdAt).toLocaleString()} · {event.reason || "status update"}</small></span></div>)}{orderDetail.stateEvents.length === 0 && <p className="v6-muted">No fulfillment events recorded yet.</p>}</div><div className="v6-divider"><p className="eyebrow">Refunds & after-sales</p>{orderDetail.refunds.map((refund) => <div className="v6-inline-row" key={refund.id}><span>{formatMoney(refund.amount, refund.currency)} · {refund.status}<small>{refund.reason || "No reason"} · {new Date(refund.createdAt).toLocaleString()}</small></span></div>)}{orderDetail.afterSales.map((request) => <div className="v6-inline-row" key={request.id}><span>{request.requestType} · {request.status}<small>{request.reason}</small></span></div>)}{!orderDetail.refunds.length && !orderDetail.afterSales.length && <p className="v6-muted">No refunds or after-sales requests for this order.</p>}</div></article>}</section>}

    {section === "after-sales" && <section className="client-portal-grid"><article className="client-portal-card"><p className="eyebrow">Support request</p><h2>Submit a verified after-sales case.</h2><form className="v6-form" onSubmit={submitAfterSales}><label className="v6-field"><span>Order number</span><input required value={afterSalesForm.orderNumber} onChange={(event) => setAfterSalesForm((current) => ({ ...current, orderNumber: event.target.value }))} placeholder="NLS-10001" /></label><label className="v6-field"><span>Order email</span><input required type="email" value={afterSalesForm.email} onChange={(event) => setAfterSalesForm((current) => ({ ...current, email: event.target.value }))} /></label><label className="v6-field"><span>Request type</span><select value={afterSalesForm.requestType} onChange={(event) => setAfterSalesForm((current) => ({ ...current, requestType: event.target.value }))}><option value="return">Return</option><option value="refund">Refund</option><option value="exchange">Exchange</option></select></label><label className="v6-field"><span>Reason</span><input required value={afterSalesForm.reason} onChange={(event) => setAfterSalesForm((current) => ({ ...current, reason: event.target.value }))} /></label><label className="v6-field"><span>Requested amount (optional)</span><input type="number" min="0.01" step="0.01" value={afterSalesForm.requestedAmount} onChange={(event) => setAfterSalesForm((current) => ({ ...current, requestedAmount: event.target.value }))} /></label><label className="v6-field"><span>Customer note</span><textarea value={afterSalesForm.customerNote} onChange={(event) => setAfterSalesForm((current) => ({ ...current, customerNote: event.target.value }))} /></label><button className="button button-dark" disabled={!canEdit || busy}>Submit request →</button><p className="v6-help">The order number and email must match a paid order. Operations can approve, reject or complete the case from the existing after-sales queue.</p></form></article><article className="client-portal-card"><div className="v6-card-heading"><div><p className="eyebrow">Case status</p><h2>Track every request.</h2></div><span>{afterSales.filter((item) => !["completed", "rejected"].includes(item.status)).length} open</span></div><div className="v24-release-list">{afterSales.map((request) => <div key={request.id}><div><strong>{request.orderNumber || request.orderId} · {request.requestType}</strong><small>{request.status} · {new Date(request.createdAt).toLocaleString()}</small><p>{request.reason}{request.adminNote ? ` · Operator: ${request.adminNote}` : ""}</p></div></div>)}{!afterSales.length && <div className="v6-empty">No after-sales cases for this site.</div>}</div></article></section>}

    {section === "operations" && <section className="v24-launch-shell">{launch && <><div className="v6-card v24-launch-hero"><div><p className="eyebrow">Tenant launch status</p><h2>{launch.readiness.score}% ready for the next release.</h2><p className="v6-muted">Resolve blockers, request owner approval, then keep the published storefront stable while draft work continues.</p></div><div className="v24-score"><strong>{launch.operations.availableUnits}</strong><span>available units</span></div></div><div className="v24-metrics"><div><span>Orders</span><strong>{launch.operations.orders}</strong></div><div><span>Paid</span><strong>{launch.operations.paidOrders}</strong></div><div><span>After-sales</span><strong>{launch.operations.openAfterSales}</strong></div><div><span>Low stock</span><strong>{launch.operations.lowStock}</strong></div><div><span>Failed events</span><strong>{launch.operations.failedEvents}</strong></div></div><div className="v6-grid"><article className="v6-card"><p className="eyebrow">Blockers</p><h3>{launch.readiness.blockers.length} item(s) need attention.</h3><div className="v24-list">{launch.readiness.blockers.map((item) => <div key={item.key}><span className="v24-dot error">!</span><span><strong>{item.label}</strong><small>{item.detail}</small></span></div>)}{!launch.readiness.blockers.length && <div className="v6-empty">No blockers detected.</div>}</div></article><article className="v6-card"><p className="eyebrow">Release request</p><h3>Send the draft to an owner.</h3><label className="v6-field"><span>Review note</span><textarea value={releaseNote} onChange={(event) => setReleaseNote(event.target.value)} disabled={!canEdit} placeholder="Summarize what changed." /></label><button type="button" className="button button-dark" onClick={() => void requestRelease()} disabled={!canEdit || busy || !launch.diff.totalChanges}>Request approval →</button><div className="v24-release-list">{launch.releases.slice(0, 5).map((release) => <div key={release.id}><div><strong>{release.status}</strong><small>{release.label} · {new Date(release.requestedAt).toLocaleString()}</small></div></div>)}</div></article></div></>}</section>}

    {section === "integrations" && <section className="client-portal-grid"><article className="client-portal-card"><div className="v6-card-heading"><div><p className="eyebrow">Production configuration</p><h2>PayPal and Resend stay tenant-scoped.</h2></div><span>{canConfigure ? "Owner" : "Read only"}</span></div><div className="integration-status-grid"><div><strong>PayPal</strong><span className={`v22-status ${paypal?.status || "missing"}`}>{paypal?.status || "missing"}</span><small>{paypal?.source || "missing"} · {paypal?.environment || "sandbox"}</small></div><div><strong>Resend</strong><span className={`v22-status ${resend?.status || "missing"}`}>{resend?.status || "missing"}</span><small>{resend?.source || "missing"} · {resend?.fromDomain || "sender domain not set"}</small></div></div><p className="v6-help">Secrets never return to the browser. CMS_SECRETS_KEY must be configured in the production environment before saving.</p>{canConfigure && <form className="v6-form" onSubmit={saveIntegration}><label className="v6-field"><span>Provider</span><select value={integrationForm.provider} onChange={(event) => setIntegrationForm((current) => ({ ...current, provider: event.target.value as "paypal" | "resend" }))}><option value="paypal">PayPal</option><option value="resend">Resend</option></select></label>{integrationForm.provider === "paypal" ? <div className="v6-form-grid"><label className="v6-field"><span>Client ID</span><input value={integrationForm.clientId} onChange={(event) => setIntegrationForm((current) => ({ ...current, clientId: event.target.value }))} placeholder="Replace client ID" /></label><label className="v6-field"><span>Client secret</span><input type="password" value={integrationForm.clientSecret} onChange={(event) => setIntegrationForm((current) => ({ ...current, clientSecret: event.target.value }))} placeholder="Replace secret" /></label><label className="v6-field"><span>Webhook ID</span><input value={integrationForm.webhookId} onChange={(event) => setIntegrationForm((current) => ({ ...current, webhookId: event.target.value }))} placeholder="Webhook ID" /></label><label className="v6-field"><span>Environment</span><select value={integrationForm.environment} onChange={(event) => setIntegrationForm((current) => ({ ...current, environment: event.target.value }))}><option value="sandbox">Sandbox</option><option value="live">Live</option></select></label></div> : <div className="v6-form-grid"><label className="v6-field"><span>Resend API key</span><input type="password" value={integrationForm.apiKey} onChange={(event) => setIntegrationForm((current) => ({ ...current, apiKey: event.target.value }))} placeholder="Replace API key" /></label><label className="v6-field"><span>From email</span><input type="email" value={integrationForm.fromEmail} onChange={(event) => setIntegrationForm((current) => ({ ...current, fromEmail: event.target.value }))} placeholder="orders@client-domain.com" /></label></div>}<button className="button button-dark" disabled={busy}>{busy ? "Encrypting..." : "Save encrypted credentials"}</button></form>}</article><aside className="client-portal-card client-portal-callout"><p className="eyebrow">Preview and release</p><h2>Keep changes reviewable.</h2><p className="v6-muted">Use a temporary preview link for client sign-off. Release approval and rollback are controlled from the V24 launch center.</p><button type="button" className="button button-outline" onClick={() => void copyPreviewShare()} disabled={!canEdit || busy}>Copy draft preview link</button></aside></section>}
  </main>;
}
