"use client";

import Link from "./site-link";
import { useEffect, useState } from "react";
import type { Product } from "../data/products";
import { useSiteRuntime } from "./site-runtime";
import { ProductCard } from "./product-card";
import { readWishlist } from "./wishlist-button";

export function WishlistPage() {
  const { activeSiteId, site, catalog } = useSiteRuntime(); const siteId = site?.id || activeSiteId; const [ids, setIds] = useState<string[]>([]);
  // Wishlist state mirrors a tenant-scoped browser preference.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setIds(readWishlist(siteId)); }, [siteId]);
  const products = catalog.filter((product: Product) => ids.includes(product.id));
  return <main className="page-shell"><section className="section-heading"><p className="eyebrow">Saved gear</p><h1>Your wishlist.</h1><p>Keep a short list of pieces to revisit later.</p></section>{products.length ? <section className="product-grid">{products.map((product) => <ProductCard product={product} key={product.id} />)}</section> : <section className="empty-state"><h2>No saved products yet.</h2><p>Use Save on a product card to build your shortlist.</p><Link href="/shop" className="button button-dark">Browse products</Link></section>}</main>;
}
