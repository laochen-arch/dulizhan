"use client";

import Link from "./site-link";
import type { Product } from "../data/products";
import { AddToCartButton } from "./product-actions";
import { useSiteRuntime } from "./site-runtime";
import { formatMoney } from "../lib/format-money";
import { WishlistButton } from "./wishlist-button";

export function ProductCard({ product, variant = "default" }: { product: Product; variant?: "default" | "rail" }) {
  const { config } = useSiteRuntime();
  const requiresOptions = product.variants.length > 1 || product.options.some((option) => option.values.length > 1);
  return (
    <article className={`product-card ${variant === "rail" ? "product-card-rail" : ""}`}>
      <Link href={`/products/${product.slug}`} className="product-image-wrap">
        {product.badge && <span className="product-badge">{product.badge}</span>}
        <img src={product.images[0] || product.image} alt={product.alt} className="product-image" loading="lazy" decoding="async" sizes="(max-width: 620px) 50vw, (max-width: 980px) 33vw, 25vw" />
        <span className="product-view">Open details ↗</span>
      </Link>
      <div className="product-card-info">
        <div><p className="eyebrow">{product.category}</p><Link href={`/products/${product.slug}`} className="product-name">{product.name}</Link></div>
        <div className="product-price"><span>{formatMoney(product.price, config.commerce.currency)}</span>{product.compareAt && <del>{formatMoney(product.compareAt, config.commerce.currency)}</del>}</div>
      </div>
      <WishlistButton productId={product.id} />
      {requiresOptions ? <Link href={`/products/${product.slug}`} className="add-button add-button-compact product-card-choose">Choose options <span aria-hidden="true">→</span></Link> : <AddToCartButton product={product} compact />}
    </article>
  );
}
