"use client";

import { FormEvent, useEffect, useState } from "react";
import { useStore } from "./cart-store";
import { useSiteRuntime } from "./site-runtime";
import { showToast } from "./toast";
import { readStoredCoupon, writeStoredCoupon, clearStoredCoupon } from "../lib/coupon";

export function CartCoupon() {
  const { activeSiteId, site } = useSiteRuntime();
  const siteId = site?.id || activeSiteId;
  const { cart } = useStore(siteId);
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const stored = readStoredCoupon(siteId);
    const timer = window.setTimeout(() => { setCode(stored); setApplied(stored); }, 0);
    return () => window.clearTimeout(timer);
  }, [siteId]);

  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setError("Enter a coupon code first.");
      return;
    }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/checkout/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart.map((item) => ({ productId: item.id, variantId: item.variantId, quantity: item.quantity })), deliveryMethod: "Standard delivery", couponCode: normalized }),
      });
      const payload = await response.json().catch(() => ({})) as { quote?: { couponApplied?: boolean; couponCode?: string | null }; error?: string };
      if (!response.ok || !payload.quote) throw new Error(payload.error || "Unable to validate this coupon.");
      if (!payload.quote.couponApplied) {
        clearStoredCoupon(siteId); setApplied("");
        throw new Error("That coupon is not valid for this order.");
      }
      writeStoredCoupon(siteId, normalized); setApplied(payload.quote.couponCode || normalized); showToast("Coupon applied to checkout.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to validate this coupon.");
    } finally { setBusy(false); }
  }

  function remove() {
    clearStoredCoupon(siteId); setCode(""); setApplied(""); setError(""); showToast("Coupon removed.", "info");
  }

  return <section className="cart-coupon" aria-labelledby="cart-coupon-title"><p className="eyebrow" id="cart-coupon-title">Have a code?</p><form onSubmit={apply}><label className="sr-only" htmlFor="cart-coupon-input">Coupon code</label><input id="cart-coupon-input" value={code} onChange={(event) => { setCode(event.target.value.toUpperCase()); setError(""); }} placeholder="WELCOME10" autoComplete="off" /><button type="submit" disabled={busy}>{busy ? "Checking..." : applied ? "Applied" : "Apply"}</button></form>{applied && <button type="button" className="cart-coupon-remove" onClick={remove}>Remove {applied}</button>}{error && <p className="form-error" role="alert">{error}</p>}</section>;
}
