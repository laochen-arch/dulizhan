"use client";

import { useWishlist } from "./wishlist-context";

export { readWishlist, wishlistKey } from "./wishlist-context";

export function WishlistButton({ productId }: { productId: string }) {
  const { ids, toggle } = useWishlist();
  const saved = ids.includes(productId);
  return <button type="button" className={`wishlist-button ${saved ? "is-saved" : ""}`} onClick={() => toggle(productId)} aria-pressed={saved} aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}>{saved ? "Saved" : "Save"}</button>;
}
