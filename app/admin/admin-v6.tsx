"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CmsAsset, CmsAuditLog, CmsDomain, CmsInvitation, CmsLaunchCheck, CmsManualLaunchCheck, CmsMember, CmsReplacementItem, CmsRevision, CmsSchedule, CmsSite, CmsRole, CmsSnapshotDiff } from "../../db/cms";
import type { CmsInventoryRow, CmsOrder, CmsOrderDetail, CmsPaymentEvent } from "../../db/commerce";
import { getCatalogValidationErrors, getProductValidationErrors, products as templateProducts, type Product, type ProductVariant, variantOptionValues } from "../data/products";
import type { HomeModule } from "../data/site-config";
import { type EditableSiteConfig, useSiteRuntime } from "../components/site-runtime";
import { DeliveryPanel, LaunchSetupPanel } from "./launch-panels";
import { formatMoney } from "../lib/format-money";
import { BundleManager, V21OperationsPanel } from "./v21-panels";
import { V22DeliveryWizard, V22OperationsPanel } from "./v22-panels";
import { V23ConfigurationPanel } from "./v23-panels";
import { V24OperationsPanel } from "./v24-panels";
import { PlatformApplicationsPanel } from "./platform-applications-panel";

type AdminTab = "overview" | "merchants" | "setup" | "delivery" | "brand" | "content" | "products" | "media" | "access" | "team" | "domains" | "activity" | "release" | "commerce" | "versions" | "v21" | "v22" | "v23" | "v24";
type Notice = { tone: "success" | "error" | "info"; text: string } | null;
type CommerceConfiguration = { paypal: { clientId: boolean; clientSecret: boolean; webhookId: boolean; mode?: string }; resend: { apiKey: boolean; fromEmail: boolean; fromDomain?: string | null }; webhookEndpoint?: string; environmentKeys?: string[] };
type OnboardingState = { domain?: { hostname: string; status: string } | null; checks: CmsLaunchCheck[]; manualChecks?: CmsManualLaunchCheck[]; replacements: CmsReplacementItem[]; progress: { done: number; total: number }; readiness?: { score: number; done: number; total: number } };

const tabs: Array<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "Workstation" },
  { id: "merchants", label: "Merchant applications" },
  { id: "setup", label: "Platform setup" },
  { id: "delivery", label: "Client delivery" },
  { id: "brand", label: "Storefront identity" },
  { id: "content", label: "Homepage content" },
  { id: "products", label: "Global templates" },
  { id: "media", label: "Media library" },
  { id: "access", label: "Site permissions" },
  { id: "team", label: "Team invitations" },
  { id: "domains", label: "Domains" },
  { id: "activity", label: "Activity log" },
  { id: "release", label: "Publish & rollback" },
  { id: "commerce", label: "Cross-merchant support" },
  { id: "versions", label: "Release history" },
  { id: "v21", label: "Operations health" },
  { id: "v22", label: "Delivery controls" },
  { id: "v23", label: "Environment settings" },
  { id: "v24", label: "Launch checklist" },
];

const adminNavGroups: Array<{ label: string; items: AdminTab[] }> = [
  { label: "Platform work", items: ["overview", "merchants"] },
  { label: "Client delivery", items: ["setup", "delivery", "domains", "v24"] },
  { label: "Global templates", items: ["brand", "content", "products", "media"] },
  { label: "People & permissions", items: ["access", "team"] },
  { label: "Operations & support", items: ["activity", "commerce", "v21", "v22", "v23"] },
  { label: "Publishing", items: ["release", "versions"] },
];

const roleVisibleAdminTabs: Record<CmsRole, AdminTab[]> = {
  owner: tabs.map((item) => item.id),
  editor: ["overview", "merchants", "setup", "delivery", "brand", "content", "products", "media", "domains", "activity", "release", "commerce", "versions", "v21", "v22", "v23", "v24"],
  viewer: ["overview", "merchants", "delivery", "domains", "activity", "versions", "v24"],
};

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

function launchChecks(config: EditableSiteConfig, catalog: Product[]): CmsLaunchCheck[] {
  const commerceErrors = getCatalogValidationErrors(catalog);
  return [
    { key: "brand", label: "Brand name and mark", detail: "Set the client brand name and logo mark.", done: Boolean(config.brand.name && config.brand.mark), required: true },
    { key: "hero", label: "Hero image", detail: "Add the storefront hero image.", done: Boolean(config.assets.hero), required: true },
    { key: "seo", label: "SEO title and description", detail: "Complete the title and description used by search engines.", done: Boolean(config.seo.title && config.seo.description), required: true },
    { key: "homepage", label: "Homepage copy", detail: "Complete the homepage headline and body copy.", done: Boolean(config.content.home.heroTitleLead && config.content.home.heroBody), required: true },
    { key: "products", label: "At least one product", detail: "Add at least one product to the draft catalog.", done: catalog.length > 0, required: true },
    { key: "product-images", label: "Every product has an image", detail: "Every catalog item needs a primary image.", done: catalog.length > 0 && catalog.every((product) => Boolean(product.image && product.images.length > 0)), required: true },
    { key: "product-validation", label: "Active products have valid variants and SKUs", detail: commerceErrors.length ? commerceErrors.join("; ") : "Catalog validation passed.", done: commerceErrors.length === 0, required: true },
    { key: "active-product", label: "At least one active product", detail: "Publish at least one product for the storefront.", done: catalog.some((product) => product.status === "active"), required: true },
    { key: "policies", label: "Shipping and returns copy", detail: "Explain shipping and return conditions.", done: Boolean(config.content.policies.shippingLead && config.content.policies.returnsLead), required: true },
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

type P0PanelsProps = {
  tab: AdminTab;
  config: EditableSiteConfig;
  updateConfig: (updater: (current: EditableSiteConfig) => EditableSiteConfig) => void;
  setHome: (field: "heroLabel" | "heroTitleLead" | "heroTitleAccent" | "heroBody" | "heroCta" | "introLabel" | "introTitleLead" | "introTitleAccent" | "introBody" | "storyLabel" | "storyTitleLead" | "storyTitleAccent" | "storyBody" | "newsletterLabel" | "newsletterTitleLead" | "newsletterTitleAccent" | "newsletterBody" | "productsLabel" | "productsTitleLead" | "productsTitleAccent" | "journalLabel" | "journalTitleLead" | "journalTitleAccent", value: string) => void;
  toggleModule: (module: HomeModule) => void;
  moveModule: (module: HomeModule, direction: -1 | 1) => void;
  domainForm: { name: string; slug: string; domain: string };
  setDomainForm: React.Dispatch<React.SetStateAction<{ name: string; slug: string; domain: string }>>;
  saveDomain: (event: React.FormEvent) => Promise<void>;
  site: CmsSite | null;
  activeSiteId: string;
  cmsRole?: CmsRole;
  diff: CmsSnapshotDiff | null;
  scheduleForm: { label: string; scheduledAt: string };
  setScheduleForm: React.Dispatch<React.SetStateAction<{ label: string; scheduledAt: string }>>;
  saveSchedule: (event: React.FormEvent) => Promise<void>;
  schedules: CmsSchedule[];
  cancelScheduledPublish: (id: string) => Promise<void>;
  busy: boolean;
  publish: () => Promise<void>;
  members: CmsMember[];
  invitations: CmsInvitation[];
  changeMemberRole: (userId: string, role: CmsRole) => Promise<void>;
  removeAccess: (userId: string) => Promise<void>;
  revokeAccessInvite: (id: string) => Promise<void>;
  auditLogs: CmsAuditLog[];
  loadWorkspaceData: () => Promise<void>;
  orders: CmsOrder[];
  inventory: CmsInventoryRow[];
  loadCommerceData: () => Promise<void>;
  updateOrder: (order: CmsOrder) => Promise<void>;
  updateStock: (row: CmsInventoryRow, quantity: number) => Promise<void>;
  loadOrderDetail: (orderId: string) => Promise<void>;
  orderDetail: CmsOrderDetail | null;
  orderLoading: boolean;
  commerceConfiguration: CommerceConfiguration | null;
  domains: CmsDomain[];
  onboarding: OnboardingState | null;
  paymentEvents: CmsPaymentEvent[];
  retryPaymentEvent: (eventId: string) => Promise<void>;
  retryNotification: (notificationId: string) => Promise<void>;
  refundOrder: (order: CmsOrderDetail["order"], amount: number | undefined, reason: string, restockItems: Array<{ productId: string; variantId: string; quantity: number }>) => Promise<void>;
};

function P0Panels(props: P0PanelsProps) {
  const { tab, config, updateConfig, setHome, toggleModule, moveModule, domainForm, setDomainForm, saveDomain, site, activeSiteId, cmsRole, diff, scheduleForm, setScheduleForm, saveSchedule, schedules, cancelScheduledPublish, busy, publish, members, invitations, changeMemberRole, removeAccess, revokeAccessInvite, auditLogs, loadWorkspaceData, orders, inventory, loadCommerceData, updateOrder, updateStock, loadOrderDetail, orderDetail, orderLoading, commerceConfiguration, domains, paymentEvents, retryPaymentEvent, retryNotification, refundOrder } = props;
  if (tab === "content") return <section className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">P0 content modules</p><h2>Compose the client storefront.</h2></div><span>Draft autosave</span></div><div className="v6-module-list">{(["hero", "intro", "products", "story", "journal", "newsletter"] as HomeModule[]).map((module, index) => <div className="v6-inline-row" key={module}><label className="v6-check-field"><input type="checkbox" checked={config.content.home.modules.includes(module)} onChange={() => toggleModule(module)} /> {module}</label><span><button className="text-button" onClick={() => moveModule(module, -1)} disabled={index === 0}>↑</button><button className="text-button" onClick={() => moveModule(module, 1)} disabled={index === 5}>↓</button></span></div>)}</div><div className="v6-divider"><p className="eyebrow">Announcement and navigation</p><div className="v6-form-grid"><Field label="Announcement" value={config.announcement.text} onChange={(value) => updateConfig((current) => { current.announcement.text = value; return current; })} /><Field label="Announcement accent" value={config.announcement.accent} onChange={(value) => updateConfig((current) => { current.announcement.accent = value; return current; })} />{config.navigation.map((item, index) => <Field key={`${item.href}-${index}`} label={`Nav ${index + 1} label | link`} value={`${item.label} | ${item.href}`} onChange={(value) => updateConfig((current) => { const [label, href] = value.split("|"); current.navigation[index] = { label: label.trim(), href: href?.trim() || current.navigation[index].href }; return current; })} />)}</div></div><div className="v6-divider"><p className="eyebrow">Home, trust, contact and SEO</p><div className="v6-form-grid"><Field label="Products label" value={config.content.home.productsLabel} onChange={(value) => setHome("productsLabel", value)} /><Field label="Products title" value={config.content.home.productsTitleLead} onChange={(value) => setHome("productsTitleLead", value)} /><Field label="Products accent" value={config.content.home.productsTitleAccent} onChange={(value) => setHome("productsTitleAccent", value)} /><Field label="Journal label" value={config.content.home.journalLabel} onChange={(value) => setHome("journalLabel", value)} /><Field label="About title" value={config.content.about.titleLead} onChange={(value) => updateConfig((current) => { current.content.about.titleLead = value; return current; })} /><Field label="About accent" value={config.content.about.titleAccent} onChange={(value) => updateConfig((current) => { current.content.about.titleAccent = value; return current; })} /><Field label="About lead" value={config.content.about.lead} onChange={(value) => updateConfig((current) => { current.content.about.lead = value; return current; })} multiline /><Field label="FAQ intro" value={config.content.faq.intro} onChange={(value) => updateConfig((current) => { current.content.faq.intro = value; return current; })} multiline /><Field label="Shipping copy" value={config.content.policies.shippingLead} onChange={(value) => updateConfig((current) => { current.content.policies.shippingLead = value; return current; })} multiline /><Field label="Returns copy" value={config.content.policies.returnsLead} onChange={(value) => updateConfig((current) => { current.content.policies.returnsLead = value; return current; })} multiline /><Field label="Contact email" value={config.content.contact.email} onChange={(value) => updateConfig((current) => { current.content.contact.email = value; return current; })} /><Field label="Trade email" value={config.content.contact.tradeEmail} onChange={(value) => updateConfig((current) => { current.content.contact.tradeEmail = value; return current; })} /><Field label="SEO title" value={config.seo.title} onChange={(value) => updateConfig((current) => { current.seo.title = value; return current; })} /><Field label="SEO description" value={config.seo.description} onChange={(value) => updateConfig((current) => { current.seo.description = value; return current; })} multiline /><Field label="SEO keywords" value={config.seo.keywords} onChange={(value) => updateConfig((current) => { current.seo.keywords = value; return current; })} /></div></div></section>;
  if (tab === "domains") return <section className="v6-grid"><div className="v6-card"><p className="eyebrow">Public tenant routing</p><h2>One workspace, many storefronts.</h2><p className="v6-muted">Public requests resolve a client site by hostname. Shared Sites URLs continue to use the default site.</p><div className="v6-callout"><strong>{site?.domain || "No custom domain mapped"}</strong><span>{site?.domain ? "Mapped in CMS · verify DNS with Sites" : "Add a domain mapping to route this tenant"}</span></div>{domains.map((domain) => <div className="v6-inline-row" key={domain.id}><span>{domain.hostname}<small>Verification: {domain.status}</small></span></div>)}<a className="text-link" href={`/preview?siteId=${encodeURIComponent(activeSiteId)}`} target="_blank" rel="noreferrer">Open tenant preview <span>↗</span></a></div><div className="v6-card"><p className="eyebrow">Domain mapping</p><h2>Connect the client URL.</h2><form className="v6-form" onSubmit={saveDomain}><Field label="Client site name" value={domainForm.name} onChange={(value) => setDomainForm((current) => ({ ...current, name: value }))} /><Field label="URL slug" value={domainForm.slug} onChange={(value) => setDomainForm((current) => ({ ...current, slug: slugify(value) }))} /><Field label="Custom domain" value={domainForm.domain} onChange={(value) => setDomainForm((current) => ({ ...current, domain: value }))} placeholder="shop.client.com" /><button className="button button-dark" disabled={busy || cmsRole !== "owner"}>Save domain mapping <span>+</span></button></form><p className="v6-help">After saving the mapping, verify the DNS target and activate the Sites custom-domain binding when the client provides the hostname.</p></div></section>;
  if (tab === "release") return <section className="v6-grid"><div className="v6-card"><p className="eyebrow">Publish diff</p><h2>{diff?.totalChanges ?? 0} changes waiting.</h2>{diff?.changes.length ? <div className="v6-checks">{diff.changes.map((change) => <div key={change}><span>+</span>{change}</div>)}</div> : <p className="v6-muted">Draft and published storefronts are aligned.</p>}<button className="button button-dark" onClick={() => void publish()} disabled={busy || !diff?.totalChanges || (cmsRole !== "owner" && cmsRole !== "editor")}>Review and publish <span>-&gt;</span></button></div><div className="v6-card"><p className="eyebrow">Scheduled publish</p><h2>Set the release moment.</h2><form className="v6-form" onSubmit={saveSchedule}><Field label="Release label" value={scheduleForm.label} onChange={(value) => setScheduleForm((current) => ({ ...current, label: value }))} /><label className="v6-field"><span>Publish at</span><input type="datetime-local" value={scheduleForm.scheduledAt} onChange={(event) => setScheduleForm((current) => ({ ...current, scheduledAt: event.target.value }))} /></label><button className="button button-dark" disabled={busy || !scheduleForm.scheduledAt || cmsRole === "viewer"}>Schedule release <span>+</span></button></form>{schedules.filter((schedule) => schedule.status === "pending").map((schedule) => <div className="v6-inline-row" key={schedule.id}><span>{schedule.label}<small>{new Date(schedule.scheduledAt).toLocaleString()}</small></span><button className="text-button danger" onClick={() => void cancelScheduledPublish(schedule.id)}>Cancel</button></div>)}</div></section>;
  if (tab === "team") return <section className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Member lifecycle</p><h2>Invite, change, revoke.</h2></div><span>Owner controlled</span></div><div className="v6-member-list">{members.map((member) => <div key={`${member.siteId}-${member.userId}`}><span>{member.email}</span><select value={member.role} disabled={cmsRole !== "owner"} onChange={(event) => void changeMemberRole(member.userId, event.target.value as CmsRole)}><option value="viewer">Viewer</option><option value="editor">Editor</option><option value="owner">Owner</option></select><button className="text-button danger" disabled={cmsRole !== "owner"} onClick={() => void removeAccess(member.userId)}>Remove</button></div>)}</div><div className="v6-divider"><p className="eyebrow">Pending invitations</p>{invitations.map((invitation) => <div className="v6-inline-row" key={invitation.id}><span>{invitation.email} · {invitation.role}<small>{invitation.status} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</small></span>{invitation.status === "pending" && <button className="text-button danger" disabled={cmsRole !== "owner"} onClick={() => void revokeAccessInvite(invitation.id)}>Revoke</button>}</div>)}{invitations.length === 0 && <p className="v6-muted">No pending invitations.</p>}</div><p className="v6-help">The existing invite form creates a secure seven-day link and copies it to the clipboard. The link can be sent through the client’s preferred email channel.</p></section>;
  if (tab === "activity") return <section className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Audit trail</p><h2>Every important change, visible.</h2></div><button className="text-button" onClick={() => void loadWorkspaceData()}>Refresh activity</button></div><div className="v6-version-list">{auditLogs.map((log) => <article key={log.id}><div><strong>{log.action}</strong><span>{log.actorEmail} · {log.entityType}{log.entityId ? ` / ${log.entityId}` : ""}</span></div><time>{new Date(log.createdAt).toLocaleString()}</time></article>)}{auditLogs.length === 0 && <div className="v6-empty">No audited changes yet.</div>}</div></section>;
  if (tab === "commerce") return <CommercePanel activeSiteId={activeSiteId} orders={orders} inventory={inventory} cmsRole={cmsRole} loadCommerceData={loadCommerceData} updateOrder={updateOrder} updateStock={updateStock} loadOrderDetail={loadOrderDetail} orderDetail={orderDetail} orderLoading={orderLoading} commerceConfiguration={commerceConfiguration} paymentEvents={paymentEvents} retryPaymentEvent={retryPaymentEvent} retryNotification={retryNotification} refundOrder={refundOrder} />;
  return null;
}

type CommercePanelProps = {
  activeSiteId: string;
  orders: CmsOrder[];
  inventory: CmsInventoryRow[];
  cmsRole?: CmsRole;
  loadCommerceData: () => Promise<void>;
  updateOrder: (order: CmsOrder) => Promise<void>;
  updateStock: (row: CmsInventoryRow, quantity: number) => Promise<void>;
  loadOrderDetail: (orderId: string) => Promise<void>;
  orderDetail: CmsOrderDetail | null;
  orderLoading: boolean;
  commerceConfiguration: CommerceConfiguration | null;
  paymentEvents: CmsPaymentEvent[];
  retryPaymentEvent: (eventId: string) => Promise<void>;
  retryNotification: (notificationId: string) => Promise<void>;
  refundOrder: (order: CmsOrderDetail["order"], amount: number | undefined, reason: string, restockItems: Array<{ productId: string; variantId: string; quantity: number }>) => Promise<void>;
};

function CommercePanelBase({ orders, inventory, cmsRole, loadCommerceData, updateOrder, updateStock, loadOrderDetail, orderDetail, orderLoading, commerceConfiguration }: CommercePanelProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const filteredOrders = orders.filter((order) => {
    const search = query.trim().toLowerCase();
    const matchesQuery = !search || [order.orderNumber, order.email, order.customerName].some((value) => value.toLowerCase().includes(search));
    const matchesStatus = status === "all" || order.paymentStatus === status || order.fulfillmentStatus === status;
    return matchesQuery && matchesStatus;
  });

  function exportOrders() {
    const headers = ["Order", "Created", "Customer", "Email", "Payment", "Fulfillment", "Subtotal", "Shipping", "Total", "Tracking"];
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const lines = [headers, ...filteredOrders.map((order) => [order.orderNumber, order.createdAt, order.customerName, order.email, order.paymentStatus, order.fulfillmentStatus, order.subtotal.toFixed(2), order.shipping.toFixed(2), order.total.toFixed(2), order.trackingNumber || ""])].map((row) => row.map(escape).join(","));
    const blob = new Blob([`\ufeff${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const paymentReady = Boolean(commerceConfiguration?.paypal.clientId && commerceConfiguration?.paypal.clientSecret && commerceConfiguration?.paypal.webhookId);
  const emailReady = Boolean(commerceConfiguration?.resend.apiKey && commerceConfiguration?.resend.fromEmail);
  return <section className="v6-grid"><div className="v6-card v6-card-large"><div className="v6-card-heading"><div><p className="eyebrow">Order operations</p><h2>{orders.length} recent orders.</h2></div><div className="v6-actions"><button className="text-button" onClick={() => void loadCommerceData()}>Refresh</button><button className="text-button" onClick={exportOrders} disabled={!filteredOrders.length}>Export CSV</button></div></div><div className="v6-commerce-config"><span className={paymentReady ? "is-ready" : "is-missing"}>PayPal {paymentReady ? "ready" : "needs keys"}</span><span className={emailReady ? "is-ready" : "is-missing"}>Resend {emailReady ? "ready" : "needs keys"}</span><small>Configure production secrets before accepting live orders.</small></div><div className="v6-commerce-toolbar"><label className="v6-field"><span>Search orders</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Order, customer or email" /></label><label className="v6-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="paid">Paid</option><option value="pending">Pending payment</option><option value="failed">Payment failed</option><option value="unfulfilled">Unfulfilled</option><option value="processing">Processing</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option></select></label></div><div className="v6-version-list">{filteredOrders.map((order) => <article key={order.id} className="v6-order-row"><button type="button" className="v6-order-summary" onClick={() => void loadOrderDetail(order.id)}><strong>{order.orderNumber} · {formatMoney(order.total, order.currency)}</strong><span>{order.customerName} · {order.email}</span><small>{new Date(order.createdAt).toLocaleString()} · Payment: {order.paymentStatus} · Fulfillment: {order.fulfillmentStatus}</small></button><div className="v6-actions"><select aria-label={`Fulfillment status for ${order.orderNumber}`} value={order.fulfillmentStatus} disabled={cmsRole !== "owner" && cmsRole !== "editor"} onChange={(event) => void updateOrder({ ...order, fulfillmentStatus: event.target.value })}><option value="unfulfilled">Unfulfilled</option><option value="processing">Processing</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select></div></article>)}{filteredOrders.length === 0 && <div className="v6-empty">{orders.length ? "No orders match the current filters." : "No orders yet. Orders appear here after PayPal confirms payment."}</div>}</div>{orderLoading && <p className="v6-muted">Loading order details...</p>}{orderDetail && <div className="v6-order-detail"><div className="v6-card-heading"><div><p className="eyebrow">Order detail</p><h3>{orderDetail.order.orderNumber}</h3></div><span>{orderDetail.order.paymentStatus} / {orderDetail.order.fulfillmentStatus}</span></div><div className="v6-order-detail-grid"><div><p className="eyebrow">Customer</p><p>{orderDetail.order.customerName}<br />{orderDetail.order.email}</p><p>{Object.values(orderDetail.order.shippingAddress).filter(Boolean).join(", ")}</p></div><div><p className="eyebrow">Items</p>{orderDetail.items.map((item) => <p key={item.id}>{item.name} / {item.variantLabel} · {item.quantity} · {formatMoney(item.unitPrice * item.quantity, orderDetail.order.currency)}</p>)}</div></div><div className="v6-order-detail-footer"><label className="v6-field"><span>Tracking number</span><input defaultValue={orderDetail.order.trackingNumber || ""} placeholder="Add tracking number" disabled={cmsRole === "viewer"} onBlur={(event) => void updateOrder({ ...orderDetail.order, trackingNumber: event.target.value })} /></label><div><p className="eyebrow">Notifications</p>{orderDetail.notifications.length ? orderDetail.notifications.map((notification) => <span className="v6-status-chip" key={notification.id}>{notification.type}: {notification.status}</span>) : <p className="v6-muted">No notification records yet.</p>}</div></div></div>}</div><div className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Inventory / SKU</p><h2>Live stock.</h2></div></div><div className="v6-version-list">{inventory.map((row) => <article key={`${row.productId}-${row.variantId}`}><div><strong>{row.productName} · {row.variantLabel}</strong><span>{row.sku} · {row.reservedQuantity} reserved · {Math.max(0, row.quantity - row.reservedQuantity)} available</span></div><label className="v6-inline-input"><span className="sr-only">Quantity</span><input type="number" min="0" defaultValue={row.quantity} disabled={cmsRole === "viewer"} onBlur={(event) => void updateStock(row, Number(event.target.value))} /></label></article>)}{inventory.length === 0 && <div className="v6-empty">Inventory rows initialize from the published catalog.</div>}</div></div></section>;
}

function CommercePanel(props: CommercePanelProps) {
  return <><CommercePanelBase {...props} /><CommerceOperations key={props.orderDetail?.order.id || "empty"} {...props} /></>;
}

function CommerceOperations({ activeSiteId, orderDetail, cmsRole, paymentEvents, retryPaymentEvent, retryNotification, refundOrder }: CommercePanelProps) {
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState(orderDetail?.order.adminNote || "");
  const [noteStatus, setNoteStatus] = useState("");
  const canOperate = cmsRole === "owner" || cmsRole === "editor";

  if (!orderDetail) return <section className="v6-card"><p className="eyebrow">Operations log</p><h2>Payment and email retries.</h2><div className="v6-version-list">{paymentEvents.map((event) => <article key={event.id}><div><strong>{event.eventType}</strong><span>{event.providerEventId} · attempts {event.attempts}</span></div><div className="v6-actions"><span className={event.processedAt ? "v6-status-chip is-ready" : "v6-status-chip is-missing"}>{event.processedAt ? "Processed" : event.lastError || "Pending"}</span>{!event.processedAt && canOperate && <button className="text-button" onClick={() => void retryPaymentEvent(event.id)}>Retry</button>}</div></article>)}{paymentEvents.length === 0 && <div className="v6-empty">PayPal webhook events will appear here after the first payment.</div>}{!canOperate && <p className="v6-help">Viewer access can inspect the log. An editor or owner is required to retry provider operations.</p>}</div></section>;

  const remaining = Math.max(0, orderDetail.order.total - orderDetail.order.refundTotal);
  const restockItems = orderDetail.items.filter((item) => restock[item.productId + ":" + item.variantId]).map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity }));
  return <section className="v6-grid"><div className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Support operations</p><h2>Keep the order traceable.</h2></div><span>{orderDetail.order.orderNumber}</span></div><label className="v6-field"><span>Admin note</span><textarea value={note} onChange={(event) => setNote(event.target.value)} onBlur={() => void propsUpdateNote(orderDetail.order, note)} placeholder="Internal note for support and fulfillment" disabled={!canOperate} /></label>{noteStatus && <p className="v6-help" role="status">{noteStatus}</p>}<div className="v6-divider"><p className="eyebrow">Email notifications</p>{orderDetail.notifications.length ? orderDetail.notifications.map((notification) => <div className="v6-inline-row" key={notification.id}><span>{notification.type}<small>{notification.status} · attempts {notification.attempts}{notification.error ? " · " + notification.error : ""}</small></span>{notification.status !== "sent" && canOperate && <button className="text-button" onClick={() => void retryNotification(notification.id)}>Retry email</button>}</div>) : <p className="v6-muted">No notification records yet.</p>}</div></div><div className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">PayPal refunds</p><h2>{formatMoney(remaining, orderDetail.order.currency)} refundable.</h2></div><span>{orderDetail.order.refundTotal > 0 ? `${formatMoney(orderDetail.order.refundTotal, orderDetail.order.currency)} refunded` : "No refunds"}</span></div><label className="v6-field"><span>Amount in {orderDetail.order.currency.toUpperCase()}; blank means full remaining balance</span><input type="number" min="0.01" max={remaining.toFixed(2)} step="0.01" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} disabled={remaining <= 0 || !canOperate} /></label><label className="v6-field"><span>Reason</span><input value={refundReason} onChange={(event) => setRefundReason(event.target.value)} placeholder="Customer request" disabled={remaining <= 0 || !canOperate} /></label><p className="eyebrow">Inventory rule: only selected items are restocked.</p>{orderDetail.items.map((item) => <label className="v6-check-field" key={item.id}><input type="checkbox" checked={Boolean(restock[item.productId + ":" + item.variantId])} disabled={!canOperate} onChange={(event) => setRestock((current) => ({ ...current, [item.productId + ":" + item.variantId]: event.target.checked }))} /> Return {item.name} × {item.quantity}</label>)}<button className="button button-dark" disabled={remaining <= 0 || !canOperate} onClick={() => void refundOrder(orderDetail.order, refundAmount ? Number(refundAmount) : undefined, refundReason, restockItems)}>Issue PayPal refund <span>→</span></button>{orderDetail.refunds.length > 0 && <div className="v6-version-list">{orderDetail.refunds.map((refund) => <article key={refund.id}><div><strong>{formatMoney(refund.amount, orderDetail.order.currency)} · {refund.status}</strong><span>{refund.reason || "No reason"} · {new Date(refund.createdAt).toLocaleString()}</span></div><small>{refund.error || refund.paypalRefundId || "Pending provider ID"}</small></article>)}</div>}</div><div className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">PayPal event log</p><h2>Webhook recovery.</h2></div></div><div className="v6-version-list">{paymentEvents.map((event) => <article key={event.id}><div><strong>{event.eventType}</strong><span>{event.providerEventId} · attempts {event.attempts}</span></div><div className="v6-actions"><span className={event.processedAt ? "v6-status-chip is-ready" : "v6-status-chip is-missing"}>{event.processedAt ? "Processed" : event.lastError || "Pending"}</span>{!event.processedAt && canOperate && <button className="text-button" onClick={() => void retryPaymentEvent(event.id)}>Retry event</button>}</div></article>)}{paymentEvents.length === 0 && <div className="v6-empty">No webhook events yet.</div>}{!canOperate && <p className="v6-help">Viewer access can inspect the log. An editor or owner is required to change order operations.</p>}</div></div></section>;

  async function propsUpdateNote(order: CmsOrder, value: string) {
    setNoteStatus("Saving note…");
    const response = await fetch("/api/cms/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, orderId: order.id, adminNote: value }) });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      setNoteStatus(payload.error || "Unable to save the note.");
      return;
    }
    setNoteStatus("Note saved.");
  }
}

export function AdminStudioV6() {
  const runtime = useSiteRuntime();
  const { config, catalog, cmsError, cmsMode, cmsRole, cmsStatus, activeSiteId, site, updateCatalog, updateConfig, refreshCms, setActiveSiteId, publishCms, fetchRevisions, rollbackCms } = runtime;
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [sites, setSites] = useState<CmsSite[]>([]);
  const [members, setMembers] = useState<CmsMember[]>([]);
  const [assets, setAssets] = useState<CmsAsset[]>([]);
  const [revisions, setRevisions] = useState<CmsRevision[]>([]);
  const [invitations, setInvitations] = useState<CmsInvitation[]>([]);
  const [auditLogs, setAuditLogs] = useState<CmsAuditLog[]>([]);
  const [schedules, setSchedules] = useState<CmsSchedule[]>([]);
  const [diff, setDiff] = useState<CmsSnapshotDiff | null>(null);
  const [orders, setOrders] = useState<CmsOrder[]>([]);
  const [inventory, setInventory] = useState<CmsInventoryRow[]>([]);
  const [commerceConfiguration, setCommerceConfiguration] = useState<CommerceConfiguration | null>(null);
  const [orderDetail, setOrderDetail] = useState<CmsOrderDetail | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [domains, setDomains] = useState<CmsDomain[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [paymentEvents, setPaymentEvents] = useState<CmsPaymentEvent[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [siteForm, setSiteForm] = useState({ name: "", slug: "", templateSiteId: "default" });
  const [memberForm, setMemberForm] = useState({ email: "", role: "editor" as CmsRole });
  const [domainForm, setDomainForm] = useState({ name: "", slug: "", domain: "" });
  const [scheduleForm, setScheduleForm] = useState({ label: "Scheduled storefront release", scheduledAt: "" });
  const [mediaForm, setMediaForm] = useState({ kind: "hero", alt: "" });
  const [productSearch, setProductSearch] = useState("");
  const [productFilter, setProductFilter] = useState("all");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productValidation, setProductValidation] = useState<string[]>([]);
  const csvInput = useRef<HTMLInputElement>(null);
  const clientImportInput = useRef<HTMLInputElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);

  const checks = useMemo(() => launchChecks(config, catalog), [catalog, config]);
  const requiredChecks = useMemo(() => onboarding?.checks.filter((check) => check.required !== false) ?? checks, [checks, onboarding]);
  const filteredProducts = useMemo(() => catalog.filter((product) => {
    const query = productSearch.toLowerCase().trim();
    const matchesQuery = !query || [product.name, product.sku, product.category].some((value) => value.toLowerCase().includes(query));
    const matchesStatus = productFilter === "all" || product.status === productFilter;
    return matchesQuery && matchesStatus;
  }), [catalog, productFilter, productSearch]);
  const visibleAdminTabs = useMemo(() => new Set<AdminTab>(cmsRole ? roleVisibleAdminTabs[cmsRole] : tabs.map((item) => item.id)), [cmsRole]);
  const visibleAdminNavGroups = useMemo(() => adminNavGroups.map((group) => ({ ...group, items: group.items.filter((item) => visibleAdminTabs.has(item)) })).filter((group) => group.items.length), [visibleAdminTabs]);

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

  const selectTab = useCallback((nextTab: AdminTab) => {
    if (cmsRole && !roleVisibleAdminTabs[cmsRole].includes(nextTab)) return;
    setTab(nextTab);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", nextTab);
    params.set("siteId", activeSiteId);
    window.history.pushState({}, "", `/admin?${params.toString()}`);
  }, [activeSiteId, cmsRole]);

  const selectSite = useCallback((nextSiteId: string) => {
    setActiveSiteId(nextSiteId);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    params.set("siteId", nextSiteId);
    window.history.replaceState({}, "", `/admin?${params.toString()}`);
  }, [setActiveSiteId, tab]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab") as AdminTab | null;
    // URL query parameters are an external navigation source for the admin workspace.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (requestedTab && tabs.some((item) => item.id === requestedTab)) setTab(requestedTab);
    const requestedSite = searchParams.get("siteId");
    if (requestedSite && /^[a-zA-Z0-9_-]{2,80}$/.test(requestedSite) && requestedSite !== activeSiteId) setActiveSiteId(requestedSite);
  }, [activeSiteId, searchParams, setActiveSiteId]);

  useEffect(() => {
    const syncHistoryNavigation = () => {
      const params = new URLSearchParams(window.location.search);
      const requestedTab = params.get("tab") as AdminTab | null;
      if (requestedTab && tabs.some((item) => item.id === requestedTab)) setTab(requestedTab);
      const requestedSite = params.get("siteId");
      if (requestedSite && /^[a-zA-Z0-9_-]{2,80}$/.test(requestedSite) && requestedSite !== activeSiteId) setActiveSiteId(requestedSite);
    };
    window.addEventListener("popstate", syncHistoryNavigation);
    return () => window.removeEventListener("popstate", syncHistoryNavigation);
  }, [activeSiteId, setActiveSiteId]);

  const loadWorkspaceData = useCallback(async () => {
    const query = `?siteId=${encodeURIComponent(activeSiteId)}`;
    const [membersResponse, assetsResponse, revisionsResponse, auditResponse, diffResponse, schedulesResponse, domainsResponse, onboardingResponse] = await Promise.all([
      fetch(`/api/cms/members${query}`, { cache: "no-store" }),
      fetch(`/api/cms/assets${query}`, { cache: "no-store" }),
      fetch(`/api/cms/revisions${query}`, { cache: "no-store" }),
      fetch(`/api/cms/audit${query}`, { cache: "no-store" }),
      fetch(`/api/cms/diff${query}`, { cache: "no-store" }),
      fetch(`/api/cms/schedules${query}`, { cache: "no-store" }),
      fetch(`/api/cms/domains${query}`, { cache: "no-store" }),
      fetch(`/api/cms/onboarding${query}`, { cache: "no-store" }),
    ]);
    const [membersPayload, assetsPayload, revisionsPayload, auditPayload, diffPayload, schedulesPayload, domainsPayload, onboardingPayload] = await Promise.all([
      membersResponse.json().catch(() => ({})),
      assetsResponse.json().catch(() => ({})),
      revisionsResponse.json().catch(() => ({})),
      auditResponse.json().catch(() => ({})),
      diffResponse.json().catch(() => ({})),
      schedulesResponse.json().catch(() => ({})),
      domainsResponse.json().catch(() => ({})),
      onboardingResponse.json().catch(() => ({})),
    ]) as [{ members?: CmsMember[]; invitations?: CmsInvitation[] }, { assets?: CmsAsset[] }, { revisions?: CmsRevision[] }, { logs?: CmsAuditLog[] }, { diff?: CmsSnapshotDiff }, { schedules?: CmsSchedule[] }, { domains?: CmsDomain[] }, OnboardingState];
    if (membersResponse.ok) setMembers(membersPayload.members ?? []);
    if (membersResponse.ok) setInvitations(membersPayload.invitations ?? []);
    if (assetsResponse.ok) setAssets(assetsPayload.assets ?? []);
    if (revisionsResponse.ok) setRevisions(revisionsPayload.revisions ?? []);
    if (auditResponse.ok) setAuditLogs(auditPayload.logs ?? []);
    if (diffResponse.ok) setDiff(diffPayload.diff ?? null);
    if (schedulesResponse.ok) setSchedules(schedulesPayload.schedules ?? []);
    if (domainsResponse.ok) setDomains(domainsPayload.domains ?? []);
    if (onboardingResponse.ok) setOnboarding(onboardingPayload);
  }, [activeSiteId]);

  const loadCommerceData = useCallback(async () => {
    const query = `?siteId=${encodeURIComponent(activeSiteId)}`;
    const [ordersResponse, inventoryResponse, configurationResponse, eventsResponse] = await Promise.all([
      fetch(`/api/cms/orders${query}`, { cache: "no-store" }),
      fetch(`/api/cms/inventory${query}`, { cache: "no-store" }),
      fetch(`/api/cms/commerce/status${query}`, { cache: "no-store" }),
      fetch(`/api/cms/commerce/events${query}`, { cache: "no-store" }),
    ]);
    const [ordersPayload, inventoryPayload, configurationPayload, eventsPayload] = await Promise.all([
      ordersResponse.json().catch(() => ({})) as Promise<{ orders?: CmsOrder[] }>,
      inventoryResponse.json().catch(() => ({})) as Promise<{ inventory?: CmsInventoryRow[] }>,
      configurationResponse.json().catch(() => ({})) as Promise<{ configuration?: CommerceConfiguration; webhookEndpoint?: string; environmentKeys?: string[] }>,
      eventsResponse.json().catch(() => ({})) as Promise<{ events?: CmsPaymentEvent[] }>,
    ]);
    if (ordersResponse.ok) setOrders(ordersPayload.orders ?? []);
    if (inventoryResponse.ok) setInventory(inventoryPayload.inventory ?? []);
    if (configurationResponse.ok) setCommerceConfiguration(configurationPayload.configuration ? { ...configurationPayload.configuration, webhookEndpoint: configurationPayload.webhookEndpoint, environmentKeys: configurationPayload.environmentKeys } : null);
    if (eventsResponse.ok) setPaymentEvents(eventsPayload.events ?? []);
  }, [activeSiteId]);

  const loadOrderDetail = useCallback(async (orderId: string) => {
    setOrderLoading(true);
    try {
      const response = await fetch(`/api/cms/orders?siteId=${encodeURIComponent(activeSiteId)}&orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as CmsOrderDetail & { error?: string };
      if (!response.ok || !payload.order) throw new Error(payload.error || "Unable to load order details.");
      setOrderDetail({ order: payload.order, items: payload.items || [], notifications: payload.notifications || [], refunds: payload.refunds || [], stateEvents: payload.stateEvents || [] });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to load order details." });
    } finally {
      setOrderLoading(false);
    }
  }, [activeSiteId]);

  useEffect(() => {
    if (!site) return;
    // Keep the domain editor aligned with the selected tenant.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDomainForm({ name: site.name, slug: site.slug, domain: site.domain || "" });
  }, [site]);

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

  useEffect(() => {
    // The commerce panel synchronizes operational D1 data for the selected site.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!authRequired) void loadCommerceData();
  }, [authRequired, loadCommerceData]);

  const setBrand = (field: "name" | "mark" | "descriptor" | "tagline" | "footerLine" | "originLine", value: string) => {
    updateConfig((current) => {
      current.brand[field] = value;
      return current;
    });
  };

  const setHome = (field: "heroLabel" | "heroTitleLead" | "heroTitleAccent" | "heroBody" | "heroCta" | "introLabel" | "introTitleLead" | "introTitleAccent" | "introBody" | "storyLabel" | "storyTitleLead" | "storyTitleAccent" | "storyBody" | "newsletterLabel" | "newsletterTitleLead" | "newsletterTitleAccent" | "newsletterBody" | "productsLabel" | "productsTitleLead" | "productsTitleAccent" | "journalLabel" | "journalTitleLead" | "journalTitleAccent", value: string) => {
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
      setSiteForm({ name: "", slug: "", templateSiteId: "default" });
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
    const result = await publishCms("V22 white-label production release");
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
      const payload = await response.json().catch(() => ({})) as { member?: CmsMember; invitation?: CmsInvitation; error?: string };
      if (!response.ok || (!payload.member && !payload.invitation)) throw new Error(payload.error || "Unable to add member.");
      if (payload.member) setMembers((current) => [...current.filter((member) => member.userId !== payload.member?.userId), payload.member as CmsMember]);
      if (payload.invitation) setInvitations((current) => [payload.invitation as CmsInvitation, ...current]);
      setMemberForm({ email: "", role: "editor" });
      setNotice({ tone: "success", text: payload.invitation ? "Invitation created. Copy the invite link for the collaborator." : "Member access saved." });
      if (payload.invitation?.inviteUrl) await navigator.clipboard?.writeText(`${window.location.origin}${payload.invitation.inviteUrl}`);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to add member." });
    } finally {
      setBusy(false);
    }
  };

  const saveDomain = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/cms/sites", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, ...domainForm }) });
      const payload = await response.json().catch(() => ({})) as { site?: CmsSite; error?: string };
      if (!response.ok || !payload.site) throw new Error(payload.error || "Unable to save domain mapping.");
      setSites((current) => current.map((item) => item.id === payload.site?.id ? payload.site as CmsSite : item));
      setNotice({ tone: "success", text: payload.site.domain ? "Domain mapping saved. Point DNS to the hosted site, then verify it with Sites." : "Custom domain cleared." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to save domain mapping." });
    } finally {
      setBusy(false);
    }
  };

  const moveModule = (module: HomeModule, direction: -1 | 1) => updateConfig((current) => {
    const modules = [...current.content.home.modules];
    const index = modules.indexOf(module);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= modules.length) return current;
    [modules[index], modules[nextIndex]] = [modules[nextIndex], modules[index]];
    current.content.home.modules = modules;
    return current;
  });

  const toggleModule = (module: HomeModule) => updateConfig((current) => {
    const modules = [...current.content.home.modules];
    current.content.home.modules = modules.includes(module) ? modules.filter((item) => item !== module) : [...modules, module];
    return current;
  });

  const saveSchedule = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/cms/schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, label: scheduleForm.label, scheduledAt: new Date(scheduleForm.scheduledAt).toISOString() }) });
      const payload = await response.json().catch(() => ({})) as { schedule?: CmsSchedule; error?: string };
      if (!response.ok || !payload.schedule) throw new Error(payload.error || "Unable to schedule publish.");
      setSchedules((current) => [payload.schedule as CmsSchedule, ...current]);
      setScheduleForm({ label: "Scheduled storefront release", scheduledAt: "" });
      setNotice({ tone: "success", text: "Publish scheduled. It will be processed on the next CMS request after the scheduled time." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to schedule publish." });
    } finally {
      setBusy(false);
    }
  };

  const cancelScheduledPublish = async (scheduleId: string) => {
    const response = await fetch(`/api/cms/schedules?siteId=${encodeURIComponent(activeSiteId)}&scheduleId=${encodeURIComponent(scheduleId)}`, { method: "DELETE" });
    if (response.ok) setSchedules((current) => current.map((schedule) => schedule.id === scheduleId ? { ...schedule, status: "cancelled" } : schedule));
    else setNotice({ tone: "error", text: "Unable to cancel scheduled publish." });
  };

  const changeMemberRole = async (userId: string, role: CmsRole) => {
    const response = await fetch("/api/cms/members", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, userId, role }) });
    const payload = await response.json().catch(() => ({})) as { member?: CmsMember; error?: string };
    if (response.ok && payload.member) setMembers((current) => current.map((member) => member.userId === userId ? payload.member as CmsMember : member));
    else setNotice({ tone: "error", text: payload.error || "Unable to change member role." });
  };

  const removeAccess = async (userId: string) => {
    if (!window.confirm("Remove this member from the site?")) return;
    const response = await fetch(`/api/cms/members?siteId=${encodeURIComponent(activeSiteId)}&userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
    if (response.ok) setMembers((current) => current.filter((member) => member.userId !== userId));
    else setNotice({ tone: "error", text: "Unable to remove member." });
  };

  const revokeAccessInvite = async (invitationId: string) => {
    const response = await fetch(`/api/cms/members?siteId=${encodeURIComponent(activeSiteId)}&invitationId=${encodeURIComponent(invitationId)}`, { method: "DELETE" });
    if (response.ok) setInvitations((current) => current.map((invitation) => invitation.id === invitationId ? { ...invitation, status: "revoked" } : invitation));
    else setNotice({ tone: "error", text: "Unable to revoke invitation." });
  };

  const updateOrder = async (order: CmsOrder) => {
    const response = await fetch("/api/cms/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, orderId: order.id, fulfillmentStatus: order.fulfillmentStatus, trackingNumber: order.trackingNumber || "", adminNote: order.adminNote || "" }) });
    const payload = await response.json().catch(() => ({})) as { order?: CmsOrder; error?: string };
    if (response.ok && payload.order) {
      setOrders((current) => current.map((item) => item.id === order.id ? payload.order as CmsOrder : item));
      setOrderDetail((current) => current && current.order.id === order.id ? { ...current, order: payload.order as CmsOrder } : current);
      setNotice({ tone: "success", text: `${order.orderNumber} updated.` });
    } else setNotice({ tone: "error", text: payload.error || "Unable to update order." });
  };

  const retryPaymentEvent = async (eventId: string) => {
    const response = await fetch("/api/cms/commerce/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, eventId }) });
    if (response.ok) {
      setNotice({ tone: "success", text: "PayPal event retry completed." });
      await loadCommerceData();
    } else {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      setNotice({ tone: "error", text: payload.error || "PayPal event retry failed." });
    }
  };

  const retryNotification = async (notificationId: string) => {
    const response = await fetch("/api/cms/commerce/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, notificationId }) });
    if (response.ok) {
      const payload = await response.json() as CmsOrderDetail;
      setOrderDetail(payload);
      setNotice({ tone: "success", text: "Email notification retry completed." });
    } else {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      setNotice({ tone: "error", text: payload.error || "Email retry failed." });
    }
  };

  const refundOrder = async (order: CmsOrderDetail["order"], amount: number | undefined, reason: string, restockItems: Array<{ productId: string; variantId: string; quantity: number }>) => {
    const response = await fetch("/api/cms/orders/refund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, orderId: order.id, amount, reason, restockItems }) });
    const payload = await response.json().catch(() => ({})) as CmsOrderDetail & { error?: string };
    if (response.ok && payload.order) {
      setOrderDetail(payload);
      setOrders((current) => current.map((item) => item.id === order.id ? payload.order : item));
      setNotice({ tone: "success", text: order.orderNumber + " refund recorded." });
    } else setNotice({ tone: "error", text: payload.error || "Refund failed." });
  };

  const updateStock = async (row: CmsInventoryRow, quantity: number) => {
    if (!Number.isInteger(quantity) || quantity < 0) return setNotice({ tone: "error", text: "Stock must be a whole number of zero or more." });
    const response = await fetch("/api/cms/inventory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, productId: row.productId, variantId: row.variantId, quantity }) });
    const payload = await response.json().catch(() => ({})) as { inventory?: CmsInventoryRow; error?: string };
    if (response.ok && payload.inventory) {
      setInventory((current) => current.map((item) => item.productId === row.productId && item.variantId === row.variantId ? { ...item, ...payload.inventory } : item));
      setNotice({ tone: "success", text: `${row.sku} inventory updated.` });
    } else setNotice({ tone: "error", text: payload.error || "Unable to update inventory." });
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
      const uploadedAsset = payload.asset;
      if (!uploadedAsset) throw new Error("Upload did not return an asset.");
      setAssets((current) => [uploadedAsset, ...current]);
      setMediaForm({ kind: "hero", alt: "" });
      if (mediaForm.kind === "hero") updateConfig((current) => { current.assets.hero = uploadedAsset.url || current.assets.hero; return current; });
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

  const importClientFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const payload = file.name.toLowerCase().endsWith(".json") ? JSON.parse(text) as Record<string, unknown> : { productCsv: text };
      const response = await fetch("/api/cms/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, ...payload }) });
      const result = await response.json().catch(() => ({})) as { importedProducts?: number; error?: string };
      if (!response.ok) throw new Error(result.error || "Client import failed.");
      await refreshCms();
      await loadWorkspaceData();
      setNotice({ tone: "success", text: `Client data imported. ${result.importedProducts ?? 0} products are now in draft.` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Client import failed." });
    } finally {
      setBusy(false);
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
    const errors = getProductValidationErrors(editingProduct, catalog);
    if (errors.length) {
      setProductValidation(errors);
      setNotice({ tone: "error", text: "Complete the product fields before saving." });
      return;
    }
    updateCatalog((current) => {
      const index = current.findIndex((product) => product.id === editingProduct.id);
      if (index < 0) return [...current, editingProduct];
      const next = [...current];
      next[index] = editingProduct;
      return next;
    });
    setEditingProduct(null);
    setProductValidation([]);
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
    <main className="admin-shell admin-shell-blue">
      <div className="admin-layout container">
        <aside className="admin-sidebar" aria-label="Platform control center navigation">
          <a className="admin-sidebar-brand" href="/admin" aria-label="Northline CMS home">
            <span className="admin-sidebar-mark">N</span>
            <span><strong>Northline</strong><small>Platform control center</small></span>
          </a>

          <div className="admin-site-switcher">
            <label><span>Active merchant storefront</span><select value={activeSiteId} onChange={(event) => selectSite(event.target.value)}>{sites.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.slug}</option>)}</select></label>
            <div className="admin-sidebar-site-meta"><strong>{site?.name || "Loading site..."}</strong><span>{cmsRole ? `${cmsRole} access` : "Draft workspace"}</span><span className={`v6-status ${cmsStatus}`}>{cmsStatus.replace("-", " ")}</span></div>
          </div>

          <nav className="admin-sidebar-nav" aria-label="Platform administration sections">
            {visibleAdminNavGroups.map((group) => <div className="admin-nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((itemId) => {
                const item = tabs.find((candidate) => candidate.id === itemId);
                const index = tabs.findIndex((candidate) => candidate.id === itemId);
                if (!item) return null;
                return <button key={item.id} className={tab === item.id ? "is-active" : ""} onClick={() => selectTab(item.id)} aria-current={tab === item.id ? "page" : undefined}><span className="admin-nav-index">{String(index + 1).padStart(2, "0")}</span><span>{item.label}</span></button>;
              })}
            </div>)}
          </nav>

          <div className="admin-sidebar-footer">
            <span className="admin-sidebar-footer-dot" />
            <span><strong>Workspace synced</strong><small>Draft autosaves · publish when ready</small></span>
          </div>
        </aside>

        <div className="admin-main">
          <div className="admin-topbar"><span>Platform admin</span><span>{site?.name || "Merchant storefront"} · {cmsRole || "checking access"}</span></div>
          <nav className="workspace-breadcrumb" aria-label="Breadcrumb"><a href="/admin">Platform admin</a><span aria-hidden="true">/</span><span>{tabs.find((item) => item.id === tab)?.label || "Workstation"}</span></nav>
        <header className="admin-hero v6-hero">
          <div>
            <p className="eyebrow">Platform operations / Merchant delivery</p>
            <h1>Merchant storefronts,<br /><em>ready to grow.</em></h1>
            <p>Review applications, create isolated storefronts, prepare the launch package and keep platform support separate from each merchant&apos;s daily catalog operations.</p>
          </div>
          <div className="admin-hero-actions">
            <a className="button button-outline" href={`/preview?siteId=${encodeURIComponent(activeSiteId)}`} target="_blank" rel="noreferrer">Open preview <span>↗</span></a>
            <button className="button button-dark" onClick={() => void publish()} disabled={busy || cmsMode !== "draft" || (cmsRole !== "owner" && cmsRole !== "editor")}>Publish draft <span>↗</span></button>
          </div>
        </header>

        <div className="v6-sitebar">
          <label><span>Active merchant storefront</span><select value={activeSiteId} onChange={(event) => selectSite(event.target.value)}>{sites.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.slug}</option>)}</select></label>
          <div className="v6-site-meta"><strong>{site?.name || "Loading site…"}</strong><span>{cmsRole ? `${cmsRole} access` : "Draft workspace"}</span><span className={`v6-status ${cmsStatus}`}>{cmsStatus.replace("-", " ")}</span></div>
        </div>

        {notice && <div className={`v6-notice ${notice.tone}`} role="status">{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss message">×</button></div>}
        {cmsError && <div className="v6-notice error" role="alert">{cmsError}</div>}

        <div className="admin-workspace-status" role="status">Draft changes autosave · public stays on the published version · {tabs.find((item) => item.id === tab)?.label}</div>

        <P0Panels tab={tab} config={config} updateConfig={updateConfig} setHome={setHome} toggleModule={toggleModule} moveModule={moveModule} domainForm={domainForm} setDomainForm={setDomainForm} saveDomain={saveDomain} site={site} activeSiteId={activeSiteId} cmsRole={cmsRole} diff={diff} scheduleForm={scheduleForm} setScheduleForm={setScheduleForm} saveSchedule={saveSchedule} schedules={schedules} cancelScheduledPublish={cancelScheduledPublish} busy={busy} publish={publish} members={members} invitations={invitations} changeMemberRole={changeMemberRole} removeAccess={removeAccess} revokeAccessInvite={revokeAccessInvite} auditLogs={auditLogs} loadWorkspaceData={loadWorkspaceData} orders={orders} inventory={inventory} loadCommerceData={loadCommerceData} updateOrder={updateOrder} updateStock={updateStock} loadOrderDetail={loadOrderDetail} orderDetail={orderDetail} orderLoading={orderLoading} commerceConfiguration={commerceConfiguration} domains={domains} onboarding={onboarding} paymentEvents={paymentEvents} retryPaymentEvent={retryPaymentEvent} retryNotification={retryNotification} refundOrder={refundOrder} />

        {tab === "merchants" && <PlatformApplicationsPanel />}
        {tab === "setup" && <LaunchSetupPanel activeSiteId={activeSiteId} commerceConfiguration={commerceConfiguration} domains={domains} onboarding={onboarding} busy={busy} onRefresh={async () => { await loadCommerceData(); await loadWorkspaceData(); }} onNotice={(next) => setNotice(next)} />}
        {tab === "delivery" && <V22DeliveryWizard activeSiteId={activeSiteId} site={site} cmsRole={cmsRole} onboarding={onboarding} busy={busy} onRefresh={async () => { await refreshCms(); await loadWorkspaceData(); }} onNotice={(next) => setNotice(next)}><DeliveryPanel sites={sites} site={site} activeSiteId={activeSiteId} setActiveSiteId={setActiveSiteId} siteForm={siteForm} setSiteForm={setSiteForm} createClientSite={createClientSite} onboarding={onboarding} busy={busy} onRefresh={async () => { await refreshCms(); await loadWorkspaceData(); }} onNotice={(next) => setNotice(next)} /></V22DeliveryWizard>}
        {tab === "v21" && <><V21OperationsPanel activeSiteId={activeSiteId} cmsRole={cmsRole} config={config} updateConfig={updateConfig} onNotice={(next) => setNotice(next)} /><BundleManager activeSiteId={activeSiteId} cmsRole={cmsRole} onNotice={(next) => setNotice(next)} /></>}
        {tab === "v22" && <V22OperationsPanel activeSiteId={activeSiteId} cmsRole={cmsRole} onNotice={(next) => setNotice(next)} />}
         {tab === "v23" && <V23ConfigurationPanel activeSiteId={activeSiteId} cmsRole={cmsRole || "viewer"} onNotice={setNotice} />}
         {tab === "v24" && <V24OperationsPanel activeSiteId={activeSiteId} cmsRole={cmsRole || "viewer"} onNotice={setNotice} />}

        {tab === "overview" && onboarding && <section className="v6-card v6-onboarding-card"><div className="v6-card-heading"><div><p className="eyebrow">V20 delivery center</p><h2>{onboarding.progress.done}/{onboarding.progress.total} required checks ready.</h2></div><span>{onboarding.readiness?.score ?? Math.round(onboarding.progress.done / Math.max(1, onboarding.progress.total) * 100)}% ready</span></div><div className="v6-checks">{onboarding.checks.map((check) => <div className={check.done ? "done" : ""} key={check.key}><span>{check.done ? "OK" : "!"}</span>{check.label}<small>{check.detail}{check.required === false ? " Optional for this site." : ""}</small></div>)}</div><div className="v6-divider"><p className="eyebrow">Replacement checklist</p><div className="v6-version-list">{onboarding.replacements.map((item) => <article key={item.key}><div><strong>{item.label}</strong><span>{item.source}</span></div><span className={item.done ? "v6-status-chip is-ready" : "v6-status-chip is-missing"}>{item.done ? "Replaced" : item.required ? "Required" : "Optional"}</span></article>)}</div></div><div className="v6-divider"><p className="eyebrow">Batch import</p><p className="v6-muted">Upload a client JSON package or product CSV into this tenant draft.</p><button className="button button-outline" onClick={() => clientImportInput.current?.click()} disabled={busy}>Import client JSON / CSV <span>+</span></button><input ref={clientImportInput} type="file" accept=".csv,.json,text/csv,application/json" className="sr-only" onChange={(event) => void importClientFile(event)} /></div></section>}

        {tab === "overview" && <section className="v6-grid v6-overview">
          <div className="v6-card v6-card-large"><p className="eyebrow">Launch readiness</p><h2>{requiredChecks.filter((check) => check.done).length}/{requiredChecks.length} required checks ready.</h2><p className="v6-muted">V20 stores the release checks per client site. Publish creates a revision only after every required check passes.</p><div className="v6-checks">{requiredChecks.map((check) => <div className={check.done ? "done" : ""} key={check.key || check.label}><span>{check.done ? "OK" : "!"}</span>{check.label}</div>)}</div><button className="button button-dark" onClick={() => void publish()} disabled={busy || requiredChecks.some((check) => !check.done)}>Publish when ready <span>→</span></button></div>
          <div className="v6-card"><p className="eyebrow">Client onboarding</p><h2>Start a new site.</h2><p className="v6-muted">Create an isolated D1 workspace for a new B2B client. Add brand, media and products in draft.</p><form className="v6-form" onSubmit={createClientSite}><Field label="Client name" value={siteForm.name} onChange={(value) => setSiteForm((current) => ({ ...current, name: value, slug: current.slug || slugify(value) }))} placeholder="Acme Outdoor" /><Field label="URL slug" value={siteForm.slug} onChange={(value) => setSiteForm((current) => ({ ...current, slug: slugify(value) }))} placeholder="acme-outdoor" /><button className="button button-outline" disabled={busy || !siteForm.name || !siteForm.slug}>Create client site <span>+</span></button></form></div>
          <div className="v6-card"><p className="eyebrow">V10 handoff</p><h2>One replacement list.</h2><p className="v6-muted">Use the B2B content list to collect the logo, palette, product CSV, legal copy, domain and launch owner before handoff.</p><a className="text-link" href="/about">View storefront example <span>↗</span></a></div>
        </section>}

        {tab === "brand" && <section className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Brand system</p><h2>Replace the client story.</h2></div><span>Autosaved draft</span></div><div className="v6-form-grid"><Field label="Brand name" value={config.brand.name} onChange={(value) => setBrand("name", value)} /><Field label="Logo mark" value={config.brand.mark} onChange={(value) => setBrand("mark", value)} /><Field label="Tagline" value={config.brand.tagline} onChange={(value) => setBrand("tagline", value)} /><Field label="Descriptor" value={config.brand.descriptor} onChange={(value) => setBrand("descriptor", value)} /><Field label="Origin line" value={config.brand.originLine} onChange={(value) => setBrand("originLine", value)} /><Field label="Footer line" value={config.brand.footerLine} onChange={(value) => setBrand("footerLine", value)} /><Field label="Hero label" value={config.content.home.heroLabel} onChange={(value) => setHome("heroLabel", value)} /><Field label="Hero CTA" value={config.content.home.heroCta} onChange={(value) => setHome("heroCta", value)} /><Field label="Hero lead" value={config.content.home.heroTitleLead} onChange={(value) => setHome("heroTitleLead", value)} /><Field label="Hero accent" value={config.content.home.heroTitleAccent} onChange={(value) => setHome("heroTitleAccent", value)} /><Field label="Hero body" value={config.content.home.heroBody} onChange={(value) => setHome("heroBody", value)} multiline /><Field label="Intro body" value={config.content.home.introBody} onChange={(value) => setHome("introBody", value)} multiline /><Field label="Story body" value={config.content.home.storyBody} onChange={(value) => setHome("storyBody", value)} multiline /><Field label="Newsletter body" value={config.content.home.newsletterBody} onChange={(value) => setHome("newsletterBody", value)} multiline /></div><div className="v6-divider"><p className="eyebrow">Theme palette</p><div className="v6-palette">{Object.entries(config.theme.colors).map(([key, value]) => <label key={key}><span>{key}</span><input type="color" value={value.startsWith("#") ? value : "#1d1f1c"} onChange={(event) => updateConfig((current) => { current.theme.colors[key as keyof typeof current.theme.colors] = event.target.value; return current; })} /><input value={value} onChange={(event) => updateConfig((current) => { current.theme.colors[key as keyof typeof current.theme.colors] = event.target.value; return current; })} /></label>)}</div></div></section>}

        {tab === "brand" && <section className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Commerce identity</p><h2>Keep every client storefront distinct.</h2></div><span>Saved in the tenant draft</span></div><p className="v6-muted">These values are used by checkout, PayPal, order numbers and shipping estimates for this client site.</p><div className="v6-form-grid"><Field label="Currency code" value={config.commerce.currency} onChange={(value) => updateConfig((current) => { current.commerce.currency = value.toUpperCase().slice(0, 3); return current; })} /><Field label="Order number prefix" value={config.commerce.orderPrefix} onChange={(value) => updateConfig((current) => { current.commerce.orderPrefix = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); return current; })} /><Field label="Standard shipping" value={String(config.commerce.shipping.standard)} onChange={(value) => updateConfig((current) => { current.commerce.shipping.standard = Math.max(0, Number(value) || 0); return current; })} /><Field label="Express shipping" value={String(config.commerce.shipping.express)} onChange={(value) => updateConfig((current) => { current.commerce.shipping.express = Math.max(0, Number(value) || 0); return current; })} /><Field label="Free shipping threshold" value={String(config.commerce.shipping.freeThreshold)} onChange={(value) => updateConfig((current) => { current.commerce.shipping.freeThreshold = Math.max(0, Number(value) || 0); return current; })} /></div></section>}

        {tab === "products" && <section className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Catalog</p><h2>{catalog.length} products in draft.</h2></div><div className="v6-actions"><button className="button button-outline" onClick={() => csvInput.current?.click()}>Import CSV</button><input ref={csvInput} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void importCsv(event)} /><button className="button button-outline" onClick={exportCsv}>Export CSV</button><button className="button button-dark" onClick={() => setEditingProduct({ ...clone(templateProducts[0]), id: `product-${crypto.randomUUID().slice(0, 8)}`, name: "New client product", slug: "new-client-product", sku: `SKU-${catalog.length + 1}` })}>New product <span>+</span></button></div></div><div className="v6-product-tools"><input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search name, SKU or category" /><select value={productFilter} onChange={(event) => setProductFilter(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="draft">Draft</option></select></div><div className="v6-product-list">{filteredProducts.map((product) => <article className="v6-product-row" key={product.id}><img src={product.image} alt="" /><div><strong>{product.name}</strong><span>{product.sku} · {product.category}</span></div><span className={`product-status ${product.status}`}>{product.status}</span><span>${product.price.toFixed(2)} · {product.stock} in stock</span><div className="v6-actions"><button className="text-button" onClick={() => setEditingProduct(clone(product))}>Edit</button><button className="text-button danger" onClick={() => updateCatalog((current) => current.filter((item) => item.id !== product.id))}>Remove</button></div></article>)}{filteredProducts.length === 0 && <div className="v6-empty">No products match this filter. Import a CSV or create a product.</div>}</div><p className="v6-help">CSV columns: name, slug, sku, category, price, stock, status, description, image, tags. Use a vertical bar to separate images, colors or tags.</p></section>}

        {tab === "media" && <section className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">R2 media library</p><h2>Client-owned visual assets.</h2></div><span>10 MB max · images only</span></div><form className="v6-media-upload" onSubmit={uploadMedia}><label className="v6-file-input"><span>Choose image</span><input ref={mediaInput} type="file" accept="image/*" /></label><Field label="Alt text" value={mediaForm.alt} onChange={(value) => setMediaForm((current) => ({ ...current, alt: value }))} placeholder="Describe the image" /><label className="v6-field"><span>Usage</span><select value={mediaForm.kind} onChange={(event) => setMediaForm((current) => ({ ...current, kind: event.target.value }))}><option value="hero">Hero</option><option value="story">Story</option><option value="product">Product</option><option value="general">General</option></select></label><button className="button button-dark" disabled={busy}>Upload to R2 <span>↑</span></button></form><div className="v6-media-grid">{assets.map((asset) => <article className="v6-media-card" key={asset.id}><img src={asset.url} alt={asset.alt} /><div><strong>{asset.assetKey}</strong><span>{asset.kind} · {Math.round(asset.sizeBytes / 1024)} KB</span><div className="v6-actions"><button className="text-button" onClick={() => { void navigator.clipboard?.writeText(asset.url); setNotice({ tone: "success", text: "Asset URL copied." }); }}>Copy URL</button><button className="text-button" onClick={() => updateConfig((current) => { current.assets.hero = asset.url; return current; })}>Use as hero</button><button className="text-button danger" onClick={() => void deleteMedia(asset)}>Delete</button></div></div></article>)}{assets.length === 0 && <div className="v6-empty">Upload the first client image. R2 assets are isolated by site.</div>}</div></section>}

        {tab === "access" && <section className="v6-grid"><div className="v6-card"><p className="eyebrow">Site members</p><h2>Role-based access.</h2><p className="v6-muted">Owners manage members, editors manage draft content and viewers can review the workspace.</p><div className="v6-member-list">{members.map((member) => <div key={`${member.siteId}-${member.userId}`}><span>{member.email}</span><strong>{member.role}</strong></div>)}{members.length === 0 && <div className="v6-empty">No members returned for this site.</div>}</div></div><div className="v6-card"><p className="eyebrow">Add access</p><h2>Invite a collaborator.</h2><form className="v6-form" onSubmit={saveMember}><Field label="Email" value={memberForm.email} onChange={(value) => setMemberForm((current) => ({ ...current, email: value }))} placeholder="client@company.com" /><label className="v6-field"><span>Role</span><select value={memberForm.role} onChange={(event) => setMemberForm((current) => ({ ...current, role: event.target.value as CmsRole }))}><option value="editor">Editor</option><option value="viewer">Viewer</option><option value="owner">Owner</option></select></label><button className="button button-dark" disabled={busy || cmsRole !== "owner" || !memberForm.email}>Save access <span>+</span></button></form>{cmsRole !== "owner" && <p className="v6-help">Only the site owner can change member access.</p>}</div></section>}

        {tab === "versions" && <section className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Release history</p><h2>Drafts you can trust.</h2></div><button className="text-button" onClick={() => void fetchRevisions().then(setRevisions)}>Refresh versions</button></div><div className="v6-version-list">{revisions.map((revision) => <article key={revision.id}><div><strong>{revision.label}</strong><span>{revision.kind} · {new Date(revision.createdAt).toLocaleString()}</span></div><button className="button button-outline" onClick={() => void rollback(revision)} disabled={busy || (cmsRole !== "owner" && cmsRole !== "editor")}>Restore to draft</button></article>)}{revisions.length === 0 && <div className="v6-empty">Published revisions will appear here after the first release.</div>}</div></section>}
        </div>
      </div>

      {editingProduct && <V6ProductEditor product={editingProduct} assets={assets} errors={productValidation} onChange={setEditingProduct} onSave={saveProduct} onCancel={() => { setEditingProduct(null); setProductValidation([]); }} />}
    </main>
  );
}

function parseVariantOptions(value: string) {
  return Object.fromEntries(value.split(";").map((item) => item.trim()).filter(Boolean).map((item) => {
    const [name, option] = item.split("=");
    return [name?.trim() || "Option", option?.trim() || ""];
  }).filter(([, option]) => Boolean(option)));
}

function variantOptionsText(variant: ProductVariant) {
  return Object.entries(variantOptionValues(variant)).map(([name, value]) => `${name}=${value}`).join("; ");
}

function V6ProductEditor({ product, assets, errors, onChange, onSave, onCancel }: { product: Product; assets: CmsAsset[]; errors: string[]; onChange: (product: Product) => void; onSave: () => void; onCancel: () => void }) {
  function patchProduct(patch: Partial<Product>) {
    onChange({ ...product, ...patch });
  }

  function patchImages(value: string) {
    const images = value.split("\n").map((item) => item.trim()).filter(Boolean);
    patchProduct({ images, image: images[0] || "" });
  }

  function addAsset(asset: CmsAsset) {
    const images = product.images.includes(asset.url) ? product.images : [...product.images, asset.url];
    patchProduct({ images, image: images[0] || asset.url, alt: product.alt || asset.alt });
  }

  function patchVariant(index: number, patch: Partial<ProductVariant>) {
    const variants = product.variants.map((variant, variantIndex) => variantIndex === index ? { ...variant, ...patch } : variant);
    const colors = variants.filter((variant) => variant.optionType.toLowerCase() === "color").map((variant) => variant.label).filter(Boolean);
    onChange({ ...product, variants, colors: colors.length ? colors : product.colors });
  }

  function addVariant() {
    const number = product.variants.length + 1;
    const variant: ProductVariant = { id: `${product.id}-variant-${number}`, label: `Option ${number}`, swatch: "#b7aa8f", sku: `${product.sku}-${String(number).padStart(2, "0")}`, optionType: "Option", optionValues: { Option: `Option ${number}` }, stock: 0, available: true };
    onChange({ ...product, variants: [...product.variants, variant] });
  }

  return <div className="v6-editor-backdrop"><section className="v6-editor" role="dialog" aria-modal="true" aria-labelledby="product-editor-title"><div className="v6-card-heading"><div><p className="eyebrow">Product editor / V10</p><h2 id="product-editor-title">{product.name}</h2></div><button type="button" className="close-button" onClick={onCancel} aria-label="Close editor">×</button></div>
    {errors.length > 0 && <div className="v6-validation" role="alert"><strong>Before saving</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
    <div className="v6-form-grid"><Field label="Name" value={product.name} onChange={(value) => patchProduct({ name: value, shortName: value })} /><Field label="Slug" value={product.slug} onChange={(value) => patchProduct({ slug: slugify(value) })} /><Field label="SKU" value={product.sku} onChange={(value) => patchProduct({ sku: value })} /><Field label="Category" value={product.category} onChange={(value) => patchProduct({ category: value })} /><Field label="Price" value={String(product.price)} onChange={(value) => patchProduct({ price: value === "" ? 0 : Number(value) })} /><Field label="Compare-at price" value={product.compareAt === undefined ? "" : String(product.compareAt)} onChange={(value) => patchProduct({ compareAt: value === "" ? undefined : Number(value) })} /><Field label="Product stock fallback" value={String(product.stock)} onChange={(value) => patchProduct({ stock: value === "" ? 0 : Number(value) })} /><Field label="Tags (use |)" value={product.tags.join("|")} onChange={(value) => patchProduct({ tags: value.split("|").map((item) => item.trim()).filter(Boolean) })} /><Field label="Short description" value={product.description} onChange={(value) => patchProduct({ description: value })} multiline /><Field label="Product story" value={product.details} onChange={(value) => patchProduct({ details: value })} multiline /><Field label="Image alt text" value={product.alt} onChange={(value) => patchProduct({ alt: value })} /><Field label="Related product slugs (use |)" value={product.relatedSlugs.join("|")} onChange={(value) => patchProduct({ relatedSlugs: value.split("|").map((item) => item.trim()).filter(Boolean) })} multiline /><Field label="Option groups (Color: Black | Sand)" value={product.options.map((option) => `${option.name}: ${option.values.join(" | ")}`).join("\n")} onChange={(value) => patchProduct({ options: value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => { const [name, values] = line.split(":"); return { name: name?.trim() || "Option", values: (values || "").split("|").map((item) => item.trim()).filter(Boolean) }; }).filter((option) => option.values.length) })} multiline /></div>
    <div className="v6-editor-section"><p className="eyebrow">Product media</p><h3>Use uploaded client assets or external URLs.</h3><Field label="Images (one URL per line)" value={product.images.join("\n")} onChange={patchImages} multiline />{assets.length > 0 && <div className="v6-asset-picker" aria-label="Choose media assets">{assets.filter((asset) => asset.kind === "product" || asset.kind === "general").map((asset) => <button type="button" key={asset.id} className={product.images.includes(asset.url) ? "is-selected" : ""} onClick={() => addAsset(asset)} aria-label={`Add ${asset.assetKey}`}><img src={asset.url} alt={asset.alt} /><span>{asset.assetKey}</span></button>)}</div>}{assets.length === 0 && <p className="v6-help">Upload product images in the Media library first, then return here to bind them.</p>}</div>
    <div className="v6-editor-section"><div className="v6-card-heading"><div><p className="eyebrow">Variants / SKU matrix</p><h3>Each option can carry its own price and stock.</h3></div><button type="button" className="text-button" onClick={addVariant}>Add variant +</button></div><div className="v6-variant-list">{product.variants.map((variant, index) => <div className="v6-variant-row" key={variant.id}><Field label="Option type" value={variant.optionType} onChange={(value) => patchVariant(index, { optionType: value, optionValues: { [value || "Option"]: variant.label } })} /><Field label="Label" value={variant.label} onChange={(value) => patchVariant(index, { label: value, optionValues: { ...variantOptionValues(variant), [variant.optionType || "Option"]: value } })} /><Field label="SKU" value={variant.sku} onChange={(value) => patchVariant(index, { sku: value })} /><Field label="Price override" value={variant.price === undefined ? "" : String(variant.price)} onChange={(value) => patchVariant(index, { price: value === "" ? undefined : Number(value) })} /><Field label="Stock" value={variant.stock === undefined ? "" : String(variant.stock)} onChange={(value) => patchVariant(index, { stock: value === "" ? undefined : Number(value) })} /><Field label="Option values (Color=Black; Size=M)" value={variantOptionsText(variant)} onChange={(value) => patchVariant(index, { optionValues: parseVariantOptions(value) })} /><label className="v6-check-field"><input type="checkbox" checked={variant.available} onChange={(event) => patchVariant(index, { available: event.target.checked })} /> Available</label><button type="button" className="text-button danger" disabled={product.variants.length === 1} onClick={() => onChange({ ...product, variants: product.variants.filter((_, variantIndex) => variantIndex !== index) })}>Remove</button></div>)}</div></div>
    <div className="v6-editor-options"><label className="v6-field"><span>Status</span><select value={product.status} onChange={(event) => patchProduct({ status: event.target.value as Product["status"] })}><option value="active">Active</option><option value="draft">Draft</option></select></label><label className="v6-check-field"><input type="checkbox" checked={product.featured} onChange={(event) => patchProduct({ featured: event.target.checked })} /> Featured product</label></div><div className="editor-actions"><button type="button" className="button button-outline" onClick={onCancel}>Cancel</button><button type="button" className="button button-dark" onClick={onSave}>Save product <span>↗</span></button></div></section></div>;
}
