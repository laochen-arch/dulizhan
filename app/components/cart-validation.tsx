"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CartLine } from "./cart-store";
import { COUPON_CHANGED_EVENT, readStoredCoupon } from "../lib/coupon";

export type CartValidationState = {
  status: "idle" | "checking" | "valid" | "invalid";
  message: string;
  quote: { currency: string; subtotal: number; discount: number; shipping: number; total: number; couponCode: string | null; couponApplied: boolean; freeShippingThreshold: number } | null;
};

function validationMessage(code?: string, fallback?: string) {
  if (code === "STOCK_UNAVAILABLE") return "Some items changed availability. Update your bag before checkout.";
  if (code === "PRODUCT_UNAVAILABLE") return "One or more products are no longer available. Remove them before checkout.";
  if (code === "INVALID_CHECKOUT") return "Your bag needs to be refreshed before checkout.";
  return fallback || "We could not verify your bag. Try again before checkout.";
}

export function useCartValidation(siteId: string, cart: CartLine[], enabled = true) {
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<CartValidationState>({ status: "idle", message: "", quote: null });
  const itemSignature = useMemo(() => JSON.stringify(cart.map((item) => ({ productId: item.id, variantId: item.variantId, quantity: item.quantity }))), [cart]);

  useEffect(() => {
    const onCouponChange = (event: Event) => {
      const detail = (event as CustomEvent<{ siteId?: string }>).detail;
      if (!detail?.siteId || detail.siteId === siteId) setRetryVersion((current) => current + 1);
    };
    window.addEventListener(COUPON_CHANGED_EVENT, onCouponChange);
    return () => window.removeEventListener(COUPON_CHANGED_EVENT, onCouponChange);
  }, [siteId]);

  useEffect(() => {
    if (!enabled || !cart.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: "idle", message: "", quote: null });
      return;
    }
    let active = true;
    setState((current) => ({ ...current, status: "checking", message: "Checking live availability and price..." }));
    const timer = window.setTimeout(() => {
      void fetch("/api/checkout/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: JSON.parse(itemSignature), deliveryMethod: "Standard delivery", couponCode: readStoredCoupon(siteId) }),
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { quote?: CartValidationState["quote"]; error?: string; code?: string };
        if (!response.ok || !payload.quote) throw Object.assign(new Error(validationMessage(payload.code, payload.error)), { code: payload.code });
        if (active) setState({ status: "valid", message: "Your bag is ready for checkout.", quote: payload.quote });
      }).catch((error: unknown) => {
        if (active) setState({ status: "invalid", message: validationMessage((error as { code?: string })?.code, error instanceof Error ? error.message : undefined), quote: null });
      });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [cart.length, enabled, itemSignature, retryVersion, siteId]);

  const retry = useCallback(() => setRetryVersion((current) => current + 1), []);
  return { ...state, retry };
}
