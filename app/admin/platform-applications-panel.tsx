"use client";

import { useEffect, useState } from "react";

type Application = { id: string; email: string; contactName: string; companyName: string; brandName: string; category: string; website: string | null; targetDomain: string | null; markets: string | null; productSource: string | null; notes: string | null; status: string; assignedSiteId: string | null; adminNote: string | null; createdAt: string; updatedAt: string };

export function PlatformApplicationsPanel() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  async function load() {
    const response = await fetch("/api/platform/applications", { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as { applications?: Application[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to load merchant applications.");
    setApplications(payload.applications || []);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load().catch((error) => setNotice(error instanceof Error ? error.message : "Unable to load merchant applications.")); }, []);
  async function update(application: Application, nextStatus: string, createSite = false) {
    setBusy(true);
    try {
      const response = await fetch("/api/platform/applications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: application.id, status: nextStatus, createSite }) });
      const payload = await response.json().catch(() => ({})) as { application?: Application; error?: string };
      if (!response.ok || !payload.application) throw new Error(payload.error || "Unable to update application.");
      setApplications((current) => current.map((item) => item.id === application.id ? payload.application as Application : item));
      setNotice(createSite ? "Storefront created and merchant owner access assigned." : "Application status updated.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to update application."); }
    finally { setBusy(false); }
  }
  return <section className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Merchant applications</p><h2>Turn qualified applications into storefronts.</h2></div><button className="text-button" type="button" onClick={() => void load()} disabled={busy}>Refresh</button></div><p className="v6-muted">This is the platform team queue. Approve an application to create a tenant from the template, then the applicant becomes its merchant owner. Platform product templates remain separate from the merchant catalog.</p><div className="v6-version-list">{applications.map((application) => <article key={application.id}><div><strong>{application.brandName} / {application.companyName}</strong><span>{application.contactName} · {application.email} · {application.category}</span><small>{application.markets || "Markets not provided"} · {application.productSource || "Product source not provided"}{application.targetDomain ? ` · ${application.targetDomain}` : ""}</small><small>{application.notes || "No additional notes."}</small></div><div className="v6-actions"><select value={application.status} disabled={busy} onChange={(event) => void update(application, event.target.value)}><option value="submitted">Submitted</option><option value="reviewing">Reviewing</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="site_created">Store created</option></select>{!application.assignedSiteId && <button className="button button-dark" type="button" disabled={busy} onClick={() => void update(application, "site_created", true)}>Create storefront →</button>}{application.assignedSiteId && <a className="button button-outline" href={`/admin?siteId=${encodeURIComponent(application.assignedSiteId)}`}>Open site</a>}</div></article>)}{!applications.length && <div className="v6-empty">No merchant applications are waiting for review.</div>}</div>{notice && <div className="client-notice info" role="status">{notice}</div>}</section>;
}
