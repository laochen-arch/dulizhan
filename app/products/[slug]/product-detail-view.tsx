"use client";

import Link from "../../components/site-link";
import { ProductGallery } from "../../components/product-gallery";
import { ProductPurchase } from "../../components/product-actions";
import { ProductCard } from "../../components/product-card";
import { useSiteRuntime } from "../../components/site-runtime";
import type { Product } from "../../data/products";
import { ProductReviews } from "../../components/reviews";

export function ProductDetailView({ slug, fallback }: { slug: string; fallback: Product | null }) {
  const { catalog, config } = useSiteRuntime();
  const product = catalog.find((item) => item.slug === slug) ?? fallback;
  if (!product || product.status !== "active") return <div className="empty-state container section-pad"><span className="empty-mark">O</span><p className="eyebrow">Product unavailable</p><h1>Not on the route.</h1><p>This product is currently unavailable. Browse the live collection for what is ready to go.</p><Link href="/shop" className="button button-dark">Back to the collection -&gt;</Link></div>;
  const related = catalog.filter((item) => item.status === "active" && item.id !== product.id && (product.relatedSlugs.includes(item.slug) || item.category === product.category)).slice(0, 2);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    sku: product.sku,
    category: product.category,
    image: product.images.length ? product.images : [product.image],
    brand: { "@type": "Brand", name: config.brand.name },
    offers: product.variants.map((variant) => ({
      "@type": "Offer",
      sku: variant.sku,
      priceCurrency: config.commerce.currency.toUpperCase(),
      price: variant.price ?? product.price,
      availability: variant.available !== false && (variant.stock ?? product.stock) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `/products/${product.slug}`,
    })),
  };
  return <div className="product-page appstore-product-page container section-pad"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} /><div className="breadcrumbs"><Link href="/shop">Shop</Link><span>/</span><span>{product.category}</span><span>/</span><span>{product.name}</span></div><div className="product-detail"><ProductGallery product={product} /><div className="detail-copy appstore-purchase-panel"><p className="appstore-kicker">{product.category} <span>/</span> {config.brand.name}</p><h1>{product.name}</h1><p className="detail-description">{product.description}</p><p className="detail-story">{product.details}</p><div className="detail-divider" /><ProductPurchase product={product} /><div className="detail-accordions"><details open><summary>Details <span>+</span></summary><p>{product.details}</p></details><details><summary>Specifications <span>+</span></summary><ul>{product.specs.map((spec) => <li key={spec}>{spec}</li>)}</ul></details><details><summary>Shipping & returns <span>+</span></summary><p>{config.content.policies.shippingLead} {config.content.policies.returnsLead} <Link href="/shipping">Read the full policy ↗</Link></p></details></div></div></div><ProductReviews productId={product.id} />{related.length > 0 && <section className="related-products appstore-related-products"><div className="appstore-section-heading compact"><div><p className="appstore-kicker">Keep exploring</p><h2>More for the<br /><em>same kind of day.</em></h2></div></div><div className="appstore-product-rail">{related.map((item) => <ProductCard key={item.id} product={item} variant="rail" />)}</div></section>}</div>;
}
