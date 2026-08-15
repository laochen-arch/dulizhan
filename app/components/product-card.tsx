"use client";

import Link from "./site-link";
import type { Product } from "../data/products";
import { AddToCartButton } from "./product-actions";
import { useSiteRuntime } from "./site-runtime";
import { formatMoney } from "../lib/format-money";

export function ProductCard({ product }: { product: Product }) {
  const { config } = useSiteRuntime();
  return (
    <article className="product-card">
      <Link href={`/products/${product.slug}`} className="product-image-wrap">
        {product.badge && <span className="product-badge">{product.badge}</span>}
        <img src={product.images[0] || product.image} alt={product.alt} className="product-image" />
        <span className="product-view">View product -&gt;</span>
      </Link>
      <div className="product-card-info">
        <div><p className="eyebrow">{product.category}</p><Link href={`/products/${product.slug}`} className="product-name">{product.name}</Link></div>
        <div className="product-price"><span>{formatMoney(product.price, config.commerce.currency)}</span>{product.compareAt && <del>{formatMoney(product.compareAt, config.commerce.currency)}</del>}</div>
      </div>
      <AddToCartButton product={product} compact />
    </article>
  );
}
