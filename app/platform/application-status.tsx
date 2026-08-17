"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Application = {
  id: string; userId: string | null; email: string; applicantType: "business" | "individual"; contactName: string; phone: string | null; companyName: string; brandName: string; category: string; website: string | null; targetDomain: string | null; markets: string | null; productSource: string | null; notes: string | null; templateSiteId: string; brandLogoUrl: string | null; brandPrimaryColor: string | null; homeCopy: string | null; productImport: { products?: unknown[]; productCsv?: string; assetBindings?: Record<string, string> } | null; agreementVersion: string | null; agreementAcceptedAt: string | null; status: string; assignedSiteId: string | null; adminNote: string | null; createdAt: string; updatedAt: string;
};
type Event = { id: string; eventType: string; fromStatus: string | null; toStatus: string | null; note: string | null; createdAt: string };
type DomainRequest = { id: string; hostname: string; status: string; note: string | null; createdAt: string; updatedAt: string };
type Asset = { id: string; assetKey: string; kind: string; url: string; alt: string | null; mimeType: string; sizeBytes: number; createdAt: string };
type Ticket = { id: string; subject: string; message: string; status: string; adminNote: string | null; createdAt: string; updatedAt: string };
type Detail = { application: Application; events: Event[]; domains: DomainRequest[]; assets: Asset[]; tickets: Ticket[]; canReview: boolean };

const statusLabels: Record<string, string> = { submitted: "Submitted", reviewing: "In review", needs_info: "Action required", approved: "Approved", rejected: "Not approved", site_created: "Storefront ready" };
const statusOrder = ["submitted", "reviewing", "approved", "site_created"];

function statusLabel(status: string) { return statusLabels[status] || status.replaceAll("_", " "); }

function progressIndex(status: string) {
  if (status === "rejected") return 1;
  if (status === "needs_info") return 1;
  const index = statusOrder.indexOf(status);
  return index < 0 ? 0 : index;
}

export function PlatformApplicationStatus() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [domain, setDomain] = useState("");
  const [ticket, setTicket] = useState({ subject: "", message: "" });
  const [supplement, setSupplement] = useState({ contactName: "", phone: "", notes: "", homeCopy: "", targetDomain: "" });
  const [assetKind, setAssetKind] = useState("product");

  const query = useMemo(() => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search), []);

  const loadDetail = useCallback(async (id: string, accessToken = "") => {
    const params = new URLSearchParams({ id });
    if (accessToken) params.set("token", accessToken);
    const response = await fetch(`/api/platform/applications?${params.toString()}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as Detail & { error?: string };
    if (!response.ok || !payload.application) throw new Error(payload.error || "Unable to load this application.");
    setDetail(payload);
    setSelectedId(id);
    setSupplement({ contactName: payload.application.contactName, phone: payload.application.phone || "", notes: payload.application.notes || "", homeCopy: payload.application.homeCopy || "", targetDomain: payload.application.targetDomain || "" });
  }, []);

  const loadList = useCallback(async () => {
    const response = await fetch("/api/platform/applications", { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as { applications?: Application[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Sign in to view application status.");
    setApplications(payload.applications || []);
    if (payload.applications?.length && !selectedId) await loadDetail(payload.applications[0].id);
  }, [loadDetail, selectedId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const queryId = query.get("application") || query.get("id");
      const queryToken = query.get("token") || "";
      setToken(queryToken);
      if (queryId) await loadDetail(queryId, queryToken);
      else await loadList();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load application status.");
    } finally {
      setLoading(false);
    }
  }, [loadDetail, loadList, query]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);

  async function reloadDetail() {
    if (selectedId) await loadDetail(selectedId, token);
    else await refresh();
  }

  async function submitSupplement(event: React.FormEvent) {
    event.preventDefault();
    if (!detail) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/platform/applications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: detail.application.id, token, ...supplement }) });
      const payload = await response.json().catch(() => ({})) as { application?: Application; error?: string };
      if (!response.ok || !payload.application) throw new Error(payload.error || "Unable to resubmit the application.");
      setNotice("Your updates were sent back to the platform team.");
      await reloadDetail();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to resubmit the application."); }
    finally { setBusy(false); }
  }

  async function requestDomain(event: React.FormEvent) {
    event.preventDefault();
    if (!detail || !domain.trim()) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/platform/applications/domain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId: detail.application.id, token, hostname: domain, siteId: detail.application.assignedSiteId }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to request the domain.");
      setDomain(""); setNotice("Domain request submitted. The platform team will update its status here."); await reloadDetail();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to request the domain."); }
    finally { setBusy(false); }
  }

  async function submitTicket(event: React.FormEvent) {
    event.preventDefault();
    if (!detail) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/platform/applications/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId: detail.application.id, token, ...ticket }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to create the support request.");
      setTicket({ subject: "", message: "" }); setNotice("Support request sent. Keep this page for the response."); await reloadDetail();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create the support request."); }
    finally { setBusy(false); }
  }

  async function uploadAssets(event: React.ChangeEvent<HTMLInputElement>) {
    if (!detail || !event.target.files?.length) return;
    setBusy(true); setNotice("");
    try {
      for (const file of Array.from(event.target.files)) {
        const body = new FormData(); body.set("applicationId", detail.application.id); if (token) body.set("token", token); body.set("file", file); body.set("kind", assetKind); body.set("alt", file.name);
        const response = await fetch("/api/platform/applications/assets", { method: "POST", body });
        const payload = await response.json().catch(() => ({})) as { error?: string };
        if (!response.ok) throw new Error(payload.error || `Unable to upload ${file.name}.`);
      }
      setNotice(`${event.target.files.length} image(s) uploaded to the application workspace.`); event.target.value = ""; await reloadDetail();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to upload images."); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="platform-status-state"><p className="eyebrow">Merchant onboarding</p><h2>Loading your application workspace.</h2><p>Reading the latest review status and launch tasks...</p></div>;
  if (error && !detail) return <div className="platform-status-state"><p className="eyebrow">Merchant onboarding</p><h2>Sign in or use your secure link.</h2><p>{error}</p><div className="v6-actions"><a className="button button-dark" href={`/signin-with-chatgpt?return_to=${encodeURIComponent("/platform/applications")}`}>Sign in with ChatGPT ↗</a><a className="button button-outline" href="/platform/apply">Start an application</a></div></div>;
  if (!detail) return <div className="platform-status-state"><p className="eyebrow">Merchant onboarding</p><h2>No application selected.</h2><p>Select an application below or submit a new one.</p><div className="v6-actions"><a className="button button-dark" href="/platform/apply">Start an application →</a></div></div>;

  const application = detail.application;
  const checklist = [
    { label: "Application submitted", done: true, detail: "Your business profile is on file." },
    { label: "Template selected", done: Boolean(application.templateSiteId), detail: application.templateSiteId === "default" ? "Northline Commerce / Outdoor" : application.templateSiteId },
    { label: "Brand direction", done: Boolean(application.brandName && (application.brandPrimaryColor || application.homeCopy)), detail: "Brand name, color and homepage direction." },
    { label: "Product materials", done: Boolean(application.productImport?.products?.length || application.productImport?.productCsv || detail.assets.length), detail: "CSV/JSON catalog or uploaded images." },
    { label: "Storefront created", done: Boolean(application.assignedSiteId), detail: application.assignedSiteId || "Waiting for platform approval." },
    { label: "Domain request", done: detail.domains.some((item) => ["reviewing", "active"].includes(item.status)), detail: detail.domains[0]?.hostname || "Optional until the storefront is approved." },
  ];

  return <div className="platform-application-workspace">
    {applications.length > 1 && <label className="platform-application-switcher"><span>Applications for this account</span><select value={selectedId} onChange={(event) => void loadDetail(event.target.value, "")}><option value="">Choose an application...</option>{applications.map((item) => <option value={item.id} key={item.id}>{item.brandName} · {statusLabel(item.status)}</option>)}</select></label>}
    <div className="platform-status-header"><div><p className="eyebrow">Application {application.id}</p><h2>{application.brandName}</h2><p>{application.companyName} · {application.email}</p></div><span className={`platform-status-badge ${application.status}`}>{statusLabel(application.status)}</span></div>
    {error && <div className="client-notice error" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
    {notice && <div className="client-notice success" role="status">{notice}</div>}
    <div className="platform-status-progress">{statusOrder.map((status, index) => <div key={status} className={index <= progressIndex(application.status) ? "is-done" : ""}><span>{String(index + 1).padStart(2, "0")}</span><strong>{statusLabel(status)}</strong></div>)}</div>
    {application.status === "needs_info" || application.status === "rejected" ? <form className="platform-action-card" onSubmit={submitSupplement}><div><p className="eyebrow">Next action</p><h3>{application.status === "needs_info" ? "Add the missing information." : "Update the application and try again."}</h3><p>{application.adminNote || "The platform team left a note for the next submission."}</p></div><div className="v6-form-grid"><label className="v6-field"><span>Contact name</span><input value={supplement.contactName} onChange={(event) => setSupplement((current) => ({ ...current, contactName: event.target.value }))} /></label><label className="v6-field"><span>Phone</span><input value={supplement.phone} onChange={(event) => setSupplement((current) => ({ ...current, phone: event.target.value }))} /></label><label className="v6-field"><span>Target domain</span><input value={supplement.targetDomain} onChange={(event) => setSupplement((current) => ({ ...current, targetDomain: event.target.value }))} placeholder="shop.example.com" /></label><label className="v6-field"><span>Homepage direction</span><textarea value={supplement.homeCopy} onChange={(event) => setSupplement((current) => ({ ...current, homeCopy: event.target.value }))} /></label></div><label className="v6-field"><span>What changed?</span><textarea required value={supplement.notes} onChange={(event) => setSupplement((current) => ({ ...current, notes: event.target.value }))} /></label><button className="button button-dark" disabled={busy}>{busy ? "Sending..." : "Send updated materials →"}</button></form> : <div className="platform-action-card"><div><p className="eyebrow">Review status</p><h3>{application.status === "site_created" ? "Your merchant workspace is ready." : "The platform team is reviewing your launch plan."}</h3><p>{application.adminNote || "We will keep this workspace updated as the application moves through review."}</p></div>{application.assignedSiteId && <a className="button button-dark" href={`/merchant?siteId=${encodeURIComponent(application.assignedSiteId)}`}>Open merchant workspace →</a>}</div>}
    <div className="platform-status-grid"><section className="platform-status-panel"><div className="platform-panel-heading"><div><p className="eyebrow">Launch checklist</p><h3>Prepare before the first order.</h3></div><span>{checklist.filter((item) => item.done).length}/{checklist.length}</span></div><div className="platform-checklist">{checklist.map((item) => <div key={item.label} className={item.done ? "is-done" : ""}><span>{item.done ? "✓" : "·"}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div></div>)}</div></section><section className="platform-status-panel"><div className="platform-panel-heading"><div><p className="eyebrow">Application history</p><h3>Every decision stays visible.</h3></div></div><div className="platform-event-list">{detail.events.map((event) => <div key={event.id}><span>{statusLabel(event.toStatus || event.eventType)}</span><small>{new Date(event.createdAt).toLocaleString()} · {event.note || event.eventType.replaceAll("_", " ")}</small></div>)}{!detail.events.length && <p className="v6-muted">No history events yet.</p>}</div></section></div>
    <div className="platform-status-grid"><section className="platform-status-panel"><div className="platform-panel-heading"><div><p className="eyebrow">Product & media handoff</p><h3>Keep launch materials together.</h3></div><span>{detail.assets.length} media</span></div><p className="v6-muted">Import CSV or JSON from the application form. Upload product, hero or brand images here; the platform team will bind approved media when the storefront is created.</p><div className="platform-upload-controls"><label className="v6-field"><span>Asset type</span><select value={assetKind} onChange={(event) => setAssetKind(event.target.value)}><option value="product">Product</option><option value="hero">Hero</option><option value="brand">Brand / logo</option><option value="general">General</option></select></label><label className="button button-outline platform-file-button"><span>Upload images</span><input type="file" accept="image/*" multiple onChange={(event) => void uploadAssets(event)} disabled={busy} /></label></div><div className="platform-asset-grid">{detail.assets.map((asset) => <figure key={asset.id}><img src={`${asset.url}${token ? "" : ""}`} alt={asset.alt || asset.assetKey} /><figcaption><strong>{asset.assetKey}</strong><small>{asset.kind} · {Math.ceil(asset.sizeBytes / 1024)} KB</small></figcaption></figure>)}{!detail.assets.length && <div className="v6-empty">No uploaded images yet.</div>}</div></section><section className="platform-status-panel"><div className="platform-panel-heading"><div><p className="eyebrow">Domain request</p><h3>Connect the storefront address.</h3></div></div><form className="v6-form" onSubmit={requestDomain}><label className="v6-field"><span>Hostname</span><input required value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="shop.example.com" /></label><button className="button button-dark" disabled={busy}>Request domain review →</button></form><div className="platform-domain-list">{detail.domains.map((item) => <div key={item.id}><strong>{item.hostname}</strong><span className={`platform-status-badge ${item.status}`}>{statusLabel(item.status)}</span><small>{item.note || "Awaiting platform review."}</small></div>)}{!detail.domains.length && <p className="v6-muted">No domain request yet. You can add one before approval.</p>}</div></section></div>
    <section className="platform-status-panel platform-support-panel"><div className="platform-panel-heading"><div><p className="eyebrow">Support</p><h3>Ask the platform team a question.</h3></div></div><div className="platform-support-layout"><form className="v6-form" onSubmit={submitTicket}><label className="v6-field"><span>Subject</span><input required value={ticket.subject} onChange={(event) => setTicket((current) => ({ ...current, subject: event.target.value }))} placeholder="Domain, import or launch question" /></label><label className="v6-field"><span>Message</span><textarea required value={ticket.message} onChange={(event) => setTicket((current) => ({ ...current, message: event.target.value }))} /></label><button className="button button-dark" disabled={busy}>Send support request →</button></form><div className="platform-ticket-list">{detail.tickets.map((item) => <div key={item.id}><div><strong>{item.subject}</strong><small>{new Date(item.updatedAt).toLocaleString()}</small></div><span className={`platform-status-badge ${item.status}`}>{statusLabel(item.status)}</span><p>{item.adminNote || item.message}</p></div>)}{!detail.tickets.length && <div className="v6-empty">No support requests yet.</div>}</div></div></section>
  </div>;
}
