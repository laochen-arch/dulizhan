"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CmsAsset, CmsMember, CmsRevision, CmsSite, CmsRole } from "../../db/cms";
import { products as templateProducts, type Product } from "../data/products";
import { type EditableSiteConfig, useSiteRuntime } from "../components/site-runtime";

type AdminTab = "overview" | "brand" | "products" | "media" | "access" | "versions";
type Notice = { tone: "success" | "error" | "info"; text: string } | null;

const tabs: Array<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "brand", label: "Brand & content" },
  { id: "products", label: "Products" },
  { id: "media", label: "Media library" },
  { id: "access", label: "Access" },
  { id: "versions", label: "Versions" },
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0,  fifty);
}

const fifty = 50;

function csvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function productFromRow(headers: string[], values: string[], current: Product[]) {
  const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  const existing = current.find((item) => item.sku === row.sku || item.slug === row.slug);
  const base = clone(existing ?? templateProducts[0]);
  const image = row.image || row.images || base.image;
  const id = row.id || existing?.id || `product-${row.sku || row.slug || crypto.randomUUID().slice(0, 8)}`;
  const name = row.name || base.name;
  const category = row.category || base.category;
  const colors = row.colors ? row.colors.split("|").map((item) => item.trim()).filter(Boolean) : base.colors;
  return {
    ...base,
    id,
    slug: row.slug || slugify(name),
    name,
    shortName: row.shortname || row.shortName || name,
    category,
    sku: row.sku || base.sku,
    status: row.status === "draft" ? "draft" : "active",
    featured: row.featured === "true" || row.featured === "1",
    price: Number(row.price || base.price),
    compareAt: row.compareat ? Number(row.compareat) : base.compareAt,
    description: row.description || base.description,
    details: row.details || base.details,
    image,
    images: image.split("|").map((item) => item.trim()).filter(Boolean),
    alt: row.alt || base.alt,
    badge: row.badge || base.badge,
    colors,
    options: [{ name: "Color", values: colors }],
    tags: (row.tags || base.tags.join("|")).split("|").map((item) => item.trim()).filter(Boolean),
    stock: Number(row.stock || 0),
    relatedSlugs: (row.relatedslugs || base.relatedSlugs.join("|")).split("|").map((item) => item.trim()).filter(Boolean),
  } as Product;
}

function launchChecks(config: EditableSiteConfig, catalog: Product[]) {
  return [
    { label: "Brand name and mark", done: Boolean(config.brand.name && config.brand.mark) },
    { label: "Hero image", done: Boolean(config.assets.hero) },
    { label: "SEO title and description", done: Boolean(config.seo.title && config.seo.description) },
    { label: "Homepage copy", done: Boolean(config.content.home.heroTitleLead && config.content.home.heroBody) },
    { label: "At least one product", done: catalog.length > 0 },
    { label: "Every product has an image", done: catalog.length > 0 && catalog.every((product) => product.image && product.images.length > 0) },
    { label: "At least one active product", done: catalog.some((product) => product.status === "active") },
    { label: "Shipping and returns copy", done: Boolean(config.content.policies.shippingLead && config.content.policies.returnsLead) },
  ];
}

function Field({ label, value, onChange, multiline = false, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; placeholder?: string }) {
  return (
    <label className="v6-field">
      <span>{label}</span>
      {multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /> : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />}
    </label>
  );
}

export function AdminStudioV6() {
  const runtime = useSiteRuntime();
  const { config, catalog, cmsError, cmsMode, cmsRole, cmsStatus, activeSiteId, site, updateCatalog, updateConfig, refreshCms, setActiveSiteId, publishCms, fetchRevisions, rollbackCms } = runtime;
  const [tab, setTab] = useState<AdminTab>("overview");
  const [sites, setSites] = useState<CmsSite[]>([]);
  const [members, setMembers] = useState<CmsMember[]>([]);
  const [assets, setAssets] = useState<CmsAsset[]>([]);
  const [revisions, setRevisions] = useState<CmsRevision[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [siteForm, setSiteForm] = useState({ name: "", slug: "" });
  const [memberForm, setMemberForm] = useState({ email: "", role: "editor" as CmsRole });
  const [mediaForm, setMediaForm] = useState({ kind: "hero", alt: "" });
  const [productSearch, setProductSearch] = useState("");
  const [productFilter, setProductFilter] = useState("all");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);

  const checks = useMemo(() => launchChecks(config, catalog), [catalog, config]);
  const filteredProducts = useMemo(() => catalog.filter((product) => {
    const query = productSearch.toLowerCase().trim();
    const matchesQuery = !query || [product.name, product.sku, product.category].some((value) => value.toLowerCase().includes(query));
    const matchesStatus = productFilter === "all" || product.status === productFilter;
    return matchesQuery && matchesStatus;
  }), [catalog, productFilter, productSearch]);

  const loadSites = useCallback(async () => {
    const response = await fetch("/api/cms/sites", { cache: "no-store" });
    if (response.status === 401) {
      setAuthRequired(true);
      return;
    }
    const payload = await response.json().catch(() => ({})) as { sites?: CmsSite[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to load client sites.");
    setAuthRequired(false);
    const nextSites = payload.sites ?? [];
    setSites(nextSites);
    if (nextSites.length && !nextSites.some((item) => item.id === activeSiteId)) setActiveSiteId(nextSites[0].id);
  }, [activeSiteId, setActiveSiteId]);

  const loadWorkspaceData = useCallback(async () => {
    const query = `?siteId=${encodeURIComponent(activeSiteId)}`;
    const [membersResponse, assetsResponse, revisionsResponse] = await Promise.all([
      fetch(`/api/cms/members${query}`, { cache: "no-store" }),
      fetch(`/api/cms/assets${query}`, { cache: "no-store" }),
      fetch(`/api/cms/revisions${query}`, { cache: "no-store" }),
    ]);
    const [membersPayload, assetsPayload, revisionsPayload] = await Promise.all([
      membersResponse.json().catch(() => ({})),
      assetsResponse.json().catch(() => ({})),
      revisionsResponse.json().catch(() => ({})),
    ]) as [{ members?: CmsMember[] }, { assets?: CmsAsset[] }, { revisions?: CmsRevision[] }];
    if (membersResponse.ok) setMembers(membersPayload.members ?? []);
    if (assetsResponse.ok) setAssets(assetsPayload.assets ?? []);
    if (revisionsResponse.ok) setRevisions(revisionsPayload.revisions ?? []);
  }, [activeSiteId]);

  useEffect(() => {
    // The loader synchronizes external CMS state into this client workspace.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSites().catch((error) => setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to load sites." }));
  }, [loadSites]);

  useEffect(() => {
    // The loader synchronizes external CMS state into this client workspace.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!authRequired) void loadWorkspaceData();
  }, [authRequired, loadWorkspaceData]);

  const setBrand = (field: "name" | "mark" | "descriptor" | "tagline" | "footerLine" | "originLine", value: string) => {
    updateConfig((current) => {
      current.brand[field] = value;
      return current;
    });
  };

  const setHome = (field: "heroLabel" | "heroTitleLead" | "heroTitleAccent" | "heroBody" | "heroCta" | "introTitleLead" | "introTitleAccent" | "introBody" | "storyTitleLead" | "storyTitleAccent" | "storyBody" | "newsletterTitleLead" | "newsletterTitleAccent" | "newsletterBody", value: string) => {
    updateConfig((current) => {
      current.content.home[field] = value;
      return current;
    });
  };

  const createClientSite = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/cms/sites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(siteForm) });
      const payload = await response.json().catch(() => ({})) as { site?: CmsSite; error?: string };
      if (!response.ok || !payload.site) throw new Error(payload.error || "Unable to create client site.");
      setSites((current) => [...current, payload.site as CmsSite]);
      setSiteForm({ name: "", slug: "" });
      setActiveSiteId(payload.site.id);
      setNotice({ tone: "success", text: "Client site created. Add content, then publish when the launch checks pass." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to create client site." });
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    const result = await publishCms("V6 storefront release");
    setBusy(false);
    if (!result.ok) setNotice({ tone: "error", text: result.checks?.length ? `${result.error || "Publish checks failed"} ${result.checks.join(" · ")}` : result.error || "Publish failed." });
    else {
      setNotice({ tone: "success", text: "Draft published. The public storefront now uses this version." });
      await refreshCms();
      setRevisions(await fetchRevisions());
    }
  };

  const saveMember = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/cms/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, ...memberForm }) });
      const payload = await response.json().catch(() => ({})) as { member?: CmsMember; error?: string };
      if (!response.ok || !payload.member) throw new Error(payload.error || "Unable to add member.");
      setMembers((current) => [...current.filter((member) => member.userId !== payload.member?.userId), payload.member as CmsMember]);
      setMemberForm({ email: "", role: "editor" });
      setNotice({ tone: "success", text: "Member access saved. Connect this email to your auth provider when you add invitations." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to add member." });
    } finally {
      setBusy(false);
    }
  };

  const uploadMedia = async (event: React.FormEvent) => {
    event.preventDefault();
    const file = mediaInput.current?.files?.[0];
    if (!file) return setNotice({ tone: "error", text: "Choose an image first." });
    setBusy(true);
    try {
      const formData = new FormData();
      formData.set("siteId", activeSiteId);
      formData.set("kind", mediaForm.kind);
      formData.set("alt", mediaForm.alt);
      formData.set("file", file);
      const response = await fetch("/api/cms/assets", { method: "POST", body: formData });
      const payload = await response.json().catch(() => ({})) as { asset?: CmsAsset; error?: string };
      if (!response.ok || !payload.asset) throw new Error(payload.error || "Upload failed.");
      setAssets((current) => [payload.asset as CmsAsset, ...current]);
      setMediaForm({ kind: "hero", alt: "" });
      if (mediaForm.kind === "hero") updateConfig((current) => { current.assets.hero = payload.asset?.url || current.assets.hero; return current; });
      setNotice({ tone: "success", text: "Image uploaded to the client site media library." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setBusy(false);
    }
  };

  const deleteMedia = async (asset: CmsAsset) => {
    if (!window.confirm(`Delete ${asset.assetKey}?`)) return;
    const response = await fetch(`/api/cms/assets?siteId=${encodeURIComponent(activeSiteId)}&assetId=${encodeURIComponent(asset.id)}`, { method: "DELETE" });
    if (response.ok) setAssets((current) => current.filter((item) => item.id !== asset.id));
    else setNotice({ tone: "error", text: "Unable to delete this asset." });
  };

  const importCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const rows = csvRows(await file.text());
      if (rows.length < 2) throw new Error("CSV needs a header row and at least one product row.");
      const headers = rows[0].map((header) => header.trim().toLowerCase());
      const imported = rows.slice(1).map((row) => productFromRow(headers, row, catalog));
      updateCatalog((current) => {
        const next = [...current];
        imported.forEach((product) => {
          const index = next.findIndex((item) => item.sku === product.sku || item.slug === product.slug);
          if (index >= 0) next[index] = product;
          else next.push(product);
        });
        return next;
      });
      setNotice({ tone: "success", text: `${imported.length} product row${imported.length === 1 ? "" : "s"} imported into the draft.` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "CSV import failed." });
    } finally {
      event.target.value = "";
    }
  };

  const exportCsv = () => {
    const headers = ["id", "name", "slug", "shortName", "category", "sku", "status", "featured", "price", "compareAt", "description", "details", "image", "images", "alt", "badge", "colors", "tags", "stock", "relatedSlugs"];
    const lines = [
      headers.join(","),
      ...catalog.map((product) => headers.map((header) => csvEscape(
        header === "images" ? product.images.join("|")
          : header === "colors" ? product.colors.join("|")
            : header === "tags" ? product.tags.join("|")
              : header === "relatedSlugs" ? product.relatedSlugs.join("|")
                : product[header as keyof Product],
      )).join(",")),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${site?.slug || "client-site"}-products.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const saveProduct = () => {
    if (!editingProduct) return;
    updateCatalog((current) => {
      const index = current.findIndex((product) => product.id === editingProduct.id);
      if (index < 0) return [...current, editingProduct];
      const next = [...current];
      next[index] = editingProduct;
      return next;
    });
    setEditingProduct(null);
    setNotice({ tone: "success", text: "Product saved to the draft." });
  };

  const rollback = async (revision: CmsRevision) => {
    if (!window.confirm(`Restore ${revision.label} as the current draft?`)) return;
    setBusy(true);
    const ok = await rollbackCms(revision.id);
    setBusy(false);
    if (ok) {
      setNotice({ tone: "success", text: "Revision restored to draft. Review it, then publish when ready." });
      setRevisions(await fetchRevisions());
    } else setNotice({ tone: "error", text: "Unable to restore this revision." });
  };

  if (authRequired || cmsStatus === "auth-required") {
    return <main className="admin-shell"><div className="container"><div className="v6-auth"><p className="eyebrow">Northline / V6 CMS</p><h1>Sign in to manage client sites.</h1><p>The storefront remains public, while the workspace is protected by ChatGPT sign-in and site-level roles.</p><a className="button button-dark" href="/signin-with-chatgpt?return_to=%2Fadmin">Sign in with ChatGPT <span>↗</span></a></div></div></main>;
  }

  return (
    <main className="admin-shell">
      <div className="container">
        <header className="admin-hero v6-hero">
          <div>
            <p className="eyebrow">White-label CMS / V6</p>
            <h1>Client sites,<br /><em>ready to ship.</em></h1>
            <p>Manage each client storefront from one workspace. Changes stay in draft until the launch checks pass and you publish a version.</p>
          </div>
          <div className="admin-hero-actions">
            <a className="button button-outline" href={`/preview?siteId=${encodeURIComponent(activeSiteId)}`} target="_blank" rel="noreferrer">Open preview <span>↗</span></a>
            <button className="button button-dark" onClick={() => void publish()} disabled={busy || cmsMode !== "draft" || (cmsRole !== "owner" && cmsRole !== "editor")}>Publish draft <span>↗</span></button>
          </div>
        </header>

        <div className="v6-sitebar">
          <label><span>Active client site</span><select value={activeSiteId} onChange={(event) => setActiveSiteId(event.target.value)}>{sites.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.slug}</option>)}</select></label>
          <div className="v6-site-meta"><strong>{site?.name || "Loading site…"}</strong><span>{cmsRole ? `${cmsRole} access` : "Draft workspace"}</span><span className={`v6-status ${cmsStatus}`}>{cmsStatus.replace("-", " ")}</span></div>
        </div>

        {notice && <div className={`v6-notice ${notice.tone}`} role="status">{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss message">×</button></div>}
        {cmsError && <div className="v6-notice error" role="alert">{cmsError}</div>}

        <nav className="admin-toolbar v6-tabs" aria-label="CMS sections">
          <div className="admin-tabs">{tabs.map((item) => <button key={item.id} className={tab === item.id ? "is-active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
          <span>Draft changes autosave · public stays on published version</span>
        </nav>

        {tab === "overview" && <section className="v6-grid v6-overview">
          <div className="v6-card v6-card-large"><p className="eyebrow">Launch readiness</p><h2>{checks.filter((check) => check.done).length}/{checks.length} checks ready.</h2><p className="v6-muted">Publish creates a revision that can be rolled back from the Versions tab.</p><div className="v6-checks">{checks.map((check) => <div className={check.done ? "done" : ""} key={check.label}><span>{check.done ? "✓" : "·"}</span>{check.label}</div>)}</div><button className="button button-dark" onClick={() => void publish()} disabled={busy || checks.some((check) => !check.done)}>Publish when ready <span>↗</span></button></div>
          <div className="v6-card"><p className="eyebrow">Client onboarding</p><h2>Start a new site.</h2><p className="v6-muted">Create an isolated D1 workspace for a new B2B client. Add brand, media and products in draft.</p><form className="v6-form" onSubmit={createClientSite}><Field label="Client name" value={siteForm.name} onChange={(value) => setSiteForm((current) => ({ ...current, name: value, slug: current.slug || slugify(value) }))} placeholder="Acme Outdoor" /><Field label="URL slug" value={siteForm.slug} onChange={(value) => setSiteForm((current) => ({ ...current, slug: slugify(value) }))} placeholder="acme-outdoor" /><button className="button button-outline" disabled={busy || !siteForm.name || !siteForm.slug}>Create client site <span>+</span></button></form></div>
          <div className="v6-card"><p className="eyebrow">V6 handoff</p><h2>One replacement list.</h2><p className="v6-muted">Use the B2B content list to collect the logo, palette, product CSV, legal copy, domain and launch owner before handoff.</p><a className="text-link" href="/about">View storefront example <span>↗</span></a></div>
        </section>}

        {tab === "brand" && <section className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Brand system</p><h2>Replace the client story.</h2></div><span>Autosaved draft</span></div><div className="v6-form-grid"><Field label="Brand name" value={config.brand.name} onChange={(value) => setBrand("name", value)} /><Field label="Logo mark" value={config.brand.mark} onChange={(value) => setBrand("mark", value)} /><Field label="Tagline" value={config.brand.tagline} onChange={(value) => setBrand("tagline", value)} /><Field label="Descriptor" value={config.brand.descriptor} onChange={(value) => setBrand("descriptor", value)} /><Field label="Origin line" value={config.brand.originLine} onChange={(value) => setBrand("originLine", value)} /><Field label="Footer line" value={config.brand.footerLine} onChange={(value) => setBrand("footerLine", value)} /><Field label="Hero label" value={config.content.home.heroLabel} onChange={(value) => setHome("heroLabel", value)} /><Field label="Hero CTA" value={config.content.home.heroCta} onChange={(value) => setHome("heroCta", value)} /><Field label="Hero lead" value={config.content.home.heroTitleLead} onChange={(value) => setHome("heroTitleLead", value)} /><Field label="Hero accent" value={config.content.home.heroTitleAccent} onChange={(value) => setHome("heroTitleAccent", value)} /><Field label="Hero body" value={config.content.home.heroBody} onChange={(value) => setHome("heroBody", value)} multiline /><Field label="Intro body" value={config.content.home.introBody} onChange={(value) => setHome("introBody", value)} multiline /><Field label="Story body" value={config.content.home.storyBody} onChange={(value) => setHome("storyBody", value)} multiline /><Field label="Newsletter body" value={config.content.home.newsletterBody} onChange={(value) => setHome("newsletterBody", value)} multiline /></div><div className="v6-divider"><p className="eyebrow">Theme palette</p><div className="v6-palette">{Object.entries(config.theme.colors).map(([key, value]) => <label key={key}><span>{key}</span><input type="color" value={value.startsWith("#") ? value : "#1d1f1c"} onChange={(event) => updateConfig((current) => { current.theme.colors[key as keyof typeof current.theme.colors] = event.target.value; return current; })} /><input value={value} onChange={(event) => updateConfig((current) => { current.theme.colors[key as keyof typeof current.theme.colors] = event.target.value; return current; })} /></label>)}</div></div></section>}

        {tab === "products" && <section className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Catalog</p><h2>{catalog.length} products in draft.</h2></div><div className="v6-actions"><button className="button button-outline" onClick={() => csvInput.current?.click()}>Import CSV</button><input ref={csvInput} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void importCsv(event)} /><button className="button button-outline" onClick={exportCsv}>Export CSV</button><button className="button button-dark" onClick={() => setEditingProduct({ ...clone(templateProducts[0]), id: `product-${crypto.randomUUID().slice(0, 8)}`, name: "New client product", slug: "new-client-product", sku: `SKU-${catalog.length + 1}` })}>New product <span>+</span></button></div></div><div className="v6-product-tools"><input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search name, SKU or category" /><select value={productFilter} onChange={(event) => setProductFilter(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="draft">Draft</option></select></div><div className="v6-product-list">{filteredProducts.map((product) => <article className="v6-product-row" key={product.id}><img src={product.image} alt="" /><div><strong>{product.name}</strong><span>{product.sku} · {product.category}</span></div><span className={`product-status ${product.status}`}>{product.status}</span><span>${product.price.toFixed(2)} · {product.stock} in stock</span><div className="v6-actions"><button className="text-button" onClick={() => setEditingProduct(clone(product))}>Edit</button><button className="text-button danger" onClick={() => updateCatalog((current) => current.filter((item) => item.id !== product.id))}>Remove</button></div></article>)}{filteredProducts.length === 0 && <div className="v6-empty">No products match this filter. Import a CSV or create a product.</div>}</div><p className="v6-help">CSV columns: name, slug, sku, category, price, stock, status, description, image, tags. Use a vertical bar to separate images, colors or tags.</p></section>}

        {tab === "media" && <section className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">R2 media library</p><h2>Client-owned visual assets.</h2></div><span>10 MB max · images only</span></div><form className="v6-media-upload" onSubmit={uploadMedia}><label className="v6-file-input"><span>Choose image</span><input ref={mediaInput} type="file" accept="image/*" /></label><Field label="Alt text" value={mediaForm.alt} onChange={(value) => setMediaForm((current) => ({ ...current, alt: value }))} placeholder="Describe the image" /><label className="v6-field"><span>Usage</span><select value={mediaForm.kind} onChange={(event) => setMediaForm((current) => ({ ...current, kind: event.target.value }))}><option value="hero">Hero</option><option value="story">Story</option><option value="product">Product</option><option value="general">General</option></select></label><button className="button button-dark" disabled={busy}>Upload to R2 <span>↑</span></button></form><div className="v6-media-grid">{assets.map((asset) => <article className="v6-media-card" key={asset.id}><img src={asset.url} alt={asset.alt} /><div><strong>{asset.assetKey}</strong><span>{asset.kind} · {Math.round(asset.sizeBytes / 1024)} KB</span><div className="v6-actions"><button className="text-button" onClick={() => { void navigator.clipboard?.writeText(asset.url); setNotice({ tone: "success", text: "Asset URL copied." }); }}>Copy URL</button><button className="text-button" onClick={() => updateConfig((current) => { current.assets.hero = asset.url; return current; })}>Use as hero</button><button className="text-button danger" onClick={() => void deleteMedia(asset)}>Delete</button></div></div></article>)}{assets.length === 0 && <div className="v6-empty">Upload the first client image. R2 assets are isolated by site.</div>}</div></section>}

        {tab === "access" && <section className="v6-grid"><div className="v6-card"><p className="eyebrow">Site members</p><h2>Role-based access.</h2><p className="v6-muted">Owners manage members, editors manage draft content and viewers can review the workspace.</p><div className="v6-member-list">{members.map((member) => <div key={`${member.siteId}-${member.userId}`}><span>{member.email}</span><strong>{member.role}</strong></div>)}{members.length === 0 && <div className="v6-empty">No members returned for this site.</div>}</div></div><div className="v6-card"><p className="eyebrow">Add access</p><h2>Invite a collaborator.</h2><form className="v6-form" onSubmit={saveMember}><Field label="Email" value={memberForm.email} onChange={(value) => setMemberForm((current) => ({ ...current, email: value }))} placeholder="client@company.com" /><label className="v6-field"><span>Role</span><select value={memberForm.role} onChange={(event) => setMemberForm((current) => ({ ...current, role: event.target.value as CmsRole }))}><option value="editor">Editor</option><option value="viewer">Viewer</option><option value="owner">Owner</option></select></label><button className="button button-dark" disabled={busy || cmsRole !== "owner" || !memberForm.email}>Save access <span>+</span></button></form>{cmsRole !== "owner" && <p className="v6-help">Only the site owner can change member access.</p>}</div></section>}

        {tab === "versions" && <section className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Release history</p><h2>Drafts you can trust.</h2></div><button className="text-button" onClick={() => void fetchRevisions().then(setRevisions)}>Refresh versions</button></div><div className="v6-version-list">{revisions.map((revision) => <article key={revision.id}><div><strong>{revision.label}</strong><span>{revision.kind} · {new Date(revision.createdAt).toLocaleString()}</span></div><button className="button button-outline" onClick={() => void rollback(revision)} disabled={busy || (cmsRole !== "owner" && cmsRole !== "editor")}>Restore to draft</button></article>)}{revisions.length === 0 && <div className="v6-empty">Published revisions will appear here after the first release.</div>}</div></section>}
      </div>

      {editingProduct && <div className="v6-editor-backdrop"><section className="v6-editor" role="dialog" aria-modal="true" aria-labelledby="product-editor-title"><div className="v6-card-heading"><div><p className="eyebrow">Product editor</p><h2 id="product-editor-title">{editingProduct.name}</h2></div><button className="close-button" onClick={() => setEditingProduct(null)} aria-label="Close editor">×</button></div><div className="v6-form-grid"><Field label="Name" value={editingProduct.name} onChange={(value) => setEditingProduct((current) => current && ({ ...current, name: value, shortName: value, slug: current.slug === slugify(current.name) ? slugify(value) : current.slug }))} /><Field label="Slug" value={editingProduct.slug} onChange={(value) => setEditingProduct((current) => current && ({ ...current, slug: slugify(value) }))} /><Field label="SKU" value={editingProduct.sku} onChange={(value) => setEditingProduct((current) => current && ({ ...current, sku: value }))} /><Field label="Category" value={editingProduct.category} onChange={(value) => setEditingProduct((current) => current && ({ ...current, category: value }))} /><Field label="Price" value={String(editingProduct.price)} onChange={(value) => setEditingProduct((current) => current && ({ ...current, price: Number(value) || 0 }))} /><Field label="Stock" value={String(editingProduct.stock)} onChange={(value) => setEditingProduct((current) => current && ({ ...current, stock: Number(value) || 0 }))} /><Field label="Image URL" value={editingProduct.image} onChange={(value) => setEditingProduct((current) => current && ({ ...current, image: value, images: [value] }))} /><Field label="Tags" value={editingProduct.tags.join("|")} onChange={(value) => setEditingProduct((current) => current && ({ ...current, tags: value.split("|").map((item) => item.trim()).filter(Boolean) }))} /><Field label="Description" value={editingProduct.description} onChange={(value) => setEditingProduct((current) => current && ({ ...current, description: value }))} multiline /><Field label="Details" value={editingProduct.details} onChange={(value) => setEditingProduct((current) => current && ({ ...current, details: value }))} multiline /></div><div className="v6-editor-options"><label className="v6-field"><span>Status</span><select value={editingProduct.status} onChange={(event) => setEditingProduct((current) => current && ({ ...current, status: event.target.value as Product["status"] }))}><option value="active">Active</option><option value="draft">Draft</option></select></label><label className="v6-check-field"><input type="checkbox" checked={editingProduct.featured} onChange={(event) => setEditingProduct((current) => current && ({ ...current, featured: event.target.checked }))} /> Featured product</label></div><div className="editor-actions"><button className="button button-outline" onClick={() => setEditingProduct(null)}>Cancel</button><button className="button button-dark" onClick={saveProduct}>Save product <span>↗</span></button></div></section></div>}
    </main>
  );
}
