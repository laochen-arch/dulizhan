"use client";

import Link from "next/link";
import { ProductGallery } from "../../components/product-gallery";
import { ProductPurchase } from "../../components/product-actions";
import { ProductCard } from "../../components/product-card";
import { useSiteRuntime } from "../../components/site-runtime";
import type { Product } from "../../data/products";

export function ProductDetailView({ slug, fallback }: { slug: string; fallback: Product | null }) {
  const { catalog, config } = useSiteRuntime();
  const product = catalog.find((item) => item.slug === slug) ?? fallback;
  if (!product || product.status !== "active") return <div className="empty-state container section-pad"><span className="empty-mark">O</span><p className="eyebrow">Product unavailable</p><h1>Not on the route.</h1><p>This product is currently unavailable. Browse the live collection for what is ready to go.</p><Link href="/shop" className="button button-dark">Back to the collection -&gt;</Link></div>;
  const related = catalog.filter((item) => item.status === "active" && item.id !== product.id && (product.relatedSlugs.includes(item.slug) || item.category === product.category)).slice(0, 2);
  return <div className="product-page container section-pad"><div className="breadcrumbs"><Link href="/shop">Shop</Link><span>/</span><span>{product.category}</span><span>/</span><span>{product.name}</span></div><div className="product-detail"><ProductGallery product={product} /><div className="detail-copy"><p className="eyebrow">{product.category} / {config.brand.name}</p><h1>{product.name}</h1><p className="detail-description">{product.details}</p><div className="detail-divider" /><ProductPurchase product={product} /><div className="detail-accordions"><details open><summary>Details <span>+</span></summary><p>{product.details}</p></details><details><summary>Specifications <span>+</span></summary><ul>{product.specs.map((spec) => <li key={spec}>{spec}</li>)}</ul></details><details><summary>Shipping & returns <span>+</span></summary><p>{config.content.policies.shippingLead} {config.content.policies.returnsLead} <Link href="/shipping">Read the full policy -&gt;</Link></p></details></div></div></div>{related.length > 0 && <section className="related-products"><div className="section-heading"><div><p className="eyebrow">Keep exploring</p><h2>More for the<br /><em>same kind of day.</em></h2></div></div><div className="product-grid">{related.map((item) => <ProductCard key={item.id} product={item} />)}</div></section>}</div>;
}
