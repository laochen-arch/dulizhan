"use client";

import { useState, type ChangeEvent, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type { CmsDomain, CmsLaunchCheck, CmsReplacementItem, CmsSite } from "../../db/cms";

type NoticeSetter = (notice: { tone: "success" | "error" | "info"; text: string }) => void;
type CommerceConfiguration = {
  paypal: { clientId: boolean; clientSecret: boolean; webhookId: boolean; mode?: string };
  resend: { apiKey: boolean; fromEmail: boolean; fromDomain?: string | null };
  webhookEndpoint?: string;
  environmentKeys?: string[];
};
type OnboardingState = { domain?: { hostname: string; status: string } | null; checks: CmsLaunchCheck[]; replacements: CmsReplacementItem[]; progress: { done: number; total: number } };
type SiteForm = { name: string; slug: string; templateSiteId: string };
type Probe = { provider: "paypal" | "resend"; configured: boolean; reachable: boolean; status: "ready" | "missing" | "error"; detail: string; checkedAt: string; mode?: string };
type ImportPreview = { valid: boolean; errors: string[]; warnings: string[]; summary: { configChanged: boolean; totalProducts: number; activeProducts: number; importedProducts: number; assetBindings: number } };
const productionTests = ["Sandbox PayPal order created", "Return URL capture completed", "PayPal webhook event is processed", "Full or partial refund completed", "Refund inventory rule verified", "Resend payment and shipping mail delivered", "Live credentials and domain checked"];

function StatusPill({ status }: { status: string }) {
  return <span className={`v13-status-pill ${status}`}>{status === "ready" ? "Ready" : status === "missing" ? "Needs setup" : status === "error" ? "Needs attention" : status}</span>;
}

function copyText(value: string, onNotice: NoticeSetter) {
  const promise = navigator.clipboard?.writeText(value);
  if (promise) {
    void promise.then(() => onNotice({ tone: "success", text: "Copied to clipboard." }));
    return;
  }
  onNotice({ tone: "info", text: "Clipboard unavailable in this browser." });
}

export function LaunchSetupPanel({ activeSiteId, commerceConfiguration, domains, onboarding, busy, onRefresh, onNotice }: {
  activeSiteId: string;
  commerceConfiguration: CommerceConfiguration | null;
  domains: CmsDomain[];
  onboarding: OnboardingState | null;
  busy: boolean;
  onRefresh: () => Promise<void>;
  onNotice: NoticeSetter;
}) {
  const [probes, setProbes] = useState<Record<string, Probe>>({});
  const [checking, setChecking] = useState<string | null>(null);
  const [checkingDomain, setCheckingDomain] = useState<string | null>(null);
  const [testChecklist, setTestChecklist] = useState<Record<string, boolean>>({});
  const endpoint = commerceConfiguration?.webhookEndpoint || `${typeof window === "undefined" ? "" : window.location.origin}/api/paypal/webhook`;
  const environmentKeys = commerceConfiguration?.environmentKeys || ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "PAYPAL_ENVIRONMENT", "RESEND_API_KEY", "RESEND_FROM_EMAIL"];

  async function check(provider: "paypal" | "resend" | "all") {
    setChecking(provider);
    try {
      const response = await fetch("/api/cms/commerce/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, provider }) });
      const payload = await response.json().catch(() => ({})) as { probes?: Probe[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Configuration check failed.");
      setProbes((current) => ({ ...current, ...Object.fromEntries((payload.probes || []).map((item) => [item.provider, item])) }));
      onNotice({ tone: "success", text: "Production configuration check completed." });
    } catch (error) {
      onNotice({ tone: "error", text: error instanceof Error ? error.message : "Configuration check failed." });
    } finally {
      setChecking(null);
    }
  }

  async function checkDomain(domainId: string) {
    setCheckingDomain(domainId);
    try {
      const response = await fetch("/api/cms/domains/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, domainId }) });
      const payload = await response.json().catch(() => ({})) as { detail?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Domain check failed.");
      onNotice({ tone: payload.detail?.startsWith("This request") ? "success" : "info", text: payload.detail || "Domain check completed." });
      await onRefresh();
    } catch (error) {
      onNotice({ tone: "error", text: error instanceof Error ? error.message : "Domain check failed." });
    } finally {
      setCheckingDomain(null);
    }
  }

  async function releaseExpired() {
    try {
      const response = await fetch("/api/cms/commerce/expire", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId }) });
      const result = await response.json().catch(() => ({})) as { released?: number; error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to release expired reservations.");
      onNotice({ tone: "success", text: `${result.released || 0} expired order reservation(s) released.` });
      await onRefresh();
    } catch (error) {
      onNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to release expired reservations." });
    }
  }

  async function retryDueEmails() {
    try {
      const response = await fetch("/api/cms/commerce/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId }) });
      const result = await response.json().catch(() => ({})) as { retried?: number; error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to retry email notifications.");
      onNotice({ tone: "success", text: `${result.retried || 0} due email notification(s) retried.` });
      await onRefresh();
    } catch (error) {
      onNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to retry email notifications." });
    }
  }

  const paypalProbe = probes.paypal;
  const resendProbe = probes.resend;
  const paypalReady = paypalProbe?.status === "ready" || Boolean(commerceConfiguration?.paypal.clientId && commerceConfiguration?.paypal.clientSecret && commerceConfiguration?.paypal.webhookId);
  const resendReady = resendProbe?.status === "ready" || Boolean(commerceConfiguration?.resend.apiKey && commerceConfiguration?.resend.fromEmail);
  const domainReady = Boolean(onboarding?.domain?.hostname && ["verified", "active"].includes(onboarding.domain.status));

  return <section className="v13-setup-stack">
    <div className="v6-card v13-setup-hero"><div><p className="eyebrow">V14 / Production launch setup</p><h2>Check the systems behind the storefront.</h2><p className="v6-muted">Secrets stay in the Sites runtime. This panel only reports masked readiness and performs safe provider checks.</p></div><button className="button button-dark" onClick={() => void check("all")} disabled={busy || checking !== null}>{checking === "all" ? "Checking..." : "Run all checks ->"}</button></div>
    <div className="v13-provider-grid">
      <article className="v6-card v13-provider-card"><div className="v6-card-heading"><div><p className="eyebrow">Payments</p><h3>PayPal</h3></div><StatusPill status={paypalProbe?.status || (paypalReady ? "ready" : "missing")} /></div><p className="v6-muted">Accept PayPal checkout payments, receive webhook updates, and issue full or partial refunds from the commerce panel.</p><div className="v13-check-lines"><span><b>Client ID</b>{commerceConfiguration?.paypal.clientId ? "Configured" : "Missing"}</span><span><b>Client secret</b>{commerceConfiguration?.paypal.clientSecret ? "Configured" : "Missing"}</span><span><b>Mode</b>{paypalProbe?.mode || commerceConfiguration?.paypal.mode || "Not detected"}</span></div>{paypalProbe && <p className={`v13-probe-detail ${paypalProbe.status}`}>{paypalProbe.detail}</p>}<button className="button button-outline" onClick={() => void check("paypal")} disabled={checking !== null}>{checking === "paypal" ? "Checking..." : "Test PayPal connection"}</button></article>
      <article className="v6-card v13-provider-card"><div className="v6-card-heading"><div><p className="eyebrow">Transactional email</p><h3>Resend</h3></div><StatusPill status={resendProbe?.status || (resendReady ? "ready" : "missing")} /></div><p className="v6-muted">Send payment receipts, shipping updates, and operational alerts with retry records.</p><div className="v13-check-lines"><span><b>API key</b>{commerceConfiguration?.resend.apiKey ? "Configured" : "Missing"}</span><span><b>From email</b>{commerceConfiguration?.resend.fromEmail ? "Configured" : "Missing"}</span><span><b>From domain</b>{commerceConfiguration?.resend.fromDomain || "Not detected"}</span></div>{resendProbe && <p className={`v13-probe-detail ${resendProbe.status}`}>{resendProbe.detail}</p>}<button className="button button-outline" onClick={() => void check("resend")} disabled={checking !== null}>{checking === "resend" ? "Checking..." : "Test Resend connection"}</button></article>
    </div>
    <div className="v13-provider-grid">
      <article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Webhook endpoint</p><h3>PayPal event delivery</h3></div><StatusPill status={commerceConfiguration?.paypal.webhookId ? "ready" : "missing"} /></div><p className="v6-muted">Copy this URL into PayPal Developer Dashboard → Webhooks. The handler records duplicate events and supports retries.</p><code className="v13-copy-field">{endpoint}</code><button className="text-button" onClick={() => copyText(endpoint, onNotice)}>Copy webhook URL</button></article>
      <article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Custom domain</p><h3>Client routing</h3></div><StatusPill status={domainReady ? "ready" : "missing"} /></div><p className="v6-muted">Map the hostname in the Domains tab, add the DNS record in the client provider, then verify the Sites custom-domain binding.</p>{domains.length ? domains.map((domain) => <div className="v13-domain-row" key={domain.id}><span><strong>{domain.hostname}</strong><small>{domain.status} {domain.lastCheckedAt ? `· checked ${new Date(domain.lastCheckedAt).toLocaleString()}` : "· not checked"}</small></span><span className="v13-domain-actions"><button className="text-button" onClick={() => void checkDomain(domain.id)} disabled={checkingDomain !== null}>{checkingDomain === domain.id ? "Checking..." : "Check routing"}</button><button className="text-button" onClick={() => copyText(domain.verificationToken || "", onNotice)} disabled={!domain.verificationToken}>Copy token</button></span></div>) : <p className="v6-empty">No custom domain mapping has been added.</p>}</article>
    </div>
    <div className="v13-provider-grid"><article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Operations recovery</p><h3>Release and retry queue</h3></div><span>Manual safety controls</span></div><p className="v6-muted">Expired pending orders release reserved inventory. Failed Resend messages retry when their backoff window is due.</p><div className="v6-actions"><button className="button button-outline" onClick={() => void releaseExpired()} disabled={busy}>Release expired inventory</button><button className="button button-outline" onClick={() => void retryDueEmails()} disabled={busy}>Retry due emails</button></div></article><article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Production test checklist</p><h3>Record the go-live evidence.</h3></div><span>{Object.values(testChecklist).filter(Boolean).length}/{productionTests.length}</span></div><div className="v13-checklist">{productionTests.map((label) => <label className={testChecklist[label] ? "done" : ""} key={label}><input type="checkbox" checked={Boolean(testChecklist[label])} onChange={(event) => setTestChecklist((current) => ({ ...current, [label]: event.target.checked }))} /><span>{testChecklist[label] ? "OK" : "!"}</span><div><strong>{label}</strong><small>Complete this step after the matching provider or storefront action.</small></div></label>)}</div></article></div>
    <div className="v6-card v13-env-card"><div className="v6-card-heading"><div><p className="eyebrow">Runtime variables</p><h3>Configure these in the Sites environment</h3></div><button className="text-button" onClick={() => copyText(environmentKeys.join("\n"), onNotice)}>Copy names</button></div><div className="v13-env-list">{environmentKeys.map((key) => <code key={key}>{key}</code>)}</div><p className="v6-help">Values are intentionally never shown in the client CMS. After updating them, return here and run the provider checks again.</p><button className="text-button" onClick={() => void onRefresh()}>Refresh configuration status</button></div>
  </section>;
}

export function DeliveryPanel({ sites, site, activeSiteId, setActiveSiteId, siteForm, setSiteForm, createClientSite, onboarding, busy, onRefresh, onNotice }: {
  sites: CmsSite[];
  site: CmsSite | null;
  activeSiteId: string;
  setActiveSiteId: (siteId: string) => void;
  siteForm: SiteForm;
  setSiteForm: Dispatch<SetStateAction<SiteForm>>;
  createClientSite: (event: FormEvent) => Promise<void>;
  onboarding: OnboardingState | null;
  busy: boolean;
  onRefresh: () => Promise<void>;
  onNotice: NoticeSetter;
}) {
  const [pendingImport, setPendingImport] = useState<{ payload: Record<string, unknown>; filename: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [assetBindingsText, setAssetBindingsText] = useState("{}");
  const [importing, setImporting] = useState(false);
  const [bindingError, setBindingError] = useState("");
  const [lastImportRevisionId, setLastImportRevisionId] = useState("");
  const [batchText, setBatchText] = useState("[]");
  const [batching, setBatching] = useState(false);

  function readBindings() {
    try {
      const value = JSON.parse(assetBindingsText || "{}") as unknown;
      if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("Asset bindings must be a JSON object.");
      setBindingError("");
      return value as Record<string, string>;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid asset bindings JSON.";
      setBindingError(message);
      return null;
    }
  }

  async function inspectImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const raw = await file.text();
      const parsed = file.name.toLowerCase().endsWith(".json") ? JSON.parse(raw) as Record<string, unknown> : { productCsv: raw };
      const bindings = readBindings();
      if (!bindings) return;
      const payload = { ...parsed, assetBindings: { ...((parsed.assetBindings as Record<string, string> | undefined) || {}), ...bindings } };
      const response = await fetch("/api/cms/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, dryRun: true, ...payload }) });
      const result = await response.json().catch(() => ({})) as ImportPreview & { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to validate the import.");
      setPendingImport({ payload, filename: file.name });
      setPreview(result);
      onNotice({ tone: result.valid ? "success" : "error", text: result.valid ? "Import preview is ready. Review the summary before applying." : "Import preview found errors. Fix them before applying." });
    } catch (error) {
      setPendingImport(null);
      setPreview(null);
      onNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to validate the import." });
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  }

  async function applyImport() {
    if (!pendingImport || !preview?.valid) return;
    setImporting(true);
    try {
      const response = await fetch("/api/cms/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, ...pendingImport.payload }) });
      const result = await response.json().catch(() => ({})) as { error?: string; revisionId?: string };
      if (!response.ok) throw new Error(result.error || "Unable to apply the import.");
      const filename = pendingImport.filename;
      setLastImportRevisionId(result.revisionId || "");
      setPendingImport(null);
      setPreview(null);
      await onRefresh();
      onNotice({ tone: "success", text: `${filename} imported into the client draft.` });
    } catch (error) {
      onNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to apply the import." });
    } finally {
      setImporting(false);
    }
  }

  async function rollbackImport() {
    if (!lastImportRevisionId || !window.confirm("Restore the draft from before the last client import?")) return;
    setImporting(true);
    try {
      const response = await fetch("/api/cms/revisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, revisionId: lastImportRevisionId }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to roll back the import.");
      setLastImportRevisionId("");
      await onRefresh();
      onNotice({ tone: "success", text: "The draft was restored to the pre-import version." });
    } catch (error) {
      onNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to roll back the import." });
    } finally {
      setImporting(false);
    }
  }

  async function createBatch() {
    try {
      const clients = JSON.parse(batchText) as unknown;
      if (!Array.isArray(clients)) throw new Error("Batch input must be a JSON array.");
      setBatching(true);
      const response = await fetch("/api/cms/sites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clients }) });
      const result = await response.json().catch(() => ({})) as { results?: Array<{ name?: string }>; errors?: Array<{ name?: string; error?: string }>; error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to create client sites.");
      const created = result.results?.length || 0;
      const failed = result.errors?.length || 0;
      setBatchText("[]");
      await onRefresh();
      onNotice({ tone: failed ? "info" : "success", text: `Batch delivery created ${created} site(s)${failed ? `; ${failed} failed and remain in the report.` : "."}` });
    } catch (error) {
      onNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to create client sites." });
    } finally {
      setBatching(false);
    }
  }

  function exportReport() {
    const report = { generatedAt: new Date().toISOString(), site, onboarding, importPreview: preview, lastImportRevisionId: lastImportRevisionId || null, status: onboarding?.progress || null };
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    link.download = `${site?.slug || "client-site"}-delivery-report.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    onNotice({ tone: "success", text: "Delivery report downloaded." });
  }

  const previewUrl = `/preview?siteId=${encodeURIComponent(activeSiteId)}`;
  return <section className="v13-delivery-stack">
    {lastImportRevisionId ? <article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Import recovery</p><h3>Pre-import backup is ready.</h3></div><span>{lastImportRevisionId}</span></div><p className="v6-muted">The last client import created a rollback point. Restore it before publishing if the package needs correction.</p><button className="button button-outline" onClick={() => void rollbackImport()} disabled={importing}>Undo last import</button></article> : null}
    {preview && pendingImport?.payload.assetBindings ? <article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Asset binding preview</p><h3>{Object.keys(pendingImport.payload.assetBindings as Record<string, string>).length} media replacement(s)</h3></div><span>Review before apply</span></div><div className="v13-replacement-list">{Object.entries(pendingImport.payload.assetBindings as Record<string, string>).map(([from, to]) => <div key={from}><span><strong>{from}</strong><small>{String(to)}</small></span><StatusPill status="ready" /></div>)}</div></article> : null}
    <article className="v6-card"><p className="eyebrow">01B / Batch delivery</p><h3>Create several client sites from one manifest.</h3><p className="v6-muted">Use a JSON array with name, slug, and optional templateSiteId.</p><textarea value={batchText} onChange={(event) => setBatchText(event.target.value)} aria-label="Batch client sites JSON" /><button className="button button-outline" type="button" onClick={() => void createBatch()} disabled={batching}>{batching ? "Creating batch..." : "Create client batch"}</button></article>
    <div className="v6-card v13-setup-hero"><div><p className="eyebrow">V15 / Client delivery center</p><h2>Turn client materials into a ready storefront.</h2><p className="v6-muted">Create an isolated tenant, validate the handoff package, bind media, preview the result, and export the launch report.</p></div><div className="v6-actions"><a className="button button-outline" href={previewUrl} target="_blank" rel="noreferrer">Open preview -&gt;</a><button className="button button-dark" onClick={exportReport} disabled={!onboarding}>Export handoff report</button></div></div>
    <div className="v13-delivery-grid">
      <article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">01 / Create</p><h3>One-click client site</h3></div><span>Isolated tenant</span></div><form className="v6-form" onSubmit={createClientSite}><label className="v6-field"><span>Template source</span><select value={siteForm.templateSiteId} onChange={(event) => setSiteForm((current) => ({ ...current, templateSiteId: event.target.value }))}>{sites.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.slug}</option>)}</select></label><label className="v6-field"><span>Client name</span><input value={siteForm.name} onChange={(event) => setSiteForm((current) => ({ ...current, name: event.target.value, slug: current.slug || event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-") }))} placeholder="Acme Outdoor" /></label><label className="v6-field"><span>URL slug</span><input value={siteForm.slug} onChange={(event) => setSiteForm((current) => ({ ...current, slug: event.target.value }))} placeholder="acme-outdoor" /></label><button className="button button-dark" disabled={busy || !siteForm.name || !siteForm.slug}>Create from template +</button></form><p className="v6-help">The new site receives its own brand draft, catalog, media references, orders, inventory and permissions.</p></article>
      <article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">02 / Select</p><h3>Active delivery workspace</h3></div><span>{site?.slug || "Loading"}</span></div><label className="v6-field"><span>Client site</span><select value={activeSiteId} onChange={(event) => setActiveSiteId(event.target.value)}>{sites.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.slug}</option>)}</select></label><div className="v13-delivery-actions"><a className="text-link" href={previewUrl} target="_blank" rel="noreferrer">Preview tenant -&gt;</a><a className="text-link" href={`/admin?tab=versions&siteId=${encodeURIComponent(activeSiteId)}`}>Open release history -&gt;</a></div><p className="v6-help">Draft changes remain private until a publish action passes the launch checks.</p></article>
    </div>
    <article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">03 / Import</p><h3>Validate before applying client materials</h3></div><span>JSON / CSV</span></div><div className="v13-import-toolbar"><label className="v6-file-input"><span>{importing ? "Checking..." : "Choose client package"}</span><input type="file" accept=".json,.csv,text/csv,application/json" onChange={(event) => void inspectImport(event)} disabled={importing || busy} /></label><label className="v6-field v13-binding-field"><span>Asset bindings JSON</span><textarea value={assetBindingsText} onChange={(event) => setAssetBindingsText(event.target.value)} placeholder={'{"old-image-url":"/api/cms/assets/asset_x?siteId=..."}'} /></label></div>{bindingError && <p className="v13-probe-detail error" role="alert">{bindingError}</p>}{pendingImport && <p className="v6-help">Pending package: <strong>{pendingImport.filename}</strong>. It has not changed the draft yet.</p>}{preview && <div className="v13-import-preview"><div className="v13-import-summary"><span><b>{preview.summary.totalProducts}</b> total products</span><span><b>{preview.summary.activeProducts}</b> active products</span><span><b>{preview.summary.importedProducts}</b> imported rows</span><span><b>{preview.summary.assetBindings}</b> asset bindings</span></div>{preview.errors.length > 0 && <div className="v13-import-errors" role="alert"><strong>Fix before applying</strong>{preview.errors.map((error) => <span key={error}>{error}</span>)}</div>}{preview.warnings.length > 0 && <div className="v13-import-warnings"><strong>Review notes</strong>{preview.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>}<button className="button button-dark" onClick={() => void applyImport()} disabled={!preview.valid || importing || busy}>Apply validated import -&gt;</button></div>}</article>
    <div className="v13-delivery-grid"><article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">04 / Launch checklist</p><h3>{onboarding?.progress.done || 0}/{onboarding?.progress.total || 0} checks ready</h3></div><button className="text-button" onClick={() => void onRefresh()}>Refresh</button></div><div className="v13-checklist">{onboarding?.checks.map((check) => <div className={check.done ? "done" : ""} key={check.key}><span>{check.done ? "OK" : "!"}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div></div>) || <p className="v6-empty">Select a client site to load launch checks.</p>}</div></article><article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">05 / Replacement list</p><h3>Materials still to replace</h3></div><span>{onboarding?.replacements.filter((item) => !item.done && item.required).length || 0} required</span></div><div className="v13-replacement-list">{onboarding?.replacements.map((item) => <div key={item.key}><span><strong>{item.label}</strong><small>{item.source}</small></span><StatusPill status={item.done ? "ready" : item.required ? "missing" : "optional"} /></div>) || <p className="v6-empty">No replacement data yet.</p>}</div></article></div>
  </section>;
}
