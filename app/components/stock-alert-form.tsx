"use client";

import { FormEvent, useState } from "react";
import { showToast } from "./toast";

export function StockAlertForm({ productId, variantId }: { productId: string; variantId: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/stock-alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, productId, variantId }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to save the alert.");
      setMessage("We’ll email you when this option is available."); setEmail(""); showToast("Restock alert saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save the alert."); }
    finally { setBusy(false); }
  }

  return <div className="stock-alert"><p className="eyebrow">Out of stock</p><h3>Want a note when it returns?</h3><p>Leave your email and we&apos;ll keep the request with this product option.</p><form onSubmit={submit}><label className="sr-only" htmlFor={`stock-alert-${productId}-${variantId}`}>Email address</label><input id={`stock-alert-${productId}-${variantId}`} type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /><button type="submit" className="button button-outline" disabled={busy}>{busy ? "Saving..." : "Notify me"}</button></form>{message && <p className="form-help" role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}</div>;
}
