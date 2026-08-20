"use client";

import { useEffect, useMemo, useState } from "react";

type Application = { id: string; email: string; applicantType: string; contactName: string; phone: string | null; companyName: string; brandName: string; category: string; website: string | null; targetDomain: string | null; markets: string | null; productSource: string | null; notes: string | null; templateSiteId: string; brandPrimaryColor: string | null; homeCopy: string | null; productImport?: { products?: unknown[]; productCsv?: string } | null; status: string; assignedSiteId: string | null; adminNote: string | null; ownerInviteStatus?: string; ownerActivatedAt?: string | null; createdAt: string; updatedAt: string };
type Event = { id: string; eventType: string; toStatus: string | null; note: string | null; createdAt: string };
type DomainRequest = { id: string; hostname: string; status: string; note: string | null };
type Ticket = { id: string; subject: string; message: string; status: string; assignedTo: string | null; adminNote: string | null };
type Notification = { id: string; eventType: string; subject: string; status: string; attempts: number; lastError: string | null };
type Detail = { application: Application; events: Event[]; domains: DomainRequest[]; assets: Array<{ id: string; assetKey: string; kind: string; sizeBytes: number }>; tickets: Ticket[]; notifications: Notification[]; canReview: boolean };

const statusLabels: Record<string, string> = { draft: "Draft", submitted: "Submitted", reviewing: "In review", needs_info: "Action required", approved: "Approved", commercial_pending: "Agreement pending", site_creating: "Creating storefront", onboarding_failed: "Delivery failed", rejected: "Not approved", site_created: "Storefront ready", live: "Live", suspended: "Suspended" };
function statusLabel(status: string) { return statusLabels[status] || status.replaceAll("_", " "); }

export function PlatformApplicationsPanel() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [domainDrafts, setDomainDrafts] = useState<Record<string, { status: string; note: string }>>({});
  const [ticketDrafts, setTicketDrafts] = useState<Record<string, { status: string; assignedTo: string; adminNote: string }>>({});

  async function load() {
    const response = await fetch("/api/platform/applications", { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as { applications?: Application[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to load merchant applications.");
    const next = payload.applications || [];
    setApplications(next);
    setNotes(Object.fromEntries(next.map((application) => [application.id, application.adminNote || ""])));
  }

  async function loadDetail(applicationId: string) {
    try {
      const response = await fetch(`/api/platform/applications?id=${encodeURIComponent(applicationId)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as Detail & { error?: string };
      if (!response.ok || !payload.application) throw new Error(payload.error || "Unable to load application details.");
      setDetail(payload);
      setDomainDrafts(Object.fromEntries(payload.domains.map((item) => [item.id, { status: item.status, note: item.note || "" }])));
      setTicketDrafts(Object.fromEntries(payload.tickets.map((item) => [item.id, { status: item.status, assignedTo: item.assignedTo || "", adminNote: item.adminNote || "" }])));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to load application details."); }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load().catch((error) => setNotice(error instanceof Error ? error.message : "Unable to load merchant applications.")); }, []);

  async function update(application: Application, nextStatus?: string, createSite = false) {
    setBusy(true);
    try {
      const response = await fetch("/api/platform/applications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: application.id, status: nextStatus || application.status, adminNote: notes[application.id] || null, createSite }) });
      const payload = await response.json().catch(() => ({})) as { application?: Application; error?: string };
      if (!response.ok || !payload.application) throw new Error(payload.error || "Unable to update application.");
      setApplications((current) => current.map((item) => item.id === application.id ? payload.application as Application : item));
      setNotice(createSite ? (application.assignedSiteId ? "Storefront delivery retried." : "Storefront created. The owner invitation is being sent.") : "Application review saved.");
      await loadDetail(application.id);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to update application."); }
    finally { setBusy(false); }
  }

  async function updateDomain(item: DomainRequest) {
    if (!detail) return; const draft = domainDrafts[item.id]; setBusy(true);
    try {
      const response = await fetch("/api/platform/applications/domain", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId: detail.application.id, requestId: item.id, status: draft?.status || item.status, note: draft?.note || null }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to update domain status.");
      setNotice("Domain status saved and the applicant was notified."); await loadDetail(detail.application.id);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to update domain status."); }
    finally { setBusy(false); }
  }

  async function updateTicket(item: Ticket) {
    if (!detail) return; const draft = ticketDrafts[item.id]; setBusy(true);
    try {
      const response = await fetch("/api/platform/applications/support", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId: detail.application.id, ticketId: item.id, status: draft?.status || item.status, assignedTo: draft?.assignedTo || null, adminNote: draft?.adminNote || null }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to update support request.");
      setNotice("Support request saved."); await loadDetail(detail.application.id);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to update support request."); }
    finally { setBusy(false); }
  }

  async function retryNotification(notificationId: string) {
    if (!detail) return; setBusy(true);
    try {
      const response = await fetch("/api/platform/applications/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId: detail.application.id, notificationId }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to retry notification.");
      setNotice("Notification retry recorded."); await loadDetail(detail.application.id);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to retry notification."); }
    finally { setBusy(false); }
  }

  async function inviteOwner() {
    if (!detail) return; setBusy(true);
    try {
      const response = await fetch("/api/platform/applications/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite_owner", applicationId: detail.application.id }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to send owner invitation.");
      setNotice("Owner invitation sent. Delivery status is recorded below."); await loadDetail(detail.application.id);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to send owner invitation."); }
    finally { setBusy(false); }
  }

  const filteredApplications = useMemo(() => applications.filter((application) => {
    const matchesFilter = filter === "all" || application.status === filter;
    const haystack = `${application.brandName} ${application.companyName} ${application.email} ${application.category}`.toLowerCase();
    return matchesFilter && haystack.includes(query.trim().toLowerCase());
  }), [applications, filter, query]);

  return <section className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Merchant applications</p><h2>Turn qualified applications into storefronts.</h2></div><button className="text-button" type="button" onClick={() => void load()} disabled={busy}>Refresh</button></div><p className="v6-muted">Review every applicant material, domain request, support thread and delivery attempt from one workspace. Status changes and retries are recorded in the application history.</p><div className="v6-commerce-toolbar"><input aria-label="Search applications" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search brand, company, email or category" /><select aria-label="Filter applications" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div><div className="v6-version-list">{filteredApplications.map((application) => <article key={application.id}><div><strong>{application.brandName} / {application.companyName}</strong><span>{application.contactName} · {application.email}{application.phone ? ` · ${application.phone}` : ""} · {application.category}</span><small>{application.markets || "Markets not provided"} · {application.productSource || "Product source not provided"}{application.targetDomain ? ` · ${application.targetDomain}` : ""}</small><small>{application.notes || "No additional notes."}</small><small>Template: {application.templateSiteId} · Created {new Date(application.createdAt).toLocaleString()}</small></div><div className="platform-admin-application-actions"><span className={`platform-status-badge ${application.status}`}>{statusLabel(application.status)}</span><button type="button" className="button button-outline" disabled={busy} onClick={() => void loadDetail(application.id)}>View details</button><select value={application.status} disabled={busy} aria-label={`Status for ${application.brandName}`} onChange={(event) => void update(application, event.target.value)}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><label className="v6-field"><span>Review note</span><textarea value={notes[application.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [application.id]: event.target.value }))} placeholder="Explain approval conditions or missing materials" /></label><button className="button button-outline" type="button" disabled={busy} onClick={() => void update(application)}>Save note</button>{!application.assignedSiteId && application.status === "approved" && <button className="button button-dark" type="button" disabled={busy} onClick={() => void update(application, "site_created", true)}>Create storefront →</button>}{application.status === "onboarding_failed" && application.assignedSiteId && <button className="button button-dark" type="button" disabled={busy} onClick={() => void update(application, "site_created", true)}>Retry delivery →</button>}{application.assignedSiteId && <a className="button button-outline" href={`/admin?siteId=${encodeURIComponent(application.assignedSiteId)}`}>Open site</a>}</div></article>)}{!filteredApplications.length && <div className="v6-empty">No merchant applications match this view.</div>}</div>{detail && <section className="platform-admin-detail"><div className="v6-card-heading"><div><p className="eyebrow">Application detail</p><h3>{detail.application.brandName} · {detail.application.id}</h3><p className="v6-muted">{detail.application.email} · owner invite: {detail.application.ownerInviteStatus || "not_sent"}</p></div><div className="v6-actions"><button type="button" className="text-button" onClick={() => setDetail(null)}>Close</button>{detail.application.assignedSiteId && detail.application.ownerInviteStatus !== "accepted" && <button type="button" className="button button-dark" disabled={busy} onClick={() => void inviteOwner()}>Invite owner →</button>}</div></div><div className="platform-admin-detail-grid"><div className="platform-admin-detail-card"><p className="eyebrow">Applicant and brand</p><p><strong>{detail.application.contactName}</strong><br />{detail.application.companyName}<br />{detail.application.category}<br />{detail.application.markets || "Markets not provided"}</p><p>{detail.application.website || "No existing website"}<br />{detail.application.targetDomain || "No target domain"}</p><div className="platform-admin-brand-preview" style={{ borderColor: detail.application.brandPrimaryColor || "#c9d9e8" }}><strong>{detail.application.brandName}</strong><small>{detail.application.homeCopy || "No homepage direction provided."}</small></div></div><div className="platform-admin-detail-card"><p className="eyebrow">Review and delivery</p><label className="v6-field"><span>Status</span><select value={detail.application.status} disabled={busy} onChange={(event) => void update(detail.application, event.target.value)}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="v6-field"><span>Platform note</span><textarea value={notes[detail.application.id] || detail.application.adminNote || ""} onChange={(event) => setNotes((current) => ({ ...current, [detail.application.id]: event.target.value }))} /></label><button type="button" className="button button-outline" disabled={busy} onClick={() => void update(detail.application)}>Save review decision</button>{detail.application.assignedSiteId && <p className="v6-muted">Site: {detail.application.assignedSiteId}</p>}</div></div><div className="platform-admin-detail-grid"><div className="platform-admin-detail-card"><p className="eyebrow">Domain requests</p>{detail.domains.map((item) => { const draft = domainDrafts[item.id] || { status: item.status, note: item.note || "" }; return <div className="platform-admin-record" key={item.id}><strong>{item.hostname}</strong><select value={draft.status} onChange={(event) => setDomainDrafts((current) => ({ ...current, [item.id]: { ...draft, status: event.target.value } }))}><option value="pending">Pending</option><option value="reviewing">Verifying</option><option value="active">Verified</option><option value="failed">Failed</option></select><textarea value={draft.note} onChange={(event) => setDomainDrafts((current) => ({ ...current, [item.id]: { ...draft, note: event.target.value } }))} placeholder="DNS / SSL result or next action" /><button type="button" className="button button-outline" disabled={busy} onClick={() => void updateDomain(item)}>Save domain status</button></div>; })}{!detail.domains.length && <p className="v6-muted">No domain request yet.</p>}</div><div className="platform-admin-detail-card"><p className="eyebrow">Support requests</p>{detail.tickets.map((item) => { const draft = ticketDrafts[item.id] || { status: item.status, assignedTo: item.assignedTo || "", adminNote: item.adminNote || "" }; return <div className="platform-admin-record" key={item.id}><strong>{item.subject}</strong><small>{item.message}</small><select value={draft.status} onChange={(event) => setTicketDrafts((current) => ({ ...current, [item.id]: { ...draft, status: event.target.value } }))}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select><input value={draft.assignedTo} onChange={(event) => setTicketDrafts((current) => ({ ...current, [item.id]: { ...draft, assignedTo: event.target.value } }))} placeholder="Assigned operator" /><textarea value={draft.adminNote} onChange={(event) => setTicketDrafts((current) => ({ ...current, [item.id]: { ...draft, adminNote: event.target.value } }))} placeholder="Reply or internal note" /><button type="button" className="button button-outline" disabled={busy} onClick={() => void updateTicket(item)}>Save support request</button></div>; })}{!detail.tickets.length && <p className="v6-muted">No support requests yet.</p>}</div></div><div className="platform-admin-detail-card"><p className="eyebrow">Notification delivery</p>{detail.notifications.map((item) => <div className="platform-admin-notification" key={item.id}><span><strong>{item.subject}</strong><small>{item.eventType} · {item.attempts} attempt(s){item.lastError ? ` · ${item.lastError}` : ""}</small></span><span className={`platform-status-badge ${item.status}`}>{item.status}</span>{item.status === "failed" && <button type="button" className="button button-outline" disabled={busy} onClick={() => void retryNotification(item.id)}>Retry</button>}</div>)}{!detail.notifications.length && <p className="v6-muted">No notification records yet.</p>}</div><div className="platform-admin-detail-card"><p className="eyebrow">Audit history</p><div className="platform-event-list">{detail.events.map((event) => <div key={event.id}><span>{statusLabel(event.toStatus || event.eventType)}</span><small>{new Date(event.createdAt).toLocaleString()} · {event.note || event.eventType.replaceAll("_", " ")}</small></div>)}</div></div></section>}{notice && <div className="client-notice info" role="status">{notice}</div>}</section>;
}
