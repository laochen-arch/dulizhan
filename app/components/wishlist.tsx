"use client";

import Link from "./site-link";
import type { Product } from "../data/products";
import { useSiteRuntime } from "./site-runtime";
import { ProductCard } from "./product-card";
import { useWishlist } from "./wishlist-context";
import { WishlistBulkActions } from "./wishlist-bulk-actions";

export function WishlistPage() {
  const { catalog } = useSiteRuntime(); const { ids, hydrated } = useWishlist();
  const products = catalog.filter((product: Product) => ids.includes(product.id));
  return <main className="page-shell"><section className="section-heading"><p className="eyebrow">Saved gear</p><h1>Your wishlist.</h1><p>{hydrated ? "Keep a short list of pieces to revisit later." : "Loading your saved gear..."}</p>{hydrated && <WishlistBulkActions products={products} />}</section>{products.length ? <section className="product-grid">{products.map((product) => <ProductCard product={product} key={product.id} />)}</section> : hydrated && <section className="empty-state"><h2>No saved products yet.</h2><p>Use Save on a product card to build your shortlist.</p><Link href="/shop" className="button button-dark">Browse products</Link></section>}</main>;
}
