"use client";

import { useEffect, useMemo, useState } from "react";

type Application = { id: string; email: string; applicantType: string; contactName: string; phone: string | null; companyName: string; brandName: string; category: string; website: string | null; targetDomain: string | null; markets: string | null; productSource: string | null; notes: string | null; templateSiteId: string; brandPrimaryColor: string | null; homeCopy: string | null; status: string; assignedSiteId: string | null; adminNote: string | null; createdAt: string; updatedAt: string };

const statusLabels: Record<string, string> = { draft: "Draft", submitted: "Submitted", reviewing: "Reviewing", needs_info: "Needs information", approved: "Approved", rejected: "Rejected", site_created: "Store created" };

export function PlatformApplicationsPanel() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function load() {
    const response = await fetch("/api/platform/applications", { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as { applications?: Application[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to load merchant applications.");
    const next = payload.applications || [];
    setApplications(next);
    setNotes(Object.fromEntries(next.map((application) => [application.id, application.adminNote || ""])));
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
      setNotice(createSite ? (application.assignedSiteId ? "Storefront onboarding retried." : "Storefront created and merchant owner access assigned.") : "Application review saved.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to update application."); }
    finally { setBusy(false); }
  }

  const filteredApplications = useMemo(() => applications.filter((application) => {
    const matchesFilter = filter === "all" || application.status === filter;
    const haystack = `${application.brandName} ${application.companyName} ${application.email} ${application.category}`.toLowerCase();
    return matchesFilter && haystack.includes(query.trim().toLowerCase());
  }), [applications, filter, query]);

  return <section className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Merchant applications</p><h2>Turn qualified applications into storefronts.</h2></div><button className="text-button" type="button" onClick={() => void load()} disabled={busy}>Refresh</button></div><p className="v6-muted">Review the applicant&apos;s materials, explain missing information and create an isolated tenant only after the application is ready. Platform product templates remain separate from the merchant catalog.</p><div className="v6-commerce-toolbar"><input aria-label="Search applications" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search brand, company, email or category" /><select aria-label="Filter applications" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div><div className="v6-version-list">{filteredApplications.map((application) => <article key={application.id}><div><strong>{application.brandName} / {application.companyName}</strong><span>{application.contactName} · {application.email}{application.phone ? ` · ${application.phone}` : ""} · {application.category}</span><small>{application.markets || "Markets not provided"} · {application.productSource || "Product source not provided"}{application.targetDomain ? ` · ${application.targetDomain}` : ""}</small><small>{application.notes || "No additional notes."}</small><small>Template: {application.templateSiteId} · Submitted {new Date(application.createdAt).toLocaleString()}</small></div><div className="platform-admin-application-actions"><select value={application.status} disabled={busy} aria-label={`Status for ${application.brandName}`} onChange={(event) => void update(application, event.target.value)}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><label className="v6-field"><span>Review note</span><textarea value={notes[application.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [application.id]: event.target.value }))} placeholder="Explain approval conditions or missing materials" /></label><button className="button button-outline" type="button" disabled={busy} onClick={() => void update(application)}>Save note</button>{!application.assignedSiteId && application.status === "approved" && <button className="button button-dark" type="button" disabled={busy} onClick={() => void update(application, "site_created", true)}>Create storefront →</button>}{application.assignedSiteId && application.status !== "site_created" && <button className="button button-dark" type="button" disabled={busy} onClick={() => void update(application, "site_created", true)}>Retry onboarding →</button>}{application.assignedSiteId && <a className="button button-outline" href={`/admin?siteId=${encodeURIComponent(application.assignedSiteId)}`}>Open site</a>}</div></article>)}{!filteredApplications.length && <div className="v6-empty">No merchant applications match this view.</div>}</div>{notice && <div className="client-notice info" role="status">{notice}</div>}</section>;
}
