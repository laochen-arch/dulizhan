"use client";
import { TaskSections } from "../components/backoffice";

import { useCallback, useEffect, useState } from "react";
import type { CmsRole } from "../../db/cms";

type Notice = { tone: "success" | "error" | "info"; text: string };
type Integration = { provider: "paypal" | "resend"; source: string; status: string; configured: boolean; hasEncryptionKey: boolean; environment?: "sandbox" | "live"; clientId: boolean; clientSecret: boolean; webhookId: boolean; apiKey: boolean; fromEmail: boolean; fromDomain: string | null; lastCheckedAt: string | null; lastError: string | null };

export function V23ConfigurationPanel({ activeSiteId, cmsRole, onNotice }: { activeSiteId: string; cmsRole: CmsRole; onNotice: (notice: Notice) => void }) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [provider, setProvider] = useState<"paypal" | "resend">("paypal");
  const [form, setForm] = useState({ clientId: "", clientSecret: "", webhookId: "", environment: "sandbox", apiKey: "", fromEmail: "" });
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [keyReady, setKeyReady] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/cms/integrations?siteId=${encodeURIComponent(activeSiteId)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as { integrations?: Integration[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to load tenant integrations.");
    setIntegrations(payload.integrations || []);
    setKeyReady(Boolean(payload.integrations?.every((item) => item.hasEncryptionKey)));
  }, [activeSiteId]);

  // Provider configuration is remote tenant state; refresh it when the selected site changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load().catch((error) => onNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to load tenant integrations." })); }, [load, onNotice]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/cms/integrations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, provider, ...form }) });
      const payload = await response.json().catch(() => ({})) as { integrations?: Integration[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to save tenant integration.");
      setIntegrations(payload.integrations || []);
      setForm({ clientId: "", clientSecret: "", webhookId: "", environment: form.environment, apiKey: "", fromEmail: "" });
      onNotice({ tone: "success", text: `${provider === "paypal" ? "PayPal" : "Resend"} credentials encrypted and saved for this site.` });
    } catch (error) { onNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to save tenant integration." }); }
    finally { setBusy(false); }
  }

  async function runCheck() {
    setChecking(true);
    try {
      const response = await fetch("/api/cms/commerce/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: activeSiteId, provider: "all" }) });
      const payload = await response.json().catch(() => ({})) as { probes?: Array<{ detail: string }>; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to test providers.");
      await load();
      onNotice({ tone: "success", text: payload.probes?.map((item) => item.detail).join(" ") || "Provider checks completed." });
    } catch (error) { onNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to test providers." }); }
    finally { setChecking(false); }
  }

  const paypal = integrations.find((item) => item.provider === "paypal");
  const resend = integrations.find((item) => item.provider === "resend");
  const canEdit = cmsRole === "owner";
  return <TaskSections className="v23-config-shell" labels={["配置说明","服务连接状态","修改连接配置"]}>
    <div className="v6-card v23-config-hero"><div><p className="eyebrow">V23 / Production isolation</p><h2>Every client gets its own payment and email connection.</h2><p className="v6-muted">Credentials are encrypted before they enter D1. Only masked readiness flags return to the browser.</p></div><div className={`v23-key-status ${keyReady ? "ready" : "missing"}`}><strong>{keyReady ? "Key ready" : "Key missing"}</strong><span>CMS_SECRETS_KEY</span></div><button type="button" className="button button-dark" onClick={() => void runCheck()} disabled={!canEdit || checking}>{checking ? "Checking..." : "Test providers →"}</button></div>
    <div className="v23-integration-summary"><article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">PayPal</p><h3>{paypal?.status || "missing"}</h3></div><span>{paypal?.source || "missing"} · {paypal?.environment || "sandbox"}</span></div><p className="v6-muted">Client ID {paypal?.clientId ? "saved" : "missing"} · Secret {paypal?.clientSecret ? "saved" : "missing"} · Webhook {paypal?.webhookId ? "saved" : "missing"}</p>{paypal?.lastError && <p className="v23-error">{paypal.lastError}</p>}</article><article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Resend</p><h3>{resend?.status || "missing"}</h3></div><span>{resend?.source || "missing"}</span></div><p className="v6-muted">API key {resend?.apiKey ? "saved" : "missing"} · Sender {resend?.fromEmail ? "saved" : "missing"} · {resend?.fromDomain || "no verified domain"}</p>{resend?.lastError && <p className="v23-error">{resend.lastError}</p>}</article></div>
    <div className="v23-config-grid"><article className="v6-card"><div className="v6-card-heading"><div><p className="eyebrow">Tenant credential editor</p><h2>Replace a site connection.</h2></div><span>{canEdit ? "Owner only" : "Read only"}</span></div><p className="v6-help">Leave a secret field blank to keep the current encrypted value. The master CMS_SECRETS_KEY is never editable here; configure it in Sites environment settings.</p><form className="v6-form" onSubmit={save}><label className="v6-field"><span>Provider</span><select value={provider} onChange={(event) => setProvider(event.target.value as "paypal" | "resend")} disabled={!canEdit}><option value="paypal">PayPal</option><option value="resend">Resend</option></select></label>{provider === "paypal" ? <div className="v6-form-grid"><label className="v6-field"><span>Client ID</span><input value={form.clientId} onChange={(event) => setForm((current) => ({ ...current, clientId: event.target.value }))} placeholder="Enter to replace" disabled={!canEdit} /></label><label className="v6-field"><span>Client secret</span><input type="password" value={form.clientSecret} onChange={(event) => setForm((current) => ({ ...current, clientSecret: event.target.value }))} placeholder="Enter to replace" disabled={!canEdit} /></label><label className="v6-field"><span>Webhook ID</span><input value={form.webhookId} onChange={(event) => setForm((current) => ({ ...current, webhookId: event.target.value }))} placeholder="Enter to replace" disabled={!canEdit} /></label><label className="v6-field"><span>Mode</span><select value={form.environment} onChange={(event) => setForm((current) => ({ ...current, environment: event.target.value }))} disabled={!canEdit}><option value="sandbox">Sandbox</option><option value="live">Live</option></select></label></div> : <div className="v6-form-grid"><label className="v6-field"><span>Resend API key</span><input type="password" value={form.apiKey} onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))} placeholder="Enter to replace" disabled={!canEdit} /></label><label className="v6-field"><span>From email</span><input type="email" value={form.fromEmail} onChange={(event) => setForm((current) => ({ ...current, fromEmail: event.target.value }))} placeholder="orders@client-domain.com" disabled={!canEdit} /></label></div>}<button className="button button-dark" disabled={!canEdit || busy}>{busy ? "Encrypting..." : "Save tenant credentials"}</button></form></article><aside className="v6-card"><p className="eyebrow">Release impact</p><h2>Publish checks use this site profile.</h2><p className="v6-muted">A client site can no longer pass the production gate with another client&apos;s global credentials. Payment, webhook and Resend checks read the active site profile.</p><div className="v6-checks"><div><span>{paypal?.configured ? "✓" : "!"}</span>PayPal checkout credentials</div><div><span>{paypal?.webhookId ? "✓" : "!"}</span>PayPal webhook identity</div><div><span>{resend?.configured ? "✓" : "!"}</span>Transactional email sender</div></div><span className="v6-help">Platform-only configuration. Merchant operations stay in the merchant workspace.</span></aside></div>
  </TaskSections>;
}
