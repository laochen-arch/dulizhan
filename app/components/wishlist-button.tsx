"use client";

import { useEffect, useState } from "react";
import { useSiteRuntime } from "./site-runtime";

export function wishlistKey(siteId: string) { return `storefront-wishlist:${siteId}`; }
export function readWishlist(siteId: string) { try { const value = JSON.parse(localStorage.getItem(wishlistKey(siteId)) || "[]") as unknown; return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; } catch { return []; } }
export function WishlistButton({ productId }: { productId: string }) {
  const { activeSiteId, site } = useSiteRuntime(); const siteId = site?.id || activeSiteId; const [saved, setSaved] = useState(false);
  // Wishlist state mirrors a tenant-scoped browser preference.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSaved(readWishlist(siteId).includes(productId)); }, [productId, siteId]);
  return <button type="button" className={`wishlist-button ${saved ? "is-saved" : ""}`} aria-pressed={saved} onClick={() => { const next = readWishlist(siteId); const updated = next.includes(productId) ? next.filter((id) => id !== productId) : [...next, productId]; localStorage.setItem(wishlistKey(siteId), JSON.stringify(updated)); setSaved(!saved); }}>{saved ? "Saved" : "Save"}</button>;
}
