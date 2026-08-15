"use client";

import { FormEvent, useState } from "react";

type LookupResult = { order: { orderNumber: string; customerName: string; email: string; total: number; currency: string; status: string; paymentStatus: string; fulfillmentStatus: string; trackingNumber: string | null; createdAt: string; paidAt: string | null; shippedAt: string | null; refundedAt: string | null; refundTotal: number }; items: Array<{ id: string; name: string; variantLabel: string; quantity: number; unitPrice: number }> };

export default function OrdersPage() {
  const [form, setForm] = useState({ orderNumber: "", email: "" });
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/orders/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const payload = await response.json().catch(() => ({})) as LookupResult & { error?: string };
      if (!response.ok || !payload.order) throw new Error(payload.error || "Unable to find your order.");
      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to find your order.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="page-shell order-lookup-page"><section className="narrow-copy"><p className="eyebrow">Order support</p><h1>Track your order.</h1><p>Enter the order number from your confirmation email and the email used at checkout.</p><form className="checkout-form" onSubmit={submit} noValidate><label><span>Order number</span><input value={form.orderNumber} onChange={(event) => setForm((current) => ({ ...current, orderNumber: event.target.value }))} placeholder="NL-20250815-ABC123" required /></label><label><span>Email address</span><input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="you@example.com" required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-dark" disabled={busy}>{busy ? "Looking up..." : "Find order"} <span>→</span></button></form></section>{result && <section className="order-lookup-result" aria-live="polite"><div><p className="eyebrow">{result.order.orderNumber}</p><h2>{result.order.fulfillmentStatus}</h2><p>{result.order.paymentStatus} · {new Date(result.order.createdAt).toLocaleDateString()}</p></div><div className="v13-checklist"><div className={result.order.paidAt ? "done" : ""}><span>{result.order.paidAt ? "OK" : "!"}</span><div><strong>Payment</strong><small>{result.order.paidAt ? `Confirmed ${new Date(result.order.paidAt).toLocaleString()}` : "Awaiting payment confirmation"}</small></div></div><div className={result.order.shippedAt ? "done" : ""}><span>{result.order.shippedAt ? "OK" : "!"}</span><div><strong>Delivery</strong><small>{result.order.shippedAt ? `Shipped ${new Date(result.order.shippedAt).toLocaleString()}` : "Preparing your order"}</small></div></div><div className={result.order.refundedAt ? "done" : ""}><span>{result.order.refundedAt ? "OK" : "-"}</span><div><strong>Refund</strong><small>{result.order.refundedAt ? `Refunded ${new Date(result.order.refundedAt).toLocaleString()}` : "No refund recorded"}</small></div></div></div>{result.order.trackingNumber && <div className="status-callout"><strong>Tracking number</strong><span>{result.order.trackingNumber}</span></div>}<div className="order-lookup-items">{result.items.map((item) => <div key={item.id}><span>{item.name} / {item.variantLabel} × {item.quantity}</span><strong>${(item.unitPrice * item.quantity).toFixed(2)}</strong></div>)}</div><p className="order-total">Total <strong>${result.order.total.toFixed(2)}</strong>{result.order.refundTotal > 0 && <small> · ${result.order.refundTotal.toFixed(2)} refunded</small>}</p></section>}</main>;
}
