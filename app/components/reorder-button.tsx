"use client";

import { useState } from "react";
import { useStore } from "./cart-store";
import { useSiteRuntime } from "./site-runtime";
import { showToast } from "./toast";

type ReorderItem = { productId?: string; variantId?: string; quantity?: number };

export function ReorderButton({ orderId }: { orderId: string }) {
  const { activeSiteId, site, catalog } = useSiteRuntime();
  const { addToCart, openDrawer } = useStore(site?.id || activeSiteId);
  const [busy, setBusy] = useState(false);

  async function reorder() {
    setBusy(true);
    try {
      const response = await fetch(`/api/account/orders?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { order?: { items?: ReorderItem[] }; error?: string };
      if (!response.ok || !payload.order?.items) throw new Error(payload.error || "Unable to load this order.");
      let missing = 0;
      payload.order.items.forEach((item) => {
        const product = catalog.find((candidate) => candidate.id === item.productId && candidate.status === "active");
        const variant = product?.variants.find((candidate) => candidate.id === item.variantId);
        if (!product || !variant || variant.available === false || (variant.stock ?? product.stock) < 1) { missing += 1; return; }
        addToCart(product, { variantId: variant.id, quantity: Math.max(1, Number(item.quantity) || 1) });
      });
      openDrawer();
      showToast(missing ? `${missing} item${missing === 1 ? "" : "s"} could not be added because stock changed.` : "Your previous order is back in the bag.");
    } catch (cause) { showToast(cause instanceof Error ? cause.message : "Unable to reorder this purchase.", "error"); }
    finally { setBusy(false); }
  }

  return <button type="button" className="button button-outline reorder-button" disabled={busy} onClick={() => void reorder()}>{busy ? "Adding..." : "Buy again"}</button>;
}
