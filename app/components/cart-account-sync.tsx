"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { useStore, type CartLine } from "./cart-store";
import { loadStorefrontSession } from "../lib/storefront-session";
import { useSiteRuntime } from "./site-runtime";

type ServerCartLine = { productId?: string; variantId?: string; quantity?: number };

function cartSignature(items: Array<{ productId: string; variantId: string; quantity: number }>) {
  return JSON.stringify(items);
}

function materialize(lines: ServerCartLine[], catalog: ReturnType<typeof useSiteRuntime>["catalog"]) {
  return lines.map((line) => {
    const product = catalog.find((candidate) => candidate.id === line.productId && candidate.status === "active");
    const variant = product?.variants.find((candidate) => candidate.id === line.variantId) ?? product?.variants[0];
    if (!product || !variant || variant.available === false) return null;
    return { ...product, quantity: Math.max(1, Math.min(20, Math.floor(Number(line.quantity) || 1))), lineId: `${product.id}:${variant.id}`, variantId: variant.id, variantLabel: variant.label, variantPrice: variant.price ?? product.price } as CartLine;
  }).filter(Boolean) as CartLine[];
}

export function CartAccountSync() {
  const pathname = usePathname() || "/";
  const { activeSiteId, site, catalog } = useSiteRuntime();
  const siteId = site?.id || activeSiteId;
  const { cart, hydrated, replaceCart } = useStore(siteId);
  const mergedFor = useRef<string | null>(null);
  const lastPersisted = useRef("");
  const syncing = useRef(false);
  const cartItems = useMemo(() => cart.map((item) => ({ productId: item.id, variantId: item.variantId, quantity: item.quantity })), [cart]);
  const signature = cartSignature(cartItems);

  useEffect(() => {
    if (!hydrated || !catalog.length || pathname.startsWith("/admin") || pathname.startsWith("/manage") || pathname.startsWith("/preview")) return;
    let active = true;
    void loadStorefrontSession().then(async (access) => {
      if (!active || !access?.authenticated || !access.user?.id) return;
      const identity = `${siteId}:${access.user.id}`;
      if (mergedFor.current === identity) return;
      syncing.current = true;
      try {
        const response = await fetch("/api/account/cart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: cartItems }) });
        const payload = await response.json().catch(() => ({})) as { items?: ServerCartLine[] };
        if (!active || !response.ok || !Array.isArray(payload.items)) return;
        const next = materialize(payload.items, catalog);
        lastPersisted.current = cartSignature(payload.items.map((item) => ({ productId: item.productId || "", variantId: item.variantId || "", quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)) })));
        replaceCart(next);
        mergedFor.current = identity;
      } finally {
        syncing.current = false;
      }
    }).catch(() => undefined);
    return () => { active = false; };
    // The cart store methods are intentionally omitted; they are scoped to this site and stable for the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, cartItems, hydrated, pathname, siteId]);

  useEffect(() => {
    if (!hydrated || !mergedFor.current || syncing.current || signature === lastPersisted.current) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/account/cart", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: cartItems }) }).then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { items?: ServerCartLine[] };
        if (response.ok && Array.isArray(payload.items)) lastPersisted.current = cartSignature(payload.items.map((item) => ({ productId: item.productId || "", variantId: item.variantId || "", quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)) })));
      }).catch(() => undefined);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [cartItems, hydrated, signature]);

  return null;
}
