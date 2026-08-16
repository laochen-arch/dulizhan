"use client";

import type { Product } from "../data/products";
import { useStore } from "./cart-store";
import { useSiteRuntime } from "./site-runtime";
import { showToast } from "./toast";

export function WishlistBulkActions({ products }: { products: Product[] }) {
  const { activeSiteId, site } = useSiteRuntime();
  const { addToCart, openDrawer } = useStore(site?.id || activeSiteId);
  if (!products.length) return null;
  return <div className="wishlist-bulk-actions"><button type="button" className="button button-outline" onClick={() => { let unavailable = 0; products.forEach((product) => { const variant = product.variants[0]; if (!variant || variant.available === false || (variant.stock ?? product.stock) < 1) { unavailable += 1; return; } addToCart(product, { variantId: variant.id, quantity: 1 }); }); openDrawer(); showToast(unavailable ? `${unavailable} saved item${unavailable === 1 ? "" : "s"} unavailable.` : "Saved gear added to your bag."); }}>Add available items to bag <span>→</span></button></div>;
}
