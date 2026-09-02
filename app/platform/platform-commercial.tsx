"use client";

import { useState } from "react";
import { platformPlans, type PlatformPlan } from "./platform-plans";

export type PlatformCommercialSnapshot = {
  plan: PlatformPlan | null;
  subscription: { id: string; status: string; billingInterval: "monthly" | "annual"; setupFee: number; recurringFee: number; currency: string; nextBillingAt: string | null; provider: string | null; providerSubscriptionId: string | null; providerStatus: string | null; entitlementStatus: string } | null;
  agreement: { id: string; agreementVersion: string; signerEmail: string; signedAt: string | null } | null;
  invoices: Array<{ id: string; invoiceNumber: string; kind: string; amount: number; currency: string; status: string; dueAt: string; paidAt: string | null; failureReason: string | null }>;
  payments: Array<{ id: string; invoiceId: string; amount: number; currency: string; status: string; provider: string; providerReference: string | null }>;
  referral: { code: string; status: string; rewardAmount: number } | null;
};

type Props = { applicationId: string; token: string; canReview: boolean; commercial: PlatformCommercialSnapshot | null; onUpdated: () => Promise<void> };
const money = (amount: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

export function PlatformCommercialPanel({ applicationId, token, canReview, commercial, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/platform/commercial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, applicationId, token, ...extra }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to update commercial settings.");
      setMessage(action === "sign_agreement" ? "Agreement signed and archived." : action === "record_payment" ? "Payment record updated." : "Commercial settings updated.");
      await onUpdated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update commercial settings."); }
    finally { setBusy(false); }
  }

  async function subscribeWithPayPal() {
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/platform/billing/paypal/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId, token }) });
      const payload = await response.json().catch(() => ({})) as { error?: string; subscription?: { approveUrl?: string | null; reused?: boolean } };
      if (!response.ok) throw new Error(payload.error || "Unable to start PayPal subscription.");
      if (payload.subscription?.approveUrl) { window.location.assign(payload.subscription.approveUrl); return; }
      setMessage(payload.subscription?.reused ? "PayPal subscription already exists. Its latest status will be synchronized automatically." : "PayPal subscription created.");
      await onUpdated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to start PayPal subscription."); }
    finally { setBusy(false); }
  }

  if (!commercial) return null;
  return <section className="platform-commercial-panel">
    <div className="platform-commercial-heading"><div><p className="eyebrow">Plans & billing</p><h3>Choose the commercial track.</h3><p className="v6-muted">The selected plan is recorded with this application. Signing creates an immutable agreement snapshot for future billing reference.</p></div><a className="button button-outline" href="/platform/plans">Compare plans ↗</a></div>
    {message && <div className="client-notice success" role="status">{message}</div>}
    {error && <div className="client-notice error" role="alert">{error}</div>}
    {commercial.plan ? <div className="platform-commercial-summary"><div><span>Selected plan</span><strong>{commercial.plan.name}</strong><small>{commercial.plan.description}</small></div><div><span>Recurring</span><strong>{money(commercial.subscription?.recurringFee || commercial.plan.monthlyFee, commercial.plan.currency)} / {commercial.subscription?.billingInterval === "annual" ? "year" : "month"}</strong><small>Setup {money(commercial.plan.setupFee, commercial.plan.currency)} · Service fee {commercial.plan.serviceFeePercent}%</small></div><div><span>Agreement</span><strong>{commercial.agreement ? "Signed" : "Needs signature"}</strong><small>{commercial.agreement?.signedAt ? new Date(commercial.agreement.signedAt).toLocaleString() : "Review and sign online below."}</small></div></div> : <div className="platform-commercial-empty"><h4>No plan selected yet.</h4><p>Choose a plan here; the selection is saved to this application and does not create a second application.</p><div className="platform-commercial-quick-plans">{platformPlans.map((plan) => <button type="button" key={plan.id} className="button button-outline" disabled={busy} onClick={() => void act("select_plan", { planId: plan.id, billingInterval: "annual" })}>{plan.name} · {money(plan.annualFee, plan.currency)}/yr</button>)}</div></div>}
    {commercial.plan && <div className="platform-commercial-actions"><a className="text-link" href="/platform/agreement" target="_blank" rel="noreferrer">Read agreement terms ↗</a>{!commercial.agreement && <button type="button" className="button button-dark" disabled={busy} onClick={() => void act("sign_agreement")}>{busy ? "Saving..." : "Sign and archive agreement →"}</button>}{commercial.agreement && commercial.subscription?.entitlementStatus !== "active" && <button type="button" className="button button-dark" disabled={busy} onClick={() => void subscribeWithPayPal()}>{busy ? "Connecting..." : "Subscribe securely with PayPal →"}</button>}{commercial.subscription?.providerSubscriptionId && <span className={`platform-status-badge ${commercial.subscription.entitlementStatus}`}>PayPal · {commercial.subscription.providerStatus || "pending"}</span>}</div>}
    <div className="platform-invoice-list"><div className="platform-panel-heading"><div><p className="eyebrow">Service fee ledger</p><h4>Invoices and payment records.</h4></div><span>{commercial.invoices.length}</span></div>{commercial.invoices.length ? commercial.invoices.map((invoice) => <div className="platform-invoice-row" key={invoice.id}><div><strong>{invoice.invoiceNumber}</strong><small>{invoice.kind} · Due {new Date(invoice.dueAt).toLocaleDateString()}</small></div><strong>{money(invoice.amount, invoice.currency)}</strong><span className={`platform-status-badge ${invoice.status}`}>{invoice.status}</span>{invoice.failureReason && <small className="platform-field-error">{invoice.failureReason}</small>}{canReview && invoice.status !== "paid" && invoice.status !== "void" && <button type="button" className="text-button" disabled={busy} onClick={() => void act("record_payment", { invoiceId: invoice.id, status: "paid", provider: "manual" })}>Record paid</button>}</div>) : <p className="v6-muted">Invoices will appear after a plan is selected.</p>}</div>
    {commercial.referral && <div className="platform-referral-inline"><span>Referral</span><strong>{commercial.referral.code}</strong><small>{commercial.referral.status} · reward {money(commercial.referral.rewardAmount, "USD")}</small></div>}
  </section>;
}
