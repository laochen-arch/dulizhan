"use client";

import { FormEvent, useState } from "react";
import { formatMoney } from "../lib/format-money";

type OrderItem = { id: string; productId?: string; name: string; variantLabel: string; quantity: number; unitPrice: number };
type LookupResult = { accessToken?: string; accessExpiresAt?: string; order: { orderNumber: string; customerName: string; email: string; total: number; currency: string; status: string; paymentStatus: string; fulfillmentStatus: string; trackingNumber: string | null; createdAt: string; paidAt: string | null; shippedAt: string | null; refundedAt: string | null; refundTotal: number }; items: OrderItem[] };

export default function OrdersPage() {
  const [form, setForm] = useState({ orderNumber: "", email: "" });
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [afterSales, setAfterSales] = useState({ requestType: "refund", reason: "", customerNote: "", requestedAmount: "" });
  const [afterSalesMessage, setAfterSalesMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/orders/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const payload = await response.json().catch(() => ({})) as LookupResult & { error?: string };
      if (!response.ok || !payload.order) throw new Error(payload.error || "Unable to find your order.");
      setResult(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to find your order."); } finally { setBusy(false); }
  }

  async function submitAfterSales(event: FormEvent) {
    event.preventDefault(); setAfterSalesMessage("");
    try {
      const response = await fetch("/api/orders/after-sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, ...afterSales, requestedAmount: afterSales.requestedAmount ? Number(afterSales.requestedAmount) : undefined }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to submit the request.");
      setAfterSalesMessage("Your request is submitted. The store team will review it and email you.");
    } catch (cause) { setAfterSalesMessage(cause instanceof Error ? cause.message : "Unable to submit the request."); }
  }

  return <main className="page-shell order-lookup-page"><section className="narrow-copy"><p className="eyebrow">Order support</p><h1>Track your order.</h1><p>Enter the order number from your confirmation email and the email used at checkout. A private access link is issued for this browser session.</p><form className="checkout-form" onSubmit={submit} noValidate><label><span>Order number</span><input value={form.orderNumber} onChange={(event) => setForm((current) => ({ ...current, orderNumber: event.target.value }))} placeholder="NL-20250815-ABC123" required /></label><label><span>Email address</span><input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="you@example.com" required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-dark" disabled={busy}>{busy ? "Looking up..." : "Find order"} <span>→</span></button></form></section>{result && <section className="order-lookup-result" aria-live="polite"><div><p className="eyebrow">{result.order.orderNumber}</p><h2>{result.order.fulfillmentStatus}</h2><p>{result.order.paymentStatus} · {new Date(result.order.createdAt).toLocaleDateString()}</p></div><div className="v13-checklist"><div className={result.order.paidAt ? "done" : ""}><span>{result.order.paidAt ? "OK" : "!"}</span><div><strong>Payment</strong><small>{result.order.paidAt ? `Confirmed ${new Date(result.order.paidAt).toLocaleString()}` : "Awaiting payment confirmation"}</small></div></div><div className={result.order.shippedAt ? "done" : ""}><span>{result.order.shippedAt ? "OK" : "!"}</span><div><strong>Delivery</strong><small>{result.order.shippedAt ? `Shipped ${new Date(result.order.shippedAt).toLocaleString()}` : "Preparing your order"}</small></div></div><div className={result.order.refundedAt ? "done" : ""}><span>{result.order.refundedAt ? "OK" : "-"}</span><div><strong>Refund</strong><small>{result.order.refundedAt ? `Refunded ${new Date(result.order.refundedAt).toLocaleString()}` : "No refund recorded"}</small></div></div></div>{result.order.trackingNumber && <div className="status-callout"><strong>Tracking number</strong><span>{result.order.trackingNumber}</span></div>}<div className="order-lookup-items">{result.items.map((item) => <div key={item.id}><span>{item.name} / {item.variantLabel} × {item.quantity}</span><strong>{formatMoney(item.unitPrice * item.quantity, result.order.currency)}</strong></div>)}</div><p className="order-total">Total <strong>{formatMoney(result.order.total, result.order.currency)}</strong>{result.order.refundTotal > 0 && <small> · {formatMoney(result.order.refundTotal, result.order.currency)} refunded</small>}</p><form className="after-sales-form" onSubmit={submitAfterSales}><p className="eyebrow">After-sales support</p><h3>Need a return, exchange or refund?</h3><label><span>Request type</span><select value={afterSales.requestType} onChange={(event) => setAfterSales((current) => ({ ...current, requestType: event.target.value }))}><option value="refund">Refund</option><option value="return">Return</option><option value="exchange">Exchange</option></select></label><label><span>Reason</span><input required value={afterSales.reason} onChange={(event) => setAfterSales((current) => ({ ...current, reason: event.target.value }))} placeholder="How can we help?" /></label><label><span>Requested refund amount (optional)</span><input type="number" min="0" step="0.01" value={afterSales.requestedAmount} onChange={(event) => setAfterSales((current) => ({ ...current, requestedAmount: event.target.value }))} /></label><label><span>Notes</span><textarea value={afterSales.customerNote} onChange={(event) => setAfterSales((current) => ({ ...current, customerNote: event.target.value }))} /></label>{afterSalesMessage && <p className="form-help" role="status">{afterSalesMessage}</p>}<button className="button button-outline">Submit request</button></form>{result.accessToken && <p className="form-help">This lookup link expires {result.accessExpiresAt ? new Date(result.accessExpiresAt).toLocaleString() : "in 24 hours"}.</p>}</section>}</main>;
}
