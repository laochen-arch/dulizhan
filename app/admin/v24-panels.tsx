"use client";
import { TaskSections } from "../components/backoffice";

import { useCallback, useEffect, useState } from "react";
import type { CmsRole } from "../../db/cms";

type Notice = { tone: "success" | "error" | "info"; text: string };
type Check = { key: string; label: string; detail: string; done: boolean; required?: boolean };
type Release = { id: string; status: string; label: string; note: string | null; requestedByEmail: string; requestedAt: string; reviewedAt: string | null; revisionId: string | null; publishedAt: string | null };
type Revision = { id: string; kind: string; label: string; createdAt: string; createdBy: string };
type Backup = { id: string; status: string; reason: string; checksum: string; rowCounts: Record<string, number>; sizeBytes: number; createdAt: string; verifiedAt: string | null; lastError: string | null };
type LaunchCenter = {
  readiness: { score: number; blockers: Array<{ key: string; label: string; detail: string; source: string }>; launch: { checks: Check[]; progress: { done: number; total: number } }; health: Array<{ key: string; status: string; detail: string; checkedAt: string }>; openOperations: number; recentOperations: Array<{ id: string; action: string; status: string; severity: string; message: string; createdAt: string }> };
  releases: Release[];
  revisions: Revision[];
  diff: { totalChanges: number; changes: string[] };
  integrations: Array<{ provider: string; status: string; source: string; lastCheckedAt: string | null; lastError: string | null }>;
  backups: Backup[];
  operations: { orders: number; paidOrders: number; openAfterSales: number; lowStock: number; availableUnits: number; failedEvents: number };
};

export function V24OperationsPanel({ activeSiteId, cmsRole, onNotice }: { activeSiteId: string; cmsRole: CmsRole; onNotice: (notice: Notice) => void }) {
  const [center, setCenter] = useState<LaunchCenter | null>(null);
  const [busy, setBusy] = useState(false);
  const [releaseNote, setReleaseNote] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/cms/launch-center?siteId=${encodeURIComponent(activeSiteId)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as LaunchCenter & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to load the V24 launch center.");
    setCenter(payload);
  }, [activeSiteId]);

  // Launch center state is remote tenant state; refresh it after switching sites.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load().catch((error) => onNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to load the V24 launch center." })); }, [load, onNotice]);

  async function runHealthChecks() {
    setBusy(true);
    try {
      const response = await fetch("/api/cms/health", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Health checks failed.");
      await load();
      onNotice({ tone: "success", text: "Production health checks completed and provider results were persisted." });
    } catch (error) { onNotice({ tone: "error", text: error instanceof Error ? error.message : "Health checks failed." }); }
    finally { setBusy(false); }
  }

  async function createShare() {
    setBusy(true);
    try {
      const response = await fetch("/api/cms/preview-share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, hours: 24 }) });
      const payload = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error || "Unable to create preview share.");
      await navigator.clipboard?.writeText(payload.url);
      onNotice({ tone: "success", text: "A 24-hour draft preview link was copied to the clipboard." });
    } catch (error) { onNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to create preview share." }); }
    finally { setBusy(false); }
  }

  async function backupAction(action: "create" | "verify", backupId?: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/cms/backups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, action, backupId }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to complete the backup action.");
      await load();
      onNotice({ tone: "success", text: action === "create" ? "Tenant backup stored and verified in private media storage." : "Non-destructive restore drill passed checksum and tenant validation." });
    } catch (error) { onNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to complete the backup action." }); }
    finally { setBusy(false); }
  }

  async function requestRelease() {
    setBusy(true);
    try {
      const response = await fetch("/api/cms/releases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, label: "Client storefront release", note: releaseNote }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to request release.");
      setReleaseNote("");
      await load();
      onNotice({ tone: "success", text: "Release request submitted for owner approval." });
    } catch (error) { onNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to request release." }); }
    finally { setBusy(false); }
  }

  async function releaseAction(requestId: string, action: "approve" | "reject" | "publish" | "cancel") {
    setBusy(true);
    try {
      const response = await fetch("/api/cms/releases", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, requestId, action }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to update release request.");
      await load();
      onNotice({ tone: "success", text: action === "publish" ? "Approved release published." : `Release request ${action}d.` });
    } catch (error) { onNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to update release request." }); }
    finally { setBusy(false); }
  }

  async function rollback(revisionId: string) {
    if (!window.confirm("Restore this published revision and publish the rollback immediately?")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/cms/releases", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, action: "rollback", revisionId }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to publish rollback.");
      await load();
      onNotice({ tone: "success", text: "Rollback published and recorded as a new revision." });
    } catch (error) { onNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to publish rollback." }); }
    finally { setBusy(false); }
  }

  if (!center) return <section className="v6-card"><p className="eyebrow">V24 / Launch center</p><h2>Loading production controls.</h2><p className="v6-muted">Reading release requests, health checks and tenant operations...</p></section>;
  const canEdit = cmsRole === "owner" || cmsRole === "editor";
  const isOwner = cmsRole === "owner";
  return <TaskSections className="v24-launch-shell" labels={["检查概览","经营摘要","检查结果","预览与发布申请","备份与恢复演练","审核队列","回滚记录"]}>
    <div className="v6-card v24-launch-hero"><div><p className="eyebrow">V24 / Production launch center · V59 hardening</p><h2>Ship each tenant with a traceable release gate.</h2><p className="v6-muted">Live providers, custom domain, automatic recovery, private backups, owner approval and rollback are stored per client site.</p></div><div className="v24-score"><strong>{center.readiness.score}%</strong><span>ready</span><button type="button" className="button button-dark" onClick={() => void runHealthChecks()} disabled={!canEdit || busy}>{busy ? "Working..." : "Run health checks →"}</button></div></div>
    <div className="v24-metrics"><div><span>Orders</span><strong>{center.operations.orders}</strong></div><div><span>Paid</span><strong>{center.operations.paidOrders}</strong></div><div><span>Open after-sales</span><strong>{center.operations.openAfterSales}</strong></div><div><span>Low stock</span><strong>{center.operations.lowStock}</strong></div><div><span>Failed events</span><strong>{center.operations.failedEvents}</strong></div></div>
    <div className="v6-grid"><article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Release blockers</p><h3>{center.readiness.blockers.length} item(s) need attention.</h3></div><button type="button" className="text-button" onClick={() => void load()}>Refresh</button></div><div className="v24-list">{center.readiness.blockers.slice(0, 16).map((item) => <div key={item.key}><span className="v24-dot error">!</span><span><strong>{item.label}</strong><small>{item.detail}</small></span></div>)}{!center.readiness.blockers.length && <div className="v6-empty">No release blockers detected.</div>}</div></article><article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Runtime checks</p><h3>Payment, email, domain and storage.</h3></div><span>{center.readiness.health.filter((item) => item.status === "ready").length}/{center.readiness.health.length}</span></div><div className="v24-list">{center.readiness.health.map((item) => <div key={item.key}><span className={`v24-dot ${item.status === "ready" ? "ready" : "error"}`}>{item.status === "ready" ? "✓" : "!"}</span><span><strong>{item.key}</strong><small>{item.detail}</small></span></div>)}{!center.readiness.health.length && <div className="v6-empty">Run the checks to persist a runtime snapshot.</div>}</div></article></div>
    <div className="v6-grid"><article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Draft handoff</p><h3>{center.diff.totalChanges} change(s) waiting for review.</h3></div><button type="button" className="button button-outline" onClick={() => void createShare()} disabled={!canEdit || busy}>Copy preview link</button></div><div className="v24-diff-list">{center.diff.changes.slice(0, 12).map((change) => <span key={change}>+ {change}</span>)}{!center.diff.changes.length && <p className="v6-muted">Draft and published snapshots are aligned.</p>}</div><label className="v6-field"><span>Release note</span><textarea value={releaseNote} onChange={(event) => setReleaseNote(event.target.value)} placeholder="What should the owner verify before publishing?" disabled={!canEdit} /></label><button type="button" className="button button-dark" onClick={() => void requestRelease()} disabled={!canEdit || busy || !center.diff.totalChanges}>Request owner approval →</button></article><article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Tenant integrations</p><h3>Masked provider state.</h3></div><a className="text-link" href={`/admin?tab=v23&siteId=${encodeURIComponent(activeSiteId)}`}>Configure →</a></div><div className="v24-list">{center.integrations.map((item) => <div key={item.provider}><span className={`v24-dot ${item.status === "ready" ? "ready" : "error"}`}>{item.status === "ready" ? "✓" : "!"}</span><span><strong>{item.provider}</strong><small>{item.status} · {item.source}{item.lastCheckedAt ? ` · checked ${new Date(item.lastCheckedAt).toLocaleString()}` : ""}</small></span></div>)}</div></article></div>
    <article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Backup & restore drill</p><h3>Private, tenant-scoped recovery evidence.</h3></div>{isOwner && <button type="button" className="button button-dark" onClick={() => void backupAction("create")} disabled={busy}>Create verified backup</button>}</div><p className="v6-muted">Backups exclude provider secrets, are stored privately in R2, retained for 14 versions and validated without changing production data.</p><div className="v24-release-list">{center.backups.map((backup) => <div key={backup.id}><div><strong>{backup.status === "verified" ? "Verified tenant backup" : "Backup needs attention"}</strong><small>{backup.reason} · {new Date(backup.createdAt).toLocaleString()} · {Math.ceil(backup.sizeBytes / 1024)} KB</small>{backup.lastError && <p>{backup.lastError}</p>}</div><div className="v6-actions">{isOwner && <button type="button" className="button button-outline" onClick={() => void backupAction("verify", backup.id)} disabled={busy}>Run restore drill</button>}{isOwner && backup.status === "verified" && <a className="text-link" href={`/api/cms/backups?siteId=${encodeURIComponent(activeSiteId)}&download=${encodeURIComponent(backup.id)}`}>Download export →</a>}</div></div>)}{!center.backups.length && <div className="v6-empty">No tenant backup yet. Create one before requesting the production release.</div>}</div></article>
    <article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Approval queue</p><h3>Request → approve → publish.</h3></div><span>{center.releases.length} records</span></div><div className="v24-release-list">{center.releases.map((release) => <div key={release.id}><div><strong>{release.label}</strong><small>{release.status} · {release.requestedByEmail} · {new Date(release.requestedAt).toLocaleString()}</small>{release.note && <p>{release.note}</p>}</div><div className="v6-actions">{isOwner && release.status === "pending" && <><button type="button" className="text-button" onClick={() => void releaseAction(release.id, "approve")} disabled={busy}>Approve</button><button type="button" className="text-button danger" onClick={() => void releaseAction(release.id, "reject")} disabled={busy}>Reject</button></>}{isOwner && release.status === "approved" && <button type="button" className="button button-dark" onClick={() => void releaseAction(release.id, "publish")} disabled={busy}>Publish</button>}{canEdit && ["pending", "approved"].includes(release.status) && <button type="button" className="text-button" onClick={() => void releaseAction(release.id, "cancel")} disabled={busy}>Cancel</button>}</div></div>)}{!center.releases.length && <div className="v6-empty">No release requests yet.</div>}</div></article>
    <article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Published versions</p><h3>Rollback with a new audited release.</h3></div><span>{center.revisions.length} revisions</span></div><div className="v24-release-list">{center.revisions.slice(0, 12).map((revision) => <div key={revision.id}><div><strong>{revision.label}</strong><small>{revision.kind} · {new Date(revision.createdAt).toLocaleString()}</small></div>{isOwner && <button type="button" className="button button-outline" onClick={() => void rollback(revision.id)} disabled={busy}>Rollback & publish</button>}</div>)}{!center.revisions.length && <div className="v6-empty">Published versions will appear after the first release.</div>}</div></article>
  </TaskSections>;
}
