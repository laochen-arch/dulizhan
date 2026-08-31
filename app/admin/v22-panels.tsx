"use client";
import { TaskSections } from "../components/backoffice";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CmsSite } from "../../db/cms";

type Notice = { tone: "success" | "error" | "info"; text: string };
type Role = "owner" | "editor" | "viewer" | string | undefined;
type Check = { key: string; label: string; detail: string; done: boolean; required?: boolean };
type Onboarding = {
  domain?: { hostname: string; status: string } | null;
  checks: Check[];
  replacements: Array<{ key: string; label: string; source: string; required: boolean; done: boolean }>;
  progress: { done: number; total: number };
};
type DeliveryStep = "intake" | "import" | "media" | "domain" | "checks" | "preview" | "publish";
type DeliveryRun = {
  siteId: string;
  runId: string;
  status: "in_progress" | "blocked" | "ready" | "published" | "rolled_back";
  currentStep: DeliveryStep;
  packageName: string | null;
  packageSummary: Record<string, unknown> | null;
  importRevisionId: string | null;
  lastError: string | null;
  updatedAt: string;
};
type Intake = Record<string, string> & { status?: string; submittedAt?: string | null; approvedAt?: string | null };
type Readiness = {
  score: number;
  blockers: Array<{ key: string; label: string; detail: string; source: string }>;
  health: Array<{ key: string; status: string; detail: string; checkedAt: string }>;
  openOperations: number;
  recentOperations: Array<{ id: string; action: string; status: string; severity: string; message: string; createdAt: string; entityType: string | null }>;
};

const steps: Array<{ key: DeliveryStep; label: string; short: string }> = [
  { key: "intake", label: "Client intake", short: "01" },
  { key: "import", label: "Import catalog", short: "02" },
  { key: "media", label: "Bind media", short: "03" },
  { key: "domain", label: "Connect domain", short: "04" },
  { key: "checks", label: "Run checks", short: "05" },
  { key: "preview", label: "Review preview", short: "06" },
  { key: "publish", label: "Publish", short: "07" },
];

const emptyIntake: Intake = {
  brandName: "", logoUrl: "", primaryColor: "", secondaryColor: "", heroUrl: "", homeCopy: "",
  shippingPolicy: "", returnPolicy: "", seoTitle: "", seoDescription: "", contactEmail: "", tradeEmail: "",
  productFile: "", domain: "", ownerEmail: "", notes: "",
};

const intakeFields: Array<{ key: string; label: string; multiline?: boolean; placeholder?: string }> = [
  { key: "brandName", label: "Brand name", placeholder: "Acme Outdoor" },
  { key: "logoUrl", label: "Logo URL", placeholder: "https://..." },
  { key: "primaryColor", label: "Primary color", placeholder: "#1F3A36" },
  { key: "secondaryColor", label: "Secondary color", placeholder: "#D9C7A6" },
  { key: "heroUrl", label: "Hero image URL", placeholder: "https://..." },
  { key: "contactEmail", label: "Customer support email", placeholder: "support@client.com" },
  { key: "tradeEmail", label: "Trade / wholesale email", placeholder: "trade@client.com" },
  { key: "ownerEmail", label: "Client owner email", placeholder: "owner@client.com" },
  { key: "domain", label: "Custom domain", placeholder: "shop.client.com" },
  { key: "seoTitle", label: "SEO title", placeholder: "Client brand — considered gear" },
  { key: "seoDescription", label: "SEO description", multiline: true },
  { key: "homeCopy", label: "Homepage copy", multiline: true },
  { key: "shippingPolicy", label: "Shipping policy", multiline: true },
  { key: "returnPolicy", label: "Returns policy", multiline: true },
  { key: "productFile", label: "Product file name", placeholder: "products.csv" },
  { key: "notes", label: "Delivery notes", multiline: true },
];

function isReadyStatus(status: string) {
  return ["ready", "verified", "active", "approved", "published", "resolved"].includes(status);
}

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function V22DeliveryWizard({
  activeSiteId,
  site,
  cmsRole,
  onboarding,
  busy,
  onRefresh,
  onNotice,
  children,
}: {
  activeSiteId: string;
  site: CmsSite | null;
  cmsRole: Role;
  onboarding: Onboarding | null;
  busy: boolean;
  onRefresh: () => Promise<void>;
  onNotice: (notice: Notice) => void;
  children: ReactNode;
}) {
  const [delivery, setDelivery] = useState<DeliveryRun | null>(null);
  const [intake, setIntake] = useState<Intake>(emptyIntake);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const canEdit = cmsRole === "owner" || cmsRole === "editor";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [deliveryResponse, intakeResponse] = await Promise.all([
        fetch(`/api/cms/delivery?siteId=${encodeURIComponent(activeSiteId)}`, { cache: "no-store" }),
        fetch(`/api/cms/intake?siteId=${encodeURIComponent(activeSiteId)}`, { cache: "no-store" }),
      ]);
      const deliveryPayload = await deliveryResponse.json().catch(() => ({})) as { delivery?: DeliveryRun };
      const intakePayload = await intakeResponse.json().catch(() => ({})) as { intake?: Intake };
      if (deliveryResponse.ok && deliveryPayload.delivery) setDelivery(deliveryPayload.delivery);
      if (intakeResponse.ok && intakePayload.intake) setIntake({ ...emptyIntake, ...intakePayload.intake });
    } finally {
      setLoading(false);
    }
  }, [activeSiteId]);

  useEffect(() => {
    // The delivery run and intake record are the remote source of truth for this wizard.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const requiredChecksReady = Boolean(onboarding?.checks.filter((check) => check.required !== false).every((check) => check.done));
  const replacementReady = Boolean(onboarding?.replacements.filter((item) => item.required).every((item) => item.done));
  const domainReady = Boolean(onboarding?.domain?.hostname && isReadyStatus(onboarding.domain.status));
  const intakeReady = intake.status === "approved";
  const stepDone = useMemo(() => ({
    intake: intakeReady,
    import: Boolean(delivery?.importRevisionId),
    media: replacementReady,
    domain: domainReady,
    checks: requiredChecksReady,
    preview: delivery?.currentStep === "publish" || delivery?.status === "ready" || delivery?.status === "published",
    publish: delivery?.status === "published",
  }), [delivery, domainReady, intakeReady, replacementReady, requiredChecksReady]);

  async function patchDelivery(patch: Record<string, unknown>, success = "Delivery progress saved.") {
    setSaving(true);
    try {
      const response = await fetch("/api/cms/delivery", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, ...patch }) });
      const payload = await response.json().catch(() => ({})) as { delivery?: DeliveryRun; error?: string };
      if (!response.ok || !payload.delivery) throw new Error(payload.error || "Unable to save delivery progress.");
      setDelivery(payload.delivery);
      onNotice({ tone: "success", text: success });
    } catch (error) {
      onNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to save delivery progress." });
    } finally {
      setSaving(false);
    }
  }

  async function setStep(step: DeliveryStep) {
    await patchDelivery({ currentStep: step, status: step === "publish" && requiredChecksReady ? "ready" : delivery?.status === "published" ? "published" : "in_progress" }, `${steps.find((item) => item.key === step)?.label || "Delivery step"} selected.`);
  }

  async function saveIntake(action: "save" | "submit" | "approve") {
    setSaving(true);
    try {
      const response = await fetch("/api/cms/intake", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, action, data: intake }) });
      const payload = await response.json().catch(() => ({})) as { intake?: Intake; error?: string };
      if (!response.ok || !payload.intake) throw new Error(payload.error || "Unable to save client intake.");
      setIntake({ ...emptyIntake, ...payload.intake });
      await patchDelivery({ currentStep: action === "approve" ? "import" : "intake", status: action === "approve" ? "in_progress" : "in_progress" }, action === "approve" ? "Client intake approved. Continue to catalog import." : action === "submit" ? "Client intake submitted for approval." : "Client intake saved.");
      await onRefresh();
    } catch (error) {
      onNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to save client intake." });
    } finally {
      setSaving(false);
    }
  }

  function downloadTemplate() {
    downloadJson(`${site?.slug || "client"}-v22-package-template.json`, {
      schemaVersion: "northline-client-package-v22",
      config: {
        brand: { name: "", mark: "", tagline: "", descriptor: "" },
        assets: { hero: "" },
        seo: { title: "", description: "" },
        content: { home: { heroTitleLead: "", heroTitleAccent: "", heroBody: "" }, policies: { shippingLead: "", returnsLead: "" } },
      },
      products: [{ id: "client-product-1", slug: "client-product-1", name: "Client product", sku: "CLIENT-001", category: "Travel", price: 0, stock: 0, status: "draft", image: "", images: [], description: "", details: "", tags: [] }],
      assetBindings: {},
    });
    onNotice({ tone: "success", text: "V22 client package template downloaded." });
  }

  function downloadChecklist() {
    downloadJson(`${site?.slug || "client"}-v22-handoff.json`, {
      generatedAt: new Date().toISOString(),
      site: site ? { id: site.id, name: site.name, slug: site.slug, domain: site.domain } : null,
      delivery,
      intake,
      steps: steps.map((step) => ({ ...step, done: stepDone[step.key] })),
      launch: onboarding,
    });
    onNotice({ tone: "success", text: "V22 handoff report downloaded." });
  }

  return <section className="v22-delivery-shell">
    <div className="v6-card v22-wizard-hero">
      <div><p className="eyebrow">V22 / Client delivery wizard</p><h2>From client packet to launch-ready storefront.</h2><p className="v6-muted">Every handoff step is saved to the selected tenant. Refreshing the page or switching workspaces will not lose the delivery state.</p></div>
      <div className="v22-wizard-hero-actions"><button type="button" className="button button-outline" onClick={downloadTemplate}>Download package template</button><button type="button" className="button button-dark" onClick={downloadChecklist} disabled={!delivery || loading}>Export handoff report <span>↗</span></button></div>
    </div>
    <div className="v22-stepper" aria-label="Client delivery steps">
      {steps.map((step) => <button type="button" key={step.key} className={`${delivery?.currentStep === step.key ? "is-active " : ""}${stepDone[step.key] ? "is-done" : ""}`} onClick={() => void setStep(step.key)} disabled={!canEdit || saving}><span>{stepDone[step.key] ? "✓" : step.short}</span><strong>{step.label}</strong></button>)}
    </div>
    <div className="v22-delivery-summary">
      <div><span>Tenant</span><strong>{site?.name || activeSiteId}</strong><small>{site?.slug || "Loading site"}</small></div>
      <div><span>Run status</span><strong className={`v22-status ${delivery?.status || "in_progress"}`}>{delivery?.status || (loading ? "loading" : "in progress")}</strong><small>{delivery?.updatedAt ? `Updated ${new Date(delivery.updatedAt).toLocaleString()}` : "State will be initialized on load."}</small></div>
      <div><span>Progress</span><strong>{Object.values(stepDone).filter(Boolean).length}/{steps.length} steps</strong><small>{delivery?.packageName ? `Package: ${delivery.packageName}` : "No package applied yet"}</small></div>
      <div><span>Release</span><a className="text-link" href={`/admin?tab=versions&siteId=${encodeURIComponent(activeSiteId)}`}>Open versions →</a><small>Publish remains gated by launch checks.</small></div>
    </div>
    <article className="v6-card v22-intake-card">
      <div className="v6-card-heading"><div><p className="eyebrow">01 / Client packet</p><h3>Capture the replacement content once.</h3></div><span className={`v22-status ${intake.status || "incomplete"}`}>{intake.status || "incomplete"}</span></div>
      <div className="v6-form-grid v22-intake-grid">{intakeFields.map((field) => <label className="v6-field" key={field.key}><span>{field.label}</span>{field.multiline ? <textarea value={intake[field.key] || ""} onChange={(event) => setIntake((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} /> : <input value={intake[field.key] || ""} onChange={(event) => setIntake((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} />}</label>)}</div>
      <div className="v6-actions"><button type="button" className="button button-outline" onClick={() => void saveIntake("save")} disabled={!canEdit || saving || busy}>{saving ? "Saving..." : "Save intake"}</button><button type="button" className="button button-outline" onClick={() => void saveIntake("submit")} disabled={!canEdit || saving || busy}>Submit for approval</button><button type="button" className="button button-dark" onClick={() => void saveIntake("approve")} disabled={cmsRole !== "owner" || saving || busy}>Approve handoff <span>→</span></button></div>
      <p className="v6-help">Approval is a client-site release gate. Values are stored against this tenant, not in browser storage.</p>
    </article>
    {children}
  </section>;
}

export function V22OperationsPanel({ activeSiteId, cmsRole, onNotice }: { activeSiteId: string; cmsRole: Role; onNotice: (notice: Notice) => void }) {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = cmsRole === "owner" || cmsRole === "editor";

  const load = useCallback(async () => {
    const response = await fetch(`/api/cms/readiness?siteId=${encodeURIComponent(activeSiteId)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as Readiness;
    if (response.ok) setReadiness(payload);
  }, [activeSiteId]);

  useEffect(() => {
    // Production readiness is remote state scoped to the active tenant.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function runChecks() {
    setBusy(true);
    try {
      const response = await fetch("/api/cms/health", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to run production checks.");
      await load();
      onNotice({ tone: "success", text: "Production checks completed and readiness was refreshed." });
    } catch (error) {
      onNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to run production checks." });
    } finally {
      setBusy(false);
    }
  }

  async function resolve(eventId: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/cms/operations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, eventId, action: "resolve" }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to resolve the operation event.");
      await load();
      onNotice({ tone: "success", text: "Operation event marked as resolved." });
    } catch (error) {
      onNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to resolve the operation event." });
    } finally {
      setBusy(false);
    }
  }

  const readyHealth = readiness?.health.filter((item) => isReadyStatus(item.status)).length || 0;
  const totalHealth = readiness?.health.length || 0;
  return <TaskSections className="v22-operations-shell" labels={["交付概览","上线阻塞项","操作事件","相关配置"]}>
    <div className="v6-card v22-ops-hero"><div><p className="eyebrow">V22 / Production control</p><h2>One release gate for payments, domains and operations.</h2><p className="v6-muted">Run the checks, review blockers and resolve tenant events before publishing a production storefront.</p></div><div className="v22-readiness-score"><strong>{readiness?.score ?? 0}%</strong><span>ready</span></div><button type="button" className="button button-dark" onClick={() => void runChecks()} disabled={!canEdit || busy}>{busy ? "Working..." : "Run all checks →"}</button></div>
    <div className="v22-ops-grid"><article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Release blockers</p><h3>{readiness?.blockers.length || 0} items need attention</h3></div><span>{readiness?.openOperations || 0} open events</span></div><div className="v22-blocker-list">{readiness?.blockers.slice(0, 12).map((blocker) => <div key={blocker.key}><span className="v22-blocker-icon">!</span><span><strong>{blocker.label}</strong><small>{blocker.detail}</small></span></div>)}{!readiness?.blockers.length && <div className="v6-empty">No release blockers detected. Run checks again after changing provider or domain configuration.</div>}</div></article><article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Runtime health</p><h3>{readyHealth}/{totalHealth || 0} checks ready</h3></div><button type="button" className="text-button" onClick={() => void load()}>Refresh</button></div><div className="v22-health-list">{readiness?.health.map((check) => <div key={check.key}><span><strong>{check.key}</strong><small>{check.detail}</small></span><span className={`v22-status ${check.status}`}>{check.status}</span></div>)}{!readiness?.health.length && <div className="v6-empty">No health snapshot yet. Run all checks.</div>}</div></article></div>
    <article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Unified operation events</p><h3>Trace every important action by tenant.</h3></div><span>Audit + recovery feed</span></div><div className="v22-operation-list">{readiness?.recentOperations.map((event) => <div key={event.id}><span className={`v22-operation-dot ${event.severity}`}></span><div><strong>{event.message}</strong><small>{event.action} · {event.entityType || "cms"} · {new Date(event.createdAt).toLocaleString()}</small></div><div className="v22-operation-actions"><span className={`v22-status ${event.status}`}>{event.status}</span>{event.status !== "resolved" && <button type="button" className="text-button" onClick={() => void resolve(event.id)} disabled={!canEdit || busy}>Resolve</button>}</div></div>)}{!readiness?.recentOperations.length && <div className="v6-empty">No operation events recorded yet.</div>}</div></article>
    <div className="v22-ops-footer"><a className="button button-outline" href={`/admin?tab=setup&siteId=${encodeURIComponent(activeSiteId)}`}>Open provider setup</a><a className="button button-outline" href={`/admin?tab=versions&siteId=${encodeURIComponent(activeSiteId)}`}>Review versions</a></div>
  </TaskSections>;
}
