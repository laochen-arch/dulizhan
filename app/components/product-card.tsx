import Link from "next/link";
import type { Product } from "../data/products";
import { AddToCartButton } from "./product-actions";

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="product-card">
      <Link href={`/products/${product.slug}`} className="product-image-wrap">
        {product.badge && <span className="product-badge">{product.badge}</span>}
        <img src={product.image} alt={product.alt} className="product-image" />
        <span className="product-view">View product ↗</span>
      </Link>
      <div className="product-card-info">
        <div><p className="eyebrow">{product.category}</p><Link href={`/products/${product.slug}`} className="product-name">{product.name}</Link></div>
        <div className="product-price"><span>${product.price}</span>{product.compareAt && <del>${product.compareAt}</del>}</div>
      </div>
      <AddToCartButton product={product} compact />
    </article>
  );
}

