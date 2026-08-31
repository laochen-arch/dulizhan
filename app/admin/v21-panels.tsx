"use client";
import { TaskSections } from "../components/backoffice";

import { useCallback, useEffect, useState } from "react";
import type { EditableSiteConfig } from "../components/site-runtime";

type Notice = { tone: "success" | "error" | "info"; text: string };
type Intake = Record<string, string> & { status?: string };
type Health = { key: string; status: string; detail: string; checkedAt: string };
type BundleRow = { id: string; name: string; slug: string; productIds: string[]; discountType: string; discountValue: number; active: boolean };

function Button({ children, onClick, disabled = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="button button-outline" onClick={onClick} disabled={disabled}>{children}</button>;
}

export function V21OperationsPanel({ activeSiteId, cmsRole, config, updateConfig, onNotice }: { activeSiteId: string; cmsRole?: string; config: EditableSiteConfig; updateConfig: (updater: (current: EditableSiteConfig) => EditableSiteConfig) => void; onNotice: (notice: Notice) => void }) {
  const [intake, setIntake] = useState<Intake>({});
  const [health, setHealth] = useState<Health[]>([]);
  const [analytics, setAnalytics] = useState<{ paidOrders: number; revenue: number; openAbandonedCheckouts: number; events: Array<{ eventType: string; count: number }> } | null>(null);
  const [afterSales, setAfterSales] = useState<Array<{ id: string; orderNumber?: string; email: string; requestType: string; reason: string; status: string }>>([]);
  const [coupons, setCoupons] = useState<Array<{ id: string; code: string; discountType: string; discountValue: number; active: boolean }>>([]);
  const [reviews, setReviews] = useState<Array<{ id: string; productId: string; rating: number; body: string; status: string }>>([]);
  const [coupon, setCoupon] = useState({ code: "", discountType: "percent", discountValue: "10", minSubtotal: "0" });
  const [busy, setBusy] = useState(false);
  const query = `?siteId=${encodeURIComponent(activeSiteId)}`;
  const intakeFields = ["brandName", "logoUrl", "primaryColor", "secondaryColor", "heroUrl", "homeCopy", "shippingPolicy", "returnPolicy", "seoTitle", "seoDescription", "contactEmail", "tradeEmail", "productFile", "domain", "ownerEmail", "notes"];

  const load = useCallback(async () => {
    const responses = await Promise.all([
      fetch(`/api/cms/intake${query}`), fetch(`/api/cms/health${query}`), fetch(`/api/cms/analytics${query}`),
      fetch(`/api/cms/after-sales${query}`), fetch(`/api/cms/coupons${query}`), fetch(`/api/cms/reviews${query}`),
    ]);
    const payloads = await Promise.all(responses.map((response) => response.json().catch(() => ({}))));
    if (responses[0].ok && payloads[0].intake) setIntake(payloads[0].intake);
    if (responses[1].ok) setHealth(payloads[1].checks || []);
    if (responses[2].ok) setAnalytics(payloads[2].analytics || null);
    if (responses[3].ok) setAfterSales(payloads[3].requests || []);
    if (responses[4].ok) setCoupons(payloads[4].coupons || []);
    if (responses[5].ok) setReviews(payloads[5].reviews || []);
  }, [query]);

  // Synchronize the selected tenant with remote CMS state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function post(path: string, body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, ...body }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || message);
      await load(); onNotice({ tone: "success", text: message });
    } catch (error) { onNotice({ tone: "error", text: error instanceof Error ? error.message : message }); }
    finally { setBusy(false); }
  }

  async function patch(path: string, body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      const response = await fetch(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, ...body }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || message);
      await load(); onNotice({ tone: "success", text: message });
    } catch (error) { onNotice({ tone: "error", text: error instanceof Error ? error.message : message }); }
    finally { setBusy(false); }
  }

  const tracking = (config as EditableSiteConfig & { tracking?: { ga4MeasurementId?: string; metaPixelId?: string; tiktokPixelId?: string } }).tracking || {};
  function trackingField(key: "ga4MeasurementId" | "metaPixelId" | "tiktokPixelId", value: string) {
    updateConfig((current) => { const next = current as EditableSiteConfig & { tracking?: Record<string, string> }; next.tracking = { ...(next.tracking || {}), [key]: value }; return next; });
  }

  return <TaskSections className="v21-operations" labels={["经营状态","流量统计设置","客户交付资料","支付异常处理","优惠与客服","商品评价"]}>
    <div className="v6-card v13-setup-hero"><div><p className="eyebrow">V21 / Production operations</p><h2>Close the customer, delivery and recovery loops.</h2><p className="v6-muted">The operating layer for reusable white-label storefronts: handoff intake, payment recovery, support, analytics and launch health.</p></div><Button onClick={() => void load()} disabled={busy}>Refresh V21 data</Button></div>
    <article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Marketing integrations</p><h2>Tenant-owned measurement.</h2></div><span>Optional</span></div><div className="v6-form-grid"><label className="v6-field"><span>GA4 measurement ID</span><input value={tracking.ga4MeasurementId || ""} onChange={(event) => trackingField("ga4MeasurementId", event.target.value.trim())} placeholder="G-XXXXXXXXXX" /></label><label className="v6-field"><span>Meta Pixel ID</span><input value={tracking.metaPixelId || ""} onChange={(event) => trackingField("metaPixelId", event.target.value.trim())} placeholder="1234567890" /></label><label className="v6-field"><span>TikTok Pixel ID</span><input value={tracking.tiktokPixelId || ""} onChange={(event) => trackingField("tiktokPixelId", event.target.value.trim())} placeholder="ABC123" /></label></div><p className="v6-help">IDs save to the tenant draft and scripts load only when configured.</p></article>
    <div className="v6-grid"><article className="v6-card v6-card-large"><div className="v6-card-heading"><div><p className="eyebrow">B2B client intake</p><h2>Collect the delivery packet.</h2></div><span className="v6-status-chip">{intake.status || "incomplete"}</span></div><div className="v6-form-grid">{intakeFields.map((field) => <label className="v6-field" key={field}><span>{field}</span>{["homeCopy", "shippingPolicy", "returnPolicy", "seoDescription", "notes"].includes(field) ? <textarea value={intake[field] || ""} onChange={(event) => setIntake((current) => ({ ...current, [field]: event.target.value }))} /> : <input value={intake[field] || ""} onChange={(event) => setIntake((current) => ({ ...current, [field]: event.target.value }))} />}</label>)}</div><div className="v6-actions"><Button onClick={() => void patch("/api/cms/intake", { action: "save", data: intake }, "Client intake saved.")} disabled={busy || cmsRole === "viewer"}>Save draft</Button><Button onClick={() => void patch("/api/cms/intake", { action: "submit", data: intake }, "Client intake submitted for approval.")} disabled={busy || cmsRole === "viewer"}>Submit for approval</Button><Button onClick={() => void patch("/api/cms/intake", { action: "approve", data: intake }, "Client intake approved.")} disabled={busy || cmsRole !== "owner"}>Approve handoff</Button></div><p className="v6-help">Approval is a publish gate for client sites.</p></article><article className="v6-card"><p className="eyebrow">Launch health</p><h2>Production dependencies.</h2><div className="v6-version-list">{health.map((check) => <div className="v6-inline-row" key={check.key}><span><strong>{check.key}</strong><small>{check.detail}</small></span><span className={`v6-status-chip ${check.status === "ready" ? "is-ready" : "is-missing"}`}>{check.status}</span></div>)}{!health.length && <p className="v6-muted">Run a health check to persist the latest status.</p>}</div><Button onClick={() => void post("/api/cms/health", {}, "Health checks completed.")} disabled={busy || cmsRole === "viewer"}>Run health checks</Button></article></div>
    <div className="v6-grid"><article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Payment recovery</p><h2>Retry and reconcile.</h2></div></div><p className="v6-muted">Dead-lettered PayPal webhooks remain visible in the event log. Reconciliation checks pending PayPal orders against the provider.</p><div className="v6-actions"><Button onClick={() => void post("/api/cms/commerce/payment-retry", {}, "Due PayPal events retried.")} disabled={busy || cmsRole === "viewer"}>Retry due events</Button><Button onClick={() => void post("/api/cms/commerce/reconcile", {}, "PayPal orders reconciled.")} disabled={busy || cmsRole === "viewer"}>Reconcile orders</Button></div></article><article className="v6-card"><p className="eyebrow">Analytics</p><h2>{analytics ? `${analytics.paidOrders} paid orders` : "No snapshot yet"}.</h2><p className="v6-muted">Revenue {analytics ? analytics.revenue.toFixed(2) : "0.00"}; open abandoned checkouts {analytics?.openAbandonedCheckouts || 0}.</p><div className="v6-version-list">{analytics?.events.map((event) => <div className="v6-inline-row" key={event.eventType}><span>{event.eventType}</span><strong>{event.count}</strong></div>)}</div><Button onClick={() => void load()} disabled={busy}>Refresh analytics</Button></article></div>
    <div className="v6-grid"><article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Coupons</p><h2>Simple promotion rules.</h2></div></div><div className="v6-form-grid"><label className="v6-field"><span>Code</span><input value={coupon.code} onChange={(event) => setCoupon((current) => ({ ...current, code: event.target.value }))} placeholder="WELCOME10" /></label><label className="v6-field"><span>Discount type</span><select value={coupon.discountType} onChange={(event) => setCoupon((current) => ({ ...current, discountType: event.target.value }))}><option value="percent">Percent</option><option value="fixed">Fixed amount</option></select></label><label className="v6-field"><span>Value</span><input type="number" min="0.01" value={coupon.discountValue} onChange={(event) => setCoupon((current) => ({ ...current, discountValue: event.target.value }))} /></label></div><Button onClick={() => void post("/api/cms/coupons", { ...coupon, discountValue: Number(coupon.discountValue), minSubtotal: Number(coupon.minSubtotal) }, "Coupon saved.")} disabled={busy || cmsRole === "viewer" || !coupon.code}>Save coupon</Button><div className="v6-version-list">{coupons.map((item) => <div className="v6-inline-row" key={item.id}><span><strong>{item.code}</strong><small>{item.discountType} {item.discountValue}</small></span><span>{item.active ? "active" : "off"}</span></div>)}</div></article><article className="v6-card"><p className="eyebrow">After-sales queue</p><h2>{afterSales.length} customer requests.</h2><div className="v6-version-list">{afterSales.map((item) => <div className="v6-inline-row" key={item.id}><span><strong>{item.orderNumber || item.id} · {item.requestType}</strong><small>{item.email} · {item.reason}</small></span><select value={item.status} disabled={cmsRole === "viewer"} onChange={(event) => void patch("/api/cms/after-sales", { id: item.id, status: event.target.value }, "After-sales request updated.")}><option value="submitted">submitted</option><option value="approved">approved</option><option value="processing">processing</option><option value="completed">completed</option><option value="rejected">rejected</option></select></div>)}{!afterSales.length && <p className="v6-muted">Customer requests will appear here.</p>}</div></article></div>
    <article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Review moderation</p><h2>Approve customer proof.</h2></div></div><div className="v6-version-list">{reviews.map((review) => <div className="v6-inline-row" key={review.id}><span><strong>{review.rating}/5 · {review.productId}</strong><small>{review.body}</small></span><select value={review.status} disabled={cmsRole === "viewer"} onChange={(event) => void patch("/api/cms/reviews", { id: review.id, status: event.target.value }, "Review status updated.")}><option value="pending">pending</option><option value="approved">approved</option><option value="rejected">rejected</option></select></div>)}{!reviews.length && <p className="v6-muted">No reviews submitted yet.</p>}</div></article>
  </TaskSections>;
}

export function BundleManager({ activeSiteId, cmsRole, onNotice }: { activeSiteId: string; cmsRole?: string; onNotice: (notice: Notice) => void }) {
  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [form, setForm] = useState({ name: "", slug: "", productIds: "", discountType: "percent", discountValue: "10" });
  const load = useCallback(async () => { const response = await fetch(`/api/cms/bundles?siteId=${encodeURIComponent(activeSiteId)}`); const payload = await response.json().catch(() => ({})) as { bundles?: BundleRow[] }; if (response.ok) setBundles(payload.bundles || []); }, [activeSiteId]);
  // Synchronize the selected tenant with remote bundle state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  async function save() { const response = await fetch("/api/cms/bundles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, ...form, productIds: form.productIds.split(",").map((item) => item.trim()).filter(Boolean), discountValue: Number(form.discountValue) }) }); const payload = await response.json().catch(() => ({})) as { error?: string }; if (!response.ok) { onNotice({ tone: "error", text: payload.error || "Bundle could not be saved." }); return; } setForm({ name: "", slug: "", productIds: "", discountType: "percent", discountValue: "10" }); await load(); onNotice({ tone: "success", text: "Bundle saved." }); }
  return <article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Bundle merchandising</p><h2>Package a higher-value cart.</h2></div></div><div className="v6-form-grid"><label className="v6-field"><span>Name</span><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Weekend carry kit" /></label><label className="v6-field"><span>Slug</span><input value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} placeholder="weekend-carry-kit" /></label><label className="v6-field"><span>Product IDs (comma separated)</span><input value={form.productIds} onChange={(event) => setForm((current) => ({ ...current, productIds: event.target.value }))} placeholder="product-1, product-2" /></label><label className="v6-field"><span>Discount</span><input type="number" min="0" value={form.discountValue} onChange={(event) => setForm((current) => ({ ...current, discountValue: event.target.value }))} /></label></div><Button onClick={() => void save()} disabled={cmsRole === "viewer" || !form.name || !form.productIds}>Save bundle</Button><div className="v6-version-list">{bundles.map((bundle) => <div className="v6-inline-row" key={bundle.id}><span><strong>{bundle.name}</strong><small>{bundle.slug} · {bundle.productIds.length} products · {bundle.discountType} {bundle.discountValue}</small></span><span>{bundle.active ? "active" : "off"}</span></div>)}{!bundles.length && <p className="v6-muted">No bundles configured.</p>}</div></article>;
}
